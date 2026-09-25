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
// Declined or withdrawn there counts as closed for that child too.
export function schoolClosed(placed, childIds, schoolId, apps = []) {
  if (!childIds.length) return false;
  return childIds.every((id) => {
    const app = apps.find((a) => a.child_id === id && String(a.school_id) === String(schoolId));
    if (app?.keep_open) return false;
    if (placed[id]) return String(placed[id]) !== String(schoolId);
    return app?.status === "rejected" || app?.status === "withdrawn";
  });
}

// This child's application at this school is closed (placed elsewhere).
// A consultant can mark an application "keep open" (a second school after
// a placement) so it keeps showing here even though the child is placed.
export function appClosed(placed, app) {
  if (app.keep_open) return false;
  return !!placed[app.child_id] && String(placed[app.child_id]) !== String(app.school_id);
}
