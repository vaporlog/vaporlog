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
import { getMySessions, getProfile, toggleSessionPublic, useStrains } from "@/lib/data";
import type { SessionLog } from "@/lib/types";

/** Diary — your private session list + basic stats (age-gated). */
export default function Diary() {
  const profile = getProfile();
  const [sessions, setSessions] = useState<SessionLog[]>(() => getMySessions());
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

  const handleTogglePublic = (id: string) => {
    const updated = toggleSessionPublic(id);
    if (!updated) return;
    setSessions((current) =>
      current.map((session) => (session.id === id ? updated : session)),
    );
    toast.success(
      updated.isPublic
        ? "Session is now public — anyone with the link can view its card."
        : "Session is now private again.",
    );
  };

  const isEmpty = sessions.length === 0;

  return (
    <div className="space-y-10">
      <DiaryHeader username={profile.username} />

      {isEmpty ? (
        <EmptyDiary />
      ) : (
        <>
          <StatsStrip stats={stats} />
          <FavoriteStrains favorites={favorites} />
          <ActivityChart weeks={weekly} />
          <SessionList sessions={sessions} onTogglePublic={handleTogglePublic} />
        </>
      )}

      <Toaster position="top-center" />
    </div>
  );
}
