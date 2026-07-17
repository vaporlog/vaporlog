import { Navigate, Outlet } from "react-router-dom";
import { getCurrentAccount } from "@/lib/auth";

/**
 * Auth route guard (spec decision 5: 21+, account required).
 *
 * Wraps routes that require a signed-in account (/log, /diary). When no
 * account session exists the user is redirected to /welcome, which runs
 * the age gate + account creation/sign-in flow. Public surfaces —
 * landing, strain catalog, community feed, public session cards — must
 * NOT be wrapped by this guard.
 */
export default function AgeGate() {
  if (!getCurrentAccount()) {
    return <Navigate to="/welcome" replace />;
  }
  return <Outlet />;
}
