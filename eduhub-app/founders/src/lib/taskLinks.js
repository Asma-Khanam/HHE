// Where a task takes you, and a plain line on where it is at (Today page).
// A task knows its family, and may know a tab, a school and a step (addendum 147).
// Tasks with no tab open the family page, as they always did.

const TAB_LABEL = {
  overview: "Overview",
  details: "Family details",
  visits: "School visits",
  applications: "Applications",
  timeline: "Timeline",
  emails: "Emails",
  meetings: "Meetings",
  documents: "Documents",
  accounting: "Accounting",
};

export function taskPath(task) {
  if (!task.family_id) return null;
  const q = new URLSearchParams();
  if (task.link_tab) q.set("tab", task.link_tab);
  if (task.link_school_id) q.set("school", task.link_school_id);
  if (task.link_step) q.set("step", task.link_step);
  const s = q.toString();
  return `/staff/families/${task.family_id}` + (s ? `?${s}` : "");
}

// The shortlist row a task is about (same family and school), if it has one.
export function taskRow(task, rows) {
  if (!task.link_school_id) return null;
  return (rows || []).find((r) => r.family_id === task.family_id && String(r.school_id) === String(task.link_school_id)) || null;
}

export function taskWhere(task, row) {
  if (!task.link_tab) return "the family page";
  const tab = TAB_LABEL[task.link_tab] || "the family page";
  const school = row?.school?.name;
  return school ? `${tab}, ${school}` : tab;
}

const shortDay = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

// One plain sentence on where it is at. Worked out from the live row each time, so it never goes stale.
export function taskState(task, row) {
  if (task.link_step === "month_checkin") return "Send the family a check-in email.";
  if (!row) return "";
  if (task.link_step === "chase" || task.link_step === "escalate") {
    if ((row.availability_status || "awaiting") !== "awaiting") {
      return "The school has replied since. Open it to see what they said.";
    }
    if (!row.enquiry_sent_at) return "The availability email has not been sent yet.";
    const asked = `Asked ${shortDay(row.enquiry_sent_at)}. No reply yet.`;
    return task.link_step === "escalate"
      ? `${asked} Call the school, or ask the family if they would like another school.`
      : asked;
  }
  return "";
}
