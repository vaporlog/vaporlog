import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import i18n from "@/i18n";
import { getToken } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SessionLog } from "@/lib/types";

/**
 * Share row: OG template picker with live thumbnails, copy-link button
 * (clipboard + sonner toast), image download, plus plain share-to-X /
 * share-to-Reddit text links. No SDKs, no trackers — the Toaster itself is
 * mounted by the page that renders this row.
 *
 * The template choice travels in the shared URL (?t=) — crawlers only see
 * the link, so the design has to be encoded in it. The server validates
 * the param (see OG_TEMPLATES in server/src/routes/og.js) and renders that
 * card; the last pick is remembered in localStorage for the next share.
 *
 * Private sessions: the owner can still download and preview every card —
 * the API serves them only with the owner's Bearer token, so thumbnails and
 * the download go through fetch with the auth header instead of plain img.
 */

type OgTemplate =
  | "split"
  | "minimal"
  | "stats"
  | "story"
  | "story-minimal"
  | "story-stats"
  | "story-journal";

const OG_TEMPLATES: OgTemplate[] = [
  "split",
  "minimal",
  "stats",
  "story",
  "story-minimal",
  "story-stats",
  "story-journal",
];
const OG_TEMPLATE_KEY = "vaporlog.og-template";

function isStoryTemplate(template: OgTemplate): boolean {
  return template.startsWith("story");
}

function readPreferredTemplate(): OgTemplate {
  try {
    const raw = localStorage.getItem(OG_TEMPLATE_KEY);
    return OG_TEMPLATES.includes(raw as OgTemplate)
      ? (raw as OgTemplate)
      : "split";
  } catch {
    return "split";
  }
}

function canonicalUrl(sessionId: string, template: OgTemplate): string {
  const base = `${window.location.origin}/s/${sessionId}`;
  // The default design keeps clean param-less links.
  return template === "split" ? base : `${base}?t=${template}`;
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
async function fetchCardBlobUrl(sessionId: string, template: OgTemplate) {
  const token = getToken();
  if (!token) return null;
  const response = await fetch(
    `/api/og/s/${sessionId}/card.png?t=${template}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return null;
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * One template thumbnail. Public sessions load straight from the API;
 * private ones use a blob URL fetched with the owner's token.
 */
function TemplateThumbnail({
  sessionId,
  template,
  isPublic,
  active,
  onSelect,
  label,
}: {
  sessionId: string;
  template: OgTemplate;
  isPublic: boolean;
  active: boolean;
  onSelect: () => void;
  label: string;
}) {
  const vertical = isStoryTemplate(template);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isPublic) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void fetchCardBlobUrl(sessionId, template).then((url) => {
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
  }, [sessionId, template, isPublic]);

  const src = isPublic
    ? `/api/og/s/${sessionId}/card.png?t=${template}`
    : blobUrl;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className="pressable flex flex-col items-center gap-1.5"
    >
      <span
        className={cn(
          "block overflow-hidden rounded-lg border-2 transition-colors duration-150",
          vertical
            ? "aspect-[1080/1920] w-20 sm:w-24"
            : "aspect-[1200/630] w-24 sm:w-28",
          active ? "border-herb" : "border-border hover:border-foreground/30",
        )}
      >
        {src ? (
          <img src={src} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center bg-secondary text-[10px] text-muted-foreground">
            …
          </span>
        )}
      </span>
      <span
        className={cn(
          "text-xs",
          active ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </button>
  );
}

export default function ShareRow({
  session,
  strainName,
}: {
  session: SessionLog;
  strainName: string;
}) {
  const { t } = useTranslation("sessionCard");
  const [template, setTemplate] = useState<OgTemplate>(readPreferredTemplate);
  const [downloading, setDownloading] = useState(false);
  const url = canonicalUrl(session.id, template);
  const text = shareText(session, strainName);
  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    text,
  )}&url=${encodeURIComponent(url)}`;
  const redditHref = `https://www.reddit.com/submit?url=${encodeURIComponent(
    url,
  )}&title=${encodeURIComponent(text)}`;

  function selectTemplate(next: OgTemplate) {
    setTemplate(next);
    try {
      localStorage.setItem(OG_TEMPLATE_KEY, next);
    } catch {
      /* private mode — the in-memory pick still applies */
    }
  }

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
        ? `/api/og/s/${session.id}/card.png?t=${template}`
        : await fetchCardBlobUrl(session.id, template);
      if (!blobUrl) {
        toast.error(t("share.downloadError"));
        return;
      }
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `vaporlog-${session.id}-${template}.png`;
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

  const rows = [
    OG_TEMPLATES.filter((tp) => !isStoryTemplate(tp)),
    OG_TEMPLATES.filter((tp) => isStoryTemplate(tp)),
  ];

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Template picker — the thumbnails are the real OG cards the
          crawler will render for each design. Two rows: horizontal link
          previews first, vertical story cards below. */}
      <div className="flex flex-col items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          {t("share.templateLabel")}
        </span>
        {rows.map((rowTemplates, rowIndex) => (
          <div key={rowIndex} className="flex flex-wrap justify-center gap-2.5">
            {rowTemplates.map((tp) => (
              <TemplateThumbnail
                key={tp}
                sessionId={session.id}
                template={tp}
                isPublic={session.isPublic}
                active={template === tp}
                onSelect={() => selectTemplate(tp)}
                label={t(`share.templates.${tp}`)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
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
    </div>
  );
}
