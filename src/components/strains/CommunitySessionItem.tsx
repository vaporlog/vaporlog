import { Star, Thermometer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getDevice } from "@/lib/data";
import { formatRating, formatSessionDate } from "@/components/strains/strain-utils";
import type { SessionLog } from "@/lib/types";

interface CommunitySessionItemProps {
  session: SessionLog;
}

/**
 * One public community session in the strain detail list: who, with which
 * device, at what temperature, and how it landed (rating + moods).
 * temperatureC is nullable per the data contract.
 */
export default function CommunitySessionItem({ session }: CommunitySessionItemProps) {
  const device = getDevice(session.deviceSlug);
  const deviceName = device?.name ?? session.deviceSlug;
  const isLoved = session.rating >= 8;

  return (
    <article className="flex flex-col gap-2 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{session.author}</span>
          <span className="text-xs text-muted-foreground">
            {formatSessionDate(session.createdAt)}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm">
          <Star
            className={`size-3.5 ${
              isLoved ? "fill-herb text-herb" : "text-muted-foreground"
            }`}
            aria-hidden="true"
          />
          <span
            className={`font-semibold tabular-nums ${
              isLoved ? "text-herb" : "text-foreground"
            }`}
          >
            {formatRating(session.rating)}
          </span>
          <span className="text-muted-foreground">/10</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>{deviceName}</span>
        {session.temperatureC !== null && (
          <span className="flex items-center gap-1 tabular-nums">
            <Thermometer className="size-3.5" aria-hidden="true" />
            {session.temperatureC}°C
          </span>
        )}
        {session.durationMin !== null && (
          <span className="tabular-nums">{session.durationMin} min</span>
        )}
      </div>

      {session.moods.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {session.moods.map((mood) => (
            <Badge
              key={mood}
              variant="secondary"
              className="font-normal text-muted-foreground"
            >
              {mood}
            </Badge>
          ))}
        </div>
      )}

      {session.notes && (
        <p className="text-sm text-muted-foreground">{session.notes}</p>
      )}
    </article>
  );
}
