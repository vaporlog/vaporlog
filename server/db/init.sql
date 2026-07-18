-- ============================================================================
-- vaporlog — self-hosted PostgreSQL schema
-- ============================================================================
-- Mounted by docker-compose into /docker-entrypoint-initdb.d/ and executed by
-- the postgres image on first boot. IDEMPOTENT: every statement is safe to
-- re-run (IF NOT EXISTS everywhere).
--
-- Tables:
--   1. profiles    — one row per account: handle (unique, case-insensitive,
--                    stored lowercase), bcrypt password hash, birthdate.
--   2. sessions    — vaporization session logs. Column set mirrors the app's
--                    SessionLog shape (src/lib/types.ts) in snake_case, plus
--                    user_id (ownership) and a denormalized `author` handle
--                    maintained by the API on write.
--   3. auth_tokens — opaque Bearer tokens (crypto.randomBytes(32).hex) with a
--                    30-day expiry; cascade-deleted with their account.
--
-- NOTE for the API layer: the API speaks SessionLog camelCase both ways and
-- owns the snake_case ↔ camelCase mapping — clients never see these column
-- names. created_at doubles as SessionLog.createdAt (the client sends it
-- explicitly on write so migrated legacy sessions keep their dates).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id            uuid primary key default gen_random_uuid(),
  -- Pseudonym, always stored lowercase; uniqueness is case-insensitive via
  -- the unique index on lower(handle) below.
  handle        text not null,
  password_hash text not null,
  -- 21+ age-gate date (YYYY-MM-DD). Nullable so an absent value can never
  -- block account creation at the database layer.
  birthdate     date,
  created_at    timestamptz not null default now()
);

-- Case-insensitive handle uniqueness. This index is the REAL guard against
-- taken handles (race-proof); the API maps its unique-violation (23505) to
-- 409 { error: "That handle is taken." }.
create unique index if not exists profiles_handle_lower_key
  on profiles (lower(handle));

-- ----------------------------------------------------------------------------
-- 2. sessions
-- ----------------------------------------------------------------------------
-- SessionLog (src/lib/types.ts) ↔ column mapping:
--   id ↔ id · strainSlug ↔ strain_slug · deviceSlug ↔ device_slug
--   temperatureC ↔ temperature_c · durationMin ↔ duration_min
--   amountG ↔ amount_g · rating ↔ rating · aromas/flavors/moods/activities
--   notes ↔ notes · isPublic ↔ is_public · author ↔ author
--   createdAt ↔ created_at
create table if not exists sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles (id) on delete cascade,
  strain_slug   text not null,
  device_slug   text not null default '',
  temperature_c numeric,
  duration_min  numeric,
  amount_g      numeric,
  rating        numeric not null,
  aromas        text[] not null default '{}',
  flavors       text[] not null default '{}',
  moods         text[] not null default '{}',
  activities    text[] not null default '{}',
  notes         text not null default '',
  is_public     boolean not null default false,
  -- Denormalized copy of the owner's handle so the community feed renders
  -- without a join. Stamped by the API on every write (SELECT fallbacks to
  -- the profiles join cover rows written before this column was kept).
  author        text not null default '',
  created_at    timestamptz not null default now()
);

-- Community feed: public sessions, newest first.
create index if not exists sessions_public_created_idx
  on sessions (is_public, created_at desc);

-- "My sessions" lookups.
create index if not exists sessions_user_id_idx
  on sessions (user_id);

-- ----------------------------------------------------------------------------
-- 3. auth_tokens
-- ----------------------------------------------------------------------------
-- Opaque Bearer tokens issued at sign-up / sign-in. The API only ever
-- accepts tokens whose expires_at is still in the future; expired rows are
-- garbage (a scheduled cleanup can delete them, nothing depends on it).
create table if not exists auth_tokens (
  token      text primary key,
  user_id    uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

-- Token lookups per account (sign-out-everywhere, cleanup).
create index if not exists auth_tokens_user_id_idx
  on auth_tokens (user_id);
