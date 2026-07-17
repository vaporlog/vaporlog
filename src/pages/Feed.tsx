import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { usePublicSessions, useStrains } from "@/lib/data";
import { getCurrentAccount, onAuthChange, type Account } from "@/lib/auth";
import FeedFilters from "@/components/feed/FeedFilters";
import FeedSessionCard from "@/components/feed/FeedSessionCard";
import {
  ALL_DEVICES,
  ALL_MOODS,
  deviceOptions,
  hasActiveFilters,
  moodOptions,
  sessionMatchesFilters,
  type FeedFilterState,
} from "@/components/feed/feed-utils";

/**
 * /feed — the community feed.
 *
 * Every public session (from every member, cloud-backed), newest first,
 * via usePublicSessions(). Device / temperature-zone / mood filters combine
 * (AND); the option lists are derived from the sessions on display so a
 * filter can never point at something the feed has never seen. Public
 * route — signed-out visitors can browse it; private sessions never reach
 * this page. While the cloud cache hydrates, a loading state shows instead
 * of the empty state.
 */

const INITIAL_FILTERS: FeedFilterState = {
  device: ALL_DEVICES,
  zone: "all",
  mood: ALL_MOODS,
};

export default function Feed() {
  // Cloud-backed public sessions; re-renders when the cache hydrates and
  // whenever a session is published/unpublished.
  const { sessions, loading } = usePublicSessions();
  const [filters, setFilters] = useState<FeedFilterState>(INITIAL_FILTERS);

  // The empty feed's call to action depends on auth state; re-read it on
  // sign-in / sign-out events so the page reacts without a remount.
  const [account, setAccount] = useState<Account | null>(() =>
    getCurrentAccount(),
  );
  useEffect(
    () => onAuthChange(() => setAccount(getCurrentAccount())),
    [],
  );

  // Await the lazy catalog so strain names (and type badges) on the cards
  // resolve to real catalog entries. Until it lands, cards gracefully show
  // a humanized slug (see feed-utils displayStrainName); this hook's state
  // change re-renders the feed with resolved names.
  useStrains();

  const devices = useMemo(() => deviceOptions(sessions), [sessions]);
  const moods = useMemo(() => moodOptions(sessions), [sessions]);
  const visible = useMemo(
    () => sessions.filter((session) => sessionMatchesFilters(session, filters)),
    [sessions, filters],
  );
  const filtering = hasActiveFilters(filters);

  const countLine = filtering
    ? `${visible.length} of ${sessions.length} public ${
        sessions.length === 1 ? "session" : "sessions"
      }`
    : `${visible.length} public ${visible.length === 1 ? "session" : "sessions"}`;

  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold leading-tight">Community feed</h1>
        <p className="max-w-md text-base leading-relaxed text-muted-foreground">
          Every public session from every member, newest first.
        </p>
      </header>

      {loading ? (
        <div
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center"
          role="status"
        >
          <p className="font-medium">Loading the feed…</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Public sessions from every member are on their way.
          </p>
        </div>
      ) : sessions.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <FeedFilters
              devices={devices}
              moods={moods}
              device={filters.device}
              zone={filters.zone}
              mood={filters.mood}
              onDeviceChange={(device) =>
                setFilters((prev) => ({ ...prev, device }))
              }
              onZoneChange={(zone) => setFilters((prev) => ({ ...prev, zone }))}
              onMoodChange={(mood) => setFilters((prev) => ({ ...prev, mood }))}
            />
            {filtering && (
              <button
                type="button"
                onClick={() => setFilters(INITIAL_FILTERS)}
                className="pressable rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                Clear filters
              </button>
            )}
          </div>

          <p aria-live="polite" className="text-sm text-muted-foreground">
            {countLine}
          </p>

          {visible.length > 0 ? (
            <div className="flex flex-col gap-3">
              {visible.map((session) => (
                <FeedSessionCard key={session.id} session={session} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                No sessions match these filters
              </p>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                Try a different device, temperature zone, or mood — or clear
                the filters to see everything again.
              </p>
              <button
                type="button"
                onClick={() => setFilters(INITIAL_FILTERS)}
                className="pressable mt-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                Clear filters
              </button>
            </div>
          )}
        </>
      ) : (
        <Empty className="border border-dashed border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users className="text-herb" aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>The feed is just getting started</EmptyTitle>
            <EmptyDescription>
              This is the community feed — every public session from every
              member lands here, newest first. It fills up as people publish
              their sessions, and nobody has published yet.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {account ? (
              <>
                <Button
                  asChild
                  className="pressable herb-hover bg-herb text-herb-foreground"
                >
                  <Link to="/log">Log a session</Link>
                </Button>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Log a session, then publish it from your{" "}
                  <Link
                    to="/diary"
                    className="underline underline-offset-4 transition-colors duration-150 hover:text-foreground"
                  >
                    diary
                  </Link>{" "}
                  — the first one here could be yours.
                </p>
              </>
            ) : (
              <>
                <Button
                  asChild
                  className="pressable herb-hover bg-herb text-herb-foreground"
                >
                  <Link to="/welcome">Create an account</Link>
                </Button>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Be the first to publish a session. Already a member?{" "}
                  <Link
                    to="/welcome?mode=signin"
                    className="underline underline-offset-4 transition-colors duration-150 hover:text-foreground"
                  >
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </EmptyContent>
        </Empty>
      )}
    </section>
  );
}
