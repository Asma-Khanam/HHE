import { supabase } from "./supabaseClient";

// A signed-in user only counts as staff if they have a row in `staff` —
// nothing about signing up through this app grants that by itself (see
// eduhub_schema_addendum_2_staff.sql). This just checks whether that row
// exists for whoever's currently logged in; it relies on the "staff_read_self"
// RLS policy, which only ever lets someone see their OWN staff row, so this
// can never be used to enumerate who else has access.
export async function getOwnStaffRecord() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, staff: null };

  const { data, error } = await supabase.from("staff").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw error;

  return { user, staff: data || null };
}
