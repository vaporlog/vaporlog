/**
 * vaporlog API — admin authorization helpers.
 *
 * These handlers must be chained after `authenticate` so that
 * `request.account` and `request.authToken` are already populated.
 */
import { authenticate } from "./authenticate.js";

/** Rejects non-admin accounts with a generic 403. */
export function requireAdmin(request, reply) {
  if (request.account?.role !== "admin") {
    return reply.code(403).send({ error: "Forbidden." });
  }
}

/** Runs authenticate then requireAdmin. */
export async function authenticateAdmin(request, reply) {
  await authenticate(request, reply);
  if (reply.sent) return;
  requireAdmin(request, reply);
}
