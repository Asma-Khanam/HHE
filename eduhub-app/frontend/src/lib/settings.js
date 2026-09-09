import { supabase } from "./supabaseClient";

// CH-06 (September 2026 change request): "please keep the cut-off date
// editable in the admin area. It differs by curriculum and we will need to
// adjust it." — a single settings row (public.app_settings, schema addendum
// 26) staff can change from the founders app's Settings page. This is the
// family-facing side's read of it: falls back to the UK/UAE
// British-curriculum default (31 August) if the addendum hasn't been run
// yet, if the row is missing, or if the fetch fails for any reason — the
// year-group suggestion should degrade to "what it did before this setting
// existed", never break the form outright.
const DEFAULT_YEAR_GROUP_CUTOFF = { month: 8, day: 31 };

export async function fetchYearGroupCutoff() {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("year_group_cutoff_month, year_group_cutoff_day")
      .eq("id", "default")
      .maybeSingle();
    if (error || !data) return DEFAULT_YEAR_GROUP_CUTOFF;
    return {
      month: data.year_group_cutoff_month ?? DEFAULT_YEAR_GROUP_CUTOFF.month,
      day: data.year_group_cutoff_day ?? DEFAULT_YEAR_GROUP_CUTOFF.day,
    };
  } catch {
    return DEFAULT_YEAR_GROUP_CUTOFF;
  }
}
