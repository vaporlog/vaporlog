import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import WelcomeStep from "@/components/welcome/WelcomeStep";
import {
  formatBirthdate,
  isFutureBirthdate,
  isValidBirthdate,
  meetsAgeRequirement,
  parseBirthdate,
} from "@/lib/profile-flow";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Step 1 — age gate 21+. Three selects (month / day / year) instead of a
 * native date input: consistent across browsers and friendlier on mobile.
 * Under-21 visitors are routed to a respectful dead end; impossible or
 * future dates get an inline error instead.
 */
export default function AgeGateStep({
  initialBirthdate,
  onVerified,
  onBlocked,
}: {
  /** Optional `YYYY-MM-DD` prefill (e.g. from a legacy local profile). */
  initialBirthdate?: string;
  /** Called with a validated `YYYY-MM-DD` birthdate when the user is 21+. */
  onVerified: (birthdate: string) => void;
  /** Called when the entered birthdate is real but under 21. */
  onBlocked: () => void;
}) {
  const initial = initialBirthdate ? parseBirthdate(initialBirthdate) : null;
  const [month, setMonth] = useState<string>(
    initial ? String(initial.month) : "",
  );
  const [day, setDay] = useState<string>(initial ? String(initial.day) : "");
  const [year, setYear] = useState<string>(
    initial ? String(initial.year) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const list: number[] = [];
    // 16-year-olds can answer truthfully and get the respectful dead end.
    for (let y = currentYear - 16; y >= currentYear - 110; y -= 1) list.push(y);
    return list;
  }, [currentYear]);

  const days = useMemo(() => {
    const y = year ? Number(year) : 2000; // leap-friendly default
    const m = month ? Number(month) : 1;
    const max = new Date(y, m, 0).getDate();
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [month, year]);

  const complete = month !== "" && day !== "" && year !== "";

  function handleContinue() {
    if (!complete) return;
    const birthdate = formatBirthdate({
      year: Number(year),
      month: Number(month),
      day: Number(day),
    });
    if (!isValidBirthdate(birthdate)) {
      setError("That date doesn't look quite right — mind checking it?");
      return;
    }
    if (isFutureBirthdate(birthdate)) {
      setError("That's in the future — nice try, time traveler.");
      return;
    }
    setError(null);
    if (meetsAgeRequirement(birthdate)) {
      onVerified(birthdate);
    } else {
      onBlocked();
    }
  }

  return (
    <WelcomeStep
      title="First things first — how old are you?"
      lead="vaporlog is a journal for adults who vaporize. Your birthday never leaves this device; it just keeps the door honest."
    >
      <div className="flex flex-col gap-2">
        <Label id="birthdate-label" className="text-muted-foreground">
          Your birthday
        </Label>
        <div
          role="group"
          aria-labelledby="birthdate-label"
          className="grid grid-cols-[1.4fr_1fr_1.2fr] gap-2"
        >
          <Select
            value={month}
            onValueChange={(v) => {
              setMonth(v);
              setError(null);
            }}
          >
            <SelectTrigger aria-label="Birth month" className="w-full">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, i) => (
                <SelectItem key={name} value={String(i + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={day}
            onValueChange={(v) => {
              setDay(v);
              setError(null);
            }}
          >
            <SelectTrigger aria-label="Birth day" className="w-full">
              <SelectValue placeholder="Day" />
            </SelectTrigger>
            <SelectContent>
              {days.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={year}
            onValueChange={(v) => {
              setYear(v);
              setError(null);
            }}
          >
            <SelectTrigger aria-label="Birth year" className="w-full">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <Button
          type="button"
          size="lg"
          disabled={!complete}
          onClick={handleContinue}
          className="pressable herb-hover w-full bg-herb text-herb-foreground sm:w-auto"
        >
          Continue
          <ArrowRight className="size-4" />
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          vaporlog is for adults 21+ in jurisdictions where vaporization is
          legal.
        </p>
      </div>
    </WelcomeStep>
  );
}
