import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { SearchInput } from "@/components/ui/search-input";
import { ActivityChart } from "@/components/diary/ActivityChart";
import { HighlightsRow } from "@/components/diary/HighlightsRow";
import { DiaryHeader } from "@/components/diary/DiaryHeader";
import { EmptyDiary } from "@/components/diary/EmptyDiary";
import { FavoriteStrains } from "@/components/diary/FavoriteStrains";
import { SessionList } from "@/components/diary/SessionList";
import { StatsStrip } from "@/components/diary/StatsStrip";
import {
  computeFavorites,
  computeStats,
  computeWeeklyActivity,
  displayDeviceName,
  displayStrainName,
} from "@/components/diary/diary-utils";
import {
  getProfile,
  toggleSessionPublic,
  toggleSessionUnwantedEffectsPublic,
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

  // Diary search — free text over everything the user can see on a card:
  // strain and device display names, notes and every tag list. Client-side
  // against the in-memory sessions, live on every keystroke.
  const [query, setQuery] = useState("");
  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return sessions;
    return sessions.filter((session) =>
      [
        displayStrainName(session.strainSlug),
        displayDeviceName(session.deviceSlug),
        session.notes,
        ...session.aromas,
        ...session.flavors,
        ...session.moods,
        ...session.activities,
        ...session.unwantedEffects,
      ]
        .join("\n")
        .toLowerCase()
        .includes(q),
    );
  }, [sessions, query]);
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

          {/* Search — filters the list live; stats stay global. */}
          <div className="flex flex-col gap-1.5">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={t("search.placeholder")}
              aria-label={t("search.ariaLabel")}
              onClear={() => setQuery("")}
              clearAriaLabel={t("search.clearAria")}
            />
            {searching ? (
              <p className="text-xs text-muted-foreground" role="status">
                {t("search.results", {
                  shown: filteredSessions.length,
                  total: sessions.length,
                })}
              </p>
            ) : null}
          </div>

          {searching && filteredSessions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
              {t("search.noResults", { query: query.trim() })}
            </p>
          ) : (
            <SessionList
              sessions={filteredSessions}
              onTogglePublic={handleTogglePublic}
              onToggleUnwantedEffectsPublic={handleToggleUnwantedEffectsPublic}
              pendingToggleId={pendingToggleId}
            />
          )}
        </>
      )}

      <Toaster position="top-center" />
    </div>
  );
}
