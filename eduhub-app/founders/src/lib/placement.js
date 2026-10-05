// Which school each child ended up at (September 2026, founders' round).
// A child counts as placed at a school when their application there is
// "Offer accepted", or a start date has been saved for them on Placement.
// Nothing is written anywhere when a child is placed -- the other schools
// are only *shown* as closed, so undoing the placement reopens them.

const norm = (s) => String(s || "").trim().toLowerCase();

// Search rounds (addendum 84): each child has their own search. Round 1 is
// implicit; "Start new round" adds a row, and from then on only an offer
// accepted in the *current* round (or a start date saved after it began)
// counts as placed. Earlier rounds are kept as history.
export function roundInfoByChild(rounds = []) {
  const out = {};
  rounds.forEach((r) => {
    if (!out[r.child_id] || r.round_number > out[r.child_id].number) {
      out[r.child_id] = {
        number: r.round_number,
        startedAt: r.started_at,
        reason: r.reason || null,
        dropped: new Set((r.dropped_school_ids || []).map(String)),
      };
    }
  });
  return out;
}

export const roundOf = (info, childId) => info?.[childId]?.number || 1;
export const inCurrentRound = (app, info) => (app.round_number || 1) >= roundOf(info, app.child_id);

export function placedByChild({ children = [], applicationsByChild = {}, placements = [], schools = [], rounds = [] }) {
  const byName = Object.fromEntries(schools.map((s) => [norm(s.name), s]));
  const info = roundInfoByChild(rounds);
  const out = {};
  // Hidden (non-enumerable) so Object.entries(placed) still lists children
  // only, while the closing helpers below can see the rounds.
  Object.defineProperty(out, "__rounds", { value: info, enumerable: false });
  children.forEach((c) => {
    const startedAt = info[c.id]?.startedAt ? new Date(info[c.id].startedAt).getTime() : null;
    const accepted = (applicationsByChild[c.id] || []).find(
      (a) => a.status === "offer_accepted" && inCurrentRound(a, info)
    );
    const childPlacements = placements.filter(
      (p) => p.child_id === c.id && (startedAt == null || new Date(p.created_at).getTime() >= startedAt)
    );
    const placement = childPlacements[0];
    if (!accepted && !placement) return;
    const schoolId = accepted?.school_id || byName[norm(placement?.school_name)]?.id || null;
    const schoolName =
      accepted?.schoolName ||
      schools.find((s) => s.id === schoolId)?.name ||
      placement?.school_name ||
      "their new school";
    const start =
      childPlacements.find((p) => norm(p.school_name) === norm(schoolName))?.start_date ||
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
  const info = placed?.__rounds;
  const app = apps.find(
    (a) => a.child_id === childId && String(a.school_id) === String(schoolId) && inCurrentRound(a, info)
  );
  if (closedForChild(placed, childId, schoolId, schoolName, keepOpen || app?.keep_open)) return "placed";
  // Not carried over into this child's new search round.
  if (!placed[childId] && !keepOpen && !app && info?.[childId]?.dropped.has(String(schoolId))) return "dropped";
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
  if (reasons.every((r) => r === "dropped")) return "dropped";
  return "mixed";
}

export const CLOSED_TEXT = {
  placed: "every child has a place elsewhere",
  declined: "the school declined",
  withdrawn: "withdrawn",
  dropped: "it was not carried over into the new search",
  mixed: "no child is going ahead here",
};
