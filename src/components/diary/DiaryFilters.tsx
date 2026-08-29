import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import i18n from "@/i18n";
import { translateTag } from "@/i18n/vocab-translations";
import {
  EMPTY_DIARY_FILTERS,
  type DiaryFiltersState,
  type LikedFilter,
  type NamedSlugOption,
} from "./diary-utils";

/** Radix Select rejects "" as an item value — sentinel for "sin filtro". */
const ALL = "__all__";
const RATING_OPTIONS = [5, 6, 7, 8, 9, 10];
/** Tag facets collapse past this many chips (mirrors ChipGroup's pattern). */
const TAG_COLLAPSE_COUNT = 12;

type TagFacetKey = "aromas" | "flavors" | "moods";

interface DiaryFiltersProps {
  filters: DiaryFiltersState;
  onChange: (next: DiaryFiltersState) => void;
  /** Options derived from the diary itself (most-used first). */
  strains: NamedSlugOption[];
  devices: NamedSlugOption[];
  aromas: string[];
  flavors: string[];
  moods: string[];
}

/**
 * Structured filter panel for the diary — complements the free-text search.
 * Every option comes from the user's own sessions, so no filter can point at
 * something the diary has never seen. All facets combine (AND); selected
 * tags within one facet combine with OR.
 */
export default function DiaryFilters({
  filters,
  onChange,
  strains,
  devices,
  aromas,
  flavors,
  moods,
}: DiaryFiltersProps) {
  const { t } = useTranslation("diary");

  const set = <K extends keyof DiaryFiltersState>(
    key: K,
    value: DiaryFiltersState[K],
  ) => onChange({ ...filters, [key]: value });

  const toggleTag = (key: TagFacetKey, tag: string) => {
    const current = filters[key];
    set(
      key,
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    );
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select
          value={filters.strainSlug || ALL}
          onValueChange={(value) =>
            set("strainSlug", value === ALL ? "" : value)
          }
        >
          <SelectTrigger size="sm" aria-label={t("filters.strainAria")}>
            <SelectValue placeholder={t("filters.strain")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filters.allStrains")}</SelectItem>
            {strains.map((option) => (
              <SelectItem key={option.slug} value={option.slug}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.deviceSlug || ALL}
          onValueChange={(value) =>
            set("deviceSlug", value === ALL ? "" : value)
          }
        >
          <SelectTrigger size="sm" aria-label={t("filters.deviceAria")}>
            <SelectValue placeholder={t("filters.device")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filters.allDevices")}</SelectItem>
            {devices.map((option) => (
              <SelectItem key={option.slug} value={option.slug}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.minRating === null ? ALL : String(filters.minRating)}
          onValueChange={(value) =>
            set("minRating", value === ALL ? null : Number(value))
          }
        >
          <SelectTrigger size="sm" aria-label={t("filters.ratingAria")}>
            <SelectValue placeholder={t("filters.rating")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filters.anyRating")}</SelectItem>
            {RATING_OPTIONS.map((rating) => (
              <SelectItem key={rating} value={String(rating)}>
                {rating === 10
                  ? "10"
                  : t("filters.ratingAtLeast", { value: rating })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <ToggleGroup
          type="single"
          value={filters.liked}
          onValueChange={(value) => {
            if (value === "all" || value === "liked" || value === "disliked") {
              set("liked", value as LikedFilter);
            }
          }}
          variant="outline"
          size="sm"
          aria-label={t("filters.likedAria")}
          className="flex-wrap justify-start"
        >
          <ToggleGroupItem
            value="all"
            className="pressable px-3"
            aria-label={t("filters.likedAllAria")}
          >
            {t("filters.likedAll")}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="liked"
            className="pressable px-3"
            aria-label={t("filters.likedYesAria")}
          >
            👍
          </ToggleGroupItem>
          <ToggleGroupItem
            value="disliked"
            className="pressable px-3"
            aria-label={t("filters.likedNoAria")}
          >
            👎
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {t("filters.dateFrom")}
            <input
              type="date"
              value={filters.dateFrom}
              max={filters.dateTo || undefined}
              onChange={(event) => set("dateFrom", event.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-foreground/40"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {t("filters.dateTo")}
            <input
              type="date"
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(event) => set("dateTo", event.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-foreground/40"
            />
          </label>
        </div>
      </div>

      <TagFacet
        label={t("filters.aromas")}
        options={aromas}
        selected={filters.aromas}
        onToggle={(tag) => toggleTag("aromas", tag)}
      />
      <TagFacet
        label={t("filters.flavors")}
        options={flavors}
        selected={filters.flavors}
        onToggle={(tag) => toggleTag("flavors", tag)}
      />
      <TagFacet
        label={t("filters.moods")}
        options={moods}
        selected={filters.moods}
        onToggle={(tag) => toggleTag("moods", tag)}
      />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_DIARY_FILTERS })}
          className="pressable flex min-h-9 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
          {t("filters.clear")}
        </button>
      </div>
    </div>
  );
}

interface TagFacetProps {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (tag: string) => void;
}

/**
 * One multi-select tag facet (aromas / flavors / moods). Long lists collapse
 * to a first page; selected chips outside it stay visible — same pattern as
 * the log form's ChipGroup, minus the custom-tag input (filters only offer
 * tags the diary already has).
 */
function TagFacet({ label, options, selected, onToggle }: TagFacetProps) {
  const { t } = useTranslation("diary");
  const [expanded, setExpanded] = useState(false);

  if (options.length === 0) return null;

  const selectedSet = new Set(selected);
  const collapsible = options.length > TAG_COLLAPSE_COUNT + 2;
  let visible = options;
  if (collapsible && !expanded) {
    const head = options.slice(0, TAG_COLLAPSE_COUNT);
    const headSet = new Set(head);
    visible = [
      ...head,
      ...options.filter((o) => !headSet.has(o) && selectedSet.has(o)),
    ];
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((tag) => {
          const active = selectedSet.has(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onToggle(tag)}
              aria-pressed={active}
              className={cn(
                "pressable min-h-8 rounded-full border px-3 text-xs font-medium transition-colors duration-150",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground",
              )}
            >
              {translateTag(tag, i18n.language)}
            </button>
          );
        })}
        {collapsible ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="pressable flex min-h-8 items-center gap-1 rounded-full border border-dashed border-foreground/30 px-3 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            {expanded
              ? t("filters.showLess")
              : t("filters.showAll", { count: options.length })}
            {expanded ? (
              <ChevronUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
