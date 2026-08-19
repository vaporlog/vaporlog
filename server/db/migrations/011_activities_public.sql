-- 011_activities_public.sql — per-session flag for public activity tags.
--
-- Activities are private by default (like unwanted effects); the owner can
-- opt in per session so they show on the public card and feed.
-- Idempotent: safe to re-apply.

alter table if exists sessions add column if not exists activities_public boolean not null default false;
