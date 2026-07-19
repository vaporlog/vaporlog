/**
 * vaporlog API — auth routes.
 *
 *   POST /api/auth/signup   { handle, password, birthdate }
 *       → 201 { token, account }
 *       → 409 { error: "That handle is taken." }
 *       → 400 { error } (validation)
 *   POST /api/auth/signin   { handle, password }
 *       → 200 { token, account }
 *       → 401 { error: "Incorrect handle or password." }  (same message for
 *          unknown handle AND wrong password — never reveal which failed)
 *   GET  /api/auth/me       (Bearer) → 200 { account } | 401
 *   POST /api/auth/signout  (Bearer) → 204 (deletes the bearer token)
 *
 * Tokens are opaque: crypto.randomBytes(32).hex, stored in auth_tokens with
 * the table's default 30-day expiry.
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { rowToAccount } from "../mappers.js";
import { authenticate } from "../authenticate.js";

const HANDLE_RE = /^[a-z0-9_-]{3,20}$/i;
const BIRTHDATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PASSWORD_MIN_LENGTH = 6;

const HANDLE_TAKEN_ERROR = "That handle is taken.";
const GENERIC_CREDENTIAL_ERROR = "Incorrect handle or password.";

/**
 * Precomputed dummy bcrypt hash. Sign-in always runs one bcrypt.compare —
 * against the real hash when the handle exists, against this dummy when it
 * does not — so the response time does not reveal whether a handle exists.
 */
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 10);

/** Issues a new opaque token for the account and returns it. */
async function issueToken(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query("insert into auth_tokens (token, user_id) values ($1, $2)", [
    token,
    userId,
  ]);
  return token;
}

export default async function authRoutes(app) {
  app.post("/api/auth/signup", async (request, reply) => {
    const { handle, password, birthdate } = request.body ?? {};

    if (typeof handle !== "string" || !HANDLE_RE.test(handle.trim())) {
      return reply
        .code(400)
        .send({ error: "Handle must be 3–20 letters, numbers, _ or -." });
    }
    if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
      return reply.code(400).send({
        error: `Passwords are at least ${PASSWORD_MIN_LENGTH} characters.`,
      });
    }
    if (typeof birthdate !== "string" || !BIRTHDATE_RE.test(birthdate)) {
      return reply.code(400).send({ error: "A valid birthdate is required." });
    }

    const normalizedHandle = handle.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 10);

    let profile;
    try {
      const { rows } = await pool.query(
        `insert into profiles (handle, password_hash, birthdate)
         values ($1, $2, $3)
         returning id,
                   handle,
                   role,
                   to_char(birthdate, 'YYYY-MM-DD') as birthdate,
                   created_at`,
        [normalizedHandle, passwordHash, birthdate],
      );
      profile = rows[0];
    } catch (error) {
      // Unique violation on the lower(handle) index — the handle is taken.
      if (error.code === "23505") {
        return reply.code(409).send({ error: HANDLE_TAKEN_ERROR });
      }
      throw error;
    }

    const token = await issueToken(profile.id);
    return reply.code(201).send({ token, account: rowToAccount(profile) });
  });

  app.post("/api/auth/signin", async (request, reply) => {
    const { handle, password } = request.body ?? {};
    if (typeof handle !== "string" || typeof password !== "string") {
      return reply.code(401).send({ error: GENERIC_CREDENTIAL_ERROR });
    }

    const { rows } = await pool.query(
      `select id,
              handle,
              role,
              password_hash,
              to_char(birthdate, 'YYYY-MM-DD') as birthdate,
              created_at
         from profiles
        where lower(handle) = lower($1)`,
      [handle.trim()],
    );
    const profile = rows[0] ?? null;

    // One bcrypt.compare either way (see DUMMY_HASH above). ANY failure —
    // unknown handle or wrong password — yields the identical 401.
    const passwordOk = await bcrypt.compare(
      password,
      profile?.password_hash ?? DUMMY_HASH,
    );
    if (!profile || !passwordOk) {
      return reply.code(401).send({ error: GENERIC_CREDENTIAL_ERROR });
    }

    const token = await issueToken(profile.id);
    return { token, account: rowToAccount(profile) };
  });

  app.get("/api/auth/me", { preHandler: authenticate }, async (request) => {
    return { account: request.account };
  });

  app.post(
    "/api/auth/signout",
    { preHandler: authenticate },
    async (request, reply) => {
      await pool.query("delete from auth_tokens where token = $1", [
        request.authToken,
      ]);
      return reply.code(204).send();
    },
  );
}
