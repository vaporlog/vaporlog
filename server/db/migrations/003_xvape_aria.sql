-- ============================================================================
-- 003_xvape_aria.sql — add the XVAPE Aria to the devices catalog
-- ============================================================================
-- For EXISTING databases: db/init.sql only runs on fresh postgres volumes, so
-- apply this file by hand against live databases:
--   psql "$DATABASE_URL" -f db/migrations/003_xvape_aria.sql
-- IDEMPOTENT: safe to re-run (ON CONFLICT DO NOTHING).
-- Device facts: XVAPE Aria — portable dual-use (dry herb + concentrate)
-- conduction vaporizer by XVape; ceramic chamber, 100–240 °C.
-- ============================================================================

insert into devices (slug, name, category, sort_order) values
  ('xvape-aria', 'XVAPE Aria', 'portable', 33)
on conflict (slug) do nothing;
