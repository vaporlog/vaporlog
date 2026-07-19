import { Star } from "lucide-react";

interface ReviewStarsProps {
  /** Whole number 1–5. */
  rating: number;
  /** Accessible name announced instead of the glyphs (e.g. "4 out of 5"). */
  label: string;
}

/**
 * Read-only 1–5 star row for device reviews. Herb is the ONE accent and
 * this is a rating surface, so filled stars are herb; the rest stay on the
 * neutral scale.
 */
export default function ReviewStars({ rating, label }: ReviewStarsProps) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          aria-hidden="true"
          className={`size-3.5 ${
            value <= rating ? "fill-herb text-herb" : "text-border"
          }`}
        />
      ))}
    </span>
  );
}
