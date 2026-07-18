import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteSession } from "@/lib/data";

interface DeleteSessionButtonProps {
  /** Id of the session to delete (must belong to the signed-in user). */
  sessionId: string;
  /** Human-readable strain name, used for the trigger's aria label. */
  strainName: string;
  /** Called after a successful delete (e.g. navigate back to the diary). */
  onDeleted?: () => void;
  /**
   * "icon"   — quiet ghost icon button (diary list rows);
   * "button" — full labeled destructive-outline button (session card page).
   */
  variant?: "icon" | "button";
}

/**
 * Delete-a-session affordance with a confirmation dialog. Rendered only
 * where the viewer is the session's owner (the API rejects anyone else).
 * The data layer removes the session from the in-memory caches
 * optimistically, so the diary list updates without a reload; on failure
 * the cache rolls back and an error toast explains why.
 */
export default function DeleteSessionButton({
  sessionId,
  strainName,
  onDeleted,
  variant = "button",
}: DeleteSessionButtonProps) {
  const { t } = useTranslation("diary");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    if (pending) return;
    setPending(true);
    try {
      await deleteSession(sessionId);
      setOpen(false);
      toast.success(t("delete.success"));
      onDeleted?.();
    } catch {
      setOpen(false);
      toast.error(t("delete.error"), {
        description: t("delete.errorDescription"),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="pressable text-muted-foreground hover:text-destructive"
            aria-label={t("delete.ariaLabel", { strain: strainName })}
            title={t("delete.button")}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button
            variant="outline"
            className="pressable border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden />
            {t("delete.button")}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("delete.confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("delete.confirmBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t("delete.cancel")}
          </AlertDialogCancel>
          {/* preventDefault keeps the dialog open until the delete settles,
              so the action can show its pending label and errors surface
              as a toast instead of a silently closed dialog. */}
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={pending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {pending ? t("delete.deleting") : t("delete.confirmAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
