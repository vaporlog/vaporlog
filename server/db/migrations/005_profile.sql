-- ============================================================================
-- 005_profile.sql — user profile: bio, privacy flags, favorite device,
-- device reviews
-- ============================================================================
-- For EXISTING databases: db/init.sql only runs on fresh postgres volumes, so
-- apply this file by hand against live databases:
--   psql "$DATABASE_URL" -f db/migrations/005_profile.sql
-- IDEMPOTENT: safe to re-run (ADD COLUMN IF NOT EXISTS / IF NOT EXISTS
-- everywhere).
--
-- Privacy model: everything is private by default. is_public is the master
-- switch for the public page (/api/u/:handle); the three public_* flags gate
-- individual blocks on it. Grams and hours are NEVER part of any public
-- payload — that rule lives in the API layer, not the schema.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles — identity + privacy flags
-- ----------------------------------------------------------------------------
alter table profiles
  add column if not exists bio text not null default '';

-- Master switch: the public profile page exists only when true.
alter table profiles
  add column if not exists is_public boolean not null default false;

-- Per-block public flags (each only matters while is_public is true).
alter table profiles
  add column if not exists public_stats boolean not null default false;
alter table profiles
  add column if not exists public_reviews boolean not null default false;
alter table profiles
  add column if not exists public_collection boolean not null default false;

-- Logical reference to devices.slug. Deliberately NOT a foreign key: the
-- device catalog is re-seeded from migrations and a favorite must survive
-- that. The API validates the slug on write instead.
alter table profiles
  add column if not exists favorite_device_slug text;

-- ----------------------------------------------------------------------------
-- device_reviews — one review per device per user
-- ----------------------------------------------------------------------------
-- Reviews live ONLY on the profile (never in the feed). The unique pair
-- (user_id, device_slug) is the upsert target for PUT
-- /api/profile/reviews/:deviceSlug.
create table if not exists device_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  device_slug text not null,
  rating      numeric not null,
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, device_slug)
);

-- "My reviews" lookups.
create index if not exists device_reviews_user_id_idx
  on device_reviews (user_id);
