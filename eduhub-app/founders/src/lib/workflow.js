// Shared vocabulary for the staff-side workflow: the pipeline stages, the
// per-school application statuses, how good a fit a school is, and the
// document review states. Every one of these mirrors a CHECK constraint in
// eduhub_schema_addendum_3_staff_workflow.sql — if you add an option here,
// the database has to allow it too or the write will just fail.

export const PIPELINE_STAGES = [
  { key: "enquiry", label: "Enquiry" },
  { key: "profile", label: "Profile" },
  { key: "applied", label: "Applied" },
  { key: "assessed", label: "Assessed" },
  { key: "offer", label: "Offer" },
  { key: "placed", label: "Placed" },
];

export function stageIndex(key) {
  const i = PIPELINE_STAGES.findIndex((s) => s.key === key);
  return i === -1 ? 0 : i;
}

export function stageLabel(key) {
  return PIPELINE_STAGES[stageIndex(key)].label;
}

// The application statuses were fixed by the original schema's CHECK
// constraint — these are just the human labels for them, plus a rough
// "how far along is this" position used for the progress bar.
export const APPLICATION_STATUSES = [
  { key: "draft", label: "Draft", progress: 0 },
  { key: "submitted", label: "Submitted", progress: 1 },
  { key: "documents_pending", label: "Documents pending", progress: 1 },
  { key: "reference_requested", label: "Reference requested", progress: 2 },
  { key: "under_review", label: "Under review", progress: 3 },
  { key: "offer", label: "Offer", progress: 4 },
  { key: "rejected", label: "Rejected", progress: 4 },
  { key: "withdrawn", label: "Withdrawn", progress: 0 },
];

export const APPLICATION_PROGRESS_STEPS = 4;

export function applicationStatus(key) {
  return APPLICATION_STATUSES.find((s) => s.key === key) || APPLICATION_STATUSES[0];
}

export const FIT_OPTIONS = [
  { key: "best_fit", label: "Best fit" },
  { key: "stretch", label: "Stretch" },
  { key: "safe", label: "Safe" },
];

export function fitLabel(key) {
  return FIT_OPTIONS.find((f) => f.key === key)?.label || "";
}

// Document review states. 'received' is what the family's own upload writes,
// so it means "they've given us this, nobody has checked it."
export const DOCUMENT_STATUSES = [
  { key: "received", label: "Not checked" },
  { key: "verified", label: "Verified" },
  { key: "chasing", label: "Chasing" },
  { key: "pending", label: "Pending" },
];

export function documentStatusLabel(key) {
  return DOCUMENT_STATUSES.find((s) => s.key === key)?.label || "Not checked";
}

// A document counts as expiring when its expiry date is inside the next 60
// days (or already past) — early enough that there's time to get a new one
// before a school asks for it.
export const EXPIRY_WARNING_DAYS = 60;

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  if (Number.isNaN(then.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  then.setHours(0, 0, 0, 0);
  return Math.round((then - today) / 86400000);
}

export function isExpiring(dateStr) {
  const d = daysUntil(dateStr);
  return d !== null && d <= EXPIRY_WARNING_DAYS;
}

export function isOverdue(dueDate) {
  const d = daysUntil(dueDate);
  return d !== null && d < 0;
}

export function isDueToday(dueDate) {
  return daysUntil(dueDate) === 0;
}
