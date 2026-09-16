/**
 * vaporlog API — user-owned cover templates (global "Mis portadas" gallery).
 *
 *   GET    /api/cover-templates            (Bearer, own only)
 *          → 200 { templates: [{ id, name, doc, hasPreview, updatedAt }] }
 *            ordered by updatedAt desc
 *   POST   /api/cover-templates            (Bearer, own only)
 *          body: { name: "1-60 chars",
 *                  doc: "<serialized editor JSON>" (≤ 256 KiB),
 *                  image?: "data:image/png;base64,...." (≤ ~1.9 MiB after decode) }
 *          → 201 { template } | 400 invalid input or 50-template cap
 *   PATCH  /api/cover-templates/:id        (Bearer, own only)
 *          body: { name?, doc?, image? } — at least one required
 *          → 200 { template } | 400 | 404 unknown or foreign (identical)
 *   DELETE /api/cover-templates/:id        (Bearer, own only)
 *          → 204 | 404
 *   GET    /api/cover-templates/:id/preview.png  (Bearer, own only)
 *          → 200 image/png, cache-control private max-age=300 must-revalidate
 *            | 404 unknown, foreign, or template without preview (identical)
 *
 * A template is the serialized CoverEditor document ({version, background,
 * layers}) — the same JSON string format stored on sessions.custom_og_doc
 * (migration 015) — plus an optional 1200x630 preview PNG so the gallery can
 * show real thumbnails. Applying a template is client-side: the frontend
 * rebinds the doc onto the target session and saves through the existing
 * custom-og endpoints; this API only stores the reusable designs.
 *
 * Preview files live under server/assets/uploads/cover_templates/<id>.png
 * (same docker-volume convention as custom_og; see docker-compose.yml). The
 * DB stores the path relative to server/assets/ with forward slashes so the
 * same row works on Windows dev and Linux prod (path.resolve accepts both
 * separators on every platform).
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";
import { authenticate } from "../authenticate.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same caps as custom-og: 1.9 MiB decoded image, 256 KiB document. */
const MAX_IMAGE_BYTES = Math.floor(1.9 * 1024 * 1024);
const MAX_DOC_BYTES = 256 * 1024;

/** Templates are cheap rows, but an unbounded gallery is a storage and
 *  payload liability — cap it at 50 per user. */
const MAX_TEMPLATES_PER_USER = 50;

/** PNG signature: 89 50 4E 47 0D 0A 1A 0A. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** server/assets/ — the directory the preview files live under. The DB
 *  stores paths relative to this root so the same row works in dev
 *  (./assets) and prod (/srv/assets). */
const assetsRoot = path.resolve(
  path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))),
  "assets",
);
const uploadsDir = path.join(assetsRoot, "uploads", "cover_templates");

/** Coerces the request body to a raw PNG Buffer or null on bad input. */
function decodeDataUrl(value) {
  if (typeof value !== "string") return null;
  // Strict prefix — only PNG, same rule as custom-og.
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  let buffer;
  try {
    buffer = Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;
  // Confirm it's actually a PNG, not just a .png-named payload.
  if (buffer.length < PNG_SIGNATURE.length) return null;
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return null;
  }
  return buffer;
}

/** Builds the relative path stored in the DB. Forward slashes on purpose:
 *  path.join would emit backslashes on Windows dev and break the prod row. */
function relativePathFor(templateId) {
  return `uploads/cover_templates/${templateId}.png`;
}

/** Resolves a relative path to the on-disk assets root, with a hard
 *  containment check — never trust a string from the DB to be a bare
 *  filename. */
function resolvePreviewPath(relativePath) {
  if (typeof relativePath !== "string" || relativePath === "") return null;
  const resolved = path.resolve(assetsRoot, relativePath);
  if (
    resolved !== assetsRoot &&
    !resolved.startsWith(assetsRoot + path.sep)
  ) {
    return null;
  }
  return resolved;
}

/** Validates the `name` field: trimmed string, 1–60 chars. Returns the
 *  trimmed value or null. */
function parseName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 60) return null;
  return trimmed;
}

/** Validates the `doc` field: JSON string under the byte cap. Returns the
 *  string verbatim or null. */
function parseDoc(value) {
  if (typeof value !== "string") return null;
  if (Buffer.byteLength(value, "utf8") > MAX_DOC_BYTES) return null;
  try {
    JSON.parse(value);
  } catch {
    return null;
  }
  return value;
}

/** Row → public shape. The preview path is never exposed — only whether
 *  one exists; the PNG itself is served by the preview endpoint. */
function rowToTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    doc: row.doc,
    hasPreview: row.preview_path !== null,
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Writes a preview PNG for a template and returns the relative path. */
async function writePreview(templateId, buffer) {
  await fs.mkdir(uploadsDir, { recursive: true });
  const relativePath = relativePathFor(templateId);
  await fs.writeFile(resolvePreviewPath(relativePath), buffer);
  return relativePath;
}

export default async function coverTemplateRoutes(app) {
  // List the caller's templates, most recently touched first.
  app.get(
    "/api/cover-templates",
    { preHandler: authenticate },
    async (request) => {
      const { rows } = await pool.query(
        `select id, name, doc, preview_path, updated_at
           from cover_templates
          where user_id = $1
          order by updated_at desc`,
        [request.account.id],
      );
      return { templates: rows.map(rowToTemplate) };
    },
  );

  // Create a template. Optional preview PNG is written before the row is
  // stamped with its path, so preview_path never points at a missing file.
  app.post(
    "/api/cover-templates",
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const name = parseName(request.body?.name);
      if (name === null) {
        return reply
          .code(400)
          .send({ error: "name must be a string of 1 to 60 characters." });
      }

      const doc = parseDoc(request.body?.doc);
      if (doc === null) {
        return reply
          .code(400)
          .send({ error: "doc must be a valid JSON string under 256 KiB." });
      }

      // The image is optional, but when present it must be a real PNG.
      let image = null;
      if (request.body?.image !== undefined && request.body?.image !== null) {
        image = decodeDataUrl(request.body.image);
        if (image === null) {
          return reply.code(400).send({
            error: "image must be a base64-encoded PNG data URL under ~1.9 MB.",
          });
        }
      }

      // Per-user cap.
      const { rows: countRows } = await pool.query(
        "select count(*)::int as n from cover_templates where user_id = $1",
        [request.account.id],
      );
      if (countRows[0].n >= MAX_TEMPLATES_PER_USER) {
        return reply.code(400).send({
          error: "You can save at most 50 cover templates; delete one first.",
        });
      }

      const { rows: inserted } = await pool.query(
        `insert into cover_templates (user_id, name, doc)
         values ($1, $2, $3)
         returning id, name, doc, preview_path, updated_at`,
        [request.account.id, name, doc],
      );
      const template = inserted[0];

      if (image !== null) {
        const relativePath = await writePreview(template.id, image);
        const { rows } = await pool.query(
          `update cover_templates
              set preview_path = $1
            where id = $2
            returning id, name, doc, preview_path, updated_at`,
          [relativePath, template.id],
        );
        return reply.code(201).send({ template: rowToTemplate(rows[0]) });
      }

      return reply.code(201).send({ template: rowToTemplate(template) });
    },
  );

  // Update name, doc, and/or preview. At least one field is required;
  // omitted fields keep their values (coalesce — both columns are not null).
  app.patch(
    "/api/cover-templates/:id",
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        return reply.code(404).send({ error: "Template not found." });
      }

      // Ownership check: unknown and foreign ids get the identical 404.
      const ownership = await pool.query(
        "select user_id from cover_templates where id = $1",
        [id],
      );
      if (
        ownership.rows.length === 0 ||
        ownership.rows[0].user_id !== request.account.id
      ) {
        return reply.code(404).send({ error: "Template not found." });
      }

      const body = request.body ?? {};
      const hasName = body.name !== undefined && body.name !== null;
      const hasDoc = body.doc !== undefined && body.doc !== null;
      const hasImage = body.image !== undefined && body.image !== null;
      if (!hasName && !hasDoc && !hasImage) {
        return reply
          .code(400)
          .send({ error: "At least one of name, doc or image is required." });
      }

      let name = null;
      if (hasName) {
        name = parseName(body.name);
        if (name === null) {
          return reply
            .code(400)
            .send({ error: "name must be a string of 1 to 60 characters." });
        }
      }

      let doc = null;
      if (hasDoc) {
        doc = parseDoc(body.doc);
        if (doc === null) {
          return reply
            .code(400)
            .send({ error: "doc must be a valid JSON string under 256 KiB." });
        }
      }

      let image = null;
      if (hasImage) {
        image = decodeDataUrl(body.image);
        if (image === null) {
          return reply.code(400).send({
            error: "image must be a base64-encoded PNG data URL under ~1.9 MB.",
          });
        }
      }

      // A new preview replaces the file at the same path — the id is stable
      // so gallery URLs stay valid and no orphan file is left behind.
      let previewPath = null;
      if (image !== null) {
        previewPath = await writePreview(id, image);
      }

      const { rows } = await pool.query(
        `update cover_templates
            set name         = coalesce($1, name),
                doc          = coalesce($2, doc),
                preview_path = coalesce($3, preview_path),
                updated_at   = now()
          where id = $4 and user_id = $5
          returning id, name, doc, preview_path, updated_at`,
        [name, doc, previewPath, id, request.account.id],
      );
      return { template: rowToTemplate(rows[0]) };
    },
  );

  // Drop a template; the preview file goes away best-effort.
  app.delete(
    "/api/cover-templates/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        return reply.code(404).send({ error: "Template not found." });
      }

      const ownership = await pool.query(
        "select user_id, preview_path from cover_templates where id = $1",
        [id],
      );
      if (
        ownership.rows.length === 0 ||
        ownership.rows[0].user_id !== request.account.id
      ) {
        return reply.code(404).send({ error: "Template not found." });
      }

      const previous = ownership.rows[0].preview_path;
      if (typeof previous === "string" && previous !== "") {
        const previousAbsolute = resolvePreviewPath(previous);
        if (previousAbsolute !== null && existsSync(previousAbsolute)) {
          await fs.unlink(previousAbsolute).catch(() => {
            // best-effort: a stale file is harmless; the DB row is the
            // source of truth and a future write would overwrite the path.
          });
        }
      }

      await pool.query(
        "delete from cover_templates where id = $1 and user_id = $2",
        [id, request.account.id],
      );
      return reply.code(204).send();
    },
  );

  // Serve the preview PNG. Unknown, foreign, and preview-less templates all
  // get the identical 404 — the endpoint never confirms existence.
  app.get(
    "/api/cover-templates/:id/preview.png",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        return reply.code(404).send({ error: "Template not found." });
      }

      const ownership = await pool.query(
        "select user_id, preview_path from cover_templates where id = $1",
        [id],
      );
      if (
        ownership.rows.length === 0 ||
        ownership.rows[0].user_id !== request.account.id ||
        ownership.rows[0].preview_path === null
      ) {
        return reply.code(404).send({ error: "Template not found." });
      }

      const absolutePath = resolvePreviewPath(ownership.rows[0].preview_path);
      if (absolutePath === null || !existsSync(absolutePath)) {
        return reply.code(404).send({ error: "Template not found." });
      }

      const buffer = await fs.readFile(absolutePath);
      return reply
        .header("cache-control", "private, max-age=300, must-revalidate")
        .type("image/png")
        .send(buffer);
    },
  );
}
