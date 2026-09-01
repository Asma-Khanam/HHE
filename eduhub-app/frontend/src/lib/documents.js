import { supabase } from "./supabaseClient";

const BUCKET = "documents";

// Fetches every uploaded document for one owner (a parent or a child).
export async function fetchDocuments(ownerType, ownerId) {
  if (!ownerId) return [];
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId);
  if (error) throw error;
  return data || [];
}

// Uploads a file into one checklist slot (owner_type + owner_id +
// document_type).
//
// By default this REPLACES whatever was in that slot before — a single-file
// slot only ever holds one current file, re-uploading is how you correct a
// mistake, not how you add a second copy.
//
// Pass `multiple: true` (for slots like school reports or a 2-sided Emirates
// ID) to add alongside whatever's already there instead — nothing gets
// deleted, and the storage path is timestamped so it can't collide with an
// earlier upload under the same document_type.
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

// The bucket is private, so viewing a file needs a short-lived signed URL
// rather than a plain public link.
export async function getSignedUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

// Turns "Asma Khanam" + "Passport copy" into "Asma_Khanam_Passport_copy" —
// used so a download always has a clean, predictable name no matter what
// the family's device happened to call the file on upload. `suffix` is for
// multi-file slots (school reports, a 2-sided EID) so downloading several
// files under the same slot doesn't overwrite/collide.
export function cleanFileName(personLabel, docLabel, suffix) {
  const base = `${personLabel || "Unknown"}_${docLabel || "Document"}`
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return suffix ? `${base}_${suffix}` : base;
}

// Downloads a file under a clean name regardless of the original filename
// it was uploaded as — this is purely a client-side rename (the object in
// storage keeps its real path; only the name the browser saves it under
// changes), so it needed no database or storage changes to add. Fetches
// the signed URL as a blob rather than just setting `download` on a link
// to it, since a cross-origin `download` attribute is ignored by the
// browser and would otherwise just open the file instead of saving it.
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
