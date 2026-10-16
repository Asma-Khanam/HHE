import { supabase } from "./supabaseClient";

// Application fees HHE has sent to this family (the database only returns
// rows a consultant has pressed "Send to family dashboard" on).
//
// Reads the family_application_fees view (addendum 110), never the
// application_fees table. For a fee HHE paid on the family's behalf the view's
// "amount" is what the family is charged, not what HHE paid the school, and
// the school's own invoice is left out. Keep it that way: the family must only
// ever see one figure. (Miss Lyndsay, 16 Oct 2026.)
export async function fetchApplicationFees() {
  const { data, error } = await supabase
    .from("family_application_fees")
    .select("id, application_id, status, amount, currency, label, due_date, paid_at, invoice_path, invoice_name, payment_url, paid_direct_by_family, hhe_paid_school_on_behalf, sent_to_family_at, source, external_invoice_ref, created_at")
    .order("sent_to_family_at", { ascending: false });
  if (error) throw error;
  const fees = data || [];
  if (fees.length === 0) return fees;

  // The view has no relationships of its own, so the school and child come
  // from the family's own applications.
  const ids = [...new Set(fees.map((f) => f.application_id))];
  const { data: apps, error: appsError } = await supabase
    .from("applications")
    .select("id, child_id, school_id, school:schools(name)")
    .in("id", ids);
  if (appsError) throw appsError;
  const byId = new Map((apps || []).map((a) => [a.id, a]));
  return fees.map((f) => ({ ...f, application: byId.get(f.application_id) || null }));
}
