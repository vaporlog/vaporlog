import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface DiaryHeaderProps {
  username: string;
}

/** Time-of-day greeting, calm and personal (apple-design: direct labels). */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Greeting with the profile pseudonym + the primary journal action. */
export function DiaryHeader({ username }: DiaryHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          {greeting()},
        </p>
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
          {username}
        </h1>
      </div>
      <Button
        asChild
        className="pressable herb-hover bg-herb text-herb-foreground"
      >
        <Link to="/log">Log a Session</Link>
      </Button>
    </div>
  );
}
