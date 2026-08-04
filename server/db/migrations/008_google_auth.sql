-- 008_google_auth.sql — Google sign-in (POST /api/auth/google).
--
-- Accounts created through Google carry their stable Google user id
-- (google_sub) and email, and have no password — password_hash becomes
-- nullable. A password sign-in attempt against a Google-only account fails
-- the generic 401 like any wrong password (never reveals the account type).
-- Idempotent: safe to re-apply.

alter table if exists profiles add column if not exists google_sub text;
alter table if exists profiles add column if not exists email text;
alter table if exists profiles alter column password_hash drop not null;

-- One Google account maps to at most one vaporlog account (nulls excluded —
-- every handle+password account keeps google_sub null).
create unique index if not exists profiles_google_sub_key
  on profiles (google_sub)
  where google_sub is not null;
