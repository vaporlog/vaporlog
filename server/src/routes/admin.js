/**
 * vaporlog API — admin dashboard routes.
 *
 * All routes under /api/admin require a valid Bearer token AND an account
 * whose role is 'admin'. The payloads expose aggregate counts only; grams,
 * minutes, and private notes are intentionally omitted.
 *
 * Endpoints:
 *   GET /api/admin/stats   → high-level metrics + top strains/devices/moods
 *   GET /api/admin/users   → paginated user list (handle, role, counts)
 *   GET /api/admin/system  → DB status, tokens, catalog counts
 */
import { pool } from "../db.js";
import { authenticate } from "../authenticate.js";
import { authenticateAdmin } from "../admin.js";

const ADMIN_PRE_HANDLER = { preHandler: authenticateAdmin };
const DEFAULT_USER_LIMIT = 50;
const MAX_USER_LIMIT = 200;

export default async function adminRoutes(app) {
  app.get("/api/admin/stats", ADMIN_PRE_HANDLER, async () => {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // PGlite has a single in-process connection, so run these sequentially
    // instead of Promise.all — that keeps dev stable while prod still gets
    // good performance from the lazy pg pool.
    const userCountsRes = await pool.query(
      `select count(*)::int as total,
              count(*) filter (where created_at > $1)::int as today,
              count(*) filter (where created_at > $2)::int as last_7_days,
              count(*) filter (where created_at > $3)::int as last_30_days
         from profiles`,
      [dayAgo, weekAgo, monthAgo],
    );

    const sessionCountsRes = await pool.query(
      `select count(*)::int as total,
              count(*) filter (where is_public)::int as public,
              count(*) filter (where not is_public)::int as private,
              count(*) filter (where created_at > $1)::int as today,
              count(*) filter (where created_at > $2)::int as last_7_days,
              count(*) filter (where created_at > $3)::int as last_30_days
         from sessions`,
      [dayAgo, weekAgo, monthAgo],
    );

    const activeUsersRes = await pool.query(
      `select count(distinct user_id) filter (where created_at > $1)::int as last_7_days,
              count(distinct user_id) filter (where created_at > $2)::int as last_30_days
         from sessions`,
      [weekAgo, monthAgo],
    );

    const averagesRes = await pool.query(
      `select (select round(avg(cnt)::numeric, 2)
                 from (select count(*) as cnt from sessions group by user_id) t) as sessions_per_user,
              (select round(avg(rating)::numeric, 1) from sessions) as avg_rating`,
    );

    const topStrainsRes = await pool.query(
      `select strain_slug as slug,
              count(*)::int as count
         from sessions
        group by strain_slug
        order by count desc, strain_slug
        limit 10`,
    );

    const topDevicesRes = await pool.query(
      `select s.device_slug as slug,
              d.name,
              d.category,
              count(*)::int as count
         from sessions s
         left join devices d on d.slug = s.device_slug
        where s.device_slug <> ''
        group by s.device_slug, d.name, d.category
        order by count desc, s.device_slug
        limit 10`,
    );

    const topMoodsRes = await pool.query(
      `select tag,
              count(*)::int as count
         from (select unnest(moods) as tag from sessions) t
        group by tag
        order by count desc, tag
        limit 10`,
    );

    const topUnwantedEffectsRes = await pool.query(
      `select tag,
              count(*)::int as count
         from (select unnest(unwanted_effects) as tag from sessions) t
        group by tag
        order by count desc, tag
        limit 10`,
    );

    const dailySeriesRes = await pool.query(
      `select to_char(created_at, 'YYYY-MM-DD') as day,
              count(*)::int as sessions,
              count(*) filter (where is_public)::int as public_sessions
         from sessions
        where created_at > $1
        group by to_char(created_at, 'YYYY-MM-DD')
        order by day`,
      [monthAgo],
    );

    const userCounts = userCountsRes.rows[0];
    const sessionCounts = sessionCountsRes.rows[0];
    const activeUsers = activeUsersRes.rows[0];
    const averages = averagesRes.rows[0] ?? {};

    return {
      stats: {
        users: {
          total: Number(userCounts.total),
          today: Number(userCounts.today),
          last7Days: Number(userCounts.last_7_days),
          last30Days: Number(userCounts.last_30_days),
        },
        sessions: {
          total: Number(sessionCounts.total),
          public: Number(sessionCounts.public),
          private: Number(sessionCounts.private),
          today: Number(sessionCounts.today),
          last7Days: Number(sessionCounts.last_7_days),
          last30Days: Number(sessionCounts.last_30_days),
        },
        activeUsers: {
          last7Days: Number(activeUsers.last_7_days),
          last30Days: Number(activeUsers.last_30_days),
        },
        averages: {
          sessionsPerUser: Number(averages.sessions_per_user ?? 0),
          averageRating: Number(averages.avg_rating ?? 0),
        },
        topStrains: topStrainsRes.rows.map((row) => ({
          slug: row.slug,
          count: Number(row.count),
        })),
        topDevices: topDevicesRes.rows.map((row) => ({
          slug: row.slug,
          name: row.name ?? row.slug,
          category: row.category ?? "",
          count: Number(row.count),
        })),
        topMoods: topMoodsRes.rows.map((row) => ({
          tag: row.tag,
          count: Number(row.count),
        })),
        topUnwantedEffects: topUnwantedEffectsRes.rows.map((row) => ({
          tag: row.tag,
          count: Number(row.count),
        })),
        dailySeries: dailySeriesRes.rows.map((row) => ({
          day: row.day,
          sessions: Number(row.sessions),
          publicSessions: Number(row.public_sessions),
        })),
      },
    };
  });

  app.get("/api/admin/users", ADMIN_PRE_HANDLER, async (request, reply) => {
    const query = request.query ?? {};
    const limit = Math.min(
      Number.isInteger(Number(query.limit)) ? Number(query.limit) : DEFAULT_USER_LIMIT,
      MAX_USER_LIMIT,
    );
    const offset = Number.isInteger(Number(query.offset)) ? Number(query.offset) : 0;

    if (limit < 1 || offset < 0) {
      return reply.code(400).send({ error: "Invalid pagination." });
    }

    const { rows, rowCount } = await pool.query(
      `select p.id,
              p.handle,
              p.role,
              to_char(p.created_at, 'YYYY-MM-DD') as created_at,
              count(s.id)::int as session_count,
              max(s.created_at) as last_session_at
         from profiles p
         left join sessions s on s.user_id = p.id
        group by p.id, p.handle, p.role, p.created_at
        order by p.created_at desc
        limit $1 offset $2`,
      [limit, offset],
    );

    return {
      users: rows.map((row) => ({
        id: row.id,
        handle: row.handle,
        role: row.role,
        createdAt: row.created_at,
        sessionCount: Number(row.session_count),
        lastSessionAt:
          row.last_session_at instanceof Date
            ? row.last_session_at.toISOString()
            : null,
      })),
      pagination: {
        limit,
        offset,
        returned: rowCount,
      },
    };
  });

  app.get("/api/admin/system", ADMIN_PRE_HANDLER, async () => {
    let db = "up";
    try {
      await pool.query("select 1");
    } catch {
      db = "down";
    }

    const migrationsRes = await pool.query(
      "select name from schema_migrations order by name",
    );
    const tokensRes = await pool.query(
      "select count(*)::int as total from auth_tokens where expires_at > now()",
    );
    const devicesRes = await pool.query(
      "select count(*)::int as total from devices",
    );
    const reviewsRes = await pool.query(
      "select count(*)::int as total from device_reviews",
    );

    return {
      system: {
        db,
        migrations: migrationsRes.rows.map((row) => row.name),
        activeTokens: Number(tokensRes.rows[0].total),
        deviceCount: Number(devicesRes.rows[0].total),
        deviceReviewCount: Number(reviewsRes.rows[0].total),
      },
    };
  });
}
