import { supabase } from "./supabaseClient";

// Trimmed down from the client app's frontend/src/lib/documents.js — this
// app is read-only for now (view/download only), so the upload/delete
// functions aren't copied over; only what the Document Vault view actually
// needs. If staff ever get an editing feature, pull the rest across then.
const BUCKET = "documents";

// The bucket is private, so viewing a file needs a short-lived signed URL —
// this works for ANY family's file here (not just "your own", like in the
// client app) because of the staff read policy on storage.objects added in
// eduhub_schema_addendum_2_staff.sql.
export async function getSignedUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

// Turns "Asma Khanam" + "Passport copy" into "Asma_Khanam_Passport_copy" —
// same clean-filename convention as the client app.
export function cleanFileName(personLabel, docLabel, suffix) {
  const base = `${personLabel || "Unknown"}_${docLabel || "Document"}`
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return suffix ? `${base}_${suffix}` : base;
}

export async function downloadDocument(doc, cleanName) {
  const url = await getSignedUrl(doc.file_url);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't download file.");
  const blob = await res.blob();
  const sourceName = doc.original_filename || doc.file_url || "";
  const ext = sourceName.includes(".") ? sourceName.split(".").pop() : "";
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = ext ? `${cleanName}.${ext}` : cleanName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
