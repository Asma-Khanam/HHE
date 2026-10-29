// "What needs a person to act, and where?" -- worked out from each family's shortlist
// (29 Oct 2026 call: any consultant should open a family, or the Today view, and see at
// once what needs doing, without checking every file). Every item is something for US to do.
// Things we are waiting on (a school reply, the parent) are not actions and never appear here.

const dubaiToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });

const TABS = { visits: "School visits" };
export const actionWhere = (a) => TABS[a.where] || a.where;

// rows: school_shortlist rows with { school: { name } }; suggestions: unresolved school_reply_suggestions.
// Returns { [familyId]: [{ key, where, label, schoolName }] }
export function computeFamilyActions(rows, suggestions) {
  const today = dubaiToday();
  const sugByRow = new Set((suggestions || []).map((s) => s.shortlist_id));
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
      add(row.family_id, { key: "reply-" + row.id, where: "visits", schoolName: name, label: `${name} replied: check what they said` });
    }
    if (slots.some((s) => (s.status || "offered") === "offered")) {
      add(row.family_id, { key: "offer-" + row.id, where: "visits", schoolName: name, label: `${name} offered a tour time: accept it or ask for another` });
    }
    const toured = slots.some((s) => s.status === "completed" || (s.status === "confirmed" && s.date < today));
    if (toured && !(row.feedback_text || "").trim()) {
      add(row.family_id, { key: "feedback-" + row.id, where: "visits", schoolName: name, label: `${name}: the tour has happened, get the family's feedback` });
    }
    const emailed = row.enquiry_sent_at || row.enquiry_skipped_at;
    if (!emailed && (row.availability_status || "awaiting") === "awaiting" && slots.length === 0) {
      add(row.family_id, { key: "enquiry-" + row.id, where: "visits", schoolName: name, label: `${name}: availability email not sent yet` });
    }
  }
  return out;
}
