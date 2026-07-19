-- ============================================================================
-- 006_admin_role.sql — admin / moderator roles
-- ============================================================================
-- For EXISTING databases: db/init.sql only runs on fresh postgres volumes, so
-- apply this file by hand against live databases:
--   psql "$DATABASE_URL" -f db/migrations/006_admin_role.sql
-- IDEMPOTENT: safe to re-run (ADD COLUMN IF NOT EXISTS / IF NOT EXISTS
-- everywhere).
--
-- Only "admin" can access the admin dashboard. "moderator" is reserved for
-- future tooling (e.g. moderating public feed content). New accounts default
-- to "user".
-- ============================================================================

alter table profiles
  add column if not exists role text not null default 'user' check (role in ('user', 'admin', 'moderator'));

create index if not exists idx_profiles_role on profiles(role);
