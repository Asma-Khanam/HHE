// The checklist itself, from HHE's own "Relocate Document checklist for
// applications" reference. Each entry is one upload slot — the key is what
// gets stored in documents.document_type, so don't rename an existing key
// without also migrating any already-uploaded rows.
//
// `multiple: true` means the slot accepts more than one file (school
// reports build up over the years, an Emirates ID needs both sides) — the
// database already allows this (no uniqueness constraint on document_type),
// so this is real, not a preview.
//
// NOTHING here is required to submit any more (founder feedback, 2026-09-02):
// a family that genuinely doesn't have a document yet — a visa that hasn't
// been issued, an Emirates ID they're still waiting on — shouldn't be
// locked out of submitting because of it. What replaces the old asterisk is
// `expected`: a document HHE does still need eventually. Every expected slot
// that has no file yet shows up under "Outstanding documents" on the
// Dashboard until it's uploaded, so nothing quietly gets forgotten — it just
// no longer blocks the Submit button.
//
// `conditional` marks a slot that only applies in certain cases (a leaving
// certificate the family already said they don't have, SEN reports for a
// child with no SEN) — those never appear on the outstanding list.

// SEN-03 (September 2026 change request) — its own, slightly wider accepted
// list (adds HEIC/HEIF, the format an iPhone saves photos as by default) and
// its own 20MB-per-file limit, scoped to this one upload slot rather than
// changed globally — nothing in the document checklist elsewhere in the app
// asked for either of these. Declared up here, ahead of CHILD_DOCUMENT_TYPES
// below, since that list references these constants.
export const ACCEPTED_SEN_DOCUMENT_EXTENSIONS = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.heif";

const ACCEPTED_SEN_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
];
const ACCEPTED_SEN_DOCUMENT_EXTS = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "heic", "heif"];

export function isAcceptedSenDocumentFile(file) {
  if (!file) return false;
  if (file.type && ACCEPTED_SEN_DOCUMENT_MIME_TYPES.includes(file.type)) return true;
  const name = file.name || "";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return ACCEPTED_SEN_DOCUMENT_EXTS.includes(ext);
}

export const ACCEPTED_SEN_DOCUMENT_MESSAGE = "Only PDF, Word (.doc/.docx), JPG, PNG, or HEIC files are accepted.";

export const SEN_DOCUMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024;
export const SEN_DOCUMENT_MAX_SIZE_MESSAGE = "Files need to be 20MB or smaller.";

export const CHILD_DOCUMENT_TYPES = [
  { key: "birth_certificate", label: "Birth certificate", expected: true },
  { key: "passport", label: "Passport copy", expected: true },
  { key: "passport_photo", label: "Passport-size photo", expected: true },
  { key: "eid", label: "Emirates ID (front and back)", expected: true, hint: "Once obtained — upload both sides.", multiple: true },
  { key: "vaccination_record", label: "Vaccination record", expected: true, hint: "Recommended if available." },
  // achievement_certificate, sen_supporting_documents, and
  // sen_general_documents are never shown in the main checklist below
  // (ApplicationForm.jsx filters all three out) — they render inline next to
  // "Sports achievements" and inside the SEN and inclusion section instead.
  { key: "achievement_certificate", label: "Achievement certificate", expected: false, hint: "Optional." },
  {
    key: "sen_supporting_documents",
    label: "SEN supporting documents",
    expected: false,
    conditional: true,
    multiple: true,
    hint: "Reports, assessments, or plans — optional.",
  },
  // SEN-03 (September 2026 change request) — "Document upload", a general,
  // multi-file catch-all for the SEN and inclusion section. DU-03 moves the
  // old standalone "Psychology report / EHCP" slot here (same key kept, so
  // any file a family already uploaded under it stays exactly where it is)
  // rather than retiring it and losing that upload.
  {
    key: "psychology_report",
    label: "Please upload anything you are happy to share",
    expected: false,
    conditional: true,
    multiple: true,
    hint: "Reports more than three years old still help us. Nothing is shared with a school without your written permission.",
    acceptExtensions: ACCEPTED_SEN_DOCUMENT_EXTENSIONS,
    acceptCheck: isAcceptedSenDocumentFile,
    acceptMessage: ACCEPTED_SEN_DOCUMENT_MESSAGE,
    maxSizeBytes: SEN_DOCUMENT_MAX_SIZE_BYTES,
    maxSizeMessage: SEN_DOCUMENT_MAX_SIZE_MESSAGE,
  },
  {
    key: "school_reports",
    label: "School reports",
    expected: true,
    multiple: true,
    hint: "Upload the most recent report first — add earlier terms too if you have them, up to the last 2 years.",
  },
  {
    key: "leaving_certificate",
    label: "Leaving / transfer certificate",
    expected: true,
    conditional: true,
    hint: "Once issued.",
  },
];

export const PARENT_DOCUMENT_TYPES = [
  { key: "passport", label: "Passport copy", expected: true },
  { key: "eid", label: "Emirates ID", expected: true, hint: "Once obtained." },
];

// Word documents are accepted alongside PDFs and images (founder feedback,
// 2026-09-02) — school reports and reference letters very often arrive as
// .doc/.docx. The Supabase storage bucket itself has no MIME allowlist, so
// this list is the only thing that was ever rejecting them.
//
// Both Word MIME types are listed because .doc (the old binary format) and
// .docx (the modern zipped one) report differently, and some browsers /
// operating systems hand over an empty or generic type for either — hence
// the extension fallback in isAcceptedFile below.
// A family member's own photo. Deliberately NOT in either list above: it
// reuses the same polymorphic documents table and storage bucket (so no
// schema change was needed for it), but it isn't paperwork — it should never
// appear on a checklist, in the outstanding list, or in the Document Vault,
// and nothing about it is ever chased.
export const PROFILE_PHOTO_TYPE = "profile_photo";

export const ACCEPTED_IMAGE_EXTENSIONS = ".png,.jpg,.jpeg,.webp";
const ACCEPTED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const ACCEPTED_IMAGE_EXTS = ["png", "jpg", "jpeg", "webp"];

export function isAcceptedImage(file) {
  if (!file) return false;
  if (file.type && ACCEPTED_IMAGE_MIME_TYPES.includes(file.type)) return true;
  const name = file.name || "";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return ACCEPTED_IMAGE_EXTS.includes(ext);
}

export const ACCEPTED_IMAGE_MESSAGE = "Photos need to be a PNG, JPEG, or WebP image.";

export const ACCEPTED_FILE_EXTENSIONS = ".pdf,.png,.jpg,.jpeg,.doc,.docx";

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
];

const ACCEPTED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "doc", "docx"];

// Checks the MIME type first, then falls back to the file extension.
// The fallback matters: a .docx dragged in from some file managers arrives
// with an empty `type`, and rejecting on that alone is exactly the bug the
// founders hit — the file was fine, the browser just didn't label it.
export function isAcceptedFile(file) {
  if (!file) return false;
  if (file.type && ACCEPTED_MIME_TYPES.includes(file.type)) return true;
  const name = file.name || "";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return ACCEPTED_EXTENSIONS.includes(ext);
}

export const ACCEPTED_FILES_MESSAGE = "Only PDF, Word (.doc/.docx), PNG, or JPEG files are accepted.";
