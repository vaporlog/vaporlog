/**
 * vaporlog API — detox streak routes.
 *
 *   GET    /api/detox/marks        (Bearer) → 200 { days } ("YYYY-MM-DD"[])
 *   PUT    /api/detox/marks/:day   (Bearer) → 204 — mark a clean day
 *   DELETE /api/detox/marks/:day   (Bearer) → 204 — unmark (idempotent)
 *
 * Marks are explicit and user-driven (the diary calendar): any past day is
 * fair game (unlimited backfill by product decision), future days are
 * rejected. Streak computation happens client-side — the server just
 * stores the set. Day strings are local calendar days as sent by the
 * client; the server only validates shape and "not in the future" (with a
 * one-day tolerance so no timezone eats a legitimate today).
 */
import { pool } from "../db.js";
import { authenticate } from "../authenticate.js";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates :day — must be a real YYYY-MM-DD calendar date, not in the
 * future (CURRENT_DATE + 1 covers every client timezone's "today").
 */
async function isValidDay(day) {
  if (typeof day !== "string" || !DAY_RE.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Round-trip check rejects 2026-02-31-style overflows.
  if (parsed.toISOString().slice(0, 10) !== day) return false;
  const { rows } = await pool.query(
    "select $1::date <= current_date + 1 as ok",
    [day],
  );
  return rows[0].ok === true;
}

export default async function detoxRoutes(app) {
  // Every mark for the caller — the streak calendar renders from this set.
  app.get(
    "/api/detox/marks",
    { preHandler: authenticate },
    async (request) => {
      const { rows } = await pool.query(
        `select to_char(day, 'YYYY-MM-DD') as day
           from detox_marks
          where user_id = $1
          order by day desc`,
        [request.account.id],
      );
      return { days: rows.map((row) => row.day) };
    },
  );

  // Mark a clean day. Idempotent (re-marking is a no-op) by design — the
  // calendar toggles optimistically and retries must be safe.
  app.put(
    "/api/detox/marks/:day",
    { preHandler: authenticate },
    async (request, reply) => {
      const { day } = request.params;
      if (!(await isValidDay(day))) {
        return reply.code(400).send({ error: "A valid past day is required." });
      }
      await pool.query(
        `insert into detox_marks (user_id, day) values ($1, $2)
         on conflict (user_id, day) do nothing`,
        [request.account.id, day],
      );
      return reply.code(204).send();
    },
  );

  // Unmark a clean day (or clear today's mark when a session lands — the
  // session always wins). 204 either way: nothing to leak, nothing to fail.
  app.delete(
    "/api/detox/marks/:day",
    { preHandler: authenticate },
    async (request, reply) => {
      const { day } = request.params;
      if (typeof day !== "string" || !DAY_RE.test(day)) {
        return reply.code(400).send({ error: "A valid day is required." });
      }
      await pool.query(
        "delete from detox_marks where user_id = $1 and day = $2",
        [request.account.id, day],
      );
      return reply.code(204).send();
    },
  );
}
