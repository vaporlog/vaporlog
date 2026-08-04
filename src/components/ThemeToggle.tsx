import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { getTheme, setTheme, type Theme } from "@/lib/theme";

/**
 * Light/dark switch for the app header. Same quiet footprint as the
 * language toggle (icon button, muted until hovered) so the 360px header
 * row still fits. The icon shows where a tap takes you: a moon in light
 * mode, a sun in dark mode.
 */
export default function ThemeToggle() {
  const { t } = useTranslation("common");
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("theme.toggleAria")}
      aria-pressed={theme === "dark"}
      title={theme === "dark" ? t("theme.toLight") : t("theme.toDark")}
      className="pressable flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground"
    >
      {theme === "dark" ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
