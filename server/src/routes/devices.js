/**
 * vaporlog API — device catalog routes.
 *
 *   GET /api/devices (open) → 200 { devices } ordered by sort_order, name
 *
 * Public reference data (the session editor's device picker needs it without
 * auth). Session records reference devices by slug; slugs are stable and
 * never renamed.
 */
import { pool } from "../db.js";

/** Maps a devices row to the public camelCase shape (sort_order → sortOrder). */
function rowToDevice(row) {
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    sortOrder: Number(row.sort_order),
  };
}

export default async function deviceRoutes(app) {
  app.get("/api/devices", async () => {
    const { rows } = await pool.query(
      `select slug, name, category, sort_order
         from devices
        order by sort_order, name`,
    );
    return { devices: rows.map(rowToDevice) };
  });
}
