import { tempZone, tempZoneLesson } from "./temperature";

/**
 * Beginner education block: one short paragraph explaining what this
 * session's temperature zone means. Rendered only when the session
 * recorded a temperature — no data, no lesson.
 */
export default function LearnBlock({
  temperatureC,
}: {
  temperatureC: number;
}) {
  const zone = tempZone(temperatureC);
  return (
    <section
      aria-label="What this temperature means"
      className="mx-auto w-full max-w-xl text-center"
    >
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Reading the ritual
      </h2>
      <p className="mt-3 text-pretty text-base leading-relaxed text-foreground">
        {tempZoneLesson(temperatureC, zone)}
      </p>
    </section>
  );
}
