-- 014_custom_og_image.sql — owner-built cover image for the OG card.
--
-- A user-edited canvas (CoverEditor in the web app) gets rasterized to a
-- single 1200x630 PNG and uploaded to the API. When set, the dynamic OG
-- card route serves the saved file instead of regenerating with resvg;
-- a null value falls back to the existing per-template renderer. Path is
-- relative to server/assets/ (no leading slash) so it travels cleanly
-- through env-specific deployments.
--
-- Idempotent: safe to re-apply on a database that already has the column.

alter table if exists sessions
  add column if not exists custom_og_image text;
