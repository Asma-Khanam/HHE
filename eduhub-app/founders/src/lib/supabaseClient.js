import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "Missing Supabase env vars. Copy .env.example to .env and fill in " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase project's " +
      "Settings -> API page. Using placeholder values for now so the app can " +
      "still render — auth calls will fail until real values are set."
  );
}

// Same project as the client app (frontend/) — this is the public anon key,
// safe to reuse as-is. What a signed-in user can actually read/write is
// entirely governed by Postgres row-level security, not by which key was
// used to connect; see eduhub_schema_addendum_2_staff.sql for the staff
// policies that make this app able to see every family's data.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);
