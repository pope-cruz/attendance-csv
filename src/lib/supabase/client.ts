import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * Returns a Supabase client for browser use. Reads from NEXT_PUBLIC_* so you
 * can just paste the URL + anon key into .env.local and go.
 * Returns null if env is not yet configured.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || url.includes("YOUR_PROJECT_ID") || anonKey.includes("YOUR_SUPABASE")) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient(url, anonKey);
  }

  return cachedClient;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseClient() !== null;
}

export function shouldUseSupabase(): boolean {
  // Kept for backwards-compat — app now always uses Supabase; flag still gates the switch if you set it false.
  return isSupabaseConfigured();
}
