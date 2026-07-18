import { useTranslation } from "react-i18next";
import { LANGUAGE_STORAGE_KEY } from "@/i18n";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
] as const;

/**
 * Compact EN | ES language switcher for the app header. Persists the choice
 * to localStorage ("vaporlog.lang") so it wins over navigator detection on
 * the next visit; i18n mirrors the active language onto <html lang>.
 *
 * Footprint is kept minimal (11px labels, hairline separator) so the
 * 360px header row still fits alongside the auth control and the CTA.
 */
export default function LanguageToggle() {
  const { t, i18n } = useTranslation("common");
  const active = i18n.language?.toLowerCase().startsWith("es") ? "es" : "en";

  function select(code: string) {
    if (code === active) return;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
    } catch {
      // Storage unavailable — the language still changes for this session.
    }
    void i18n.changeLanguage(code);
  }

  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className="flex items-center gap-0.5 text-[11px] font-medium leading-none text-muted-foreground"
    >
      {LANGUAGES.map(({ code, label }, index) => (
        <span key={code} className="flex items-center gap-0.5">
          {index > 0 && (
            <span aria-hidden="true" className="text-border">
              |
            </span>
          )}
          <button
            type="button"
            onClick={() => select(code)}
            aria-pressed={active === code}
            className={`pressable rounded px-0.5 py-1 transition-colors duration-150 ${
              active === code
                ? "font-semibold text-foreground"
                : "hover:text-foreground"
            }`}
          >
            {label}
          </button>
        </span>
      ))}
    </div>
  );
}
