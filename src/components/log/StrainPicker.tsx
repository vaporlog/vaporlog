import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Leaf, Plus, X } from "lucide-react";
import { useStrains } from "@/lib/data";
import type { Strain } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  addPersonalStrain,
  getPersonalStrains,
  isPersonalSlug,
  personalStrainAsStrain,
} from "./personal";

interface StrainPickerProps {
  value: string | null;
  onChange: (slug: string) => void;
  /** When true, renders an error ring — set after a failed save attempt. */
  invalid?: boolean;
}

const TYPE_OPTIONS: Array<"Indica" | "Sativa" | "Hybrid"> = [
  "Indica",
  "Sativa",
  "Hybrid",
];

/**
 * Hard cap on rendered rows. The full catalog is ~8.6k strains — rendering
 * every match would freeze the popover, so search keeps querying the FULL
 * loaded catalog but only the first MAX_MATCHES matches render, with a
 * "keep typing to narrow" hint when more exist.
 */
const MAX_MATCHES = 50;

/**
 * Tiered score for a strain against the normalized query (lower = better):
 * 0 = exact name, 1 = name starts with, 2 = a word in the name starts with
 * the query ("og" → "Tahoe OG" outranks "Bogart"), 3 = name contains,
 * 4 = type match (keeps type searchable, the same secondary field cmdk
 * searched before). null = no match. Every match stays in the list — tiers
 * only decide the order.
 */
function strainScore(strain: Strain, normalizedQuery: string): number | null {
  if (normalizedQuery === "") return 0;
  const name = strain.name.toLowerCase();
  if (name === normalizedQuery) return 0;
  if (name.startsWith(normalizedQuery)) return 1;
  if (
    name
      .split(/[^a-z0-9áéíóúñü]+/)
      .some((word) => word.startsWith(normalizedQuery))
  ) {
    return 2;
  }
  if (name.includes(normalizedQuery)) return 3;
  if (strain.type.toLowerCase().includes(normalizedQuery)) return 4;
  return null;
}

/** Wraps the matched substring in a semibold span; no-op when the name itself didn't match. */
function HighlightedName({ name, query }: { name: string; query: string }) {
  const index = query ? name.toLowerCase().indexOf(query) : -1;
  if (index === -1) return <>{name}</>;
  return (
    <>
      {name.slice(0, index)}
      <span className="font-semibold text-foreground">
        {name.slice(index, index + query.length)}
      </span>
      {name.slice(index + query.length)}
    </>
  );
}

/**
 * Searchable strain combobox over the full catalog + the user's personal
 * strains. "Can't find it? Add yours" creates a personal strain inline
 * (name + optional type) and selects it immediately.
 *
 * The catalog loads lazily (`useStrains`): the popover shows a loading row
 * until the chunk arrives, and cmdk's built-in filtering is disabled
 * (`shouldFilter={false}`) so the picker controls its own query + cap.
 * While searching, personal + catalog entries merge into one list ranked by
 * `strainScore` tier (exact > prefix > word-start > substring > type),
 * alphabetical within a tier, capped at MAX_MATCHES after ranking; with an
 * empty query the two-group browse view (personal, then catalog) is kept.
 *
 * On mobile (<768px) the picker renders as a bottom Drawer instead of a
 * Popover: vaul tracks the visual viewport, so the sheet stays inside the
 * screen when the on-screen keyboard opens — a Popover is positioned
 * against the layout viewport and overflows the margins in that case.
 */
export default function StrainPicker({
  value,
  onChange,
  invalid = false,
}: StrainPickerProps) {
  const { t } = useTranslation("log");
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<
    "Indica" | "Sativa" | "Hybrid" | null
  >(null);
  const [personal, setPersonal] = useState<Strain[]>(() =>
    getPersonalStrains().map(personalStrainAsStrain),
  );
  const { strains: catalog, loading: catalogLoading } = useStrains();

  const normalizedQuery = query.trim().toLowerCase();
  const searching = normalizedQuery !== "";

  const visibleCatalog = useMemo(() => catalog.slice(0, MAX_MATCHES), [catalog]);
  const hiddenCount = catalog.length - visibleCatalog.length;

  // Ranked flat list (personal + catalog merged) — only used while searching.
  const rankedMatches = useMemo(() => {
    if (!searching) return [];
    return [...personal, ...catalog]
      .map((strain) => ({ strain, score: strainScore(strain, normalizedQuery) }))
      .filter(
        (r): r is { strain: Strain; score: number } => r.score !== null,
      )
      .sort(
        (a, b) =>
          a.score - b.score || a.strain.name.localeCompare(b.strain.name),
      )
      .map((r) => r.strain);
  }, [searching, personal, catalog, normalizedQuery]);
  const visibleRanked = useMemo(
    () => rankedMatches.slice(0, MAX_MATCHES),
    [rankedMatches],
  );
  const hiddenRankedCount = rankedMatches.length - visibleRanked.length;

  const all = useMemo(() => {
    return [...personal, ...catalog];
  }, [personal, catalog]);

  const selected = useMemo(
    () => (value ? all.find((s) => s.slug === value) : undefined),
    [all, value],
  );

  function pick(slug: string) {
    onChange(slug);
    setOpen(false);
    setCreating(false);
    setQuery("");
  }

  function openCreate() {
    setNewName(query.trim());
    setNewType(null);
    setCreating(true);
  }

  function confirmCreate() {
    const name = newName.trim();
    if (!name) return;
    const entry = addPersonalStrain(name, newType);
    setPersonal(getPersonalStrains().map(personalStrainAsStrain));
    pick(entry.slug);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCreating(false);
      setQuery("");
    }
  }

  const trigger = (
    <button
      type="button"
      aria-label={t("strainPicker.chooseAria")}
      className={cn(
        "pressable flex min-h-14 w-full items-center gap-3 rounded-xl border bg-background px-4 text-left transition-colors duration-150",
        invalid
          ? "border-destructive"
          : "border-border hover:border-foreground/25",
      )}
    >
      {selected ? (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">
              {selected.name}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {isPersonalSlug(selected.slug)
                ? t("strainPicker.personal")
                : `${selected.type} · THC ${selected.thc}%`}
            </span>
          </span>
          {isPersonalSlug(selected.slug) ? (
            <Badge variant="secondary" className="shrink-0">
              {t("strainPicker.yours")}
            </Badge>
          ) : null}
        </>
      ) : (
        <span className="flex-1 text-base text-muted-foreground">
          {t("strainPicker.searchPlaceholder")}
        </span>
      )}
      <ChevronDown
        className={cn(
          "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out-strong",
          open && "rotate-180",
        )}
      />
    </button>
  );

  const body = creating ? (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{t("strainPicker.addTitle")}</p>
        <button
          type="button"
          aria-label={t("strainPicker.backAria")}
          onClick={() => setCreating(false)}
          className="pressable flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t("strainPicker.nameLabel")}
        </span>
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmCreate();
            }
          }}
          placeholder={t("strainPicker.namePlaceholder")}
          className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-foreground/40"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t("strainPicker.typeLabel")}{" "}
          <span className="font-normal">{t("strainPicker.optionalParens")}</span>
        </span>
        <div className="flex gap-2">
          {TYPE_OPTIONS.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setNewType((cur) => (cur === type ? null : type))}
              className={cn(
                "pressable min-h-10 flex-1 rounded-lg border text-sm font-medium transition-colors duration-150",
                newType === type
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground",
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <Button
        type="button"
        onClick={confirmCreate}
        disabled={!newName.trim()}
        className="pressable herb-hover min-h-11 bg-herb text-herb-foreground"
      >
        <Plus className="size-4" />
        {t("strainPicker.saveUse")}
      </Button>
      <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
        {t("strainPicker.privacyNote")}
      </p>
    </div>
  ) : (
    <Command shouldFilter={false}>
      <CommandInput
        placeholder={t("strainPicker.searchPlaceholder")}
        value={query}
        onValueChange={setQuery}
        className="text-base"
      />
      <CommandList
        className={
          isMobile
            ? "max-h-[55dvh]"
            : "max-h-[min(18rem,var(--radix-popover-content-available-height,18rem))]"
        }
      >
        <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
          {catalogLoading
            ? t("strainPicker.loading")
            : t("strainPicker.noMatch", { query })}
        </CommandEmpty>

        {searching ? (
          visibleRanked.map((s) => (
            <StrainRow
              key={s.slug}
              strain={s}
              query={normalizedQuery}
              selected={s.slug === value}
              onPick={pick}
            />
          ))
        ) : (
          <>
            {personal.length > 0 ? (
              <CommandGroup heading={t("strainPicker.yourStrains")}>
                {personal.map((s) => (
                  <StrainRow
                    key={s.slug}
                    strain={s}
                    query=""
                    selected={s.slug === value}
                    onPick={pick}
                  />
                ))}
              </CommandGroup>
            ) : null}

            {visibleCatalog.length > 0 ? (
              <CommandGroup heading={t("strainPicker.catalog")}>
                {visibleCatalog.map((s) => (
                  <StrainRow
                    key={s.slug}
                    strain={s}
                    query=""
                    selected={s.slug === value}
                    onPick={pick}
                  />
                ))}
              </CommandGroup>
            ) : null}
          </>
        )}

        {catalogLoading &&
        (searching ? visibleRanked.length : personal.length) > 0 ? (
          <p
            className="px-3 py-2 text-center text-xs text-muted-foreground"
            role="status"
          >
            {t("strainPicker.loadingFull")}
          </p>
        ) : null}

        {!catalogLoading &&
        (searching ? hiddenRankedCount : hiddenCount) > 0 ? (
          <p className="border-t border-border/60 px-3 py-2 text-center text-xs text-muted-foreground">
            {t("strainPicker.showingCount", {
              shown: searching ? visibleRanked.length : visibleCatalog.length,
              total: searching ? rankedMatches.length : catalog.length,
            })}
          </p>
        ) : null}

        <div className="border-t p-2">
          <button
            type="button"
            onClick={openCreate}
            className="pressable flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-secondary">
              <Plus className="size-3.5" />
            </span>
            {query.trim()
              ? t("strainPicker.addQuery", { query: query.trim() })
              : t("strainPicker.addFallback")}
          </button>
        </div>
      </CommandList>
    </Command>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="sr-only">
            <DrawerTitle>{t("strainPicker.chooseAria")}</DrawerTitle>
          </DrawerHeader>
          <div className="min-h-0 overflow-y-auto px-2 pb-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>

      <PopoverContent
        align="start"
        collisionPadding={8}
        className="w-[var(--radix-popover-trigger-width)] min-w-72 max-w-[calc(100vw-1rem)] p-0"
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}

function StrainRow({
  strain,
  query,
  selected = false,
  onPick,
}: {
  strain: Strain;
  /** Normalized (trimmed, lowercase) search query used to highlight the match. */
  query: string;
  selected?: boolean;
  onPick: (slug: string) => void;
}) {
  const { t } = useTranslation("log");
  const personalRow = isPersonalSlug(strain.slug);
  return (
    <CommandItem
      value={strain.slug}
      keywords={[strain.name, strain.type]}
      onSelect={() => onPick(strain.slug)}
      className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2"
    >
      {personalRow ? (
        <Leaf className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          <HighlightedName name={strain.name} query={query} />
        </span>
        <span className="block text-xs text-muted-foreground">
          {personalRow
            ? t("strainPicker.personal")
            : `${strain.type} · THC ${strain.thc}%`}
        </span>
      </span>
      {selected ? <Check className="size-4 shrink-0 text-herb" /> : null}
    </CommandItem>
  );
}
