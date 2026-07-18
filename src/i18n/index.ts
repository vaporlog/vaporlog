import i18n, { type Resource } from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * i18n infrastructure for vaporlog (English / Spanish).
 *
 * Locale files live in ./locales/<lng>/<namespace>.json and are bundled
 * eagerly — the namespace is the file name (e.g. locales/en/common.json →
 * namespace "common"). Components read strings via
 * `useTranslation("<namespace>")`; non-component code can import the default
 * `i18n` instance and call `i18n.t(...)`.
 *
 * Language detection: persisted choice in localStorage ("vaporlog.lang")
 * wins; otherwise any navigator.language starting with "es" → Spanish,
 * everything else → English. The active language is mirrored onto
 * <html lang> on init and on every change.
 */

export const LANGUAGE_STORAGE_KEY = "vaporlog.lang";

const localeModules = import.meta.glob("./locales/*/*.json", {
  eager: true,
});

const resources: Record<string, Record<string, unknown>> = {};

for (const [path, mod] of Object.entries(localeModules)) {
  const match = /^\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!match) continue;
  const [, lng, namespace] = match;
  const data = (mod as { default?: unknown }).default ?? mod;
  (resources[lng] ??= {})[namespace] = data;
}

type SupportedLanguage = "en" | "es";

function detectInitialLanguage(): SupportedLanguage {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
  } catch {
    // localStorage unavailable (private mode, storage disabled) — fall
    // through to navigator-based detection.
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  return nav.toLowerCase().startsWith("es") ? "es" : "en";
}

i18n.use(initReactI18next).init({
  // The glob-built map is structurally a Resource but typed loosely —
  // the cast keeps init() happy without per-namespace type gymnastics.
  resources: resources as unknown as Resource,
  lng: detectInitialLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes interpolated values.
  },
});

document.documentElement.lang = i18n.language;

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
