import { useEffect, useState } from "react";
import { listShortlistForFamily } from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import { packageLabel } from "../data/packages";
import { applicationStatus } from "../lib/workflow";
import "./panels.css";

const TOUR_STATUS_LABEL = { offered: "Offered", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled" };

function formatTourDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// The Overview tab (September 2026 change request) -- one plain list of the
// basics, no card-per-topic sectioning. Tours are fetched here rather than
// passed down, since nothing else on this page already loads the shortlist.
export default function OverviewPanel({ family, displayName, namedParents, familyChildren, applicationsByChild }) {
  const [tours, setTours] = useState([]);
  const [toursLoaded, setToursLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listShortlistForFamily(family.id)
      .then((rows) => {
        if (cancelled) return;
        setTours((rows || []).filter((r) => r.tour_date).sort((a, b) => a.tour_date.localeCompare(b.tour_date)));
      })
      .catch(() => {
        if (!cancelled) setTours([]);
      })
      .finally(() => {
        if (!cancelled) setToursLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [family.id]);

  const [mother, father] = namedParents;
  const childNames = familyChildren.map((c, i) => displayNameForChild(c, i));

  // One line per application, across every child -- "made application"
  // should show up here without anyone having to go dig through the
  // Applications tab.
  const multipleChildren = familyChildren.length > 1;
  const applications = familyChildren.flatMap((child, i) => {
    const childName = displayNameForChild(child, i);
    return (applicationsByChild?.[child.id] || [])
      .filter((a) => a.status !== "withdrawn")
      .map((a) => {
        const line = `${a.schoolName || "Unknown school"} \u2014 ${applicationStatus(a.status).label}`;
        return multipleChildren ? `${childName}: ${line}` : line;
      });
  });

  return (
    <section className="family-detail-card">
      <div className="rec-grid">
        <div className="rec-field">
          <span className="rec-field-label">Family</span>
          <span className="rec-field-value">{displayName}</span>
        </div>

        <div className="rec-field">
          <span className="rec-field-label">Membership</span>
          <span className={"rec-field-value" + (family.membership_type ? "" : " is-empty")}>
            {family.membership_type ? packageLabel(family.membership_type) : "Not set"}
          </span>
        </div>

        <div className="rec-field">
          <span className="rec-field-label">Mother</span>
          <span className={"rec-field-value" + (mother?.full_name ? "" : " is-empty")}>
            {mother?.full_name || "Not on file"}
            {(mother?.email || mother?.phone) && <> — {[mother.email, mother.phone].filter(Boolean).join(" · ")}</>}
          </span>
        </div>

        <div className="rec-field">
          <span className="rec-field-label">Father</span>
          <span className={"rec-field-value" + (father?.full_name ? "" : " is-empty")}>
            {father?.full_name || "Not on file"}
            {(father?.email || father?.phone) && <> — {[father.email, father.phone].filter(Boolean).join(" · ")}</>}
          </span>
        </div>

        <div className="rec-field rec-field-wide">
          <span className="rec-field-label">Children</span>
          <span className={"rec-field-value" + (childNames.length ? "" : " is-empty")}>
            {childNames.length ? childNames.join(", ") : "None on file yet"}
          </span>
        </div>

        <div className="rec-field rec-field-wide">
          <span className="rec-field-label">Household address</span>
          <span className={"rec-field-value" + (family.home_address ? "" : " is-empty")}>
            {family.home_address || "Not on file"}
          </span>
        </div>

        <div className="rec-field rec-field-wide">
          <span className="rec-field-label">Applications</span>
          <span className={"rec-field-value" + (applications.length ? "" : " is-empty")}>
            {applications.length ? applications.join("\n") : "None made yet"}
          </span>
        </div>

        <div className="rec-field rec-field-wide">
          <span className="rec-field-label">Tours</span>
          {!toursLoaded ? (
            <span className="rec-field-value is-empty">Loading…</span>
          ) : tours.length === 0 ? (
            <span className="rec-field-value is-empty">None booked yet</span>
          ) : (
            <span className="rec-field-value">
              {tours
                .map(
                  (t) =>
                    `${t.school?.name || "Unknown school"} — ${formatTourDate(t.tour_date)}` +
                    (t.tour_status ? ` · ${TOUR_STATUS_LABEL[t.tour_status] || t.tour_status}` : "")
                )
                .join("\n")}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
