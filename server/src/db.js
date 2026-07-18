/**
 * vaporlog API — database handle.
 *
 * Two modes, selected by environment:
 *
 *   · DATABASE_URL set (production): a pg Pool against that PostgreSQL —
 *     identical behavior to before (docker-compose wires it as
 *     postgres://vaporlog:${POSTGRES_PASSWORD}@db:5432/vaporlog). The pool is
 *     lazy: it does not connect until the first query, so the process boots
 *     fine even when the database is unreachable (see /api/health).
 *
 *   · DATABASE_URL unset (local dev): an embedded PGlite database
 *     (PostgreSQL compiled to WASM, single in-process connection — plenty
 *     for a dev box). Data persists in server/.dev-data/ across restarts;
 *     the schema is bootstrapped from db/init.sql plus db/migrations/*.sql,
 *     tracked in a schema_migrations table so seeds never double-apply.
 *
 * Both modes export the same minimal surface the routes rely on:
 *   pool.query(text, params) → { rows, rowCount }
 *   pool.on(...)             — event registration (no-op when embedded)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * Local-dev path: embedded PGlite database persisted under server/.dev-data/.
 * Applies db/init.sql (idempotent) on every boot, then any not-yet-applied
 * files from db/migrations/ in filename order, recorded in schema_migrations.
 */
async function createEmbeddedPool() {
  // Dev-only dependency — imported lazily so production images
  // (`npm ci --omit=dev`, PGlite absent) never touch this branch.
  const { PGlite } = await import("@electric-sql/pglite");

  const dataDir = path.join(serverRoot, ".dev-data");
  const db = new PGlite(dataDir);
  await db.waitReady;

  // init.sql is fully idempotent (IF NOT EXISTS everywhere), so re-asserting
  // it on every boot is cheap and picks up fresh-checkout schema edits.
  await db.exec(
    await fs.readFile(path.join(serverRoot, "db", "init.sql"), "utf8"),
  );

  // Migrations run once each, in filename order; schema_migrations is the
  // bookkeeping that keeps the 100-device seed (and future seeds) from
  // re-applying on every restart.
  await db.exec(
    `create table if not exists schema_migrations (
       name       text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  const migrationsDir = path.join(serverRoot, "db", "migrations");
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const { rows } = await db.query(
      "select 1 from schema_migrations where name = $1",
      [file],
    );
    if (rows.length > 0) continue;
    await db.exec(await fs.readFile(path.join(migrationsDir, file), "utf8"));
    await db.query("insert into schema_migrations (name) values ($1)", [file]);
  }

  console.log(
    `vaporlog-api: DATABASE_URL not set — embedded dev database (PGlite) at ${dataDir}`,
  );

  // Adapter over the route-facing pg surface. PGlite reports affected rows
  // as affectedRows; pg calls it rowCount — map it (DELETE /api/sessions/:id
  // relies on it). on() is a no-op: an in-process database has no socket to
  // fail asynchronously.
  return {
    async query(text, params = []) {
      const result = await db.query(text, params);
      return {
        rows: result.rows,
        rowCount: result.affectedRows ?? result.rows.length,
      };
    },
    on() {},
  };
}

export const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    })
  : await createEmbeddedPool();

// A client-level error (e.g. the DB vanishing mid-connection) must never
// take the process down — log it and let the pool recover on next query.
pool.on("error", (error) => {
  console.error("vaporlog-api: unexpected pg pool error:", error.message);
});
