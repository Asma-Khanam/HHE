import { useEffect, useState } from "react";
import { displayNameForChild } from "../lib/completeness";
import { applicationStatus } from "../lib/workflow";
import { listFamilyApplicationFees } from "../lib/staffData";
import "./panels.css";
import "./OverviewPanel.css";

// Overview: once the tours have happened, where is each child up to?
// (Miss Lyndsay, 8 Oct 2026.) Read straight off the Applications tab data,
// so nothing extra to fill in: placed at, offers waiting, applications still
// in progress. Declined and withdrawn schools are only counted, not listed.
//
// Each school line now also carries the application fee at a glance (Miss
// Lyndsay, 12 Oct 2026): a chip reads Paid / Unpaid / Sent / Direct / No
// fee for that school so staff can see where fees stand without opening
// the Applications tab.
const GROUPS = [
  { key: "placed", label: "Placed at", tone: "good", statuses: ["offer_accepted"] },
  { key: "offers", label: "Offers", tone: "good", statuses: ["offer"] },
  { key: "progress", label: "In progress", tone: "wait", statuses: ["draft", "submitted", "assessment_booked", "under_review", "waitlisted"] },
];

function feeChipFor(fees) {
  if (!fees || fees.length === 0) return { label: "No fee", tone: "muted" };
  const rows = fees.filter((f) => f.status !== "waived");
  if (rows.length === 0) return { label: "Waived", tone: "muted" };
  if (rows.every((f) => f.status === "paid")) return { label: "Paid", tone: "good" };
  if (rows.some((f) => f.paid_direct_by_family) && rows.every((f) => f.status === "paid" || f.paid_direct_by_family))
    return { label: "Direct", tone: "good" };
  const unpaid = rows.filter((f) => f.status !== "paid");
  const anySent = unpaid.some((f) => f.sent_to_family_at);
  return { label: anySent ? "Sent · unpaid" : "Unpaid", tone: "warn" };
}

export default function ApplicationProgressPanel({ familyId, familyChildren, applicationsByChild, onGoToApplications }) {
  const [feesByApp, setFeesByApp] = useState({});

  useEffect(() => {
    if (!familyId) return;
    let alive = true;
    listFamilyApplicationFees(familyId)
      .then((rows) => {
        if (!alive) return;
        const by = {};
        (rows || []).forEach((f) => {
          (by[f.application_id] = by[f.application_id] || []).push(f);
        });
        setFeesByApp(by);
      })
      .catch(() => alive && setFeesByApp({}));
    return () => {
      alive = false;
    };
  }, [familyId]);

  const rows = familyChildren
    .map((child, i) => {
      const apps = (applicationsByChild?.[child.id] || []).filter((a) => a.school_id || a.schoolName);
      return { child, name: displayNameForChild(child, i), apps };
    })
    .filter((r) => r.apps.length > 0);

  if (rows.length === 0) return null;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Applications &amp; offers</h2>
        {onGoToApplications && (
          <button type="button" className="panel-btn" onClick={onGoToApplications}>
            Open applications
          </button>
        )}
      </div>

      <div className="ov-progress">
        {rows.map(({ child, name, apps }) => {
          const closed = apps.filter((a) => a.status === "rejected" || a.status === "withdrawn").length;
          return (
            <div className="ov-progress-child" key={child.id}>
              <strong className="ov-progress-name">{name}</strong>
              {GROUPS.map((g) => {
                const list = apps.filter((a) => g.statuses.includes(a.status));
                if (list.length === 0) return null;
                return (
                  <div className="ov-progress-group" key={g.key}>
                    <span className="ov-sub">{g.label}</span>
                    <ul className="ov-progress-list">
                      {list.map((a) => {
                        const chip = feeChipFor(feesByApp[a.id]);
                        return (
                          <li key={a.id} className={"ov-progress-item is-" + g.tone}>
                            <span className="ov-progress-school">{a.schoolName || "School"}</span>
                            {g.key === "progress" && (
                              <span className="ov-progress-status">{applicationStatus(a.status).label}</span>
                            )}
                            <span className={"ov-fee-chip is-" + chip.tone} title="Application fee">{chip.label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
              {closed > 0 && (
                <span className="ov-same">
                  {closed} declined or withdrawn
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
