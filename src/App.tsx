import { lazy, useEffect, useState } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import AgeGate from "@/components/AgeGate";
import Landing from "@/pages/Landing";
import { whenAuthReady } from "@/lib/auth";

/*
 * Route-level code splitting: the landing page stays in the entry chunk
 * (it's the first paint and the SEO surface); every other route loads on
 * demand. AppLayout wraps <Outlet /> in a Suspense boundary with a null
 * fallback — local chunks resolve in milliseconds, so a spinner would only
 * flash.
 */
const Welcome = lazy(() => import("@/pages/Welcome"));
const LogSession = lazy(() => import("@/pages/LogSession"));
const Diary = lazy(() => import("@/pages/Diary"));
const Strains = lazy(() => import("@/pages/Strains"));
const StrainDetail = lazy(() => import("@/pages/StrainDetail"));
const Recommendations = lazy(() => import("@/pages/Recommendations"));
const SessionCard = lazy(() => import("@/pages/SessionCard"));
const Feed = lazy(() => import("@/pages/Feed"));
const Profile = lazy(() => import("@/pages/Profile"));
const PublicProfile = lazy(() => import("@/pages/PublicProfile"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));

/**
 * Route map. Each page file in src/pages/ is owned by a later wave of
 * agents — replace the page component's internals, never the route paths.
 *
 * Auth guard: /log, /diary and /profile require a signed-in account.
 * Landing, /welcome, the strain catalog, /recommendations, the community
 * feed (/feed), public session cards (/s/:id) and public profiles
 * (/u/:handle) stay open so newcomers can look before they sign up.
 */
/**
 * Router basename: on GitHub Pages the app is served from the /vaporlog/
 * repo subpath (build:pages passes --base=/vaporlog/), so that subpath
 * becomes the router basename. The default build now uses the absolute
 * base '/' (served from the domain root): BASE_URL is '/', which must NOT
 * become basename '' — the router gets no basename at all, keeping local
 * dev, preview and production rootless.
 */
const base = import.meta.env.BASE_URL;
const basename =
  base !== "/" && base !== "./" && base.startsWith("/")
    ? base.replace(/\/$/, "")
    : undefined;

const router = createBrowserRouter(
  [
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Landing /> },
      { path: "/welcome", element: <Welcome /> },
      {
        element: <AgeGate />,
        children: [
          { path: "/log", element: <LogSession /> },
          { path: "/diary", element: <Diary /> },
          { path: "/profile", element: <Profile /> },
          { path: "/admin", element: <AdminDashboard /> },
        ],
      },
      { path: "/strains", element: <Strains /> },
      { path: "/strains/:slug", element: <StrainDetail /> },
      { path: "/recommendations", element: <Recommendations /> },
      { path: "/feed", element: <Feed /> },
      { path: "/s/:id", element: <SessionCard /> },
      { path: "/u/:handle", element: <PublicProfile /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
  ],
  { basename },
);

export default function App() {
  // Hold first render until the persisted cloud session restores —
  // otherwise a signed-in user deep-linking into /log or /diary would
  // briefly bounce through /welcome before the session lands.
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void whenAuthReady().then(() => {
      if (alive) setAuthReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!authReady) return null;
  return <RouterProvider router={router} />;
}
