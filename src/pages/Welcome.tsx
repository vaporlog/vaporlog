import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Leaf } from "lucide-react";
import { getCurrentAccount, onAuthChange, type Account } from "@/lib/auth";
import { getProfile } from "@/lib/data";
import StepDots from "@/components/welcome/StepDots";
import AgeGateStep from "@/components/welcome/AgeGateStep";
import AccountStep from "@/components/welcome/AccountStep";
import AgeBlocked from "@/components/welcome/AgeBlocked";

/**
 * Welcome — the onboarding flow (spec decisions 5 & 11):
 *   1. Age gate 21+ (birthdate, honest dead end when younger)
 *   2. Account creation — handle + password (hashed locally, per-user
 *      salt); a quiet link switches to sign-in mode for returning users.
 *      On success the account is signed in and routed to /diary — the
 *      diary is the home screen for a signed-in account.
 *
 * A legacy pre-auth profile (`vaporlog.profile`) prefills the birthdate
 * and handle when one exists. Signed-in users skip straight to /diary.
 * Step transitions are transform/opacity only (spring-ish ease), and the
 * global prefers-reduced-motion rule collapses them to gentle fades.
 */

type Step = 1 | 2;

/** Duration of the exit half of a step transition (keep CSS in sync). */
const EXIT_MS = 170;

const STEP_TRANSITION_STYLES = `
  .vl-step-enter {
    animation: vl-step-in 300ms cubic-bezier(0.34, 1.3, 0.64, 1) both;
  }
  @keyframes vl-step-in {
    from {
      opacity: 0;
      transform: translateX(var(--vl-step-from, 24px)) scale(0.98);
    }
  }
  .vl-step-exit {
    transition:
      transform ${EXIT_MS}ms var(--ease-in-out-strong),
      opacity ${EXIT_MS}ms var(--ease-in-out-strong);
    transform: translateX(calc(var(--vl-step-from, 24px) * -1)) scale(0.98);
    opacity: 0;
  }
  .vl-stagger > * {
    animation: vl-rise 320ms var(--ease-out-strong) both;
  }
  .vl-stagger > *:nth-child(2) { animation-delay: 60ms; }
  .vl-stagger > *:nth-child(3) { animation-delay: 120ms; }
  .vl-stagger > *:nth-child(4) { animation-delay: 180ms; }
  @keyframes vl-rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
`;

export default function Welcome() {
  const navigate = useNavigate();

  // Legacy pre-auth profile (if any) prefills the age gate + handle.
  const [legacyProfile] = useState(() => getProfile());

  // Direct sign-in entry (?mode=signin) skips the age gate — returning
  // users already verified 21+ when they created the account.
  const [searchParams] = useSearchParams();
  const startAtSignIn = searchParams.get("mode") === "signin";
  const [step, setStep] = useState<Step>(() => (startAtSignIn ? 2 : 1));
  const [blocked, setBlocked] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [birthdate, setBirthdate] = useState<string>(
    legacyProfile?.birthdate ?? "",
  );
  const [username, setUsername] = useState<string>(
    legacyProfile?.username ?? "",
  );

  const exitTimer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    };
  }, []);

  // Already signed in — never show onboarding again. The account cache
  // hydrates asynchronously from the cloud session, so subscribe to auth
  // changes instead of checking only once: when the session lands (or a
  // sign-in completes elsewhere) this page steps aside for /diary.
  const [account, setAccount] = useState<Account | null>(() =>
    getCurrentAccount(),
  );
  useEffect(
    () => onAuthChange(() => setAccount(getCurrentAccount())),
    [],
  );

  if (account) {
    return <Navigate to="/diary" replace />;
  }

  function transitionTo(apply: () => void, dir: 1 | -1) {
    if (exiting) return;
    setDirection(dir);
    setExiting(true);
    exitTimer.current = window.setTimeout(() => {
      apply();
      setExiting(false);
    }, EXIT_MS);
  }

  function handleVerified(date: string) {
    transitionTo(() => {
      setBirthdate(date);
      setStep(2);
    }, 1);
  }

  function handleBlocked() {
    transitionTo(() => setBlocked(true), 1);
  }

  function handleBackToAge() {
    transitionTo(() => setStep(1), -1);
  }

  function handleAccountSuccess() {
    // signUp/signIn already persisted the session — the diary is the home
    // screen once you're signed in, so land there.
    navigate("/diary");
  }

  const viewKey = blocked ? "blocked" : `step-${step}`;
  const transitionVars = {
    "--vl-step-from": `${direction * 24}px`,
  } as CSSProperties;

  return (
    <section className="flex min-h-[calc(100dvh-14rem)] flex-col justify-center py-6">
      <style>{STEP_TRANSITION_STYLES}</style>

      <div className="mx-auto flex w-full max-w-lg flex-col gap-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-herb">
            <Leaf aria-hidden="true" className="size-5" />
            <span className="text-sm font-semibold tracking-tight text-foreground">
              vapor<span className="text-herb">log</span>
            </span>
          </div>
          {!blocked ? <StepDots step={step} total={2} /> : null}
        </div>

        <div
          key={viewKey}
          style={transitionVars}
          className={exiting ? "vl-step-exit" : "vl-step-enter"}
        >
          {blocked ? (
            <AgeBlocked />
          ) : step === 1 ? (
            <AgeGateStep
              initialBirthdate={birthdate || undefined}
              onVerified={handleVerified}
              onBlocked={handleBlocked}
            />
          ) : (
            <AccountStep
              birthdate={birthdate}
              initialMode={startAtSignIn ? "signin" : "signup"}
              initialUsername={username}
              onUsernameChange={setUsername}
              onBack={handleBackToAge}
              onSuccess={handleAccountSuccess}
            />
          )}
        </div>
      </div>
    </section>
  );
}
