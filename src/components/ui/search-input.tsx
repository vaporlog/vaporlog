import { Search, X } from "lucide-react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  onClear?: () => void;
  clearAriaLabel?: string;
}

/**
 * Free-text search input with a leading Search icon and a trailing clear
 * button. Used on the diary and community feed to filter sessions live.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  onClear,
  clearAriaLabel,
}: SearchInputProps) {
  const hasValue = value.trim() !== "";

  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-foreground/40"
      />
      {hasValue ? (
        <button
          type="button"
          onClick={() => onClear?.()}
          aria-label={clearAriaLabel}
          className="pressable absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
