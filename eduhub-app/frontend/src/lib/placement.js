// Once a child has accepted an offer, their other schools are closed
// (founders, 25 Sept 2026). Nothing is changed in the data -- a school only
// *shows* as closed, so if the placement falls through it opens again.

export function placedByChild(applications) {
  const out = {};
  (applications || []).forEach((a) => {
    if (a.status === "offer_accepted") out[a.child_id] = a.school_id;
  });
  return out;
}

// A shortlist row is the whole family's, so it closes only when every child
// is placed and none of them at this school.
export function schoolClosed(placed, childIds, schoolId) {
  if (!childIds.length) return false;
  return childIds.every((id) => placed[id] && String(placed[id]) !== String(schoolId));
}

// This child's application at this school is closed (placed elsewhere).
export function appClosed(placed, app) {
  return !!placed[app.child_id] && String(placed[app.child_id]) !== String(app.school_id);
}
