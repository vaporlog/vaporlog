import { useDeferredValue, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import StrainCard from "@/components/strains/StrainCard";
import {
  communityAverageMap,
  strainMatchesQuery,
} from "@/components/strains/strain-utils";
import { getVocab, usePublicSessions, useStrains } from "@/lib/data";

type TypeFilter = "all" | "Indica" | "Sativa" | "Hybrid";
type SortKey = "name" | "thc" | "rating";

const ALL_EFFECTS = "all";

/** Cards per page — keeps the grid fast with the full ~8.6k catalog. */
const PAGE_SIZE = 60;

/**
 * Strain catalog: search (name / terpene / effect), type + effect filters,
 * sort by name, THC, or community rating. Mobile-first card grid.
 *
 * The catalog is several MB and loads as a lazy chunk (`useStrains`), so
 * the page renders an explicit loading state first. Search/filters/sort
 * always run across the FULL loaded catalog; pagination (60/page) keeps the
 * rendered card count bounded. The query is deferred so typing stays
 * responsive while a several-thousand-row filter+sort runs.
 */
export default function Strains() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [effectFilter, setEffectFilter] = useState<string>(ALL_EFFECTS);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [page, setPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement>(null);

  const { strains, loading } = useStrains();
  const effects = useMemo(() => getVocab().effects, []);
  // Cloud-backed public sessions — averages fill in once the cache
  // hydrates; until then there is simply no rating signal.
  const { sessions: communitySessions } = usePublicSessions();
  const averages = useMemo(
    () => communityAverageMap(communitySessions),
    [communitySessions],
  );
  // With zero community sessions (e.g. production at launch) there is no
  // rating signal — cards hide their rating row and the rating sort option
  // goes away so it can't masquerade as a meaningful order.
  const hasCommunityRatings = averages.size > 0;

  // Deferred so keystrokes paint immediately; the heavy filter+sort over
  // thousands of strains follows a frame later.
  const deferredQuery = useDeferredValue(query);

  const visible = useMemo(() => {
    const filtered = strains.filter(
      (strain) =>
        strainMatchesQuery(strain, deferredQuery) &&
        (typeFilter === "all" || strain.type === typeFilter) &&
        (effectFilter === ALL_EFFECTS ||
          strain.effects.some(
            (e) => e.toLowerCase() === effectFilter.toLowerCase(),
          )),
    );

    const sorted = [...filtered];
    switch (sortKey) {
      case "thc":
        sorted.sort((a, b) => b.thc - a.thc || a.name.localeCompare(b.name));
        break;
      case "rating":
        sorted.sort((a, b) => {
          const ra = averages.get(a.slug)?.avg;
          const rb = averages.get(b.slug)?.avg;
          if (ra === undefined && rb === undefined)
            return a.name.localeCompare(b.name);
          if (ra === undefined) return 1; // unrated strains sink to the bottom
          if (rb === undefined) return -1;
          return rb - ra || a.name.localeCompare(b.name);
        });
        break;
      case "name":
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [strains, averages, deferredQuery, typeFilter, effectFilter, sortKey]);

  // Any change to the result-set definition restarts pagination. Done in
  // the change handlers (not an effect) so the reset is synchronous; the
  // Math.min clamp below covers a shrinking result set.
  function changeQuery(value: string) {
    setQuery(value);
    setPage(1);
  }
  function changeTypeFilter(value: TypeFilter) {
    setTypeFilter(value);
    setPage(1);
  }
  function changeEffectFilter(value: string) {
    setEffectFilter(value);
    setPage(1);
  }
  function changeSortKey(value: SortKey) {
    setSortKey(value);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  // Clamp in case the result set shrank (e.g. deferred query caught up).
  const currentPage = Math.min(page, totalPages);
  const pageStrains = useMemo(
    () =>
      visible.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
      ),
    [visible, currentPage],
  );

  function goToPage(next: number) {
    setPage(next);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Strains</h1>
        <p className="text-muted-foreground">
          {loading
            ? "Loading the catalog…"
            : `The full catalog — ${strains.length.toLocaleString()} strains with terpenes, effects, and lineage.`}
        </p>
      </header>

      <div className="flex flex-col gap-3" ref={listTopRef}>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder="Search name, terpene, or effect…"
            aria-label="Search strains"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={typeFilter}
            onValueChange={(value) => {
              if (value) changeTypeFilter(value as TypeFilter);
            }}
            variant="outline"
            size="sm"
            aria-label="Filter by type"
          >
            <ToggleGroupItem value="all" className="pressable px-3">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="Indica" className="pressable px-3">
              Indica
            </ToggleGroupItem>
            <ToggleGroupItem value="Sativa" className="pressable px-3">
              Sativa
            </ToggleGroupItem>
            <ToggleGroupItem value="Hybrid" className="pressable px-3">
              Hybrid
            </ToggleGroupItem>
          </ToggleGroup>

          <Select value={effectFilter} onValueChange={changeEffectFilter}>
            <SelectTrigger size="sm" aria-label="Filter by effect">
              <SelectValue placeholder="Effect" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_EFFECTS}>All effects</SelectItem>
              {effects.map((effect) => (
                <SelectItem key={effect} value={effect}>
                  {effect}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={sortKey}
            onValueChange={(value) => changeSortKey(value as SortKey)}
          >
            <SelectTrigger size="sm" aria-label="Sort strains">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name A–Z</SelectItem>
              <SelectItem value="thc">THC, high to low</SelectItem>
              {hasCommunityRatings && (
                <SelectItem value="rating">Community rating</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center"
          role="status"
        >
          <p className="font-medium">Loading the catalog…</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Thousands of strains are on their way — this takes a moment the
            first time.
          </p>
        </div>
      ) : visible.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pageStrains.map((strain) => (
              <StrainCard
                key={strain.slug}
                strain={strain}
                community={averages.get(strain.slug) ?? null}
              />
            ))}
          </div>

          <nav
            className="flex flex-wrap items-center justify-between gap-3"
            aria-label="Catalog pages"
          >
            <p className="text-sm text-muted-foreground tabular-nums">
              {visible.length.toLocaleString()}{" "}
              {visible.length === 1 ? "strain" : "strains"} · page{" "}
              {currentPage} of {totalPages.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="pressable"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Prev
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="pressable"
              >
                Next
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </nav>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="font-medium">No strains match</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Try a different name, terpene, or effect — or clear a filter.
          </p>
        </div>
      )}
    </section>
  );
}
