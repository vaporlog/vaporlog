/**
 * Temperature-zone helper for the public session card.
 *
 * Local to the session-card slice (other slices: do not import; write your
 * own if you need zones). Thresholds follow the vaporlog/vaporium standard —
 * the same one the log form's TemperatureSlider uses:
 *   Low    < 170°C   (flavor range)
 *   Medium 170–190°C (balance point)
 *   High   > 190°C   (maximum extraction)
 */

import i18n from "@/i18n";

export type TempZone = "low" | "medium" | "high";

/** Classifies a Celsius temperature into a vaporization zone. */
export function tempZone(celsius: number): TempZone {
  if (celsius > 190) return "high";
  if (celsius >= 170) return "medium";
  return "low";
}

/** Short label shown next to the temperature in the ritual row. */
export function tempZoneLabel(zone: TempZone): string {
  return i18n.t(`sessionCard:zone.${zone}`);
}

/**
 * One short beginner-facing paragraph explaining what this session's
 * temperature zone means. Static copy, adapted to the actual temperature.
 */
export function tempZoneLesson(celsius: number, zone: TempZone): string {
  return i18n.t(`sessionCard:learn.lesson.${zone}`, { temp: celsius });
}
