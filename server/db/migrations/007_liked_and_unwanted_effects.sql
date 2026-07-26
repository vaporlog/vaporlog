-- ============================================================================
-- Migration 007 — liked sessions + unwanted effects
-- ============================================================================
-- Añade a sessions:
--   · liked                    boolean nullable (true/false/null)
--   · unwanted_effects         text[] no null, default vacío
--   · unwanted_effects_public  boolean no null, default false
--
-- Idempotente: usa IF NOT EXISTS para columnas.
-- ============================================================================

alter table sessions
  add column if not exists liked boolean,
  add column if not exists unwanted_effects text[] not null default '{}',
  add column if not exists unwanted_effects_public boolean not null default false;
