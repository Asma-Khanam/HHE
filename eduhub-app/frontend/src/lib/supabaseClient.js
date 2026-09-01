import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // This is a setup problem, not a user-facing error — surface it loudly in
  // the console so it's obvious during development instead of failing silently.
  console.warn(
    "Missing Supabase env vars. Copy .env.example to .env and fill in " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase project's " +
      "Settings -> API page. Using placeholder values for now so the app can " +
      "still render — sign up/login calls will fail until real values are set."
  );
}

// createClient throws immediately if the URL is missing/invalid, which would
// crash the whole app before it even renders. Fall back to a harmless
// placeholder URL so the UI still loads with real values missing; actual
// auth calls will just fail (with a clear network error) until .env is set.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);
