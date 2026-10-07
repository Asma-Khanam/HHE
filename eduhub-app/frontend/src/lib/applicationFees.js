import { supabase } from "./supabaseClient";

// Application fees HHE has sent to this family (the database only returns
// rows a consultant has pressed "Send to family dashboard" on).
export async function fetchApplicationFees() {
  const { data, error } = await supabase
    .from("application_fees")
    .select("*, application:applications(child_id, school:schools(name))")
    .not("sent_to_family_at", "is", null)
    .order("sent_to_family_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
