-- 012_in_feed.sql — split "public link" from "show in community feed".
--
-- is_public now means only "the /s/:id link is viewable by anyone".
-- in_feed controls whether the session appears in the community feed.
-- Backfill: every previously public session stays in the feed.
-- Idempotent: safe to re-apply.

alter table if exists sessions add column if not exists in_feed boolean not null default false;
update sessions set in_feed = true where is_public = true;
