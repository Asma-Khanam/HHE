import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useApplicationData } from "../context/ApplicationDataContext";
import { fetchFamilyTimetable, fetchFamilyApplications } from "../lib/timetableData";
import { packageLabel } from "../data/packages";
import { allowanceFor, countUsage } from "../lib/packageUsage";
import PackageMeter from "./PackageMeter";
import "./PackageUsageCard.css";

// Dashboard: "Your package" -- how many of the school tours and applications
// included in the family's package have been used (Miss Lyndsay's request,
// Oct 2026). Hidden when the family has no package or it includes neither.
export default function PackageUsageCard() {
  const { familyId, data } = useApplicationData();
  const packageKey = data?.family?.membership_type || "";
  const childKey = (data?.children || []).map((c) => c.id).join(",");
  const [usage, setUsage] = useState(null);
  const [override, setOverride] = useState(null);

  useEffect(() => {
    if (!familyId || !packageKey) return undefined;
    let cancelled = false;
    const childIds = childKey ? childKey.split(",") : [];
    Promise.all([
      fetchFamilyTimetable(familyId),
      fetchFamilyApplications(childIds).catch(() => []),
      supabase
        .from("family_package_allowance")
        .select("tours_included, applications_included")
        .eq("family_id", familyId)
        .maybeSingle()
        .then((r) => r.data || null)
        .catch(() => null),
    ])
      .then(([{ shortlist }, applications, ov]) => {
        if (cancelled) return;
        setUsage(countUsage({ shortlist, applications }));
        setOverride(ov);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [familyId, packageKey, childKey]);

  const allowance = allowanceFor(packageKey, override);
  if (!allowance || !usage) return null;
  const finished =
    (!(allowance.tours > 0) || usage.toursUsed >= allowance.tours) &&
    (!(allowance.applications > 0) || usage.applicationsUsed >= allowance.applications);

  return (
    <section className="dash-card pkg-card">
      <div className="dash-card-head">
        <h2>Your package</h2>
        <span className="pkg-card-chip">{packageLabel(packageKey)}</span>
      </div>
      <div className="pkg-card-meters">
        <PackageMeter label="School tours" used={usage.toursUsed} done={usage.toursDone} total={allowance.tours} />
        <PackageMeter label="Applications" used={usage.applicationsUsed} total={allowance.applications} />
      </div>
      {finished && (
        <p className="pkg-card-note">
          You&rsquo;ve used everything included in your package. If you&rsquo;d like more tours or applications, just
          let your consultant know.
        </p>
      )}
    </section>
  );
}
