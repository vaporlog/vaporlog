import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { ActivityChart } from "@/components/diary/ActivityChart";
import { DiaryHeader } from "@/components/diary/DiaryHeader";
import { EmptyDiary } from "@/components/diary/EmptyDiary";
import { FavoriteStrains } from "@/components/diary/FavoriteStrains";
import { SessionList } from "@/components/diary/SessionList";
import { StatsStrip } from "@/components/diary/StatsStrip";
import {
  computeFavorites,
  computeStats,
  computeWeeklyActivity,
} from "@/components/diary/diary-utils";
import { getProfile, toggleSessionPublic, useMySessions, useStrains } from "@/lib/data";

/** Diary — your private session list + basic stats (age-gated). */
export default function Diary() {
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
        updated.isPublic
          ? "Session is now public — anyone with the link can view its card."
          : "Session is now private again.",
      );
    } catch {
      // The optimistic cache update is rolled back by the data layer; the
      // switch flips back on its own — just say why.
      toast.error("Couldn't update that session", {
        description: "Check your connection and try again.",
      });
    } finally {
      setPendingToggleId(null);
    }
  };

  const isEmpty = sessions.length === 0;

  return (
    <div className="space-y-10">
      <DiaryHeader username={profile.username} />

      {loading ? (
        <div
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-16 text-center"
          role="status"
        >
          <p className="font-medium">Loading your journal…</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Your sessions are syncing from the cloud.
          </p>
        </div>
      ) : isEmpty ? (
        <EmptyDiary />
      ) : (
        <>
          <StatsStrip stats={stats} />
          <FavoriteStrains favorites={favorites} />
          <ActivityChart weeks={weekly} />
          <SessionList
            sessions={sessions}
            onTogglePublic={handleTogglePublic}
            pendingToggleId={pendingToggleId}
          />
        </>
      )}

      <Toaster position="top-center" />
    </div>
  );
}
