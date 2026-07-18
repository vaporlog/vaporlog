import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { getCurrentAccount, onAuthChange, type Account } from "@/lib/auth";

/**
 * Auth route guard (spec decision 5: 21+, account required).
 *
 * Wraps routes that require a signed-in account (/log, /diary). When no
 * account session exists the user is redirected to /welcome, which runs
 * the age gate + account creation/sign-in flow. Public surfaces —
 * landing, strain catalog, community feed, public session cards — must
 * NOT be wrapped by this guard.
 *
 * The account cache hydrates asynchronously (cloud session restore) and
 * changes on sign-in/sign-out, so the guard subscribes to auth events and
 * re-evaluates instead of reading once.
 */
export default function AgeGate() {
  const [account, setAccount] = useState<Account | null>(() =>
    getCurrentAccount(),
  );
  useEffect(
    () => onAuthChange(() => setAccount(getCurrentAccount())),
    [],
  );

  if (!account) {
    return <Navigate to="/welcome" replace />;
  }
  return <Outlet />;
}
