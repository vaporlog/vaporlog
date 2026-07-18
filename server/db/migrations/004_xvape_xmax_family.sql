-- ============================================================================
-- 004_xvape_xmax_family.sql — complete the XVAPE / XMAX dry-herb lineup
-- ============================================================================
-- For EXISTING databases: db/init.sql only runs on fresh postgres volumes, so
-- apply this file by hand against live databases:
--   psql "$DATABASE_URL" -f db/migrations/004_xvape_xmax_family.sql
-- IDEMPOTENT: safe to re-run (ON CONFLICT DO NOTHING).
-- Scope: portable dry-herb / dual-use models only. Concentrate-only hardware
-- (XMAX Daboo, QOMO, Riggo, Tunke, XVAPE Vista Mini 2) is intentionally left
-- out — vaporlog sessions journal dry-herb vaporization.
-- Lineup verified against retailers + Thermal Extractions' DHV database.
-- ============================================================================

insert into devices (slug, name, category, sort_order) values
  ('xvape-aria-plus', 'XVAPE Aria+',      'portable', 34),
  ('xlux-roffu',      'XLUX Roffu',       'portable', 35),
  ('xvape-avant',     'XVAPE Avant',      'portable', 36),
  ('xvape-fog-pro',   'XVAPE Fog Pro',    'portable', 37),
  ('xvape-fog',       'XVAPE Fog',        'portable', 38),
  ('xmax-starry-v3',  'XMAX Starry V3',   'portable', 39),
  ('xmax-v2-pro',     'XMAX V2 Pro',      'portable', 40),
  ('xmax-v3-nano',    'XMAX V3 Nano',     'portable', 41),
  ('xmax-ace',        'XMAX Ace',         'portable', 42),
  ('xmax-oont',       'XMAX OONT',        'portable', 43),
  ('xmax-oont-pro',   'XMAX OONT Pro',    'portable', 44),
  ('xvape-lanza',     'XVAPE Lanza',      'portable', 45)
on conflict (slug) do nothing;
