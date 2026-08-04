import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { validateUsername } from "@/lib/profile-flow";
import { formatMemberSince } from "./profile-utils";

interface ProfileIdentityProps {
  handle: string;
  /** ISO 8601 account-creation timestamp. */
  memberSince: string;
  bio: string;
  saving: boolean;
  /** Persists the bio; resolves true on success (edit mode then closes). */
  onSaveBio: (bio: string) => Promise<boolean>;
  savingHandle: boolean;
  /**
   * Persists a new handle (already lowercased/trimmed). "taken" and local
   * validation errors render inline; "error" was already toasted upstream.
   */
  onSaveHandle: (handle: string) => Promise<"ok" | "taken" | "error">;
}

const BIO_MAX_LENGTH = 500;

/**
 * Identity block: herb-tinted initial avatar, @handle (editable — the
 * whole point is that a Google-derived handle can leak part of your
 * email), member-since line, and the bio — read mode with quiet edit
 * affordances, edit modes with input/textarea + save/cancel. The only
 * accent here is the avatar tint.
 */
export default function ProfileIdentity({
  handle,
  memberSince,
  bio,
  saving,
  onSaveBio,
  savingHandle,
  onSaveHandle,
}: ProfileIdentityProps) {
  const { t } = useTranslation("profile");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleDraft, setHandleDraft] = useState("");
  const [handleError, setHandleError] = useState<string | null>(null);

  const sinceLabel = formatMemberSince(memberSince);

  function startEditing() {
    setDraft(bio);
    setEditing(true);
  }

  async function handleSave() {
    const ok = await onSaveBio(draft.trim());
    if (ok) setEditing(false);
  }

  function startEditingHandle() {
    setHandleDraft(handle);
    setHandleError(null);
    setEditingHandle(true);
  }

  async function saveHandle() {
    const value = handleDraft.trim().toLowerCase();
    if (value === handle) {
      setEditingHandle(false);
      return;
    }
    const check = validateUsername(value);
    if (!check.valid) {
      setHandleError(check.error);
      return;
    }
    const result = await onSaveHandle(value);
    if (result === "ok") {
      setEditingHandle(false);
    } else if (result === "taken") {
      setHandleError(t("identity.handleTaken"));
    }
    // "error": the page already toasted — stay in edit mode.
  }

  return (
    <section aria-label={handle} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar className="size-16 shrink-0">
          <AvatarFallback className="bg-herb/10 text-2xl font-semibold text-herb">
            {handle.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          {editingHandle ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={handleDraft}
                  onChange={(event) => {
                    setHandleDraft(event.target.value);
                    setHandleError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void saveHandle();
                    }
                  }}
                  maxLength={20}
                  autoFocus
                  autoCapitalize="off"
                  spellCheck={false}
                  disabled={savingHandle}
                  aria-label={t("identity.handleLabel")}
                  aria-invalid={handleError !== null}
                  className="h-10 w-48 text-base"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void saveHandle()}
                  disabled={savingHandle}
                  className="pressable herb-hover bg-herb text-herb-foreground"
                >
                  {savingHandle ? t("identity.saving") : t("identity.save")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingHandle(false)}
                  disabled={savingHandle}
                  className="pressable"
                >
                  {t("identity.cancel")}
                </Button>
              </div>
              {handleError !== null ? (
                <p role="alert" className="text-sm text-destructive">
                  {handleError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("identity.handleHint")}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <h1 className="truncate text-3xl font-semibold leading-tight tracking-tight">
                  @{handle}
                </h1>
                <button
                  type="button"
                  onClick={startEditingHandle}
                  aria-label={t("identity.editHandle")}
                  className="pressable flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
              </div>
              {sinceLabel !== "" && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t("identity.memberSince", { date: sinceLabel })}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <label
            htmlFor="profile-bio"
            className="text-sm font-medium text-foreground"
          >
            {t("identity.bioLabel")}
          </label>
          <Textarea
            id="profile-bio"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("identity.bioPlaceholder")}
            maxLength={BIO_MAX_LENGTH}
            rows={3}
            className="resize-none"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
              className="pressable herb-hover bg-herb text-herb-foreground"
            >
              {saving ? t("identity.saving") : t("identity.save")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="pressable"
            >
              {t("identity.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          {bio !== "" ? (
            <p className="max-w-prose whitespace-pre-wrap text-base leading-relaxed text-foreground/90">
              {bio}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("identity.bioEmpty")}
            </p>
          )}
          <button
            type="button"
            onClick={startEditing}
            className="pressable rounded-md text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            {bio !== "" ? t("identity.editBio") : t("identity.addBio")}
          </button>
        </div>
      )}
    </section>
  );
}
