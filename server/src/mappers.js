/**
 * vaporlog API — row ↔ public-shape mappers.
 *
 * The API speaks camelCase both ways (SessionLog, Account); the database
 * speaks snake_case. These mappers are the ONLY place the two worlds meet —
 * clients never see a snake_case key.
 */

/**
 * pg returns timestamptz as a Date; normalize to an ISO 8601 string.
 * Accepts strings too (defensive — depends on driver type parsers).
 */
function toIso(value) {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

/** pg returns numeric columns as strings — coerce back to number | null. */
function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Maps a profiles row to the public Account shape:
 * { id, username, birthdate, createdAt, role }.
 * Expects `birthdate` already formatted as 'YYYY-MM-DD' text (the queries
 * use to_char(birthdate, 'YYYY-MM-DD') to dodge pg date-parser timezone
 * pitfalls); passes NULL through as "".
 */
export function rowToAccount(row) {
  return {
    id: row.id,
    username: row.handle,
    birthdate: row.birthdate ?? "",
    createdAt: toIso(row.created_at),
    role: row.role ?? "user",
  };
}

/**
 * Maps a sessions row to the app's SessionLog shape (camelCase).
 * `row.owner_handle` is an optional LEFT JOIN profiles handle used as the
 * author fallback when the denormalized author column is empty; last
 * resort is "anonymous".
 *
 * `row.author_profile_public` is an optional LEFT JOIN profiles is_public
 * flag. It is attached as `authorProfilePublic` ONLY when the query
 * actually selected it (public payloads like GET /api/sessions/public);
 * NULL (no profiles row) and queries without the join (private endpoints
 * like /api/sessions/mine) leave the key out of the payload entirely.
 */
export function rowToSession(row) {
  const session = {
    id: row.id,
    strainSlug: row.strain_slug,
    deviceSlug: row.device_slug ?? "",
    temperatureC: toNumberOrNull(row.temperature_c),
    durationMin: toNumberOrNull(row.duration_min),
    amountG: toNumberOrNull(row.amount_g),
    rating: Number(row.rating),
    aromas: row.aromas ?? [],
    flavors: row.flavors ?? [],
    moods: row.moods ?? [],
    activities: row.activities ?? [],
    unwantedEffects: row.unwanted_effects ?? [],
    liked:
      typeof row.liked === "boolean" ? row.liked : (row.liked ?? null),
    unwantedEffectsPublic: row.unwanted_effects_public === true,
    detoxDays: Number.isInteger(row.detox_days) ? row.detox_days : null,
    detoxDaysPublic: row.detox_days_public === true,
    detoxReview: row.detox_review ?? "",
    notes: row.notes ?? "",
    isPublic: row.is_public,
    author:
      typeof row.author === "string" && row.author !== ""
        ? row.author
        : (row.owner_handle ?? "anonymous"),
    createdAt: toIso(row.created_at),
  };
  if (typeof row.author_profile_public === "boolean") {
    session.authorProfilePublic = row.author_profile_public;
  }
  return session;
}

/**
 * Maps a profiles row to the owner's ProfileSettings shape (camelCase) —
 * the full private view of the profile page: identity, free-form bio, the
 * is_public master switch, the per-block public flags, favorite device and
 * member-since timestamp.
 */
export function rowToProfileSettings(row) {
  return {
    handle: row.handle,
    bio: row.bio ?? "",
    isPublic: row.is_public === true,
    publicStats: row.public_stats === true,
    publicReviews: row.public_reviews === true,
    publicCollection: row.public_collection === true,
    favoriteDeviceSlug: row.favorite_device_slug ?? null,
    memberSince: toIso(row.created_at),
  };
}

/**
 * Maps a device_reviews row to the camelCase review shape. `row.device_name`
 * is an optional LEFT JOIN devices name; null when the slug is not a catalog
 * device (e.g. a personal `my-*` device) — clients humanize the slug then.
 */
export function rowToDeviceReview(row) {
  return {
    deviceSlug: row.device_slug,
    deviceName: row.device_name ?? null,
    rating: Number(row.rating),
    body: row.body ?? "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/**
 * Maps one row of the per-device stats aggregation to camelCase.
 * `row.name` is the LEFT JOIN devices name (null for non-catalog slugs).
 */
export function rowToDeviceStat(row) {
  return {
    slug: row.slug,
    name: row.name ?? null,
    sessions: Number(row.sessions),
    totalMinutes: Number(row.total_minutes ?? 0),
    avgTemperatureC: toNumberOrNull(row.avg_temperature_c),
  };
}
