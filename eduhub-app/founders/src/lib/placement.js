// Which school each child ended up at (September 2026, founders' round).
// A child counts as placed at a school when their application there is
// "Offer accepted", or a start date has been saved for them on Placement.
// Nothing is written anywhere when a child is placed -- the other schools
// are only *shown* as closed, so undoing the placement reopens them.

const norm = (s) => String(s || "").trim().toLowerCase();

export function placedByChild({ children = [], applicationsByChild = {}, placements = [], schools = [] }) {
  const byName = Object.fromEntries(schools.map((s) => [norm(s.name), s]));
  const out = {};
  children.forEach((c) => {
    const accepted = (applicationsByChild[c.id] || []).find((a) => a.status === "offer_accepted");
    const placement = placements.find((p) => p.child_id === c.id);
    if (!accepted && !placement) return;
    const schoolId = accepted?.school_id || byName[norm(placement?.school_name)]?.id || null;
    const schoolName =
      accepted?.schoolName ||
      schools.find((s) => s.id === schoolId)?.name ||
      placement?.school_name ||
      "their new school";
    const start =
      placements.find((p) => p.child_id === c.id && norm(p.school_name) === norm(schoolName))?.start_date ||
      (!accepted ? placement?.start_date : null);
    out[c.id] = { schoolId, schoolName, startDate: start || null };
  });
  return out;
}

// Is this child's application / row at this school closed because the
// child was placed somewhere else? A consultant can mark a specific school
// "keep open" (e.g. a second application after a placement) so it stays
// live even though the child is placed elsewhere -- the placement and every
// other closed school are untouched.
export function closedForChild(placed, childId, schoolId, schoolName, keepOpen) {
  if (keepOpen) return false;
  const p = placed[childId];
  if (!p) return false;
  if (p.schoolId && schoolId) return String(p.schoolId) !== String(schoolId);
  return norm(p.schoolName) !== norm(schoolName);
}

// A school visit row is per family, so it only closes once every child is
// placed, and none of them at this school.
export function rowClosed(placed, children, schoolId, schoolName) {
  if (!children.length) return false;
  return children.every((c) => placed[c.id] && closedForChild(placed, c.id, schoolId, schoolName));
}

export function placedHere(placed, children, schoolId, schoolName) {
  return children.filter((c) => placed[c.id] && !closedForChild(placed, c.id, schoolId, schoolName));
}

export function shortDate(iso) {
  if (!iso) return "";
  return new Date(String(iso).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function oneMonthAfter(iso) {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// Founders (25 Sept 2026): a declined (or withdrawn) application closes too.
// For one child at one school: why is it closed, if it is?
export function childClosedReason(placed, childId, schoolId, schoolName, apps = [], keepOpen) {
  const app = apps.find((a) => a.child_id === childId && String(a.school_id) === String(schoolId));
  if (closedForChild(placed, childId, schoolId, schoolName, keepOpen || app?.keep_open)) return "placed";
  if (app?.status === "rejected") return "declined";
  if (app?.status === "withdrawn") return "withdrawn";
  return null;
}

// A school visit row closes once every child is placed elsewhere or was
// declined / withdrawn here. Returns null (open) or a short reason.
export function rowClosedReason(placed, children, schoolId, schoolName, apps = [], keepOpen) {
  if (!children.length) return null;
  const reasons = children.map((c) => childClosedReason(placed, c.id, schoolId, schoolName, apps, keepOpen));
  if (reasons.some((r) => !r)) return null;
  if (reasons.every((r) => r === "placed")) return "placed";
  if (reasons.every((r) => r === "declined")) return "declined";
  if (reasons.every((r) => r === "withdrawn")) return "withdrawn";
  return "mixed";
}

export const CLOSED_TEXT = {
  placed: "every child has a place elsewhere",
  declined: "the school declined",
  withdrawn: "withdrawn",
  mixed: "no child is going ahead here",
};
