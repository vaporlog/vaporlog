import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  displayStrainName,
  isCatalogStrain,
  type FavoriteStrain,
} from "./diary-utils";

interface FavoriteStrainsProps {
  favorites: FavoriteStrain[];
}

function FavoriteRow({ favorite }: { favorite: FavoriteStrain }) {
  const name = displayStrainName(favorite.strainSlug);
  const catalog = isCatalogStrain(favorite.strainSlug);

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">
          {favorite.sessions}{" "}
          {favorite.sessions === 1 ? "session" : "sessions"}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-sm font-semibold tabular-nums text-herb">
          {favorite.avgRating.toFixed(1)}
        </span>
        <span className="text-xs text-muted-foreground">/10</span>
        {catalog && (
          <ChevronRight
            className="ml-1 size-4 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>
    </>
  );

  const className =
    "pressable flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors duration-150";

  // Catalog strains deep-link to their detail page; private strains stay inert.
  if (catalog) {
    return (
      <li>
        <Link
          to={`/strains/${encodeURIComponent(favorite.strainSlug)}`}
          className={`${className} hover:bg-secondary/60`}
        >
          {body}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <div className={className}>{body}</div>
    </li>
  );
}

/** Top strains by the user's own average rating. */
export function FavoriteStrains({ favorites }: FavoriteStrainsProps) {
  if (favorites.length === 0) return null;
  return (
    <section aria-labelledby="diary-favorites-heading" className="space-y-3">
      <h2
        id="diary-favorites-heading"
        className="text-lg font-semibold tracking-tight"
      >
        Favorites
      </h2>
      <ul className="space-y-2">
        {favorites.map((favorite) => (
          <FavoriteRow key={favorite.strainSlug} favorite={favorite} />
        ))}
      </ul>
    </section>
  );
}
