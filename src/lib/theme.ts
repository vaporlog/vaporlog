/**
 * vaporlog — light/dark theme.
 *
 * The site ships light-first (see the token blocks in src/index.css); the
 * dark palette activates via the `.dark` class on <html> (tailwind.config
 * `darkMode: ["class"]`). The choice persists per browser in
 * localStorage["vaporlog.theme"] and is applied pre-paint by the inline
 * script in index.html, so returning visitors never see a light flash.
 * Default is light — the documented brand look.
 */
export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "vaporlog.theme";

/** The stored choice; light when unset or storage is unavailable. */
export function getTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

/** Mirrors the theme onto <html> — the only mutation the CSS needs. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** Persists + applies a theme. Never throws (private mode safe). */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — the theme still applies for this session */
  }
  applyTheme(theme);
}

/** Flips the current theme and returns the new one. */
export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
