import { useState, type FormEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import WelcomeStep from "@/components/welcome/WelcomeStep";
import {
  generateHandle,
  USERNAME_MAX_LENGTH,
  validateUsername,
} from "@/lib/profile-flow";
import {
  PASSWORD_MIN_LENGTH,
  signIn,
  signUp,
  type Account,
} from "@/lib/auth";

type Mode = "signup" | "signin";

/**
 * Step 2 — account creation (or sign-in). Cloud accounts (self-hosted API):
 * handle + password (min 6, show/hide toggle, no confirmation field in
 * this MVP). A quiet link flips between the two modes; errors from the
 * auth layer surface inline — a taken handle gets its own spot under the
 * handle field, with a one-tap switch to sign-in.
 */
export default function AccountStep({
  birthdate,
  initialMode = "signup",
  initialUsername,
  onUsernameChange,
  onBack,
  onSuccess,
}: {
  /** Verified 21+ birthdate from step 1 — stored on the new account. */
  birthdate: string;
  /** "signin" when arriving via ?mode=signin (returning user, no age gate). */
  initialMode?: Mode;
  initialUsername: string;
  /** Keeps the page-level state in sync so Back/forward preserves typing. */
  onUsernameChange: (username: string) => void;
  onBack: () => void;
  /** Called with the signed-in account after signUp/signIn succeeds. */
  onSuccess: (account: Account) => void;
}) {
  const { t } = useTranslation("welcome");
  const [mode, setMode] = useState<Mode>(initialMode);
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A taken handle is not a generic form error — it pins to the handle
  // field and offers a one-tap switch to sign-in.
  const [handleTaken, setHandleTaken] = useState(false);

  const validation = validateUsername(username);
  const passwordOk = password.length >= PASSWORD_MIN_LENGTH;
  const canSubmit =
    !pending &&
    (mode === "signup"
      ? validation.valid && passwordOk
      : username.trim().length > 0 && password.length > 0);

  function updateUsername(value: string) {
    setUsername(value);
    setError(null);
    setHandleTaken(false);
    onUsernameChange(value);
  }

  function switchMode(next: Mode) {
    // Creating an account requires the 21+ age gate first — when we landed
    // straight in sign-in mode (?mode=signin) there is no birthdate yet,
    // so route back to the age gate instead of just flipping the form.
    if (next === "signup" && !birthdate) {
      onBack();
      return;
    }
    setMode(next);
    setPassword("");
    setShowPassword(false);
    setError(null);
    setHandleTaken(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    setHandleTaken(false);
    try {
      const account =
        mode === "signup"
          ? await signUp({
              username: username.trim(),
              password,
              birthdate,
            })
          : await signIn(username, password);
      onSuccess(account);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("account.genericError");
      if (mode === "signup" && /taken/i.test(message)) {
        setHandleTaken(true);
      } else {
        setError(message);
      }
      setPending(false);
    }
  }

  const showValid = mode === "signup" && validation.valid && !handleTaken;

  return (
    <WelcomeStep
      title={mode === "signup" ? t("account.titleSignup") : t("account.titleSignin")}
      lead={
        mode === "signup"
          ? t("account.leadSignup")
          : t("account.leadSignin")
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="account-username" className="text-muted-foreground">
            {t("account.handleLabel")}
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Input
                id="account-username"
                value={username}
                onChange={(e) => updateUsername(e.target.value)}
                placeholder={t("account.handlePlaceholder")}
                maxLength={USERNAME_MAX_LENGTH}
                autoComplete="username"
                autoCapitalize="off"
                spellCheck={false}
                disabled={pending}
                aria-invalid={validation.error !== null || handleTaken}
                aria-describedby="account-username-hint account-error"
                className="h-11 pr-9 text-base"
              />
              {showValid ? (
                <Check
                  aria-hidden="true"
                  className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-herb"
                />
              ) : null}
            </div>
            {mode === "signup" ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => updateUsername(generateHandle())}
                disabled={pending}
                className="pressable shrink-0"
              >
                <Sparkles className="size-4" />
                {t("account.surpriseMe")}
              </Button>
            ) : null}
          </div>
          <p id="account-username-hint" className="text-xs text-muted-foreground">
            {mode === "signup"
              ? t("account.handleHintSignup")
              : t("account.handleHintSignin")}
          </p>
          {mode === "signup" && validation.error !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {validation.error}
            </p>
          ) : null}
          {mode === "signup" && handleTaken ? (
            <p role="alert" className="text-sm text-destructive">
              <Trans
                i18nKey="account.handleTaken"
                t={t}
                components={{
                  signin: (
                    <button
                      type="button"
                      onClick={() => switchMode("signin")}
                      className="pressable font-medium underline underline-offset-4 transition-colors duration-150 hover:text-foreground"
                    />
                  ),
                }}
              />
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="account-password" className="text-muted-foreground">
            {t("account.passwordLabel")}
          </Label>
          <div className="relative">
            <Input
              id="account-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder={
                mode === "signup"
                  ? t("account.passwordPlaceholderSignup", { min: PASSWORD_MIN_LENGTH })
                  : t("account.passwordPlaceholderSignin")
              }
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              disabled={pending}
              aria-describedby="account-password-hint account-error"
              className="h-11 pr-11 text-base"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t("account.hidePassword") : t("account.showPassword")}
              aria-pressed={showPassword}
              className="pressable absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="size-4" />
              ) : (
                <Eye aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
          <p id="account-password-hint" className="text-xs text-muted-foreground">
            {mode === "signup"
              ? t("account.passwordHintSignup", { min: PASSWORD_MIN_LENGTH })
              : t("account.passwordHintSignin")}
          </p>
        </div>

        {error ? (
          <p id="account-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onBack}
            disabled={pending}
            className="pressable text-muted-foreground"
          >
            <ArrowLeft className="size-4" />
            {t("account.back")}
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit}
            className="pressable herb-hover bg-herb text-herb-foreground"
          >
            {pending
              ? mode === "signup"
                ? t("account.creatingAccount")
                : t("account.signingIn")
              : mode === "signup"
                ? t("account.createAccount")
                : t("account.signIn")}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
          disabled={pending}
          className="pressable self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {mode === "signup"
            ? t("account.switchToSignin")
            : t("account.switchToSignup")}
        </button>
        <p className="text-xs text-muted-foreground">
          {t("account.syncNote")}
        </p>
      </div>
    </WelcomeStep>
  );
}
