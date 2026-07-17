import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

/**
 * Tappable multi-select chips (≥40px targets). Selection uses near-black
 * fill — the herb accent stays reserved for CTAs and the rating.
 * Custom tags normalize to Title Case, dedupe against the vocabulary, and
 * land at the end of the list.
 */
export default function ChipGroup({
  options,
  selected,
  custom,
  onToggle,
  onAddCustom,
  addLabel,
}: ChipGroupProps) {
  const [draft, setDraft] = useState("");

  const selectedSet = new Set(selected);

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
        {options.map((tag) => (
          <Chip
            key={tag}
            label={tag}
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
          aria-label="Add custom tag"
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
