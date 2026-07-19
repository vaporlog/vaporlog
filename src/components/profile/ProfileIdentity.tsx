import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatMemberSince } from "./profile-utils";

interface ProfileIdentityProps {
  handle: string;
  /** ISO 8601 account-creation timestamp. */
  memberSince: string;
  bio: string;
  saving: boolean;
  /** Persists the bio; resolves true on success (edit mode then closes). */
  onSaveBio: (bio: string) => Promise<boolean>;
}

const BIO_MAX_LENGTH = 500;

/**
 * Identity block: herb-tinted initial avatar, @handle, member-since line,
 * and the bio — read mode with a quiet edit affordance, edit mode with a
 * textarea + save/cancel. The only accent here is the avatar tint.
 */
export default function ProfileIdentity({
  handle,
  memberSince,
  bio,
  saving,
  onSaveBio,
}: ProfileIdentityProps) {
  const { t } = useTranslation("profile");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const sinceLabel = formatMemberSince(memberSince);

  function startEditing() {
    setDraft(bio);
    setEditing(true);
  }

  async function handleSave() {
    const ok = await onSaveBio(draft.trim());
    if (ok) setEditing(false);
  }

  return (
    <section aria-label={handle} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          <AvatarFallback className="bg-herb/10 text-2xl font-semibold text-herb">
            {handle.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold leading-tight tracking-tight">
            @{handle}
          </h1>
          {sinceLabel !== "" && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("identity.memberSince", { date: sinceLabel })}
            </p>
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
