import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

/** Warm, illustration-free empty state — one honest line and one action. */
export function EmptyDiary() {
  return (
    <section className="flex flex-col items-center gap-6 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <p className="max-w-md text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl">
        Your journal is empty. Your next session deserves to be remembered.
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Log your first session — strain, device, temperature, how it felt —
        and start building your personal vaporization archive.
      </p>
      <Button
        asChild
        size="lg"
        className="pressable herb-hover bg-herb text-herb-foreground"
      >
        <Link to="/log">Log your first session</Link>
      </Button>
    </section>
  );
}
