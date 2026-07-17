import { lazy } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import AgeGate from "@/components/AgeGate";
import Landing from "@/pages/Landing";

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

/**
 * Route map. Each page file in src/pages/ is owned by a later wave of
 * agents — replace the page component's internals, never the route paths.
 *
 * Auth guard: only /log and /diary require a signed-in account. Landing,
 * /welcome, the strain catalog, /recommendations, the community feed
 * (/feed), and public session cards (/s/:id) stay open so newcomers can
 * look before they sign up.
 */
/**
 * Router basename: on GitHub Pages the app is served from the /vaporlog/
 * repo subpath (build:pages passes --base=/vaporlog/). The default build
 * uses the relative base './', which means "served from root" — no
 * basename — so local dev and preview stay rootless.
 */
const base = import.meta.env.BASE_URL;
const basename = base.startsWith("/") ? base.replace(/\/$/, "") : undefined;

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
        ],
      },
      { path: "/strains", element: <Strains /> },
      { path: "/strains/:slug", element: <StrainDetail /> },
      { path: "/recommendations", element: <Recommendations /> },
      { path: "/feed", element: <Feed /> },
      { path: "/s/:id", element: <SessionCard /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
  ],
  { basename },
);

export default function App() {
  return <RouterProvider router={router} />;
}
