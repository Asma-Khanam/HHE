import { useEffect, useState } from "react";
import ActivityFeed from "../components/ActivityFeed";
import { loadActivity } from "../lib/activity";
import "./ActivityPage.css";

// Everything the team has done, newest first (2 Nov 2026): who changed what,
// who added what, who marked what. The list itself lives in ActivityFeed so a
// family's History tab can show the same thing for one family.
export default function ActivityPage() {
  const [hasUnrecorded, setHasUnrecorded] = useState(false);
  useEffect(() => {
    let alive = true;
    loadActivity({ sinceDays: 30 })
      .then((r) => alive && setHasUnrecorded(r.some((x) => !x.who)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="activity-page">
      <div className="activity-header">
        <div>
          <h1>Activity</h1>
          <p className="activity-sub">Everything the team has changed, added or marked, newest first.</p>
          {hasUnrecorded && (
            <p className="activity-note">
              Who did it is only recorded from 2 November 2026, when this trail was added. Before that it says “Not recorded”. After it, a change with no name was made by the system (OpenApply sync, a payment, the family’s app or a scheduled job) and says so.
            </p>
          )}
        </div>
      </div>
      <ActivityFeed />
    </div>
  );
}
