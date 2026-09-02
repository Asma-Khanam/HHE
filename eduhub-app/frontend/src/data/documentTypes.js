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

export const CHILD_DOCUMENT_TYPES = [
  { key: "birth_certificate", label: "Birth certificate", expected: true },
  { key: "passport", label: "Passport copy", expected: true },
  { key: "passport_photo", label: "Passport-size photo", expected: true },
  { key: "eid", label: "Emirates ID (front and back)", expected: true, hint: "Once obtained — upload both sides.", multiple: true },
  { key: "visa", label: "Visa copy", expected: true, hint: "Once issued." },
  { key: "vaccination_record", label: "Vaccination record", expected: true, hint: "Recommended if available." },
  { key: "psychology_report", label: "Psychology report / EHCP", expected: false, hint: "If applicable." },
  // achievement_certificate and sen_supporting_documents are never shown in
  // the main checklist below (ApplicationForm.jsx filters both out) — they
  // render inline next to "Sports achievements" and the SEN question instead.
  { key: "achievement_certificate", label: "Achievement certificate", expected: false, hint: "Optional." },
  {
    key: "sen_supporting_documents",
    label: "SEN supporting documents",
    expected: false,
    conditional: true,
    multiple: true,
    hint: "Reports, assessments, or plans — optional.",
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
