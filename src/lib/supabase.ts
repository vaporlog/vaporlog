/**
 * vaporlog — Supabase client (single shared instance).
 *
 * Credentials come from `.env.local` (VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY), which Vite injects at build time. That file is
 * gitignored and must never be committed — see `.env.example`.
 *
 * The `!` assertions are a deliberate fail-fast: the app cannot reach the
 * backend without these values, so a missing variable should surface
 * immediately at boot rather than as a confusing network error later.
 * (The publishable anon key is safe to ship to the browser — row-level
 * security in `supabase/schema.sql` is what protects the data.)
 */
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!,
);
