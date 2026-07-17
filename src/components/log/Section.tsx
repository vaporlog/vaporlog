import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionProps {
  /** Section number — renders as a small neutral index, not an accent. */
  step: number;
  title: string;
  /** Small muted helper line under the title (e.g. "Optional"). */
  hint?: string;
  children: ReactNode;
  className?: string;
}

/**
 * One well-labeled block of the log form. The rhythm (index + tight title +
 * content with generous spacing) is what keeps a long single-page form
 * scannable on a phone.
 */
export default function Section({
  step,
  title,
  hint,
  children,
  className,
}: SectionProps) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <header className="flex items-baseline gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 translate-y-[3px] items-center justify-center rounded-full bg-secondary text-xs font-semibold tabular-nums text-muted-foreground"
        >
          {step}
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {hint ? (
          <span className="ml-auto text-xs font-medium text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}
