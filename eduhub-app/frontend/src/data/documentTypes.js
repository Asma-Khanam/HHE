// The checklist itself, from HHE's own "Relocate Document checklist for
// applications" reference. Each entry is one upload slot — the key is what
// gets stored in documents.document_type, so don't rename an existing key
// without also migrating any already-uploaded rows.
//
// `multiple: true` means the slot accepts more than one file (school
// reports build up over the years, an Emirates ID needs both sides) — the
// database already allows this (no uniqueness constraint on document_type),
// so this is real, not a preview.

export const CHILD_DOCUMENT_TYPES = [
  { key: "birth_certificate", label: "Birth certificate", required: true },
  { key: "passport", label: "Passport copy", required: true },
  { key: "passport_photo", label: "Passport-size photo", required: true },
  { key: "eid", label: "Emirates ID (front and back)", required: false, hint: "Once obtained — upload both sides.", multiple: true },
  { key: "visa", label: "Visa copy", required: false, hint: "If already issued." },
  { key: "vaccination_record", label: "Vaccination record", required: false, hint: "Recommended if available." },
  { key: "psychology_report", label: "Psychology report / EHCP", required: false, hint: "If applicable." },
  // achievement_certificate and sen_supporting_documents are never shown in
  // the main checklist below (ApplicationForm.jsx filters both out) — they
  // render inline next to "Sports achievements" and the SEN question instead.
  { key: "achievement_certificate", label: "Achievement certificate", required: false, hint: "Optional." },
  {
    key: "sen_supporting_documents",
    label: "SEN supporting documents",
    required: false,
    multiple: true,
    hint: "Reports, assessments, or plans — optional.",
  },
  {
    key: "school_reports",
    label: "School reports",
    required: true,
    multiple: true,
    hint: "Upload the most recent report first — add earlier terms too if you have them, up to the last 2 years.",
  },
  { key: "leaving_certificate", label: "Leaving / transfer certificate", required: false, hint: "If already issued." },
];

export const PARENT_DOCUMENT_TYPES = [
  { key: "passport", label: "Passport copy", required: true },
  { key: "eid", label: "Emirates ID", required: false, hint: "Once obtained." },
];

export const ACCEPTED_FILE_EXTENSIONS = ".pdf,.png,.jpg,.jpeg";
export const ACCEPTED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];
