import { Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import LanguageToggle from "@/components/LanguageToggle";
import mascotUrl from "@/assets/mascot.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getCurrentAccount,
  onAuthChange,
  signOut,
  type Account,
} from "@/lib/auth";

const NAV_LINK_CLASS = ({ isActive }: { isActive: boolean }) =>
  `pressable rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
    isActive
      ? "text-foreground"
      : "text-muted-foreground hover:text-foreground"
  }`;

/**
 * Collapsed user menu shown while a session is active. The trigger is an
 * avatar with the handle's initial (plus the @handle itself when
 * `showHandle` is set, i.e. on desktop) and the content groups every
 * account action — Profile and Log out — so the main nav stays clean.
 */
function UserMenu({
  account,
  onLogOut,
  showHandle = false,
}: {
  account: Account;
  onLogOut: () => Promise<void>;
  showHandle?: boolean;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("nav.userMenu")}
        className={`pressable flex items-center gap-2 rounded-md text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground ${
          showHandle ? "ml-1 px-2 py-1.5" : "size-8 justify-center sm:hidden"
        }`}
      >
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-full bg-herb/15 text-xs font-semibold text-herb"
        >
          {account.username.charAt(0).toUpperCase()}
        </span>
        {showHandle && <span>@{account.username}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          @{account.username}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/profile")}>
          {t("nav.profile")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void onLogOut();
          }}
        >
          {t("nav.logOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Shared app shell: clean header (wordmark → "/", Diary, Strains, Feed,
 * auth state, "Log a Session" accent CTA) + minimal footer. Every route
 * renders inside this layout via <Outlet />.
 *
 * Auth area: signed-in users get a single collapsed user menu (avatar +
 * @handle trigger → Profile, Log out); everyone else sees a quiet
 * "Sign in" link to /welcome. The account is re-read on every navigation
 * and on auth-change events so the header always reflects the session.
 */
export default function AppLayout() {
  const { t } = useTranslation("common");
  const location = useLocation();
  const navigate = useNavigate();
  const [account, setAccount] = useState<Account | null>(() =>
    getCurrentAccount(),
  );

  // Re-read the session on every route change (sign-in redirects land here).
  useEffect(() => {
    setAccount(getCurrentAccount());
  }, [location.pathname]);

  // Scroll back to the top on every route change — react-router does not
  // restore scroll position by itself. 'instant' avoids a visible scroll
  // animation when swapping pages.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);

  // And immediately on explicit sign-in / sign-out events.
  useEffect(() => onAuthChange(() => setAccount(getCurrentAccount())), []);

  async function handleLogOut() {
    // signOut resolves once the cloud session is cleared; the auth-change
    // event it emits re-renders this header into the signed-out state.
    await signOut();
    navigate("/");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
          >
            <img
              src={mascotUrl}
              alt=""
              className="size-7"
            />
            vapor<span className="text-herb">log</span>
          </Link>

          <nav className="flex items-center gap-1 sm:gap-2">
            {/* Full header row from sm up: section links, collapsed user
                menu, "Log a Session" CTA and language toggle, all inline. */}
            <div className="hidden items-center gap-1 sm:flex sm:gap-2">
              <NavLink to="/diary" className={NAV_LINK_CLASS}>
                {t("nav.diary")}
              </NavLink>
              <NavLink to="/strains" className={NAV_LINK_CLASS}>
                {t("nav.strains")}
              </NavLink>
              <NavLink to="/feed" className={NAV_LINK_CLASS}>
                {t("nav.feed")}
              </NavLink>
              {account ? (
                <UserMenu
                  account={account}
                  onLogOut={handleLogOut}
                  showHandle
                />
              ) : (
                <NavLink to="/welcome?mode=signin" className={NAV_LINK_CLASS}>
                  {t("nav.signIn")}
                </NavLink>
              )}
              <Button
                asChild
                size="sm"
                className="pressable herb-hover ml-1 bg-herb text-herb-foreground"
              >
                <Link to="/log" aria-label={t("nav.logSession")}>
                  {t("nav.logSession")}
                </Link>
              </Button>
              <LanguageToggle />
            </div>
            {/* Below sm the collapsed user menu also appears next to the
                hamburger (avatar-only trigger), keeping both headers in
                sync: account actions live in the user menu, not here. */}
            {account && <UserMenu account={account} onLogOut={handleLogOut} />}
            {/* Below sm only the wordmark, the user menu and this hamburger
                remain; navigation, CTA and language fold in here so the
                ~360px row can't overflow. */}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("nav.openMenu")}
                className="pressable flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground sm:hidden"
              >
                <Menu aria-hidden="true" className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => navigate("/diary")}>
                  {t("nav.diary")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/strains")}>
                  {t("nav.strains")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/feed")}>
                  {t("nav.feed")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => navigate("/log")}
                  className="font-medium text-herb"
                >
                  {t("nav.logSession")}
                </DropdownMenuItem>
                {!account && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => navigate("/welcome?mode=signin")}
                    >
                      {t("nav.signIn")}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                {/* Plain row (not a menu item) so tapping EN|ES doesn't
                    dismiss the menu before the change is visible. */}
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-sm text-muted-foreground">
                    {t("language.label")}
                  </span>
                  <LanguageToggle />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-6 text-xs text-muted-foreground">
          <span>{t("footer.tagline")}</span>
          <span>{t("footer.legal")}</span>
        </div>
      </footer>
    </div>
  );
}
