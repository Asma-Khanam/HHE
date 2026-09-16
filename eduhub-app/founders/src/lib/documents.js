import { supabase } from "./supabaseClient";

// Addendum 35 (September 2026 change request) — staff can now upload,
// replace, and remove a family's documents from this side too, not just
// view/download them. uploadDocument/deleteDocument below are pulled
// across from the client app's frontend/src/lib/documents.js with one
// change: `userId` here is always the FAMILY's own account_user_id, not
// whoever's signed in — the storage path convention
// ({account_user_id}/{owner_type}/{owner_id}/...) has to stay keyed to the
// family regardless of who uploads, both so an existing file staff replace
// lands in the same place a family-uploaded one would have, and so the
// family can still manage it themselves afterwards through their own
// per-folder storage policy. Addendum 35's staff storage policies are what
// make writing into someone else's folder possible from here at all.
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

// Uploads a file into one checklist slot (owner_type + owner_id +
// document_type), on the family's behalf. Same replace-by-default /
// `multiple: true`-appends behaviour as the family's own upload — see
// frontend/src/lib/documents.js for the full explanation.
export async function uploadDocument({ userId, ownerType, ownerId, documentType, file, multiple = false }) {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";

  if (!multiple) {
    const { data: existing, error: existingError } = await supabase
      .from("documents")
      .select("id, file_url")
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId)
      .eq("document_type", documentType);
    if (existingError) throw existingError;

    if (existing?.length) {
      const paths = existing.map((d) => d.file_url).filter(Boolean);
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .in(
          "id",
          existing.map((d) => d.id)
        );
      if (deleteError) throw deleteError;
    }

    const path = `${userId}/${ownerType}/${ownerId}/${documentType}${ext ? "." + ext : ""}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from("documents")
      .insert({
        owner_type: ownerType,
        owner_id: ownerId,
        document_type: documentType,
        file_url: path,
        file_type: file.type,
        original_filename: file.name,
        status: "received",
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // multiple: true — always add a new row/file, never delete an existing one.
  const path = `${userId}/${ownerType}/${ownerId}/${documentType}-${Date.now()}${ext ? "." + ext : ""}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("documents")
    .insert({
      owner_type: ownerType,
      owner_id: ownerId,
      document_type: documentType,
      file_url: path,
      file_type: file.type,
      original_filename: file.name,
      status: "received",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDocument(doc) {
  if (doc.file_url) {
    await supabase.storage.from(BUCKET).remove([doc.file_url]);
  }
  const { error } = await supabase.from("documents").delete().eq("id", doc.id);
  if (error) throw error;
}

// Generic documents (addendum 55) -- family-overview and school-record
// uploads that aren't part of a fixed checklist. document_type doubles as
// a free-text label here (see slugifyLabel/labelFromSlug below), and
// these always use uploadDocument's multiple:true path, so uploading
// again never replaces a previous file, it just adds another one.
export async function listDocuments(ownerType, ownerId) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// document_type ends up in the storage path (see uploadDocument above), so
// a staff-typed label has to be made path-safe -- same underscore
// convention cleanFileName already uses for filenames elsewhere in this
// file, just applied to a label instead of a person+doc-type pair.
export function slugifyLabel(label) {
  const slug = (label || "").trim().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "document";
}

// The inverse, for display -- not a perfect round-trip (original spacing/
// casing/punctuation isn't preserved), but close enough to read back what
// staff typed, same tradeoff the app already makes with cleanFileName.
export function labelFromSlug(slug) {
  return (slug || "Document").replace(/_/g, " ");
}
