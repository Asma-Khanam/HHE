// Copy this file to `config.js` and fill in the two values.
//
// Same pair the two web apps use — find them in the Supabase dashboard under
// Settings → API, or copy them out of either app's Vercel environment
// variables. The anon key is public by design (it ships inside every visitor's
// JavaScript already); row-level security is what protects the data, not the
// secrecy of this key. `config.js` is gitignored anyway, to match how the rest
// of this repo handles it.
export const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
export const SUPABASE_ANON_KEY = "your-anon-public-key";
