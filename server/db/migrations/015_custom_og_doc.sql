-- 015_custom_og_doc.sql — serialized editor document behind the custom cover.
--
-- The CoverEditor saves two artifacts: the rasterized 1200x630 PNG
-- (custom_og_image, migration 014) that og-image.js serves, and the JSON
-- document ({version, background, layers}) that lets the owner re-open the
-- editor and keep editing instead of starting from a flattened image.
-- A cover saved without a doc clears the column (NULL) rather than keeping
-- a stale document from a previous edit.
--
-- Idempotent: safe to re-apply on a database that already has the column.

alter table if exists sessions
  add column if not exists custom_og_doc text;
