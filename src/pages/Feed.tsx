import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
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
import { SearchInput } from "@/components/ui/search-input";
import i18n from "@/i18n";
import { translateTag } from "@/i18n/vocab-translations";
import FeedFilters from "@/components/feed/FeedFilters";
import FeedSessionCard from "@/components/feed/FeedSessionCard";
import { displayDeviceName, displayStrainName } from "@/components/feed/feed-utils";
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
  const { t } = useTranslation("feed");
  // Cloud-backed public sessions; re-renders when the cache hydrates and
  // whenever a session is published/unpublished.
  const { sessions, loading } = usePublicSessions();
  const [filters, setFilters] = useState<FeedFilterState>(INITIAL_FILTERS);
  const [query, setQuery] = useState("");

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

  // Free-text search over what a feed card shows: strain, device, moods,
  // author handle. Controlled tags match in both English and Spanish.
  // Combined with the structured filters below (AND).
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return sessions;
    return sessions.filter((session) =>
      [
        displayStrainName(session.strainSlug),
        displayDeviceName(session.deviceSlug),
        session.author,
        ...session.moods.flatMap((tag) => [tag, translateTag(tag, i18n.language)]),
      ]
        .join("\n")
        .toLowerCase()
        .includes(q),
    );
  }, [sessions, query]);

  const visible = useMemo(
    () => searched.filter((session) => sessionMatchesFilters(session, filters)),
    [searched, filters],
  );
  const filtering = hasActiveFilters(filters) || query.trim() !== "";

  const countLine = filtering
    ? t("count.filtered", { count: sessions.length, visible: visible.length })
    : t("count.all", { count: visible.length });

  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold leading-tight">
          {t("header.title")}
        </h1>
        <p className="max-w-md text-base leading-relaxed text-muted-foreground">
          {t("header.subtitle")}
        </p>
      </header>

      {loading ? (
        <div
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center"
          role="status"
        >
          <p className="font-medium">{t("loading.title")}</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {t("loading.subtitle")}
          </p>
        </div>
      ) : sessions.length > 0 ? (
        <>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("search.placeholder")}
            aria-label={t("search.ariaLabel")}
            onClear={() => setQuery("")}
            clearAriaLabel={t("search.clearAria")}
          />

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
                onClick={() => {
                  setFilters(INITIAL_FILTERS);
                  setQuery("");
                }}
                className="pressable rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                {t("filters.clear")}
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
                {t("noMatch.title")}
              </p>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                {t("noMatch.body")}
              </p>
              <button
                type="button"
                onClick={() => {
                  setFilters(INITIAL_FILTERS);
                  setQuery("");
                }}
                className="pressable mt-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                {t("filters.clear")}
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
            <EmptyTitle>{t("empty.title")}</EmptyTitle>
            <EmptyDescription>{t("empty.description")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {account ? (
              <>
                <Button
                  asChild
                  className="pressable herb-hover bg-herb text-herb-foreground"
                >
                  <Link to="/log">{t("empty.logCta")}</Link>
                </Button>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <Trans
                    i18nKey="empty.loggedInHint"
                    ns="feed"
                    components={{
                      diaryLink: (
                        <Link
                          to="/diary"
                          className="underline underline-offset-4 transition-colors duration-150 hover:text-foreground"
                        />
                      ),
                    }}
                  />
                </p>
              </>
            ) : (
              <>
                <Button
                  asChild
                  className="pressable herb-hover bg-herb text-herb-foreground"
                >
                  <Link to="/welcome">{t("empty.createCta")}</Link>
                </Button>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <Trans
                    i18nKey="empty.loggedOutHint"
                    ns="feed"
                    components={{
                      signinLink: (
                        <Link
                          to="/welcome?mode=signin"
                          className="underline underline-offset-4 transition-colors duration-150 hover:text-foreground"
                        />
                      ),
                    }}
                  />
                </p>
              </>
            )}
          </EmptyContent>
        </Empty>
      )}
    </section>
  );
}
