import { Star, Thermometer, Timer, Weight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getDevice, getStrain } from "@/lib/data";
import type { SessionLog } from "@/lib/types";

function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Humanize a slug for the window before the lazy catalog loads (or for
 * personal `my-*` entries): "my-uncle-bob" → "Uncle Bob".
 */
function humanizeSlug(slug: string): string {
  const stripped = slug.startsWith("my-") ? slug.slice(3) : slug;
  const words = stripped
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(" ") : slug;
}

/**
 * A session rendered the way the product renders it — not a screenshot.
 * Used by the hero showcase (one real community session) and the social
 * proof wall. Every nullable field (temp / duration / amount) is simply
 * omitted when absent.
 */
export default function SessionLogCard({
  session,
  elevated = false,
}: {
  session: SessionLog;
  /** Larger, shadowed presentation for the hero showcase. */
  elevated?: boolean;
}) {
  const strain = getStrain(session.strainSlug);
  const device = getDevice(session.deviceSlug);
  // getStrain reads the lazy catalog cache — until it lands (or for personal
  // strains) the humanized slug keeps the card readable.
  const strainName = strain ? strain.name : humanizeSlug(session.strainSlug);
  const deviceName = device ? device.name : humanizeSlug(session.deviceSlug);
  const dateLabel = formatSessionDate(session.createdAt);

  return (
    <article
      className={`rounded-xl border border-border bg-card text-left ${
        elevated ? "p-6 shadow-xl shadow-black/5 sm:p-7" : "p-5"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3
            className={`font-semibold tracking-tight ${
              elevated ? "text-2xl" : "text-lg"
            }`}
          >
            {strainName}
          </h3>
          {strain ? (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {strain.lineage}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-herb">
          <Star
            aria-hidden="true"
            className={elevated ? "size-5 fill-current" : "size-4 fill-current"}
          />
          <span
            className={`font-semibold tabular-nums ${
              elevated ? "text-xl" : "text-base"
            }`}
          >
            {session.rating}
            <span className="text-muted-foreground">/10</span>
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Thermometer aria-hidden="true" className="size-4 text-muted-foreground" />
          {session.temperatureC !== null ? `${session.temperatureC}°C` : "—"}
        </span>
        {session.durationMin !== null ? (
          <span className="inline-flex items-center gap-1.5">
            <Timer aria-hidden="true" className="size-4 text-muted-foreground" />
            {session.durationMin} min
          </span>
        ) : null}
        {session.amountG !== null ? (
          <span className="inline-flex items-center gap-1.5">
            <Weight aria-hidden="true" className="size-4 text-muted-foreground" />
            {session.amountG} g
          </span>
        ) : null}
        <span className="text-muted-foreground">{deviceName}</span>
        {strain ? (
          <Badge variant="outline" className="font-normal">
            {strain.type}
          </Badge>
        ) : null}
      </div>

      {session.flavors.length > 0 || session.moods.length > 0 ? (
        <>
          <Separator className="my-4" />
          <div className="flex flex-wrap gap-1.5">
            {session.flavors.map((flavor) => (
              <Badge key={`f-${flavor}`} variant="secondary" className="font-normal">
                {flavor}
              </Badge>
            ))}
            {session.moods.map((mood) => (
              <Badge key={`m-${mood}`} variant="outline" className="font-normal">
                {mood}
              </Badge>
            ))}
          </div>
        </>
      ) : null}

      <p className="mt-4 text-xs text-muted-foreground">
        {session.author}
        {dateLabel ? ` · ${dateLabel}` : ""}
      </p>
    </article>
  );
}
