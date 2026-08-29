import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { SearchInput } from "@/components/ui/search-input";
import i18n from "@/i18n";
import { translateTag } from "@/i18n/vocab-translations";
import { ActivityChart } from "@/components/diary/ActivityChart";
import DiaryFilters from "@/components/diary/DiaryFilters";
import { HighlightsRow } from "@/components/diary/HighlightsRow";
import { DiaryHeader } from "@/components/diary/DiaryHeader";
import { EmptyDiary } from "@/components/diary/EmptyDiary";
import { FavoriteStrains } from "@/components/diary/FavoriteStrains";
import { SessionList } from "@/components/diary/SessionList";
import { StatsStrip } from "@/components/diary/StatsStrip";
import {
  applyDiaryFilters,
  computeFavorites,
  computeStats,
  computeWeeklyActivity,
  countActiveDiaryFilters,
  diaryDeviceOptions,
  diaryStrainOptions,
  diaryTagOptions,
  displayDeviceName,
  displayStrainName,
  EMPTY_DIARY_FILTERS,
  isDiaryFilterActive,
  type DiaryFiltersState,
} from "@/components/diary/diary-utils";
import {
  getProfile,
  toggleSessionPublic,
  toggleSessionInFeed,
  toggleSessionUnwantedEffectsPublic,
  toggleSessionActivitiesPublic,
  useMySessions,
  useStrains,
} from "@/lib/data";

/** Diary — your private session list + basic stats (age-gated). */
export default function Diary() {
  const { t } = useTranslation("diary");
  const profile = getProfile();
  // Cloud-backed personal sessions; re-renders when the cache hydrates and
  // on every optimistic mutation (save / publish / unpublish).
  const { sessions, loading } = useMySessions();
  // Publish toggles are async now — one in flight at a time.
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null);
  // Await the lazy catalog so diary cards resolve real strain names and
  // catalog links (humanized-slug fallback until it lands — diary-utils).
  useStrains();

  const stats = useMemo(() => computeStats(sessions), [sessions]);
  const favorites = useMemo(() => computeFavorites(sessions), [sessions]);
  const weekly = useMemo(() => computeWeeklyActivity(sessions), [sessions]);

  // Structured filters — the panel under the search box. They compose with
  // the free-text query (both must match) and run client-side over the same
  // in-memory sessions.
  const [filters, setFilters] = useState<DiaryFiltersState>(EMPTY_DIARY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterOptions = useMemo(
    () => ({
      strains: diaryStrainOptions(sessions),
      devices: diaryDeviceOptions(sessions),
      aromas: diaryTagOptions(sessions, (s) => s.aromas),
      flavors: diaryTagOptions(sessions, (s) => s.flavors),
      moods: diaryTagOptions(sessions, (s) => s.moods),
    }),
    [sessions],
  );
  const filtering = isDiaryFilterActive(filters);
  const activeFilterCount = countActiveDiaryFilters(filters);
  const facetFiltered = useMemo(
    () => applyDiaryFilters(sessions, filters),
    [sessions, filters],
  );

  // Diary search — free text over everything the user can see on a card:
  // strain and device display names, notes and every tag list. Client-side
  // against the in-memory sessions, live on every keystroke. Controlled tags
  // match in both English and Spanish so "pino" finds "Pine".
  const [query, setQuery] = useState("");
  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return facetFiltered;
    return facetFiltered.filter((session) =>
      [
        displayStrainName(session.strainSlug),
        displayDeviceName(session.deviceSlug),
        session.notes,
        ...session.aromas.flatMap((tag) => [tag, translateTag(tag, i18n.language)]),
        ...session.flavors.flatMap((tag) => [tag, translateTag(tag, i18n.language)]),
        ...session.moods.flatMap((tag) => [tag, translateTag(tag, i18n.language)]),
        ...session.activities.flatMap((tag) => [tag, translateTag(tag, i18n.language)]),
        ...session.unwantedEffects.flatMap((tag) => [tag, translateTag(tag, i18n.language)]),
      ]
        .join("\n")
        .toLowerCase()
        .includes(q),
    );
  }, [facetFiltered, query]);
  const searching = query.trim() !== "";

  // Missing or unreadable profile → the age gate owns this user first.
  if (!profile) {
    return <Navigate to="/welcome" replace />;
  }

  const handleTogglePublic = async (id: string) => {
    if (pendingToggleId !== null) return;
    setPendingToggleId(id);
    try {
      const updated = await toggleSessionPublic(id);
      if (!updated) return;
      toast.success(
        updated.isPublic ? t("toggle.nowPublic") : t("toggle.nowPrivate"),
      );
    } catch {
      // The optimistic cache update is rolled back by the data layer; the
      // switch flips back on its own — just say why.
      toast.error(t("toggle.error"), {
        description: t("toggle.errorDescription"),
      });
    } finally {
      setPendingToggleId(null);
    }
  };

  const handleToggleInFeed = async (id: string) => {
    if (pendingToggleId !== null) return;
    setPendingToggleId(id);
    try {
      const updated = await toggleSessionInFeed(id);
      if (!updated) return;
      toast.success(
        updated.inFeed ? t("toggle.nowInFeed") : t("toggle.nowOutOfFeed"),
      );
    } catch {
      toast.error(t("toggle.error"), {
        description: t("toggle.errorDescription"),
      });
    } finally {
      setPendingToggleId(null);
    }
  };

   
  const handleToggleUnwantedEffectsPublic = async (id: string) => {
    if (pendingToggleId !== null) return;
    setPendingToggleId(id);
    try {
      const updated = await toggleSessionUnwantedEffectsPublic(id);
      if (!updated) return;
      toast.success(
        updated.unwantedEffectsPublic
          ? t("toggle.unwantedEffectsNowPublic")
          : t("toggle.unwantedEffectsNowPrivate"),
      );
    } catch {
      toast.error(t("toggle.error"), {
        description: t("toggle.errorDescription"),
      });
    } finally {
      setPendingToggleId(null);
    }
  };

  const handleToggleActivitiesPublic = async (id: string) => {
    if (pendingToggleId !== null) return;
    setPendingToggleId(id);
    try {
      const updated = await toggleSessionActivitiesPublic(id);
      if (!updated) return;
      toast.success(
        updated.activitiesPublic
          ? t("toggle.activitiesNowPublic")
          : t("toggle.activitiesNowPrivate"),
      );
    } catch {
      toast.error(t("toggle.error"), {
        description: t("toggle.errorDescription"),
      });
    } finally {
      setPendingToggleId(null);
    }
  };

  const isEmpty = sessions.length === 0;

  return (
    <div className="space-y-10">
      <DiaryHeader username={profile.username} />

      {/* Highlights row: detox streak + this-week + liked-ratio tiles.
          Lives outside the sessions branches on purpose — the detox tile's
          natural audience has FEW recent sessions. */}
      <HighlightsRow sessions={sessions} />

      {loading ? (
        <div
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-16 text-center"
          role="status"
        >
          <p className="font-medium">{t("loading.title")}</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {t("loading.subtitle")}
          </p>
        </div>
      ) : isEmpty ? (
        <EmptyDiary />
      ) : (
        <>
          <StatsStrip stats={stats} />
          <FavoriteStrains favorites={favorites} />
          <ActivityChart weeks={weekly} />

          {/* Search + structured filters — they narrow the list live; the
              stats above stay global. */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder={t("search.placeholder")}
                  aria-label={t("search.ariaLabel")}
                  onClear={() => setQuery("")}
                  clearAriaLabel={t("search.clearAria")}
                />
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                aria-expanded={filtersOpen}
                aria-label={t("filters.toggleAria")}
                className="pressable flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-input bg-background px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t("filters.toggle")}</span>
                {activeFilterCount > 0 ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            </div>
            {filtersOpen ? (
              <DiaryFilters
                filters={filters}
                onChange={setFilters}
                strains={filterOptions.strains}
                devices={filterOptions.devices}
                aromas={filterOptions.aromas}
                flavors={filterOptions.flavors}
                moods={filterOptions.moods}
              />
            ) : null}
            {searching || filtering ? (
              <p className="text-xs text-muted-foreground" role="status">
                {t("search.results", {
                  shown: filteredSessions.length,
                  total: sessions.length,
                })}
              </p>
            ) : null}
          </div>

          {(searching || filtering) && filteredSessions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
              {searching
                ? t("search.noResults", { query: query.trim() })
                : t("filters.noResults")}
            </p>
          ) : (
            <SessionList
              sessions={filteredSessions}
              onTogglePublic={handleTogglePublic}
              onToggleInFeed={handleToggleInFeed}
              onToggleUnwantedEffectsPublic={handleToggleUnwantedEffectsPublic}
              onToggleActivitiesPublic={handleToggleActivitiesPublic}
              pendingToggleId={pendingToggleId}
            />
          )}
        </>
      )}

      <Toaster position="top-center" />
    </div>
  );
}
