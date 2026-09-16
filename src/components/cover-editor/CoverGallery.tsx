/*
 * "My covers" gallery for the palette — the user's saved cover
 * templates, global across sessions (not per-session covers). Picking
 * one asks for confirmation and hands the template to the editor,
 * which re-binds its data layers to the current session. Each item
 * can be renamed or deleted. The list is self-contained: it fetches
 * on mount and again whenever `refreshSignal` bumps (the editor bumps
 * it after a "save as template").
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch, getToken } from "@/lib/api";

export type CoverTemplate = {
  id: string;
  name: string;
  doc: string;
  hasPreview: boolean;
  updatedAt: string;
};

function TemplateThumb({
  template,
  onPick,
  onRename,
  onDelete,
}: {
  template: CoverTemplate;
  onPick: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("coverEditor");
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!template.hasPreview) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token !== null) headers.Authorization = `Bearer ${token}`;
    fetch(`/api/cover-templates/${template.id}/preview.png`, { headers })
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
  }, [template.id, template.hasPreview, template.updatedAt]);

  // No preview (or a broken one) falls back to a tile with the name.
  const showNameTile = !template.hasPreview || failed;

  return (
    <div className="group relative overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-herb/60">
      <button
        type="button"
        onClick={onPick}
        className="block w-full text-left pressable"
      >
        <div className="aspect-[1200/630] w-full">
          {src !== null ? (
            <img
              src={src}
              alt={template.name}
              className="size-full object-cover"
              loading="lazy"
            />
          ) : showNameTile ? (
            <div className="flex size-full items-center justify-center bg-muted px-2">
              <span className="text-center text-[10px] font-medium text-muted-foreground">
                {template.name}
              </span>
            </div>
          ) : (
            <div className="size-full animate-pulse bg-muted" aria-hidden />
          )}
        </div>
      </button>
      <div className="flex items-center justify-between gap-1 px-1.5 py-1">
        <span className="truncate text-[10px] font-medium">{template.name}</span>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onRename}
            aria-label={t("gallery.renameTitle")}
            title={t("gallery.renameTitle")}
            className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground pressable"
          >
            <Pencil className="size-3" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("gallery.deleteCta")}
            title={t("gallery.deleteCta")}
            className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive pressable"
          >
            <Trash2 className="size-3" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CoverGallery({
  refreshSignal,
  onApply,
}: {
  refreshSignal: number;
  onApply: (template: CoverTemplate) => void;
}) {
  const { t } = useTranslation("coverEditor");
  const [templates, setTemplates] = useState<CoverTemplate[] | null>(null);
  const [pendingApply, setPendingApply] = useState<CoverTemplate | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CoverTemplate | null>(null);
  const [renaming, setRenaming] = useState<CoverTemplate | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ templates: CoverTemplate[] }>(
        "/cover-templates",
        { auth: true },
      );
      setTemplates(data?.templates ?? []);
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshSignal]);

  const submitRename = useCallback(async () => {
    if (renaming === null || renameSaving) return;
    const name = renameValue.trim();
    if (name === "") return;
    setRenameSaving(true);
    try {
      await apiFetch(`/cover-templates/${renaming.id}`, {
        method: "PATCH",
        body: { name },
        auth: true,
      });
      toast.success(t("gallery.renamed"));
      setRenaming(null);
      await refresh();
    } catch {
      toast.error(t("gallery.saveError"));
    } finally {
      setRenameSaving(false);
    }
  }, [renaming, renameSaving, renameValue, refresh, t]);

  const confirmDelete = useCallback(async () => {
    if (pendingDelete === null || deleting) return;
    setDeleting(true);
    try {
      await apiFetch(`/cover-templates/${pendingDelete.id}`, {
        method: "DELETE",
        auth: true,
      });
      toast.success(t("gallery.deleted"));
      setPendingDelete(null);
      await refresh();
    } catch {
      toast.error(t("gallery.saveError"));
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, deleting, refresh, t]);

  if (templates === null) {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        <div className="aspect-[1200/630] animate-pulse rounded-md bg-muted" aria-hidden />
        <div className="aspect-[1200/630] animate-pulse rounded-md bg-muted" aria-hidden />
      </div>
    );
  }

  if (templates.length === 0) {
    return <p className="px-1 text-xs text-muted-foreground">{t("gallery.empty")}</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        {templates.map((template) => (
          <TemplateThumb
            key={template.id}
            template={template}
            onPick={() => setPendingApply(template)}
            onRename={() => {
              setRenaming(template);
              setRenameValue(template.name);
            }}
            onDelete={() => setPendingDelete(template)}
          />
        ))}
      </div>

      {/* Apply confirmation — the current canvas gets replaced. */}
      <AlertDialog
        open={pendingApply !== null}
        onOpenChange={(open) => {
          if (!open) setPendingApply(null);
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
                if (pendingApply !== null) onApply(pendingApply);
                setPendingApply(null);
              }}
            >
              {t("gallery.confirmCta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename dialog. */}
      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("gallery.renameTitle")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitRename();
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                {t("gallery.nameLabel")}
              </span>
              <Input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                placeholder={t("gallery.namePlaceholder")}
                autoFocus
              />
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="pressable"
                onClick={() => setRenaming(null)}
              >
                {t("gallery.cancelCta")}
              </Button>
              <Button
                type="submit"
                className="pressable herb-hover bg-herb text-herb-foreground"
                disabled={renameSaving || renameValue.trim() === ""}
              >
                {t("gallery.saveCta")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation. */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("gallery.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("gallery.deleteBody", { name: pendingDelete?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="pressable">
              {t("gallery.cancelCta")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="pressable"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {t("gallery.deleteCta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
