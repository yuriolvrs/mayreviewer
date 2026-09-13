import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The ONLY file that constructs the Supabase client. Everything else goes
// through `getSupabaseClient()` (null when unconfigured) or
// `isSupabaseConfigured()`, so a missing key degrades to local-only mode
// instead of throwing at import or render time.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);
}

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!cached) {
    cached = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
  }
  return cached;
}
