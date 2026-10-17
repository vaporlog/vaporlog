import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Link2, Eye, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import i18n from "@/i18n";
import { getToken } from "@/lib/api";
import { COVER_EDITOR_ENABLED } from "@/lib/features";
import type { SessionLog } from "@/lib/types";

/**
 * Share row: OG card thumbnail with live preview, copy-link button
 * (clipboard + sonner toast), image download, plus plain share-to-X /
 * share-to-Reddit text links. No SDKs, no trackers — the Toaster itself is
 * mounted by the page that renders this row.
 *
 * The only card design is "story-journal" (vertical 1080×1920), so shared
 * links stay param-less. The server renders the same card the thumbnail
 * shows (see OG_TEMPLATES in server/src/routes/og.js).
 *
 * Private sessions: the owner can still download and preview the card —
 * the API serves it only with the owner's Bearer token, so thumbnails and
 * the download go through fetch with the auth header instead of plain img.
 */

/** Card design rendered by the server — the only template left. */
const OG_TEMPLATE = "story-journal" as const;

/** Canonical share URL — with a single design the link stays param-less. */
function canonicalUrl(sessionId: string): string {
  return `${window.location.origin}/s/${sessionId}`;
}

/**
 * Small content hash over every session field that reaches the OG card
 * (privacy switches included). The API serves cards with max-age=300, so
 * without this the browser keeps showing the old PNG after a toggle —
 * appending it as &v= busts the cache whenever the content changes.
 */
function cardVersion(session: SessionLog): string {
  const payload = JSON.stringify([
    session.strainSlug,
    session.deviceSlug,
    session.temperatureC,
    session.durationMin,
    session.amountG,
    session.rating,
    session.liked,
    session.aromas,
    session.flavors,
    session.moods,
    session.activities,
    session.activitiesPublic,
    session.unwantedEffects,
    session.unwantedEffectsPublic,
    session.effectIntensities,
    session.energyCalmScore,
    session.notes,
    session.author,
  ]);
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/** Card locale from the active UI language (server only knows es|en). */
function cardLang(): "es" | "en" {
  return i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

/** OG card URL with the cache-busting content version. */
function cardPngUrl(sessionId: string, version: string): string {
  return `/api/og/s/${sessionId}/card.png?v=${version}&lang=${cardLang()}`;
}

function shareText(session: SessionLog, strainName: string): string {
  return i18n.t("sessionCard:share.text", {
    author: session.author,
    strain: strainName,
    rating: session.rating,
  });
}

async function copyToClipboard(text: string): Promise<boolean> {
  // Clipboard API first (secure contexts)…
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  // …legacy fallback for older browsers / insecure contexts.
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** Fetches an OG card with the owner's Bearer token; returns a blob URL. */
async function fetchCardBlobUrl(sessionId: string, version: string) {
  const token = getToken();
  if (!token) return null;
  const response = await fetch(cardPngUrl(sessionId, version), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * The card thumbnail. Public sessions load straight from the API;
 * private ones use a blob URL fetched with the owner's token.
 */
function TemplateThumbnail({
  sessionId,
  version,
  isPublic,
  label,
}: {
  sessionId: string;
  /** Content hash — changes re-fetch the card (busts browser cache). */
  version: string;
  isPublic: boolean;
  label: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const lang = cardLang();

  useEffect(() => {
    if (isPublic) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void fetchCardBlobUrl(sessionId, version).then((url) => {
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      objectUrl = url;
      setBlobUrl(url);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sessionId, version, isPublic, lang]);

  const src = isPublic ? cardPngUrl(sessionId, version) : blobUrl;

  return (
    <span className="flex flex-col items-center gap-1.5">
      <span className="block aspect-[1080/1920] w-20 overflow-hidden rounded-lg border-2 border-herb sm:w-24">
        {src ? (
          <img src={src} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center bg-secondary text-[10px] text-muted-foreground">
            …
          </span>
        )}
      </span>
      <span className="text-xs font-medium text-foreground">{label}</span>
    </span>
  );
}

export default function ShareRow({
  session,
  strainName,
  isOwner = false,
}: {
  session: SessionLog;
  strainName: string;
  /** When true, surface the "Custom cover" entry point. The route is
   *  auth-gated server-side regardless; this is purely a UI decision. */
  isOwner?: boolean;
}) {
  const { t } = useTranslation("sessionCard");
  const [downloading, setDownloading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const version = cardVersion(session);
  const url = canonicalUrl(session.id);
  const text = shareText(session, strainName);
  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    text,
  )}&url=${encodeURIComponent(url)}`;
  const redditHref = `https://www.reddit.com/submit?url=${encodeURIComponent(
    url,
  )}&title=${encodeURIComponent(text)}`;

  // Full-size preview source: public cards load straight from the API;
  // private ones need the owner's Bearer token, so they go through a blob.
  const lang = cardLang();
  useEffect(() => {
    if (!previewOpen) return;
    if (session.isPublic) {
      setPreviewSrc(cardPngUrl(session.id, version));
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setPreviewSrc(null);
    void fetchCardBlobUrl(session.id, version).then((url) => {
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      objectUrl = url;
      setPreviewSrc(url);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewOpen, session.id, session.isPublic, version, lang]);

  async function handleCopy() {
    const ok = await copyToClipboard(url);
    if (ok) {
      toast.success(t("share.copySuccess"));
    } else {
      toast.error(t("share.copyError"));
    }
  }

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const blobUrl = session.isPublic
        ? cardPngUrl(session.id, version)
        : await fetchCardBlobUrl(session.id, version);
      if (!blobUrl) {
        toast.error(t("share.downloadError"));
        return;
      }
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `vaporlog-${session.id}-${OG_TEMPLATE}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (blobUrl.startsWith("blob:")) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
    } catch {
      toast.error(t("share.downloadError"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* The thumbnail is the real OG card the crawler will render. */}
      <div className="flex flex-col items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          {t("share.templateLabel")}
        </span>
        <TemplateThumbnail
          sessionId={session.id}
          version={version}
          isPublic={session.isPublic}
          label={t("share.templates.story-journal")}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
        {COVER_EDITOR_ENABLED && isOwner ? (
          <Button
            asChild
            type="button"
            variant={session.customOgImage ? "default" : "outline"}
            size="sm"
            className={
              session.customOgImage
                ? "pressable herb-hover bg-herb text-herb-foreground"
                : "pressable"
            }
          >
            <RouterLink to={`/s/${session.id}/edit-cover`}>
              <Pencil className="size-4" aria-hidden />
              {session.customOgImage
                ? t("share.customCoverActive")
                : t("share.customCover")}
            </RouterLink>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPreviewOpen(true)}
          className="pressable"
        >
          <Eye className="size-4" aria-hidden />
          {t("share.preview")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="pressable"
        >
          <Link2 className="size-4" aria-hidden />
          {t("share.copyLink")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDownload}
          disabled={downloading}
          className="pressable"
        >
          {downloading ? t("share.downloading") : t("share.download")}
        </Button>
        <a
          href={xHref}
          target="_blank"
          rel="noopener noreferrer"
          className="pressable text-sm font-medium text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
        >
          {t("share.toX")}
        </a>
        <a
          href={redditHref}
          target="_blank"
          rel="noopener noreferrer"
          className="pressable text-sm font-medium text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
        >
          {t("share.toReddit")}
        </a>
      </div>

      {/* Full-size preview of the story-journal card (vertical 1080×1920). */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-fit max-w-[calc(100vw-2rem)] gap-0 border-none bg-transparent p-0 shadow-none sm:max-w-[calc(100vw-4rem)] [&>button]:text-white">
          <DialogTitle className="sr-only">{t("share.previewTitle")}</DialogTitle>
          {previewSrc ? (
            <img
              src={previewSrc}
              alt={t("share.previewTitle")}
              className="max-h-[85dvh] w-auto max-w-full rounded-lg"
            />
          ) : (
            <div className="flex h-40 w-72 items-center justify-center rounded-lg bg-secondary text-sm text-muted-foreground">
              …
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
