import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import i18n from "@/i18n";
import { translateTag } from "@/i18n/vocab-translations";

interface ChipGroupProps {
  /** Controlled vocabulary options (Title Case, from getVocab()). */
  options: string[];
  /** Selected tags (vocab + custom, deduped). */
  selected: string[];
  /** Custom tags the user appended — rendered after the vocab chips. */
  custom: string[];
  onToggle: (tag: string) => void;
  onAddCustom: (tag: string) => void;
  /** Placeholder for the custom-tag input, e.g. "Add your own aroma". */
  addLabel: string;
  /**
   * How many option chips render before collapsing behind "show all".
   * Selected options outside the first page always stay visible.
   */
  collapsedCount?: number;
}

/** Default first-page size; a group only collapses when hiding ≥3 chips. */
const DEFAULT_COLLAPSED_COUNT = 10;

/**
 * Tappable multi-select chips (≥40px targets). Selection uses near-black
 * fill — the herb accent stays reserved for CTAs and the rating.
 * Custom tags normalize to Title Case, dedupe against the vocabulary, and
 * land at the end of the list.
 *
 * Long vocabularies (aromas ships 65) collapse to a first page of
 * `collapsedCount` chips — the caller orders options by the user's own
 * frequency, so the first page is usually all they need. Selected chips
 * outside the first page stay visible while collapsed.
 */
export default function ChipGroup({
  options,
  selected,
  custom,
  onToggle,
  onAddCustom,
  addLabel,
  collapsedCount = DEFAULT_COLLAPSED_COUNT,
}: ChipGroupProps) {
  const { t } = useTranslation("log");
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);

  const selectedSet = new Set(selected);

  const collapsible = options.length > collapsedCount + 2;
  let visibleOptions = options;
  if (collapsible && !expanded) {
    const head = options.slice(0, collapsedCount);
    const headSet = new Set(head);
    visibleOptions = [
      ...head,
      ...options.filter((o) => !headSet.has(o) && selectedSet.has(o)),
    ];
  }

  function titleCase(raw: string): string {
    return raw
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join(" ");
  }

  function submitCustom() {
    const tag = titleCase(draft);
    if (!tag) return;
    setDraft("");
    const exists =
      options.some((o) => o.toLowerCase() === tag.toLowerCase()) ||
      custom.some((c) => c.toLowerCase() === tag.toLowerCase());
    if (exists) {
      // Already in the list — just make sure it's selected.
      const match =
        options.find((o) => o.toLowerCase() === tag.toLowerCase()) ??
        custom.find((c) => c.toLowerCase() === tag.toLowerCase());
      if (match && !selectedSet.has(match)) onToggle(match);
      return;
    }
    onAddCustom(tag);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {visibleOptions.map((tag) => (
          <Chip
            key={tag}
            label={translateTag(tag, i18n.language)}
            active={selectedSet.has(tag)}
            onClick={() => onToggle(tag)}
          />
        ))}
        {custom.map((tag) => (
          <Chip
            key={`custom-${tag}`}
            label={tag}
            active={selectedSet.has(tag)}
            custom
            onClick={() => onToggle(tag)}
          />
        ))}
        {collapsible ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="pressable flex min-h-10 items-center gap-1 rounded-full border border-dashed border-foreground/30 px-4 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            {expanded
              ? t("chipGroup.showLess")
              : t("chipGroup.showAll", { count: options.length })}
            {expanded ? (
              <ChevronUp className="size-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitCustom();
            }
          }}
          placeholder={addLabel}
          aria-label={addLabel}
          className="h-10 min-w-0 flex-1 rounded-lg border border-dashed border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-foreground/40"
        />
        <button
          type="button"
          onClick={submitCustom}
          disabled={!draft.trim()}
          aria-label={t("chipGroup.addAria")}
          className="pressable flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background transition-colors duration-150 enabled:hover:bg-secondary disabled:opacity-40"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  custom = false,
  onClick,
}: {
  label: string;
  active: boolean;
  custom?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "pressable min-h-10 rounded-full border px-4 text-sm font-medium transition-colors duration-150",
        active
          ? "border-foreground bg-foreground text-background"
          : cn(
              "bg-background text-foreground",
              custom ? "border-dashed border-foreground/30" : "border-border",
            ),
      )}
    >
      {label}
    </button>
  );
}
