/**
 * vaporlog API — PostgreSQL connection pool.
 *
 * The connection string comes from the DATABASE_URL environment variable
 * (docker-compose wires it as
 * postgres://vaporlog:${POSTGRES_PASSWORD}@db:5432/vaporlog). The pool is
 * lazy: it does not connect until the first query, so the process boots
 * fine even when the database is unreachable (see /api/health).
 */
import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

// A client-level error (e.g. the DB vanishing mid-connection) must never
// take the process down — log it and let the pool recover on next query.
pool.on("error", (error) => {
  console.error("vaporlog-api: unexpected pg pool error:", error.message);
});
