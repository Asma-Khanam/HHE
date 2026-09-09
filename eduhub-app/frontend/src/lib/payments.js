import { supabase } from "./supabaseClient";

const BUCKET = "documents";

// Uploads a receipt for one payment and marks it submitted — the database
// trigger (payments_guard_client_edit, addendum 11) is what actually
// enforces that this is the only thing a family can do to a payment row;
// this function just does it in the right order.
export async function submitPaymentProof({ userId, payment, file }) {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const path = `${userId}/payment/${payment.id}/receipt-${Date.now()}${ext ? "." + ext : ""}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("payments")
    .update({ receipt_path: path, submitted_at: new Date().toISOString(), status: "submitted" })
    .eq("id", payment.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// The bucket is private — same short-lived signed URL pattern documents.js
// already uses, so a family can see their own uploaded receipt again.
export async function getReceiptUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}
