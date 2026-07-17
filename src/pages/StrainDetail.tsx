import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import CommunitySessionItem from "@/components/strains/CommunitySessionItem";
import {
  communityAverage,
  communitySessionsFor,
  formatRating,
} from "@/components/strains/strain-utils";
import { usePublicSessions, useStrains } from "@/lib/data";
import type { ReactNode } from "react";

/** Small labeled chip section (terpenes, aromas, effects). */
function ChipSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant="secondary" className="font-normal">
            {item}
          </Badge>
        ))}
      </div>
    </section>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  );
}

/**
 * Strain detail: full profile + community sessions + the primary
 * "Log with this strain" CTA (prefills /log via the ?strain= contract).
 *
 * The strain resolves from the lazy catalog (`useStrains`): a loading state
 * shows while the catalog chunk is fetched, and "not found" only renders
 * once the full catalog is in memory. Community sessions are cloud-backed
 * (`usePublicSessions`): the "no public sessions yet" state waits for the
 * cache to hydrate so it never flashes early.
 */
export default function StrainDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { strains, loading } = useStrains();
  const { sessions: communitySessions, loading: sessionsLoading } =
    usePublicSessions();
  const strain = slug ? strains.find((s) => s.slug === slug) : undefined;

  if (loading) {
    return (
      <section
        className="flex flex-col items-center gap-4 py-16 text-center"
        role="status"
      >
        <h1 className="text-2xl font-semibold">Loading strain…</h1>
        <p className="max-w-md text-muted-foreground">
          Pulling the full profile from the catalog.
        </p>
      </section>
    );
  }

  if (!strain) {
    return (
      <section className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Strain not found</h1>
        <p className="max-w-md text-muted-foreground">
          This strain is not in the catalog.
        </p>
        <Button asChild variant="outline" className="pressable">
          <Link to="/strains">Browse all strains</Link>
        </Button>
      </section>
    );
  }

  const strainSessions = communitySessionsFor(strain.slug, communitySessions);
  const average = communityAverage(strain.slug, communitySessions);

  return (
    <div className="flex flex-col gap-8">
      <nav>
        <Link
          to="/strains"
          className="pressable inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All strains
        </Link>
      </nav>

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">{strain.name}</h1>
          <Badge variant="outline" className="text-muted-foreground">
            {strain.type}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-medium tabular-nums">THC {strain.thc}%</span>
          <span className="text-muted-foreground tabular-nums">
            CBD {strain.cbd}%
          </span>
          {average && (
            <span className="flex items-center gap-1.5">
              <Star className="size-3.5 fill-herb text-herb" aria-hidden="true" />
              <span className="font-semibold text-herb tabular-nums">
                {formatRating(average.avg)}
              </span>
              <span className="text-muted-foreground">
                community · {average.count}{" "}
                {average.count === 1 ? "session" : "sessions"}
              </span>
            </span>
          )}
        </div>

        <div>
          <Button
            asChild
            className="pressable herb-hover bg-herb text-herb-foreground"
          >
            <Link to={`/log?strain=${encodeURIComponent(strain.slug)}`}>
              Log with this strain
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-6">
        <section className="flex flex-col rounded-xl border border-border px-4 py-2">
          <DetailRow label="Lineage">{strain.lineage}</DetailRow>
          {strain.link && (
            <>
              <Separator />
              <DetailRow label="Reference">
                <a
                  href={strain.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pressable inline-flex items-center gap-1 text-herb transition-colors duration-150 hover:text-herb-hover"
                >
                  Leafly
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </a>
              </DetailRow>
            </>
          )}
        </section>

        <ChipSection title="Terpenes" items={strain.terpenes} />
        <ChipSection title="Aromas" items={strain.aromas} />
        <ChipSection title="Effects" items={strain.effects} />
      </div>

      <section className="flex flex-col">
        <h2 className="border-b border-border pb-2 text-lg font-semibold">
          Sessions from the community
        </h2>
        {sessionsLoading ? (
          <div
            className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center"
            role="status"
          >
            <p className="text-sm font-medium text-foreground">
              Loading community sessions…
            </p>
          </div>
        ) : strainSessions.length > 0 ? (
          <div className="divide-y divide-border/60">
            {strainSessions.map((session) => (
              <CommunitySessionItem key={session.id} session={session} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              No public sessions yet
            </p>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              Nobody has published a session with {strain.name} —{" "}
              <Link
                to={`/log?strain=${encodeURIComponent(strain.slug)}`}
                className="underline underline-offset-4 transition-colors duration-150 hover:text-foreground"
              >
                log yours
              </Link>{" "}
              and be the first.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
