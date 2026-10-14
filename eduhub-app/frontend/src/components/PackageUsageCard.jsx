import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useApplicationData } from "../context/ApplicationDataContext";
import { fetchFamilyTimetable, fetchFamilyApplications } from "../lib/timetableData";
import { packageLabel } from "../data/packages";
import { allowanceFor, countUsage } from "../lib/packageUsage";
import PackageMeter from "./PackageMeter";
import { displayNameForChild } from "../lib/completeness";
import { CardError, CardSkeleton } from "./StatePanels";
import { IconWallet } from "./icons";
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
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!familyId || !packageKey) return undefined;
    let cancelled = false;
    setFailed(false);
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
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [familyId, packageKey, childKey, retry]);

  if (packageKey && failed) return <CardError title="Your package" onRetry={() => setRetry((n) => n + 1)} />;
  if (packageKey && !usage) return <CardSkeleton title="Your package" rows={3} />;
  const allowance = allowanceFor(packageKey, override);
  if (!allowance || !usage) return null;
  const finished =
    (!(allowance.tours > 0) || usage.toursUsed >= allowance.tours) &&
    (!(allowance.applications > 0) || usage.applicationsUsed >= allowance.applications);

  return (
    <section className="dash-card pkg-card">
      <div className="dash-card-head">
        <h2><span className="dash-card-icon dash-card-icon--neutral"><IconWallet size={16} /></span>Your package</h2>
        <span className="pkg-card-chip">{packageLabel(packageKey)}</span>
      </div>
      <div className="pkg-card-meters">
        <PackageMeter label="School tours" used={usage.toursUsed} done={usage.toursDone} total={allowance.tours} />
      </div>
      {allowance.applications > 0 && (
        <>
          <div className="pkg-card-subhead">
            <span>Applications per child</span>
            <small>{allowance.applications} included per child</small>
          </div>
          <div className="pkg-card-children">
            {(data?.children || []).map((c, i) => (
              <PackageMeter
                key={c.id}
                label={displayNameForChild(c, i) || `Child ${i + 1}`}
                used={usage.applicationsByChild?.[c.id] || 0}
                total={allowance.applications}
              />
            ))}
            {(data?.children || []).length === 0 && (
              <p className="pkg-card-note">Add a child on the Application form to see their count.</p>
            )}
          </div>
        </>
      )}
      {finished && (
        <p className="pkg-card-note">
          You&rsquo;ve used everything included in your package. If you&rsquo;d like more tours or applications, just
          let your consultant know.
        </p>
      )}
    </section>
  );
}
