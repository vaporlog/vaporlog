/*
 * "My covers" gallery for the palette — thumbnails of every session
 * that already has a saved custom cover. Picking one asks for
 * confirmation and hands the session id to the editor, which applies
 * the cover as a template (rebound to the current session's data) or,
 * for image-only covers, flattens the PNG into a single layer.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getToken } from "@/lib/api";

export type GalleryCover = {
  sessionId: string;
  caption: string;
  hasDoc: boolean;
  isCurrent: boolean;
};

function CoverThumb({
  cover,
  onPick,
}: {
  cover: GalleryCover;
  onPick: () => void;
}) {
  const { t } = useTranslation("coverEditor");
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token !== null) headers.Authorization = `Bearer ${token}`;
    fetch(`/api/og/s/${cover.sessionId}/card.png`, { headers })
      .then((response) => {
        if (!response.ok) throw new Error(`thumb ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [cover.sessionId]);

  // Broken thumbnails disappear instead of showing a dead tile.
  if (failed) return null;

  return (
    <button
      type="button"
      onClick={onPick}
      className="group relative overflow-hidden rounded-md border border-border bg-card text-left transition-colors hover:border-herb/60 pressable"
    >
      <div className="aspect-[1200/630] w-full">
        {src === null ? (
          <div className="size-full animate-pulse bg-muted" aria-hidden />
        ) : (
          <img
            src={src}
            alt={cover.caption}
            className="size-full object-cover"
            loading="lazy"
          />
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4">
        <span className="truncate text-[10px] font-medium text-white">
          {cover.caption}
        </span>
      </div>
      <div className="absolute left-1 top-1 flex gap-1">
        {cover.isCurrent ? (
          <span className="rounded bg-herb px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-herb-foreground">
            {t("gallery.current")}
          </span>
        ) : null}
        {!cover.hasDoc ? (
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            {t("gallery.imageOnly")}
          </span>
        ) : null}
      </div>
    </button>
  );
}

export default function CoverGallery({
  covers,
  onApply,
}: {
  covers: GalleryCover[];
  onApply: (sessionId: string) => void;
}) {
  const { t } = useTranslation("coverEditor");
  const [pending, setPending] = useState<GalleryCover | null>(null);

  if (covers.length === 0) {
    return <p className="px-1 text-xs text-muted-foreground">{t("gallery.empty")}</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        {covers.map((cover) => (
          <CoverThumb
            key={cover.sessionId}
            cover={cover}
            onPick={() => setPending(cover)}
          />
        ))}
      </div>
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("gallery.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("gallery.confirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="pressable">
              {t("gallery.cancelCta")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="pressable"
              onClick={() => {
                if (pending !== null) onApply(pending.sessionId);
                setPending(null);
              }}
            >
              {t("gallery.confirmCta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
