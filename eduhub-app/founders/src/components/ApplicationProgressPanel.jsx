import { displayNameForChild } from "../lib/completeness";
import { applicationStatus } from "../lib/workflow";
import "./panels.css";
import "./OverviewPanel.css";

// Overview: once the tours have happened, where is each child up to?
// (Miss Lyndsay, 8 Oct 2026.) Read straight off the Applications tab data,
// so nothing extra to fill in: placed at, offers waiting, applications still
// in progress. Declined and withdrawn schools are only counted, not listed.
const GROUPS = [
  { key: "placed", label: "Placed at", tone: "good", statuses: ["offer_accepted"] },
  { key: "offers", label: "Offers", tone: "good", statuses: ["offer"] },
  { key: "progress", label: "In progress", tone: "wait", statuses: ["draft", "submitted", "assessment_booked", "under_review", "waitlisted"] },
];

export default function ApplicationProgressPanel({ familyChildren, applicationsByChild, onGoToApplications }) {
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
                      {list.map((a) => (
                        <li key={a.id} className={"ov-progress-item is-" + g.tone}>
                          <span className="ov-progress-school">{a.schoolName || "School"}</span>
                          {g.key === "progress" && (
                            <span className="ov-progress-status">{applicationStatus(a.status).label}</span>
                          )}
                        </li>
                      ))}
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
