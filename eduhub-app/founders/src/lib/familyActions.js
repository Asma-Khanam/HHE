// "What needs a person to act, and where?" -- worked out from each family's shortlist
// (29 Oct 2026 call: any consultant should open a family, or the Today view, and see at
// once what needs doing, without checking every file). Every item is something for US to do.
// Things we are waiting on (a school reply, the parent) are not actions and never appear here.

const dubaiToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
const niceDay = (iso) => new Date(String(iso).slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });

const TABS = { visits: "School visits", emails: "Emails", applications: "Applications" };
export const actionWhere = (a) => TABS[a.where] || a.where;

// rows: school_shortlist rows with { school: { name } }; suggestions: unresolved school_reply_suggestions.
// Returns { [familyId]: [{ key, step, schoolId, where, label, schoolName }] }
export function computeFamilyActions(rows, suggestions, offers) {
  const today = dubaiToday();
  // Availability and tour times are dealt with on School visits; assessment dates on Applications.
  const sugByRow = new Set((suggestions || []).filter((s) => (s.availability || []).length || (s.tour_slots || []).length || !(s.assessment_dates || []).length).map((s) => s.shortlist_id));
  const assessBySchool = new Map();
  (suggestions || []).forEach((s) => {
    if ((s.assessment_dates || []).length && s.school_id) assessBySchool.set(s.family_id + "|" + s.school_id, s);
  });
  const out = {};
  const add = (familyId, item) => (out[familyId] = out[familyId] || []).push(item);

  for (const row of rows || []) {
    if (["declined", "proceeding"].includes(row.family_decision)) continue;
    const name = row.school?.name || "A school";
    const slots = [
      { date: row.tour_date, status: row.tour_status },
      { date: row.tour2_date, status: row.tour2_status },
    ].filter((s) => s.date && s.status !== "cancelled");

    if (sugByRow.has(row.id)) {
      add(row.family_id, { key: "reply-" + row.id, step: "reply", schoolId: row.school_id, where: "visits", schoolName: name, label: `${name} replied: check what they said` });
    }
    if (slots.some((s) => (s.status || "offered") === "offered")) {
      add(row.family_id, { key: "offer-" + row.id, step: "offer", schoolId: row.school_id, where: "visits", schoolName: name, label: `${name} offered a tour time: accept it or ask for another` });
    }
    const unshared =
      (row.tour_date && row.tour_status === "confirmed" && row.tour_shared_at === null) ||
      (row.tour2_date && row.tour2_status === "confirmed" && row.tour2_shared_at === null);
    if (unshared) {
      add(row.family_id, { key: "share-" + row.id, step: "share", schoolId: row.school_id, where: "visits", schoolName: name, label: `${name}: tour confirmed, send the schedule to the parent` });
    }
    const toured = slots.some((s) => s.status === "completed" || (s.status === "confirmed" && s.date < today));
    if (toured && !(row.feedback_text || "").trim()) {
      add(row.family_id, { key: "feedback-" + row.id, step: "feedback", schoolId: row.school_id, where: "visits", schoolName: name, label: `${name}: the tour has happened, get the family's feedback` });
    }
    const emailed = row.enquiry_sent_at || row.enquiry_skipped_at;
    if (!emailed && (row.availability_status || "awaiting") === "awaiting" && slots.length === 0) {
      add(row.family_id, { key: "enquiry-" + row.id, step: "enquiry", schoolId: row.school_id, where: "emails", schoolName: name, label: `${name}: availability email not sent yet` });
    }
  }
  for (const [k, sug] of assessBySchool) {
    const row = (rows || []).find((r) => r.family_id === sug.family_id && String(r.school_id) === String(sug.school_id));
    const name = row?.school?.name || "A school";
    add(sug.family_id, { key: "assess-" + k, step: "assessment_dates", schoolId: sug.school_id, where: "applications", schoolName: name, label: `${name} sent assessment dates: choose the right one` });
  }
  // An open offer: the family has to say yes or no, by a date if the school gave one.
  for (const o of offers || []) {
    const familyId = o.child?.family_id;
    if (!familyId) continue;
    const kid = o.child?.preferred_name || o.child?.first_name || o.child?.full_name || "a child";
    const name = o.school?.name || "A school";
    const by = o.offer_decision_by;
    const late = by && by < today;
    add(familyId, {
      key: "offerplace-" + o.id,
      step: "offer_place",
      schoolId: o.school_id,
      where: "applications",
      schoolName: name,
      dueDate: by || null,
      isOverdue: !!late,
      label: by
        ? `${name} offered ${kid} a place: ${late ? "the reply was due" : "reply by"} ${niceDay(by)}`
        : `${name} offered ${kid} a place: accept or decline, and record the deadline`,
    });
  }
  return out;
}

// One plain line on what to do, for the Today list.
export const ACTION_HINT = {
  reply: "Open the school and read what they said, then accept or reply.",
  offer: "Accept the time with the family, or ask the school for another.",
  share: "Send the confirmed tour schedule to the parent.",
  feedback: "Ask the family how the tour went and save it.",
  enquiry: "Send the school the availability email.",
  assessment_dates: "Open the school's application and press Use this date on the right one.",
  offer_place: "Check with the family, then accept or decline the place.",
};
