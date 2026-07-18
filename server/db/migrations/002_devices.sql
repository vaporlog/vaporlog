-- ============================================================================
-- 002_devices.sql — devices catalog table + seed
-- ============================================================================
-- For EXISTING databases: db/init.sql only runs on fresh postgres volumes, so
-- apply this file by hand against live databases:
--   psql "$DATABASE_URL" -f db/migrations/002_devices.sql
-- IDEMPOTENT: safe to re-run (IF NOT EXISTS everywhere, ON CONFLICT DO
-- NOTHING for the seed).
-- ============================================================================

create table if not exists devices (
  slug       text primary key,
  name       text not null,
  category   text not null default 'portable',
  sort_order int  not null default 0
);

create index if not exists devices_sort_order_name_idx
  on devices (sort_order, name);

-- >>> SEED DATA — the 100 most popular dry-herb vaporizers (2025–2026)
-- One row per device: (slug, name, category, sort_order). Slugs are stable
-- kebab-case identifiers — NEVER change an existing slug (session records
-- reference them). sort_order is the within-category popularity rank.
-- Categories: portable | desktop | ball-vape | butane | induction.
-- To extend the catalog, append rows to the VALUES list below (keep the
-- trailing 'on conflict (slug) do nothing' last).
insert into devices (slug, name, category, sort_order) values
  -- Portable (battery)
  ('mighty-plus',      'Mighty+',            'portable',  1),
  ('venty',            'Venty',              'portable',  2),
  ('solo-iii',         'Solo III',           'portable',  3),
  ('tinymight-2',      'TinyMight 2',        'portable',  4),
  ('mighty',           'Mighty',             'portable',  5),
  ('crafty-plus',      'Crafty+',            'portable',  6),
  ('lobo',             'Lobo',               'portable',  7),
  ('air-max',          'Air MAX',            'portable',  8),
  ('pax-plus',         'PAX Plus',           'portable',  9),
  ('pax-3',            'PAX 3',              'portable', 10),
  ('iq3',              'IQ3',                'portable', 11),
  ('veazy',            'Veazy',              'portable', 12),
  ('rogue-2',          'Rogue 2',            'portable', 13),
  ('solo-ii',          'Solo II',            'portable', 14),
  ('argo',             'ArGo',               'portable', 15),
  ('air-se',           'Air SE',             'portable', 16),
  ('pax-mini',         'PAX Mini',           'portable', 17),
  ('iqc',              'IQC',                'portable', 18),
  ('iq2',              'IQ2',                'portable', 19),
  ('miqro-c',          'MIQRO-C',            'portable', 20),
  ('potv-one',         'ONE',                'portable', 21),
  ('xmax-v3-pro',      'XMAX V3 Pro',        'portable', 22),
  ('starry-4',         'Starry V4',          'portable', 23),
  ('ont',              'ONT',                'portable', 24),
  ('xmax-v4-pro',      'XMAX V4 Pro',        'portable', 25),
  ('tera',             'Tera',               'portable', 26),
  ('cfx',              'CFX',                'portable', 27),
  ('fury-edge',        'Fury Edge',          'portable', 28),
  ('utillian-722',     'Utillian 722',       'portable', 29),
  ('utillian-620',     'Utillian 620',       'portable', 30),
  ('aris-ultra',       'ÄRiS Ultra',         'portable', 31),
  ('gpen-dash-plus',   'G Pen Dash+',        'portable', 32),
  -- Desktop (whip / balloon / hybrid / log)
  ('volcano-hybrid',   'Volcano Hybrid',     'desktop',   1),
  ('volcano-classic',  'Volcano Classic',    'desktop',   2),
  ('plenty',           'Plenty',             'desktop',   3),
  ('xq2',              'XQ2',                'desktop',   4),
  ('extreme-q',        'Extreme Q',          'desktop',   5),
  ('ditanium',         'Ditanium',           'desktop',   6),
  ('silver-surfer',    'Silver Surfer',      'desktop',   7),
  ('super-surfer-2',   'Super Surfer 2',     'desktop',   8),
  ('da-buddha',        'Da Buddha',          'desktop',   9),
  ('vb1-5',            'VB1.5',              'desktop',  10),
  ('digiti-2',         'Herborizer DigiTi 2.0', 'desktop', 11),
  ('v-tower',          'V-Tower',            'desktop',  12),
  ('e-nano',           'E-Nano',             'desktop',  13),
  ('underdog',         'Underdog',           'desktop',  14),
  ('woodscents',       'WoodScents',         'desktop',  15),
  ('couchlog',         'CouchLog',           'desktop',  16),
  ('herbalair-h3',     'HerbalAire H3',      'desktop',  17),
  -- Ball vapes (injector-style desktops)
  ('flowerpot-b1',     'Flowerpot B1',       'ball-vape', 1),
  ('terp-hammer',      'Terp Hammer',        'ball-vape', 2),
  ('taroma-360',       'Taroma 360',         'ball-vape', 3),
  ('qaroma-360',       'Qaroma 360',         'ball-vape', 4),
  ('screwball',        'Screwball',          'ball-vape', 5),
  ('flowerpot-b2',     'Flowerpot B2',       'ball-vape', 6),
  ('weedeater',        'WeedEater',          'ball-vape', 7),
  ('taroma-2',         'Taroma 2.0',         'ball-vape', 8),
  ('flowerpot-b0',     'Flowerpot B0',       'ball-vape', 9),
  ('ruby-twist',       'Ruby Twist',         'ball-vape', 10),
  ('core-2-1',         'Core 2.1',           'ball-vape', 11),
  ('zeal',             'Zeal',               'ball-vape', 12),
  ('halo',             'Halo',               'ball-vape', 13),
  ('vapvana-ace',      'Ace',                'ball-vape', 14),
  ('freight-train-pro','Freight Train Pro',  'ball-vape', 15),
  ('the-pinky',        'The Pinky',          'ball-vape', 16),
  ('firewood-9',       'Firewood 9',         'ball-vape', 17),
  ('vapbong',          'VapBong',            'ball-vape', 18),
  ('taroma-lite',      'Taroma Lite',        'ball-vape', 19),
  ('qaroma',           'Qaroma',             'ball-vape', 20),
  ('ceroma',           'Ceroma',             'ball-vape', 21),
  -- Butane / torch / analog
  ('anvil',            'Anvil',              'butane',    1),
  ('dynavap-m7',       'M7',                 'butane',    2),
  ('dynavap-woodwynd', 'DynaVap WoodWynd',   'butane',    3),
  ('dynavap-m-plus',   'DynaVap M Plus',     'butane',    4),
  ('dynavap-hyperdyn', 'HyperDyn',           'butane',    5),
  ('dynavap-m7-xl',    'M7 XL',              'butane',    6),
  ('dynavap-unidyn',   'UniDyn',             'butane',    7),
  ('dynavap-omni',     'Omni',               'butane',    8),
  ('dynavap-vong-x',   'VonG X',             'butane',    9),
  ('dynavap-vongi',    'VonG(i)',            'butane',   10),
  ('dynavap-b2',       'The B2',             'butane',   11),
  ('dynavap-g3',       'The G3',             'butane',   12),
  ('dynavap-bb9',      'BB9',                'butane',   13),
  ('vestratto-tornado','Tornado',            'butane',   14),
  ('tempest-2',        'Tempest 2',          'butane',   15),
  ('dani-fusion',      'Dani Fusion 2.0',    'butane',   16),
  ('convector-v2',     'Convector V2',       'butane',   17),
  ('convector-xl-v2',  'Convector XL V2',    'butane',   18),
  ('vapman-click',     'Vapman Click',       'butane',   19),
  ('lotus',            'Lotus',              'butane',   20),
  ('sticky-brick-junior','Sticky Brick Junior','butane', 21),
  ('sticky-brick-runt','Sticky Brick Runt',  'butane',   22),
  ('sticky-brick-og',  'Sticky Brick OG',    'butane',   23),
  ('hydrobrick-maxx',  'HydroBrick Maxx',    'butane',   24),
  ('launch-box',       'Launch Box',         'butane',   25),
  ('vaphit-qoq',       'QOQ',                'butane',   26),
  ('terpcicle',        'Terpcicle',          'butane',   27),
  -- Induction heaters (for butane devices)
  ('ispire-wand',      'The Wand',           'induction', 1),
  ('yll-ih-3',         'IH 3.0',             'induction', 2),
  ('cuboo-heater-xl',  'Heater XL',          'induction', 3)
on conflict (slug) do nothing;
