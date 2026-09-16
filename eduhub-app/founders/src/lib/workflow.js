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

// Suggested (not enforced) reasons for a "rejected" application -- a
// datalist on the free-text rejected_reason column, not a fixed list, since
// schools reject for reasons nobody can fully anticipate.
export const REJECTION_REASONS = [
  "No space this year",
  "Fees too high",
  "Didn't meet entry requirements",
  "Waitlisted elsewhere",
  "Other",
];

// One school, for one family, reduced to a single stage in the Overview
// pipeline widget -- the same underlying school_shortlist + applications
// rows the School visits and Applications tabs already show, just read as
// "where is this school up to" instead of two separate lists. Order matters:
// this is checked top to bottom, most-final outcome first.
export const SCHOOL_PIPELINE_STAGES = [
  { key: "shortlisted", label: "Shortlisted", hint: "Shortlisted, nothing booked yet" },
  { key: "tour_scheduled", label: "Tour scheduled", hint: "Tour booked, not yet happened" },
  { key: "awaiting_decision", label: "Awaiting decision", hint: "Toured — no decision recorded yet" },
  { key: "application_started", label: "Application started", hint: "Application drafted, not yet submitted" },
  { key: "application_progress", label: "In progress", hint: "Application submitted, working through the school's process" },
  { key: "decision", label: "Decision", hint: "Offer or rejection received" },
  { key: "declined", label: "Declined", hint: "Family decided not to proceed with this school" },
];

export function pipelineStage(row, applicationsForSchool) {
  const apps = (applicationsForSchool || []).filter((a) => a.status !== "withdrawn");
  const finalApp = apps.find((a) => a.status === "offer" || a.status === "rejected");
  if (finalApp) return "decision";

  if (row.family_decision === "declined" && apps.length === 0) return "declined";

  const activeApp = apps.find((a) => a.status !== "draft");
  if (activeApp) return "application_progress";
  if (apps.length > 0) return "application_started";

  if (row.tour_status === "completed") return "awaiting_decision";
  if (row.tour_date || row.tour_status) return "tour_scheduled";
  return "shortlisted";
}

export const FIT_OPTIONS = [
  { key: "best_fit", label: "Best fit" },
  { key: "stretch", label: "Stretch" },
  { key: "safe", label: "Safe" },
];

export function fitLabel(key) {
  return FIT_OPTIONS.find((f) => f.key === key)?.label || "";
}

// Document review states. 'received' is what the family's own upload
// writes, and counts as done on its own — no separate "verified" click
// needed. 'chasing'/'pending' are only for flagging something wrong or
// still owed.
export const DOCUMENT_STATUSES = [
  { key: "received", label: "Received" },
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

// Case-note kinds (addendum 5). Mirrors that file's CHECK constraint — adding
// one here without adding it there means the insert just fails.
export const NOTE_KINDS = [
  { key: "call", label: "Call" },
  { key: "email", label: "Email" },
  { key: "meeting", label: "Meeting" },
  { key: "school", label: "School" },
  { key: "decision", label: "Decision" },
  { key: "note", label: "Note" },
];

export function noteKindLabel(key) {
  return NOTE_KINDS.find((k) => k.key === key)?.label || "Note";
}

// "today", "yesterday", "3 days ago", then a real date once it's far enough
// back that a relative one stops being easier to read than the date itself.
export function relativeDay(iso) {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days > 1 && days < 7) return `${days} days ago`;
  if (days < 0) return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
