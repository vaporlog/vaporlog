import type { ReactNode } from "react";

/**
 * Shared layout for one onboarding screen: one idea per screen —
 * a headline, one supporting line, then the single interaction.
 * Direct children stagger in via the `.vl-stagger` keyframes defined
 * in Welcome.tsx (transform/opacity only, reduced-motion safe).
 */
export default function WelcomeStep({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <div className="vl-stagger flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
          {title}
        </h1>
        {lead ? (
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">
            {lead}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
