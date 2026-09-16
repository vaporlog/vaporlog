-- 016_cover_templates.sql — global, user-owned cover templates.
--
-- The CoverEditor's "Mis portadas" gallery moves from per-session covers
-- (sessions.custom_og_doc) to global templates the user can apply to any
-- session. Each row keeps the serialized editor document (doc, same JSON
-- string format as sessions.custom_og_doc) plus an optional preview PNG
-- under uploads/cover_templates/<id>.png (path relative to server/assets/,
-- same convention as migration 014). Applying a template is a pure
-- client-side rebind of the doc onto the target session, so no per-session
-- columns change here.
--
-- Idempotent: safe to re-apply on a database that already has the table.

create table if not exists cover_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  doc text not null,
  preview_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cover_templates_user on cover_templates(user_id);
