import { packageByKey } from "../data/packages";

// What a family's package includes: the package's own allowance unless staff
// set an override for this family (family_package_allowance, addendum 91).
// null = nothing to show (no package, or a package with no tours/applications).
export function allowanceFor(packageKey, override) {
  const base = packageByKey(packageKey)?.included || null;
  const tours = override?.tours_included ?? base?.tours ?? null;
  const applications = override?.applications_included ?? base?.applications ?? null;
  if (!(tours > 0) && !(applications > 0)) return null;
  return { tours, applications };
}

// How much of it has been used. A tour counts once it is booked (not just
// offered) and not cancelled; "done" once it has happened. An application
// counts once it has been submitted (not a draft) and not withdrawn.
export function countUsage({ shortlist, applications }) {
  let toursUsed = 0;
  let toursDone = 0;
  for (const row of shortlist || []) {
    for (const [date, status] of [
      [row.tour_date, row.tour_status],
      [row.tour2_date, row.tour2_status],
    ]) {
      if (!date || status === "cancelled" || status === "offered") continue;
      toursUsed += 1;
      if (status === "completed") toursDone += 1;
    }
  }
  const liveApps = (applications || []).filter((a) => a.status !== "draft" && a.status !== "withdrawn");
  const applicationsUsed = liveApps.length;
  // Per-child count (Miss Lyndsay, 12 Oct 2026): the package's application
  // allowance is per child, not per family. Map child_id -> live count.
  const applicationsByChild = {};
  for (const a of liveApps) {
    if (!a.child_id) continue;
    applicationsByChild[a.child_id] = (applicationsByChild[a.child_id] || 0) + 1;
  }
  return { toursUsed, toursDone, applicationsUsed, applicationsByChild };
}
