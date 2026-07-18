import { useTranslation } from "react-i18next";
import type { SessionLog } from "@/lib/types";
import { DiarySessionCard } from "./DiarySessionCard";

interface SessionListProps {
  sessions: SessionLog[];
  onTogglePublic: (id: string) => void;
  /** Session id whose publish toggle is currently awaiting the cloud. */
  pendingToggleId?: string | null;
}

/** All personal sessions, newest first (useMySessions() already orders them). */
export function SessionList({
  sessions,
  onTogglePublic,
  pendingToggleId = null,
}: SessionListProps) {
  const { t } = useTranslation("diary");
  return (
    <section aria-labelledby="diary-sessions-heading" className="space-y-3">
      <h2
        id="diary-sessions-heading"
        className="text-lg font-semibold tracking-tight"
      >
        {t("sessions.title")}
      </h2>
      <div className="space-y-3">
        {sessions.map((session) => (
          <DiarySessionCard
            key={session.id}
            session={session}
            onTogglePublic={onTogglePublic}
            pending={session.id === pendingToggleId}
          />
        ))}
      </div>
    </section>
  );
}
