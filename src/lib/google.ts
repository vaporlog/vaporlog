/**
 * vaporlog — Google Identity Services (GIS) glue.
 *
 * The "Continue with Google" button needs two async things: the OAuth
 * client ID (public by design — served by GET /api/config so it never has
 * to be baked into the Docker build) and Google's gsi/client script. Both
 * are fetched lazily and cached at module level, so multiple mounts share
 * one fetch and one <script> tag.
 *
 * When no client ID is configured the whole feature hides itself: the
 * button component renders nothing and the welcome flow looks exactly as
 * before.
 */
import { apiFetch } from "@/lib/api";

/** Minimal surface of the GIS API we use (avoids pulling @types). */
interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
  }): void;
  renderButton(element: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

let configPromise: Promise<string | null> | null = null;
let gisPromise: Promise<GoogleIdApi | null> | null = null;

/** The configured Google OAuth client ID, or null when not set up. */
export function getGoogleClientId(): Promise<string | null> {
  if (configPromise === null) {
    configPromise = apiFetch<{ googleClientId?: string | null }>("/config")
      .then((data) =>
        typeof data?.googleClientId === "string" && data.googleClientId !== ""
          ? data.googleClientId
          : null,
      )
      .catch(() => null);
  }
  return configPromise;
}

/**
 * Loads the GIS script once and resolves to its id API. Resolves to null
 * when the script fails (offline, blocked by an extension) — callers treat
 * that as "Google sign-in unavailable" and simply hide the button.
 */
export function loadGoogleId(): Promise<GoogleIdApi | null> {
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id);
  }
  if (gisPromise === null) {
    gisPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.google?.accounts?.id ?? null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }
  return gisPromise;
}
