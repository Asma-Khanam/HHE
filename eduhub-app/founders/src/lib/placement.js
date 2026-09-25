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
// child was placed somewhere else?
export function closedForChild(placed, childId, schoolId, schoolName) {
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
