// Phase computation for the "Your schools" page (September 2026 redesign).
// Mirrors the founders' SCHOOL_PIPELINE_STAGES / pipelineStage() (see
// founders/src/lib/workflow.js) but restated PER CHILD rather than per
// family, since an application's fit, status and outcome are all set per
// child -- two siblings can be at completely different stages with the
// same school. Labels are the family-friendly versions of the founders'
// internal status names.

export const APPLICATION_STATUS_LABEL = {
  draft: "Application started",
  submitted: "Submitted",
  assessment_booked: "Assessment booked",
  under_review: "Awaiting decision",
  offer: "Offer received",
  offer_accepted: "Offer accepted",
  waitlisted: "Waitlisted",
  rejected: "Declined",
  withdrawn: "Withdrawn",
};

export const FIT_LABEL = {
  best_fit: "Best fit",
  stretch: "Stretch",
  safe: "Safe",
};

// One school's tour info, reduced to "has it happened yet" -- used both to
// decide a child's phase (below) and to label the nearest occurrence.
export function nearestTourInfo(row) {
  const occurrences = [];
  if (row.tour_date) occurrences.push({ date: row.tour_date, status: row.tour_status });
  if (row.tour2_date) occurrences.push({ date: row.tour2_date, status: row.tour2_status });
  const completed = occurrences.find((o) => o.status === "completed");
  const upcoming = occurrences
    .filter((o) => o.status && o.status !== "completed" && o.status !== "cancelled")
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return { completed, upcoming, hasAny: occurrences.length > 0 };
}

// Returns { phase, tone, sub } for one child at one school -- `phase` is
// the short pill label, `tone` picks its color ('good' | 'bad' | 'gold' |
// 'neutral' | 'muted'), `sub` is the optional detail line underneath.
export function childPhaseFor(row, applicationsForChild) {
  const apps = (applicationsForChild || []).filter((a) => a.status !== "withdrawn");
  const finalApp = apps.find((a) => a.status === "offer" || a.status === "offer_accepted" || a.status === "rejected");
  if (finalApp) {
    return finalApp.status === "offer_accepted"
      ? { phase: "Offer accepted", tone: "good", sub: null }
      : finalApp.status === "offer"
      ? { phase: "Offer", tone: "good", sub: "Received" }
      : { phase: "Declined", tone: "bad", sub: finalApp.rejected_reason ? `Reason: ${finalApp.rejected_reason}` : null };
  }

  const activeApp = apps.find((a) => a.status !== "draft");
  if (activeApp) return { phase: "Applied", tone: "neutral", sub: APPLICATION_STATUS_LABEL[activeApp.status] };
  // A draft-only application is one staff have started but not yet
  // submitted -- "Applied" would overstate that, so this gets its own
  // in-between phase rather than borrowing either neighbor's label.
  if (apps.length > 0) return { phase: "Preparing", tone: "gold", sub: "Application being prepared" };

  if (row.family_decision === "declined") return { phase: "—", tone: "muted", sub: null };

  const { completed, upcoming } = nearestTourInfo(row);
  if (completed) return { phase: "Toured", tone: "gold", sub: null };
  if (upcoming) return { phase: "Tour scheduled", tone: "gold", sub: null };

  return { phase: "Shortlisted", tone: "muted", sub: null };
}
