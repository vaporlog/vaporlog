import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const MIN_C = 150;
const MAX_C = 230;
/** Neutral resting position before the user commits a value. */
const RESTING_C = 190;

interface TemperatureSliderProps {
  value: number | null;
  onChange: (celsius: number | null) => void;
}

type Zone = "low" | "medium" | "high" | null;

function zoneFor(celsius: number | null): Zone {
  if (celsius === null) return null;
  if (celsius < 170) return "low";
  if (celsius <= 190) return "medium";
  return "high";
}

const ZONE_LABELS: Array<{ id: Exclude<Zone, null>; label: string; hint: string }> = [
  { id: "low", label: "Low", hint: "<170°" },
  { id: "medium", label: "Medium", hint: "170–190°" },
  { id: "high", label: "High", hint: ">190°" },
];

/**
 * The temperature dial. Design intent (apple-design):
 *  - The thumb tracks the pointer 1:1 — direct manipulation is sacred.
 *  - The big readout is *decorative*, so it chases the value with a
 *    critically-damped spring (damping 1.0, response ~0.25s). The spring is
 *    interruptible by construction: every input just retargets it and it
 *    keeps its velocity. prefers-reduced-motion gets instant jumps.
 *  - "Unset" is a real state: the dial starts empty and stays skippable.
 */
export default function TemperatureSlider({
  value,
  onChange,
}: TemperatureSliderProps) {
  const sliderValue = value ?? RESTING_C;

  // --- Spring-smoothed readout -------------------------------------------
  const [display, setDisplay] = useState<number>(sliderValue);
  const spring = useRef({
    current: sliderValue,
    velocity: 0,
    target: sliderValue,
    raf: 0,
  });

  useEffect(() => {
    const s = spring.current;
    s.target = sliderValue;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      s.current = s.target;
      s.velocity = 0;
      setDisplay(s.target);
      return;
    }

    if (s.raf) return; // loop already running — it will pick up the new target

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.064);
      last = now;
      // Apple-style parameters: damping ratio 1.0 (no overshoot), response 0.25s.
      const response = 0.25;
      const omega = 2 / response;
      const accel = omega * omega * (s.target - s.current) - 2 * omega * s.velocity;
      s.velocity += accel * dt;
      s.current += s.velocity * dt;

      if (
        Math.abs(s.target - s.current) < 0.05 &&
        Math.abs(s.velocity) < 0.05
      ) {
        s.current = s.target;
        s.velocity = 0;
        s.raf = 0;
        setDisplay(s.current);
        return;
      }
      setDisplay(s.current);
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, [sliderValue]);

  // --- Press feedback: thumb swells while dragged -------------------------
  const [dragging, setDragging] = useState(false);

  const zone = zoneFor(value);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4">
      <div className="flex items-end justify-between">
        <div className="flex items-baseline gap-1 tabular-nums">
          <span
            className={cn(
              "text-5xl font-semibold leading-none tracking-tight transition-colors duration-150",
              value === null && "text-muted-foreground/50",
            )}
            aria-hidden="true"
          >
            {value === null ? "–––" : Math.round(display)}
          </span>
          <span className="text-xl font-medium text-muted-foreground">°C</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {zone ? `${ZONE_LABELS.find((z) => z.id === zone)?.label} temp` : "Drag to set"}
          </span>
          {value !== null ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="pressable text-sm font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div
        data-dragging={dragging}
        onPointerDown={() => setDragging(true)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        className="relative px-1 pb-1 pt-2"
      >
        <Slider
          min={MIN_C}
          max={MAX_C}
          step={1}
          value={[sliderValue]}
          onValueChange={([v]) => {
            if (typeof v === "number") onChange(v);
          }}
          aria-label="Temperature in Celsius"
          className={cn(
            "py-3",
            // A thumb you can actually grab with a thumb.
            "[&_[data-slot=slider-thumb]]:size-7 [&_[data-slot=slider-thumb]]:border-2",
            "[&_[data-slot=slider-thumb]]:transition-[transform,color,box-shadow] [&_[data-slot=slider-thumb]]:duration-150 [&_[data-slot=slider-thumb]]:ease-out-strong",
            "[&[data-dragging=true]_[data-slot=slider-thumb]]:scale-110",
            "[&_[data-slot=slider-track]]:h-2",
            value === null && "[&_[data-slot=slider-range]]:bg-muted",
          )}
        />
        {/* Zone boundary ticks at 170°C and 190°C */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-[7px] bg-foreground/15"
          style={{ left: `calc(1px * 4 + ${((170 - MIN_C) / (MAX_C - MIN_C)) * 100}%)` }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-[7px] bg-foreground/15"
          style={{ left: `calc(1px * 4 + ${((190 - MIN_C) / (MAX_C - MIN_C)) * 100}%)` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-1">
        {ZONE_LABELS.map((z) => (
          <div
            key={z.id}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-lg py-1.5 transition-colors duration-200",
              zone === z.id
                ? "bg-secondary text-foreground"
                : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "text-xs font-semibold",
                zone === z.id && "text-foreground",
              )}
            >
              {z.label}
            </span>
            <span className="text-[11px] tabular-nums">{z.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
