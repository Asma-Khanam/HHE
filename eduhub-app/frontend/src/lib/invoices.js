import { supabase } from "./supabaseClient";

// The Stripe invoices HHE has sent this family. Reads the family_invoices view
// (addendum 121): the amount is what the family is charged, never what HHE paid
// the school. Quietly empty if that SQL has not been run yet.
export async function fetchFamilyInvoices() {
  const { data, error } = await supabase
    .from("family_invoices")
    .select("id, kind, amount, currency, status, due_date, paid_at, hosted_invoice_url, invoice_pdf_url, created_at, school_name, children")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data || []).map((i) => ({ ...i, amount: Number(i.amount) || 0 }));
}
