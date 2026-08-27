/**
 * vaporlog API — auth-token hashing.
 *
 * Bearer tokens are opaque 256-bit random strings; only their SHA-256 digest
 * is persisted (auth_tokens.token_hash, migration 013). A database dump then
 * leaks no replayable credential, and lookup stays a plain indexed equality
 * on the hex digest.
 */
import crypto from "node:crypto";

/** Returns the SHA-256 hex digest of a raw bearer token. */
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
