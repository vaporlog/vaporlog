import { Leaf } from "lucide-react";
import WelcomeStep from "@/components/welcome/WelcomeStep";

/**
 * Dead end for visitors under 21. Respectful, warm, and final — no fake
 * workarounds (no "enter a different date" shortcut). The only honest
 * escape hatch mentioned is clearing site data, for genuine typos.
 */
export default function AgeBlocked() {
  return (
    <WelcomeStep title="This one's not for you — yet.">
      <div className="flex items-start gap-3">
        <Leaf aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-herb" />
        <p className="max-w-md text-base leading-relaxed text-muted-foreground">
          vaporlog is strictly for adults 21 and over, in places where
          vaporization is legal. No judgment, no lecture — we'll be right
          here when the time is right.
        </p>
      </div>
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
        Entered the wrong birthday by mistake? Clearing this site's data in
        your browser settings starts you over.
      </p>
    </WelcomeStep>
  );
}
