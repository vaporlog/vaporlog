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

export type TempZone = "low" | "medium" | "high";

/** Classifies a Celsius temperature into a vaporization zone. */
export function tempZone(celsius: number): TempZone {
  if (celsius > 190) return "high";
  if (celsius >= 170) return "medium";
  return "low";
}

/** Short label shown next to the temperature in the ritual row. */
export function tempZoneLabel(zone: TempZone): string {
  switch (zone) {
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
  }
}

/**
 * One short beginner-facing paragraph explaining what this session's
 * temperature zone means. Static copy, adapted to the actual temperature.
 */
export function tempZoneLesson(celsius: number, zone: TempZone): string {
  switch (zone) {
    case "low":
      return (
        `${celsius}°C sits in the low zone — the flavor range. Gentle heat ` +
        `vaporizes the most delicate terpenes first, so the vapor tastes ` +
        `brighter and the effects tend to feel lighter and clearer. This is ` +
        `how connoisseurs taste a strain before they chase potency.`
      );
    case "medium":
      return (
        `${celsius}°C sits in the middle zone — the balance point. Warm ` +
        `enough to extract the heavier compounds, cool enough to keep most ` +
        `of the terpene character intact. Flavor and strength meet here, ` +
        `which is why most everyday sessions live in this range.`
      );
    case "high":
      return (
        `${celsius}°C sits in the high zone — maximum extraction. The vapor ` +
        `comes out thicker and the body effects land harder, traded against ` +
        `some of the finer flavor notes. Experienced users finish a bowl ` +
        `here once the tasting is done.`
      );
  }
}
