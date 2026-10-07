import { supabase } from "./supabaseClient";

// Public pages the team edits themselves (addendum 93) -- the Privacy policy
// today. Readable without signing in, because the App Store / Google Play
// listing needs a public link. Returns null if the page can't be loaded.
export async function fetchSitePage(slug) {
  try {
    const { data, error } = await supabase
      .from("site_pages")
      .select("title, body, updated_at")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}
