/**
 * vaporlog API — session routes.
 *
 *   GET    /api/sessions/public         (open)  → 200 { sessions } newest-first
 *   GET    /api/sessions/mine           (Bearer) → 200 { sessions } newest-first
 *   POST   /api/sessions                (Bearer) → upsert by id → 200 { session }
 *          · ownership enforced: an existing id owned by someone else → 403
 *          · author is stamped from the caller's handle on every write
 *          · the client's createdAt is preserved into created_at
 *   PATCH  /api/sessions/:id            (Bearer, own only) { isPublic }
 *          → 200 { session } | 404 (unknown OR foreign — do not leak existence)
 *   DELETE /api/sessions/:id            (Bearer, own only) → 204 | 404
 *
 * All payloads speak SessionLog camelCase; the DB mapping lives in
 * ../mappers.js.
 */
import crypto from "node:crypto";
import { pool } from "../db.js";
import { rowToSession } from "../mappers.js";
import { authenticate } from "../authenticate.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every sessions column the API reads, aliased through the `s` table alias. */
const SESSION_COLUMNS = `
  s.id, s.user_id, s.strain_slug, s.device_slug, s.temperature_c,
  s.duration_min, s.amount_g, s.rating, s.aromas, s.flavors, s.moods,
  s.activities, s.unwanted_effects, s.liked, s.unwanted_effects_public,
  s.detox_days, s.detox_days_public, s.detox_review,
  s.notes, s.is_public, s.author, s.created_at
`;

/** Coerces an arbitrary JSON value to a clean boolean | null. */
function asBooleanOrNull(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

/** Coerces an arbitrary JSON value to a clean string[]. */
function asStringArray(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

/** Coerces to number | null (SessionLog's optional measurements). */
function asNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Preserves the client's createdAt; falls back to now() when unusable. */
function asIsoTimestamp(value) {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

export default async function sessionRoutes(app) {
  // Community feed: every public session, newest first. The LEFT JOIN lets
  // the mapper fall back to the owner's live handle when the denormalized
  // author column is empty, and exposes the owner's is_public flag so
  // clients link the handle to /u/:handle only for public profiles.
  app.get("/api/sessions/public", async () => {
    const { rows } = await pool.query(
      `select ${SESSION_COLUMNS},
              p.handle    as owner_handle,
              p.is_public as author_profile_public
         from sessions s
         left join profiles p on p.id = s.user_id
        where s.is_public
        order by s.created_at desc`,
    );
    const sessions = rows.map(rowToSession).map((session) => ({
      ...session,
      // Unwanted effects and detox data are only visible publicly when
      // explicitly opted in (per-session flags).
      unwantedEffects: session.unwantedEffectsPublic ? session.unwantedEffects : [],
      detoxDays: session.detoxDaysPublic ? session.detoxDays : null,
      detoxReview: session.detoxDaysPublic ? session.detoxReview : "",
    }));
    return { sessions };
  });

  // The caller's own sessions, newest first.
  app.get(
    "/api/sessions/mine",
    { preHandler: authenticate },
    async (request) => {
      const { rows } = await pool.query(
        `select ${SESSION_COLUMNS}
           from sessions s
          where s.user_id = $1
          order by s.created_at desc`,
        [request.account.id],
      );
      return { sessions: rows.map(rowToSession) };
    },
  );

  // Upsert by id. The client generates uuids (crypto.randomUUID); anything
  // else (legacy ids) is regenerated so the uuid PK never rejects a write.
  app.post(
    "/api/sessions",
    { preHandler: authenticate },
    async (request, reply) => {
      const body = request.body ?? {};
      const id =
        typeof body.id === "string" && UUID_RE.test(body.id)
          ? body.id
          : crypto.randomUUID();

      // Ownership is enforced in app code: a conflicting id that belongs to
      // another account is rejected before the upsert can touch it.
      const existing = await pool.query(
        "select user_id from sessions where id = $1",
        [id],
      );
      if (
        existing.rows.length > 0 &&
        existing.rows[0].user_id !== request.account.id
      ) {
        return reply
          .code(403)
          .send({ error: "You can only edit your own sessions." });
      }

      const rating = Number(body.rating);
      const liked = asBooleanOrNull(body.liked);
      const unwantedEffects = asStringArray(body.unwantedEffects);
      const unwantedEffectsPublic = body.unwantedEffectsPublic === true;
      // Post-detox data: the streak this session ended (null for ordinary
      // sessions), the opt-in public flag and the capped dedicated review.
      const detoxDays =
        Number.isInteger(body.detoxDays) && body.detoxDays >= 1
          ? body.detoxDays
          : null;
      const detoxDaysPublic =
        body.detoxDaysPublic === true && detoxDays !== null;
      const detoxReview =
        typeof body.detoxReview === "string"
          ? body.detoxReview.slice(0, 500)
          : "";
      const { rows } = await pool.query(
        `insert into sessions (
           id, user_id, strain_slug, device_slug, temperature_c, duration_min,
           amount_g, rating, aromas, flavors, moods, activities, unwanted_effects,
           liked, unwanted_effects_public, detox_days, detox_days_public,
           detox_review, notes, is_public, author, created_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
         on conflict (id) do update set
           strain_slug   = excluded.strain_slug,
           device_slug   = excluded.device_slug,
           temperature_c = excluded.temperature_c,
           duration_min  = excluded.duration_min,
           amount_g      = excluded.amount_g,
           rating        = excluded.rating,
           aromas        = excluded.aromas,
           flavors       = excluded.flavors,
           moods         = excluded.moods,
           activities    = excluded.activities,
           unwanted_effects         = excluded.unwanted_effects,
           liked                    = excluded.liked,
           unwanted_effects_public  = excluded.unwanted_effects_public,
           detox_days          = excluded.detox_days,
           detox_days_public   = excluded.detox_days_public,
           detox_review        = excluded.detox_review,
           notes         = excluded.notes,
           is_public     = excluded.is_public,
           author        = excluded.author,
           created_at    = excluded.created_at
         returning *`,
        [
          id,
          request.account.id,
          typeof body.strainSlug === "string" ? body.strainSlug : "",
          typeof body.deviceSlug === "string" ? body.deviceSlug : "",
          asNumberOrNull(body.temperatureC),
          asNumberOrNull(body.durationMin),
          asNumberOrNull(body.amountG),
          Number.isFinite(rating) ? rating : 0,
          asStringArray(body.aromas),
          asStringArray(body.flavors),
          asStringArray(body.moods),
          asStringArray(body.activities),
          unwantedEffects,
          liked,
          unwantedEffectsPublic,
          detoxDays,
          detoxDaysPublic,
          detoxReview,
          typeof body.notes === "string" ? body.notes : "",
          body.isPublic === true,
          request.account.username, // author stamped from the caller's handle
          asIsoTimestamp(body.createdAt),
        ],
      );
      return { session: rowToSession(rows[0]) };
    },
  );

  // Publish/unpublish one of the caller's own sessions, and optionally
  // toggle whether unwanted effects are included in the public view.
  app.patch(
    "/api/sessions/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params;
      const { isPublic, unwantedEffectsPublic } = request.body ?? {};
      if (!UUID_RE.test(id)) {
        return reply.code(404).send({ error: "Session not found." });
      }
      const sets = [];
      const params = [];
      if (typeof isPublic === "boolean") {
        params.push(isPublic);
        sets.push(`is_public = $${params.length}`);
      }
      if (typeof unwantedEffectsPublic === "boolean") {
        params.push(unwantedEffectsPublic);
        sets.push(`unwanted_effects_public = $${params.length}`);
      }
      if (sets.length === 0) {
        return reply
          .code(400)
          .send({ error: "isPublic or unwantedEffectsPublic must be a boolean." });
      }
      params.push(id, request.account.id);
      const { rows } = await pool.query(
        `update sessions
            set ${sets.join(", ")}
          where id = $${params.length - 1} and user_id = $${params.length}
          returning *`,
        params,
      );
      if (rows.length === 0) {
        return reply.code(404).send({ error: "Session not found." });
      }
      return { session: rowToSession(rows[0]) };
    },
  );

  // Delete one of the caller's own sessions.
  app.delete(
    "/api/sessions/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        return reply.code(404).send({ error: "Session not found." });
      }
      const { rowCount } = await pool.query(
        "delete from sessions where id = $1 and user_id = $2",
        [id, request.account.id],
      );
      if (rowCount === 0) {
        return reply.code(404).send({ error: "Session not found." });
      }
      return reply.code(204).send();
    },
  );
}
