-- 009_detox.sql — detox streak ("días limpio") + post-detox session data.
--
-- detox_marks: one row per user per clean day (explicit marks — the user
-- taps days on the diary calendar; unlimited backfill, no future days
-- enforced server-side). Sessions gain the streak they ended
-- (detox_days), the opt-in public flag (detox_days_public) and the
-- dedicated post-detox review (detox_review) — the review and the count
-- are stripped from public payloads unless the flag is on, same privacy
-- mechanics as unwanted effects. Idempotent: safe to re-apply.

create table if not exists detox_marks (
  user_id    uuid not null references profiles(id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table if exists sessions add column if not exists detox_days int;
alter table if exists sessions add column if not exists detox_days_public boolean not null default false;
alter table if exists sessions add column if not exists detox_review text not null default '';
