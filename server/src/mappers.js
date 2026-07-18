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
 * { id, username, birthdate, createdAt }.
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
  };
}

/**
 * Maps a sessions row to the app's SessionLog shape (camelCase).
 * `row.owner_handle` is an optional LEFT JOIN profiles handle used as the
 * author fallback when the denormalized author column is empty; last
 * resort is "anonymous".
 */
export function rowToSession(row) {
  return {
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
    notes: row.notes ?? "",
    isPublic: row.is_public,
    author:
      typeof row.author === "string" && row.author !== ""
        ? row.author
        : (row.owner_handle ?? "anonymous"),
    createdAt: toIso(row.created_at),
  };
}
