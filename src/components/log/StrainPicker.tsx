import { useMemo, useState } from "react";
import { ChevronDown, Leaf, Plus, X } from "lucide-react";
import { useStrains } from "@/lib/data";
import type { Strain } from "@/lib/types";
import { cn } from "@/lib/utils";
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

/** Name or type match (case-insensitive), same fields cmdk searched before. */
function strainMatches(strain: Strain, normalizedQuery: string): boolean {
  if (normalizedQuery === "") return true;
  return (
    strain.name.toLowerCase().includes(normalizedQuery) ||
    strain.type.toLowerCase().includes(normalizedQuery)
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
 */
export default function StrainPicker({
  value,
  onChange,
  invalid = false,
}: StrainPickerProps) {
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

  const personalMatches = useMemo(
    () => personal.filter((s) => strainMatches(s, normalizedQuery)),
    [personal, normalizedQuery],
  );
  const catalogMatches = useMemo(
    () => catalog.filter((s) => strainMatches(s, normalizedQuery)),
    [catalog, normalizedQuery],
  );
  const visibleCatalog = useMemo(
    () => catalogMatches.slice(0, MAX_MATCHES),
    [catalogMatches],
  );
  const hiddenCount = catalogMatches.length - visibleCatalog.length;

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

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setCreating(false);
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choose a strain"
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
                    ? "Personal strain"
                    : `${selected.type} · THC ${selected.thc}%`}
                </span>
              </span>
              {isPersonalSlug(selected.slug) ? (
                <Badge variant="secondary" className="shrink-0">
                  Yours
                </Badge>
              ) : null}
            </>
          ) : (
            <span className="flex-1 text-base text-muted-foreground">
              Search strains…
            </span>
          )}
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out-strong",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0"
      >
        {creating ? (
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Add your strain</p>
              <button
                type="button"
                aria-label="Back to search"
                onClick={() => setCreating(false)}
                className="pressable flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Name
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
                placeholder="e.g. Basement Kush"
                className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-foreground/40"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Type <span className="font-normal">(optional)</span>
              </span>
              <div className="flex gap-2">
                {TYPE_OPTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNewType((cur) => (cur === t ? null : t))}
                    className={cn(
                      "pressable min-h-10 flex-1 rounded-lg border text-sm font-medium transition-colors duration-150",
                      newType === t
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-foreground",
                    )}
                  >
                    {t}
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
              Save &amp; use this strain
            </Button>
            <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
              Saved on this device only — your personal strains stay private.
            </p>
          </div>
        ) : (
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search strains…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-72">
              <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
                {catalogLoading
                  ? "Loading the catalog…"
                  : `No strain matches “${query}”.`}
              </CommandEmpty>

              {personalMatches.length > 0 ? (
                <CommandGroup heading="Your strains">
                  {personalMatches.map((s) => (
                    <StrainRow key={s.slug} strain={s} onPick={pick} />
                  ))}
                </CommandGroup>
              ) : null}

              {visibleCatalog.length > 0 ? (
                <CommandGroup heading="Catalog">
                  {visibleCatalog.map((s) => (
                    <StrainRow key={s.slug} strain={s} onPick={pick} />
                  ))}
                </CommandGroup>
              ) : null}

              {catalogLoading && personalMatches.length > 0 ? (
                <p
                  className="px-3 py-2 text-center text-xs text-muted-foreground"
                  role="status"
                >
                  Loading the full catalog…
                </p>
              ) : null}

              {!catalogLoading && hiddenCount > 0 ? (
                <p className="border-t border-border/60 px-3 py-2 text-center text-xs text-muted-foreground">
                  Showing {visibleCatalog.length} of{" "}
                  {catalogMatches.length.toLocaleString()} matches — keep
                  typing to narrow it down.
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
                    ? `Add “${query.trim()}” as your strain`
                    : "Can't find it? Add yours"}
                </button>
              </div>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

function StrainRow({
  strain,
  onPick,
}: {
  strain: Strain;
  onPick: (slug: string) => void;
}) {
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
          {strain.name}
        </span>
        <span className="block text-xs text-muted-foreground">
          {personalRow
            ? "Personal strain"
            : `${strain.type} · THC ${strain.thc}%`}
        </span>
      </span>
    </CommandItem>
  );
}
