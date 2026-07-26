/**
 * vaporlog API — profile routes.
 *
 * Own profile (Bearer, see ../authenticate.js):
 *   GET    /api/profile           → 200 { profile, reviews }
 *   PATCH  /api/profile           { bio?, isPublic?, publicStats?,
 *                                   publicReviews?, publicCollection?,
 *                                   favoriteDeviceSlug? } → 200 { profile }
 *          · favoriteDeviceSlug must be a catalog device slug or null
 *   GET    /api/profile/stats     → 200 { stats } (private aggregates from
 *          the caller's sessions: totals, per-device, top strains, weekly)
 *   PUT    /api/profile/reviews/:deviceSlug  { rating, body? }
 *          → 200 { review } — upsert on (user_id, device_slug)
 *          · rating: whole number 1–5 · body: ≤ 2,000 chars
 *   DELETE /api/profile/reviews/:deviceSlug  → 204 | 404
 *   GET    /api/profile/export    → 200 JSON attachment { exportedAt,
 *          profile, sessions, reviews } — everything stored about the caller
 *   DELETE /api/profile           → 204 — the account row; sessions, tokens
 *          and reviews cascade-delete with it
 *
 * Public profile (open):
 *   GET    /api/u/:handle         → 200 { handle, bio, memberSince,
 *          favoriteDevice?, sessions, stats?, reviews?, collection? }
 *          | 404 { error: "private" } — unknown handle AND private profile
 *          share the identical response (do not leak existence)
 *
 * Public-payload privacy rules (product decisions, enforced here):
 *   · sessions: only rows flagged is_public — each session is published
 *     individually from the diary, and published sessions always show while
 *     the profile is public;
 *   · stats: ONLY totalSessions + favoriteDevice — grams and hours NEVER
 *     appear in any public payload;
 *   · collection: session counts per device only (no amounts, no hours).
 */
import { pool } from "../db.js";
import {
  rowToDeviceReview,
  rowToDeviceStat,
  rowToProfileSettings,
  rowToSession,
} from "../mappers.js";
import { authenticate } from "../authenticate.js";

const BIO_MAX_LENGTH = 500;
const REVIEW_BODY_MAX_LENGTH = 2000;

/** Every sessions column the public profile reads, aliased through `s`. */
const SESSION_COLUMNS = `
  s.id, s.user_id, s.strain_slug, s.device_slug, s.temperature_c,
  s.duration_min, s.amount_g, s.rating, s.aromas, s.flavors, s.moods,
  s.activities, s.unwanted_effects, s.liked, s.unwanted_effects_public,
  s.notes, s.is_public, s.author, s.created_at
`;

/** Profile columns the own-profile and public-profile queries share. */
const PROFILE_COLUMNS = `
  handle, bio, is_public, public_stats, public_reviews, public_collection,
  favorite_device_slug, created_at
`;

/** Privacy-flag request keys → profiles columns (PATCH allowlist). */
const FLAG_COLUMNS = [
  ["isPublic", "is_public"],
  ["publicStats", "public_stats"],
  ["publicReviews", "public_reviews"],
  ["publicCollection", "public_collection"],
];

/** The caller's reviews, newest-updated first, with catalog names joined. */
async function fetchReviews(userId) {
  const { rows } = await pool.query(
    `select r.*, d.name as device_name
       from device_reviews r
       left join devices d on d.slug = r.device_slug
      where r.user_id = $1
      order by r.updated_at desc`,
    [userId],
  );
  return rows.map(rowToDeviceReview);
}

/** Resolves a device slug to { slug, name }, or null when unknown/absent. */
async function fetchFavoriteDevice(slug) {
  if (typeof slug !== "string" || slug === "") return null;
  const { rows } = await pool.query(
    "select slug, name from devices where slug = $1",
    [slug],
  );
  return rows.length > 0 ? { slug: rows[0].slug, name: rows[0].name } : null;
}

export default async function profileRoutes(app) {
  /* ---------------------------------------------------------------- */
  /* Own profile                                                       */
  /* ---------------------------------------------------------------- */

  // The caller's full profile plus their reviews (one fetch for the page).
  app.get("/api/profile", { preHandler: authenticate }, async (request) => {
    const { rows } = await pool.query(
      `select ${PROFILE_COLUMNS} from profiles where id = $1`,
      [request.account.id],
    );
    return {
      profile: rowToProfileSettings(rows[0]),
      reviews: await fetchReviews(request.account.id),
    };
  });

  // Partial update: bio, privacy flags, favorite device. Only the keys
  // present in the body are touched; an empty patch returns the profile
  // unchanged.
  app.patch(
    "/api/profile",
    { preHandler: authenticate },
    async (request, reply) => {
      const body = request.body ?? {};
      const sets = [];
      const params = [];

      if ("bio" in body) {
        if (typeof body.bio !== "string") {
          return reply.code(400).send({ error: "bio must be a string." });
        }
        if (body.bio.length > BIO_MAX_LENGTH) {
          return reply.code(400).send({
            error: `Bio must be ${BIO_MAX_LENGTH} characters or fewer.`,
          });
        }
        params.push(body.bio);
        sets.push(`bio = $${params.length}`);
      }

      for (const [key, column] of FLAG_COLUMNS) {
        if (!(key in body)) continue;
        if (typeof body[key] !== "boolean") {
          return reply.code(400).send({ error: `${key} must be a boolean.` });
        }
        params.push(body[key]);
        sets.push(`${column} = $${params.length}`);
      }

      if ("favoriteDeviceSlug" in body) {
        const slug = body.favoriteDeviceSlug;
        const normalized = typeof slug === "string" && slug !== "" ? slug : null;
        if (normalized !== null && typeof slug !== "string") {
          return reply
            .code(400)
            .send({ error: "favoriteDeviceSlug must be a string or null." });
        }
        if (normalized !== null) {
          const exists = await pool.query(
            "select 1 from devices where slug = $1",
            [normalized],
          );
          if (exists.rows.length === 0) {
            return reply.code(400).send({ error: "Unknown device." });
          }
        }
        params.push(normalized);
        sets.push(`favorite_device_slug = $${params.length}`);
      }

      if (sets.length > 0) {
        params.push(request.account.id);
        const { rows } = await pool.query(
          `update profiles set ${sets.join(", ")}
            where id = $${params.length}
            returning ${PROFILE_COLUMNS}`,
          params,
        );
        return { profile: rowToProfileSettings(rows[0]) };
      }

      const { rows } = await pool.query(
        `select ${PROFILE_COLUMNS} from profiles where id = $1`,
        [request.account.id],
      );
      return { profile: rowToProfileSettings(rows[0]) };
    },
  );

  // Private statistics, computed from the caller's sessions. Total minutes
  // and average temperature are private-only numbers — the PUBLIC profile
  // stats block (see /api/u/:handle) never includes them.
  app.get(
    "/api/profile/stats",
    { preHandler: authenticate },
    async (request) => {
      const userId = request.account.id;
      const [totalsRes, devicesRes, strainsRes, weeklyRes, likedRes, unwantedEffectsRes] = await Promise.all([
        pool.query(
          `select count(*)::int as total_sessions,
                  coalesce(sum(duration_min), 0)::float8 as total_minutes,
                  round(avg(temperature_c)::numeric, 1) as avg_temperature_c
             from sessions
            where user_id = $1`,
          [userId],
        ),
        pool.query(
          `select s.device_slug as slug,
                  d.name as name,
                  count(*)::int as sessions,
                  coalesce(sum(s.duration_min), 0)::float8 as total_minutes,
                  round(avg(s.temperature_c)::numeric, 1) as avg_temperature_c
             from sessions s
             left join devices d on d.slug = s.device_slug
            where s.user_id = $1 and s.device_slug <> ''
            group by s.device_slug, d.name
            order by sessions desc, s.device_slug`,
          [userId],
        ),
        pool.query(
          `select strain_slug as slug, count(*)::int as count
             from sessions
            where user_id = $1
            group by strain_slug
            order by count desc, slug
            limit 5`,
          [userId],
        ),
        // Sessions per ISO week, last 8 weeks including the current one;
        // generate_series keeps empty weeks as zeros so the chart has no
        // gaps. week_start is to_char'd to dodge driver date-parsing.
        pool.query(
          `with weeks as (
             select generate_series(
               date_trunc('week', now()) - interval '7 weeks',
               date_trunc('week', now()),
               interval '1 week'
             ) as week_start
           )
           select to_char(w.week_start, 'YYYY-MM-DD') as week_start,
                  count(s.id)::int as count
             from weeks w
             left join sessions s
               on s.user_id = $1
              and date_trunc('week', s.created_at) = w.week_start
            group by w.week_start
            order by w.week_start`,
          [userId],
        ),
        pool.query(
          `select count(*)::int as total_sessions,
                  count(*) filter (where liked is not null)::int as rated_sessions,
                  count(*) filter (where liked = true)::int as liked_sessions
             from sessions
            where user_id = $1`,
          [userId],
        ),
        pool.query(
          `select tag,
                  count(*)::int as count
             from (select unnest(unwanted_effects) as tag from sessions where user_id = $1) t
            group by tag
            order by count desc, tag
            limit 3`,
          [userId],
        ),
      ]);

      const totals = totalsRes.rows[0];
      const liked = likedRes.rows[0];
      const likedPercent =
        Number(liked.rated_sessions) > 0
          ? Math.round(
              (Number(liked.liked_sessions) / Number(liked.rated_sessions)) * 100,
            )
          : null;
      return {
        stats: {
          totalSessions: Number(totals.total_sessions),
          totalMinutes: Number(totals.total_minutes),
          avgTemperatureC:
            totals.avg_temperature_c === null
              ? null
              : Number(totals.avg_temperature_c),
          devices: devicesRes.rows.map(rowToDeviceStat),
          topStrains: strainsRes.rows.map((row) => ({
            slug: row.slug,
            count: Number(row.count),
          })),
          weekly: weeklyRes.rows.map((row) => ({
            weekStart: row.week_start,
            count: Number(row.count),
          })),
          likedPercent,
          topUnwantedEffects: unwantedEffectsRes.rows.map((row) => ({
            tag: row.tag,
            count: Number(row.count),
          })),
        },
      };
    },
  );

  /* ---------------------------------------------------------------- */
  /* Device reviews                                                    */
  /* ---------------------------------------------------------------- */

  // Upsert on (user_id, device_slug): one review per device per user.
  app.put(
    "/api/profile/reviews/:deviceSlug",
    { preHandler: authenticate },
    async (request, reply) => {
      const { deviceSlug } = request.params;
      const body = request.body ?? {};
      if (typeof deviceSlug !== "string" || deviceSlug === "") {
        return reply.code(400).send({ error: "A device slug is required." });
      }

      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return reply
          .code(400)
          .send({ error: "Rating must be a whole number between 1 and 5." });
      }
      if (body.body !== undefined && typeof body.body !== "string") {
        return reply.code(400).send({ error: "body must be a string." });
      }
      const reviewBody = typeof body.body === "string" ? body.body : "";
      if (reviewBody.length > REVIEW_BODY_MAX_LENGTH) {
        return reply.code(400).send({
          error: `Reviews are ${REVIEW_BODY_MAX_LENGTH.toLocaleString("en-US")} characters or fewer.`,
        });
      }

      const { rows } = await pool.query(
        `insert into device_reviews (user_id, device_slug, rating, body)
         values ($1, $2, $3, $4)
         on conflict (user_id, device_slug) do update set
           rating = excluded.rating,
           body = excluded.body,
           updated_at = now()
         returning *, (select name from devices where slug = $2) as device_name`,
        [request.account.id, deviceSlug, rating, reviewBody],
      );
      return { review: rowToDeviceReview(rows[0]) };
    },
  );

  app.delete(
    "/api/profile/reviews/:deviceSlug",
    { preHandler: authenticate },
    async (request, reply) => {
      const { deviceSlug } = request.params;
      const { rowCount } = await pool.query(
        "delete from device_reviews where user_id = $1 and device_slug = $2",
        [request.account.id, deviceSlug],
      );
      if (rowCount === 0) {
        return reply.code(404).send({ error: "Review not found." });
      }
      return reply.code(204).send();
    },
  );

  /* ---------------------------------------------------------------- */
  /* Data rights: export + delete                                      */
  /* ---------------------------------------------------------------- */

  // Everything stored about the caller, as a JSON download. Sessions go
  // through the same SessionLog mapper the app speaks; the profile through
  // the settings mapper (password hash and birthdate stay server-side).
  app.get(
    "/api/profile/export",
    { preHandler: authenticate },
    async (request, reply) => {
      const userId = request.account.id;
      const [profileRes, sessionsRes, reviews] = await Promise.all([
        pool.query(`select ${PROFILE_COLUMNS} from profiles where id = $1`, [
          userId,
        ]),
        pool.query(
          `select ${SESSION_COLUMNS}
             from sessions s
            where s.user_id = $1
            order by s.created_at desc`,
          [userId],
        ),
        fetchReviews(userId),
      ]);

      const payload = {
        exportedAt: new Date().toISOString(),
        profile: rowToProfileSettings(profileRes.rows[0]),
        sessions: sessionsRes.rows.map(rowToSession),
        reviews,
      };
      return reply
        .header("Content-Type", "application/json; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="vaporlog-export-${request.account.username}.json"`,
        )
        .send(JSON.stringify(payload, null, 2));
    },
  );

  // Delete the account. sessions, auth_tokens and device_reviews all carry
  // `on delete cascade` foreign keys, so removing the profiles row removes
  // everything — every live token dies with it.
  app.delete(
    "/api/profile",
    { preHandler: authenticate },
    async (request, reply) => {
      await pool.query("delete from profiles where id = $1", [
        request.account.id,
      ]);
      return reply.code(204).send();
    },
  );

  /* ---------------------------------------------------------------- */
  /* Public profile                                                    */
  /* ---------------------------------------------------------------- */

  // The public page. Unknown handle and private profile share the identical
  // 404 { error: "private" } — the endpoint never reveals which one it was.
  // Optional blocks are attached only while their flag is on. Grams and
  // hours are structurally absent from every block.
  app.get("/api/u/:handle", async (request, reply) => {
    const { handle } = request.params;
    const { rows } = await pool.query(
      `select id, ${PROFILE_COLUMNS}
         from profiles
        where lower(handle) = lower($1)`,
      [handle],
    );
    const profile = rows[0] ?? null;
    if (profile === null || profile.is_public !== true) {
      return reply.code(404).send({ error: "private" });
    }

    const favoriteDevice = await fetchFavoriteDevice(
      profile.favorite_device_slug,
    );

    // Published sessions only, feed shape, newest first — always present
    // while the profile is public.
    const sessionsRes = await pool.query(
      `select ${SESSION_COLUMNS}
         from sessions s
        where s.user_id = $1 and s.is_public
        order by s.created_at desc`,
      [profile.id],
    );

    const payload = {
      handle: profile.handle,
      bio: profile.bio ?? "",
      memberSince:
        profile.created_at instanceof Date
          ? profile.created_at.toISOString()
          : new Date(profile.created_at).toISOString(),
      sessions: sessionsRes.rows.map(rowToSession).map((session) => ({
        ...session,
        unwantedEffects: session.unwantedEffectsPublic
          ? session.unwantedEffects
          : [],
      })),
    };
    if (favoriteDevice !== null) payload.favoriteDevice = favoriteDevice;

    if (profile.public_stats === true) {
      const { rows: countRows } = await pool.query(
        "select count(*)::int as total from sessions where user_id = $1",
        [profile.id],
      );
      payload.stats = {
        totalSessions: Number(countRows[0].total),
        favoriteDevice,
      };
    }

    if (profile.public_reviews === true) {
      payload.reviews = await fetchReviews(profile.id);
    }

    if (profile.public_collection === true) {
      const { rows: collectionRows } = await pool.query(
        `select s.device_slug as slug,
                d.name as name,
                count(*)::int as sessions
           from sessions s
           left join devices d on d.slug = s.device_slug
          where s.user_id = $1 and s.device_slug <> ''
          group by s.device_slug, d.name
          order by sessions desc, s.device_slug`,
        [profile.id],
      );
      payload.collection = collectionRows.map((row) => ({
        slug: row.slug,
        name: row.name ?? null,
        sessions: Number(row.sessions),
        favorite: row.slug === profile.favorite_device_slug,
      }));
    }

    return payload;
  });
}
