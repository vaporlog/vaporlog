/**
 * vaporlog API — Bearer-token authentication (fastify preHandler).
 *
 * Clients store the opaque token in localStorage["vaporlog.token"] and send
 * `Authorization: Bearer <token>`. A request is authenticated when the
 * token exists in auth_tokens, has not expired, and joins to a profile.
 * On success the handler decorates the request with:
 *   request.account   — the public Account { id, username, birthdate, createdAt }
 *   request.authToken — the raw token string (used by sign-out)
 * Every failure is the same 401 { error: "Not signed in." }.
 */
import { pool } from "./db.js";
import { rowToAccount } from "./mappers.js";

export async function authenticate(request, reply) {
  const header = request.headers.authorization ?? "";
  const parts = header.trim().split(/\s+/);
  const token =
    parts.length === 2 && parts[0].toLowerCase() === "bearer"
      ? parts[1]
      : null;
  if (!token) {
    return reply.code(401).send({ error: "Not signed in." });
  }

  const { rows } = await pool.query(
    `select p.id,
            p.handle,
            to_char(p.birthdate, 'YYYY-MM-DD') as birthdate,
            p.created_at
       from auth_tokens t
       join profiles p on p.id = t.user_id
      where t.token = $1
        and t.expires_at > now()`,
    [token],
  );
  if (rows.length === 0) {
    return reply.code(401).send({ error: "Not signed in." });
  }

  request.account = rowToAccount(rows[0]);
  request.authToken = token;
}
