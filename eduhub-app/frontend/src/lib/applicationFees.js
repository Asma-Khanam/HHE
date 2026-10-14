import { supabase } from "./supabaseClient";

// Application fees HHE has sent to this family (the database only returns
// rows a consultant has pressed "Send to family dashboard" on).
export async function fetchApplicationFees() {
  const { data, error } = await supabase
    .from("application_fees")
    .select("id, application_id, status, amount, currency, label, due_date, paid_at, invoice_path, invoice_name, payment_url, paid_direct_by_family, hhe_paid_school_on_behalf, sent_to_family_at, source, external_invoice_ref, application:applications(child_id, school_id, school:schools(name))")
    .not("sent_to_family_at", "is", null)
    .order("sent_to_family_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
