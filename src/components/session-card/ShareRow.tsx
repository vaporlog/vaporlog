import { Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import i18n from "@/i18n";
import type { SessionLog } from "@/lib/types";

/**
 * Share row: copy-link button (clipboard + sonner toast) plus plain
 * share-to-X / share-to-Reddit text links. No SDKs, no trackers — the
 * Toaster itself is mounted by the page that renders this row.
 */

function canonicalUrl(sessionId: string): string {
  return `${window.location.origin}/s/${sessionId}`;
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
  const url = canonicalUrl(session.id);
  const text = shareText(session, strainName);
  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    text,
  )}&url=${encodeURIComponent(url)}`;
  const redditHref = `https://www.reddit.com/submit?url=${encodeURIComponent(
    url,
  )}&title=${encodeURIComponent(text)}`;

  async function handleCopy() {
    const ok = await copyToClipboard(url);
    if (ok) {
      toast.success(t("share.copySuccess"));
    } else {
      toast.error(t("share.copyError"));
    }
  }

  return (
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
  );
}
