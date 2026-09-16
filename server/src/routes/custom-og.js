/**
 * vaporlog API — owner-built cover image (custom OG card).
 *
 *   POST   /api/sessions/:id/custom-og   (Bearer, own only)
 *          body: { image: "data:image/png;base64,....",  (≤ ~1.9 MiB after decode)
 *                  doc?: "<serialized editor JSON>" }    (optional, ≤ 256 KiB)
 *          → 200 { session } | 404 unknown | 403 foreign
 *   DELETE /api/sessions/:id/custom-og   (Bearer, own only)
 *          → 204 | 404
 *
 * The frontend's CoverEditor exports the canvas to a single 1200x630 PNG and
 * POSTs it as a data URL. We decode, validate the PNG signature, write the
 * bytes to assets/uploads/custom_og/<id>.png, and stamp the relative path on
 * sessions.custom_og_image. og-image.js then prefers that file over the
 * resvg renderer. The optional `doc` field is the serialized CoverEditor
 * document ({version, background, layers}); it is validated (string, valid
 * JSON, ≤ 256 KiB) and stored verbatim on sessions.custom_og_doc so the
 * owner can re-open the editor. A save without `doc` clears the column —
 * a flattened cover must not keep a stale document. bodyLimit on the
 * Fastify instance is 2 MiB so the whole request stays under it; we also
 * reject payloads whose decoded bytes exceed a hard cap.
 *
 * Files live under server/assets/uploads/custom_og/ (mounted as a docker
 * volume in production so user uploads survive rebuilds; see
 * docker-compose.yml). The DB stores the path relative to server/assets/
 * so it works in dev (./assets/...) and prod (/srv/assets/...) the same way.
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";
import { rowToSession } from "../mappers.js";
import { authenticate } from "../authenticate.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 1.9 MiB hard cap on the decoded image — leaves headroom under the 2 MiB
 *  bodyLimit for JSON wrapping + future tweaks. */
const MAX_IMAGE_BYTES = Math.floor(1.9 * 1024 * 1024);

/** 256 KiB hard cap on the serialized editor document. A dense cover is a
 *  few KiB of JSON; this only exists to keep the column (and the 2 MiB
 *  bodyLimit) bounded. */
const MAX_DOC_BYTES = 256 * 1024;

/** PNG signature: 89 50 4E 47 0D 0A 1A 0A. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** server/assets/ — the directory the custom cover files live under. The
 *  DB stores paths relative to this root so the same row works in dev
 *  (./assets) and prod (/srv/assets). */
const assetsRoot = path.resolve(
  path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))),
  "assets",
);
const uploadsDir = path.join(assetsRoot, "uploads", "custom_og");

/** Coerces the request body to a raw PNG Buffer or null on bad input. */
function decodeDataUrl(value) {
  if (typeof value !== "string") return null;
  // Strict prefix — only PNG for now. A future JPEG path would just add
  // a second branch here with the matching signature.
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

/** Builds the relative path stored in the DB (and used to read the file
 *  back when serving the OG card). */
function relativePathFor(sessionId) {
  return path.join("uploads", "custom_og", `${sessionId}.png`);
}

/** Resolves a relative path to the on-disk assets root, with a hard
 *  containment check — the column is owner-controlled but never trust a
 *  string from the DB to be a bare filename. Re-exported at the bottom
 *  for og-image.js — keep the binding local here. */
function resolveCustomOgPath(relativePath) {
  if (typeof relativePath !== "string" || relativePath === "") return null;
  const resolved = path.resolve(assetsRoot, relativePath);
  // Containment: the resolved path must live under assetsRoot.
  if (
    resolved !== assetsRoot &&
    !resolved.startsWith(assetsRoot + path.sep)
  ) {
    return null;
  }
  return resolved;
}

export default async function customOgRoutes(app) {
  // Owner-only: upload a new custom cover. The frontend downscales the
  // export to keep under the bodyLimit; we still re-validate here.
  app.post(
    "/api/sessions/:id/custom-og",
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        return reply.code(404).send({ error: "Session not found." });
      }

      // Ownership check: the row must exist AND belong to the caller.
      // We mirror the 404 contract from the rest of the sessions API so
      // a foreign id never confirms existence.
      const ownership = await pool.query(
        "select user_id, custom_og_image from sessions where id = $1",
        [id],
      );
      if (
        ownership.rows.length === 0 ||
        ownership.rows[0].user_id !== request.account.id
      ) {
        return reply.code(404).send({ error: "Session not found." });
      }

      const buffer = decodeDataUrl(request.body?.image);
      if (buffer === null) {
        return reply.code(400).send({
          error:
            "image must be a base64-encoded PNG data URL under ~1.9 MB.",
        });
      }

      // Optional editor document: a JSON string we store verbatim. Absent
      // (or explicit null) means "flattened cover" — the column is cleared
      // below so no stale doc survives from a previous edit.
      const doc = request.body?.doc;
      let docValue = null;
      if (doc !== undefined && doc !== null) {
        if (
          typeof doc !== "string" ||
          Buffer.byteLength(doc, "utf8") > MAX_DOC_BYTES
        ) {
          return reply
            .code(400)
            .send({ error: "doc must be a JSON string under 256 KiB." });
        }
        try {
          JSON.parse(doc);
        } catch {
          return reply.code(400).send({ error: "doc must be valid JSON." });
        }
        docValue = doc;
      }

      await fs.mkdir(uploadsDir, { recursive: true });
      const relativePath = relativePathFor(id);
      const absolutePath = resolveCustomOgPath(relativePath);

      // The previous file is replaced in place; on a clean overwrite the
      // inode stays the same so the file stays warm in any OS cache.
      await fs.writeFile(absolutePath, buffer);

      // Stamp the DB with the new path only if the write succeeded.
      const { rows } = await pool.query(
        `update sessions
            set custom_og_image = $1,
                custom_og_doc   = $2
          where id = $3 and user_id = $4
          returning *`,
        [relativePath, docValue, id, request.account.id],
      );
      return { session: rowToSession(rows[0]) };
    },
  );

  // Owner-only: drop the custom cover and fall back to the resvg renderer.
  app.delete(
    "/api/sessions/:id/custom-og",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        return reply.code(404).send({ error: "Session not found." });
      }

      const ownership = await pool.query(
        "select user_id, custom_og_image from sessions where id = $1",
        [id],
      );
      if (
        ownership.rows.length === 0 ||
        ownership.rows[0].user_id !== request.account.id
      ) {
        return reply.code(404).send({ error: "Session not found." });
      }

      const previous = ownership.rows[0].custom_og_image;
      if (typeof previous === "string" && previous !== "") {
        const previousAbsolute = resolveCustomOgPath(previous);
        if (previousAbsolute !== null && existsSync(previousAbsolute)) {
          await fs.unlink(previousAbsolute).catch(() => {
            // best-effort: a stale file is harmless; the DB column is the
            // source of truth, and a future upload overwrites it.
          });
        }
      }

      await pool.query(
        `update sessions
            set custom_og_image = null,
                custom_og_doc   = null
          where id = $1 and user_id = $2`,
        [id, request.account.id],
      );
      return reply.code(204).send();
    },
  );
}

// Re-export for og-image.js so the file-serving branch can resolve paths
// the same way the upload route stored them.
export { assetsRoot, uploadsDir, resolveCustomOgPath };
