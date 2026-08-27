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
 *   POST /api/auth/google   { credential, birthdate? }
 *       → 200 { token, account } (existing google_sub)
 *       → 201 { token, account } (account created on the spot)
 *       → 400 birthdate required for account creation | 401 invalid token
 *       → 503 Google sign-in not configured (no GOOGLE_CLIENT_ID)
 *   GET  /api/auth/me       (Bearer) → 200 { account } | 401
 *   POST /api/auth/signout  (Bearer) → 204 (deletes the bearer token)
 *
 * Tokens are opaque: crypto.randomBytes(32).hex. Only their SHA-256 hash is
 * stored (auth_tokens.token_hash, migration 013) — a DB dump cannot be used
 * to replay live sessions. Tokens carry the table's default 30-day expiry.
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { pool } from "../db.js";
import { rowToAccount } from "../mappers.js";
import { authenticate } from "../authenticate.js";
import { hashToken } from "../lib/tokens.js";

const HANDLE_RE = /^[a-z0-9_-]{3,20}$/i;
const BIRTHDATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PASSWORD_MIN_LENGTH = 6;
const BCRYPT_ROUNDS = 12;

const HANDLE_TAKEN_ERROR = "That handle is taken.";
const GENERIC_CREDENTIAL_ERROR = "Incorrect handle or password.";
const GOOGLE_ERROR = "Google sign-in failed — try again.";

/**
 * Google sign-in (GIS ID-token flow). The client ID is public by design
 * (it ships to the browser); without it configured the route answers 503
 * and the frontend hides the button (see GET /api/config). The JWKS set
 * fetches Google's signing keys lazily and caches them.
 */
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? null;
const GOOGLE_JWKS = GOOGLE_CLIENT_ID
  ? createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"))
  : null;

/**
 * Precomputed dummy bcrypt hash. Sign-in always runs one bcrypt.compare —
 * against the real hash when the handle exists, against this dummy when it
 * does not — so the response time does not reveal whether a handle exists.
 * Same cost factor as real hashes, so the timing stays identical.
 */
const DUMMY_HASH = bcrypt.hashSync(
  crypto.randomBytes(16).toString("hex"),
  BCRYPT_ROUNDS,
);

/** Issues a new opaque token for the account and returns it. */
async function issueToken(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "insert into auth_tokens (token_hash, user_id) values ($1, $2)",
    [hashToken(token), userId],
  );
  return token;
}

/** Columns every account-issuing path returns (rowToAccount's input). */
const ACCOUNT_COLUMNS = `id,
         handle,
         role,
         to_char(birthdate, 'YYYY-MM-DD') as birthdate,
         created_at`;

/**
 * Derives a unique handle for a Google-created account from the email's
 * local part (sanitized to the handle charset), falling back to the Google
 * sub and suffixing numerically on collisions.
 */
async function deriveHandle(email, sub) {
  const local = typeof email === "string" ? email.split("@")[0] : "";
  let base = local
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  if (base.length < 3) {
    base = `user-${String(sub).replace(/[^a-z0-9]/gi, "").slice(0, 8) || "g"}`;
  }

  let candidate = base;
  for (let suffix = 2; ; suffix += 1) {
    const { rows } = await pool.query(
      "select 1 from profiles where lower(handle) = lower($1)",
      [candidate],
    );
    if (rows.length === 0) return candidate;
    const tag = `-${suffix}`;
    candidate = `${base.slice(0, 20 - tag.length)}${tag}`;
  }
}

export default async function authRoutes(app) {
  app.post(
    "/api/auth/signup",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } },
    async (request, reply) => {
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
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

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
    },
  );

  app.post(
    "/api/auth/signin",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
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

    // Progressive rehash: hashes created at a lower cost factor are upgraded
    // on the next successful sign-in (fire-and-forget — never block login).
    if (bcrypt.getRounds(profile.password_hash) < BCRYPT_ROUNDS) {
      bcrypt.hash(password, BCRYPT_ROUNDS).then((upgraded) =>
        pool
          .query("update profiles set password_hash = $1 where id = $2", [
            upgraded,
            profile.id,
          ])
          .catch((error) => request.log.error(error, "password rehash failed")),
      );
    }

    const token = await issueToken(profile.id);
    return { token, account: rowToAccount(profile) };
    },
  );

  /**
   * Google sign-in / sign-up in one door. The browser sends the ID token
   * that Google Identity Services issued; we verify it locally against
   * Google's JWKS (signature + issuer + audience + expiry), then:
   *   - known google_sub → sign in (fresh opaque token, as always);
   *   - unknown → create the account on the spot: handle derived from the
   *     email, password_hash null, birthdate from the request (the age
   *     gate collected it upstream — Google does not share birthdays).
   */
  app.post(
    "/api/auth/google",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_JWKS) {
      return reply
        .code(503)
        .send({ error: "Google sign-in is not configured." });
    }
    const { credential, birthdate } = request.body ?? {};
    if (typeof credential !== "string" || credential === "") {
      return reply.code(400).send({ error: "Missing Google credential." });
    }

    let payload;
    try {
      ({ payload } = await jwtVerify(credential, GOOGLE_JWKS, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: GOOGLE_CLIENT_ID,
      }));
    } catch {
      return reply.code(401).send({ error: GOOGLE_ERROR });
    }
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (sub === "") {
      return reply.code(401).send({ error: GOOGLE_ERROR });
    }
    const email =
      typeof payload.email === "string" && payload.email !== ""
        ? payload.email
        : null;

    const existing = await pool.query(
      `select ${ACCOUNT_COLUMNS} from profiles where google_sub = $1`,
      [sub],
    );
    if (existing.rows.length > 0) {
      const token = await issueToken(existing.rows[0].id);
      return { token, account: rowToAccount(existing.rows[0]) };
    }

    // New account: the 21+ gate's birthdate is mandatory (Google does not
    // provide one). The client bounces to the age gate on this 400.
    if (typeof birthdate !== "string" || !BIRTHDATE_RE.test(birthdate)) {
      return reply.code(400).send({ error: "A valid birthdate is required." });
    }

    const handle = await deriveHandle(email, sub);
    let profile;
    try {
      const { rows } = await pool.query(
        `insert into profiles (handle, password_hash, birthdate, google_sub, email)
         values ($1, null, $2, $3, $4)
         returning ${ACCOUNT_COLUMNS}`,
        [handle, birthdate, sub, email],
      );
      profile = rows[0];
    } catch (error) {
      // Unique violation: two concurrent first sign-ins raced the derived
      // handle (or the same google_sub double-submitted — that one is a
      // sign-in, so re-read and issue the token).
      if (error.code === "23505") {
        const retry = await pool.query(
          `select ${ACCOUNT_COLUMNS} from profiles where google_sub = $1`,
          [sub],
        );
        if (retry.rows.length > 0) {
          const token = await issueToken(retry.rows[0].id);
          return { token, account: rowToAccount(retry.rows[0]) };
        }
        return reply.code(409).send({ error: HANDLE_TAKEN_ERROR });
      }
      throw error;
    }

    const token = await issueToken(profile.id);
    return reply.code(201).send({ token, account: rowToAccount(profile) });
    },
  );

  app.get("/api/auth/me", { preHandler: authenticate }, async (request) => {
    return { account: request.account };
  });

  app.post(
    "/api/auth/signout",
    { preHandler: authenticate },
    async (request, reply) => {
      await pool.query("delete from auth_tokens where token_hash = $1", [
        hashToken(request.authToken),
      ]);
      return reply.code(204).send();
    },
  );
}
