import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getGoogleClientId, loadGoogleId } from "@/lib/google";
import { getTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * The official "Continue with Google" button (rendered by Google's own
 * script into our container) with an "or continue with" divider on top.
 *
 * Renders NOTHING when Google sign-in is not configured (no client ID
 * from /api/config) or when the GIS script cannot load — the welcome flow
 * then looks exactly like the handle+password-only version. Google's
 * iframe draws the button itself; our job is just config, theme matching
 * (light → outline, dark → filled_black) and forwarding the credential.
 */
export default function GoogleButton({
  onCredential,
}: {
  /** Called with Google's ID token after the user picks an account. */
  onCredential: (credential: string) => void;
}) {
  const { t, i18n } = useTranslation("welcome");
  const containerRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  const [state, setState] = useState<"loading" | "unavailable" | "ready">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const clientId = await getGoogleClientId();
      if (clientId === null) {
        if (!cancelled) setState("unavailable");
        return;
      }
      const gis = await loadGoogleId();
      const container = containerRef.current;
      if (!gis || !container || cancelled) {
        if (!cancelled) setState("unavailable");
        return;
      }
      gis.initialize({
        client_id: clientId,
        callback: (response) => {
          if (typeof response.credential === "string") {
            onCredentialRef.current(response.credential);
          }
        },
      });
      container.innerHTML = "";
      gis.renderButton(container, {
        theme: getTheme() === "dark" ? "filled_black" : "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        locale: i18n.language,
        width: 280,
      });
      if (!cancelled) setState("ready");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "unavailable") return null;

  return (
    <div
      className={cn("flex flex-col gap-4", state === "loading" && "invisible")}
      aria-hidden={state === "loading"}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">
          {t("account.orContinueWith")}
        </span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>
      <div ref={containerRef} className="flex min-h-11 justify-center" />
      {/* Consent note: the email Google shares is stored to re-link the
          account on later sign-ins; it can be deleted from /profile. */}
      <p className="max-w-72 self-center text-center text-xs leading-relaxed text-muted-foreground">
        {t("account.googleEmailNote")}
      </p>
    </div>
  );
}
