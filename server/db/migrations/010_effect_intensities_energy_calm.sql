-- 010_effect_intensities_energy_calm.sql — effect intensity map + energy/calm score.
--
-- effect_intensities: per-tag intensity (1-10) for moods and unwanted effects
-- selected in the session. Stored as jsonb so tag names stay free-form.
-- energy_calm_score: bipolar -5..+5 slider (-5 very calm, 0 neutral, +5 very
-- energized). NULL means the user skipped it.
-- Idempotent: safe to re-apply.

alter table if exists sessions add column if not exists effect_intensities jsonb not null default '{}';
alter table if exists sessions add column if not exists energy_calm_score int check (energy_calm_score between -5 and 5);
