import { useState } from "react";
import { Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import i18n from "@/i18n";
import { cn } from "@/lib/utils";
import type { SessionLog } from "@/lib/types";

/**
 * Share row: OG template picker with live thumbnails, copy-link button
 * (clipboard + sonner toast) plus plain share-to-X / share-to-Reddit text
 * links. No SDKs, no trackers — the Toaster itself is mounted by the page
 * that renders this row.
 *
 * The template choice travels in the shared URL (?t=) — crawlers only see
 * the link, so the design has to be encoded in it. The server validates
 * the param (see OG_TEMPLATES in server/src/routes/og.js) and renders that
 * card; the last pick is remembered in localStorage for the next share.
 */

type OgTemplate = "split" | "minimal" | "stats";

const OG_TEMPLATES: OgTemplate[] = ["split", "minimal", "stats"];
const OG_TEMPLATE_KEY = "vaporlog.og-template";

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

export default function ShareRow({
  session,
  strainName,
}: {
  session: SessionLog;
  strainName: string;
}) {
  const { t } = useTranslation("sessionCard");
  const [template, setTemplate] = useState<OgTemplate>(readPreferredTemplate);
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

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Template picker — the thumbnails are the real OG cards the
          crawler will render for each design. */}
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {t("share.templateLabel")}
        </span>
        <div className="flex gap-2.5">
          {OG_TEMPLATES.map((tp) => {
            const active = template === tp;
            return (
              <button
                key={tp}
                type="button"
                onClick={() => selectTemplate(tp)}
                aria-pressed={active}
                className="pressable flex flex-col items-center gap-1.5"
              >
                <span
                  className={cn(
                    "block aspect-[1200/630] w-24 overflow-hidden rounded-lg border-2 transition-colors duration-150 sm:w-28",
                    active
                      ? "border-herb"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  <img
                    src={`/api/og/s/${session.id}/card.png?t=${tp}`}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </span>
                <span
                  className={cn(
                    "text-xs",
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {t(`share.templates.${tp}`)}
                </span>
              </button>
            );
          })}
        </div>
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
