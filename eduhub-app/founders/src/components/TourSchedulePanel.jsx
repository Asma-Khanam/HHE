import { useEffect, useState } from "react";
import { listShortlistForFamily, friendlyError } from "../lib/staffData";
import "./panels.css";
import "./OverviewPanel.css";

const STATUS_LABEL = { offered: "Offered by the school", confirmed: "Confirmed", completed: "Done" };

function fmtTime(t) {
  return t ? String(t).slice(0, 5) : "";
}

// The Overview's live tour schedule: every tour that is still on, read straight
// off the family's shortlist (the same rows the School visits tab edits), so a
// date change or cancellation there shows up here with no extra step.
// Cancelled tours drop out; the earliest comes first.
export default function TourSchedulePanel({ familyId, onGoToVisits }) {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listShortlistForFamily(familyId)
      .then((rows) => {
        if (!alive) return;
        const out = [];
        for (const r of rows) {
          const feedback =
            r.feedback_text || r.feedback_rating
              ? {
                  rating: r.feedback_rating || 0,
                  text: r.feedback_text || "",
                  by: r.feedback_by || null,
                }
              : null;
          let seenFeedback = false;
          for (const p of ["tour_", "tour2_"]) {
            const date = r[p + "date"];
            const status = r[p + "status"];
            if (!date || status === "cancelled") continue;
            // Attach the family's own rating / comment to the last completed
            // tour on this shortlist row -- so the staff see at a glance
            // what the family thought of the visit without hopping pages.
            const attach = feedback && (status === "completed" || date < new Date().toISOString().slice(0, 10));
            out.push({
              key: r.id + p,
              date,
              start: r[p + "start_time"],
              end: r[p + "end_time"],
              status,
              shared: r[p + "shared_at"],
              school: r.school?.name || "School",
              feedback: attach && !seenFeedback ? feedback : null,
            });
            if (attach) seenFeedback = true;
          }
        }
        out.sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));
        setTours(out);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(friendlyError(err, "Couldn't load the tour schedule."));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [familyId]);

  const today = new Date().toISOString().slice(0, 10);
  const upcomingCount = tours.filter((t) => t.date >= today && t.status !== "completed").length;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          Tour schedule
          {upcomingCount > 0 && <span className="panel-count" title="Upcoming tours">{upcomingCount}</span>}
        </h2>
        {onGoToVisits && (
          <button type="button" className="panel-btn" onClick={onGoToVisits}>
            Open school visits
          </button>
        )}
      </div>
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
      {loading ? (
        <p className="panel-hint">Loading…</p>
      ) : tours.length === 0 ? (
        <p className="panel-hint">No tours booked yet.</p>
      ) : (
        <div className="ov-t2-list">
          {tours.map((t) => {
            const d = new Date(t.date + "T00:00:00");
            const past = t.date < today || t.status === "completed";
            return (
              <div key={t.key} className={"ov-t2" + (past ? " is-past" : "")}>
                <div className="ov-t2-dt">
                  <b>{d.getDate()}</b>
                  {d.toLocaleDateString(undefined, { month: "short", weekday: "short" })}
                </div>
                <div className="ov-t2-body">
                  <div className="ov-t2-school">{t.school}</div>
                  <div className="ov-t2-sub">
                    {t.start ? fmtTime(t.start) : "Time to be set"}
                    {t.end ? `–${fmtTime(t.end)}` : ""} ·{" "}
                    <span className={t.status === "confirmed" ? "ov-t2-ok" : ""}>{STATUS_LABEL[t.status] || t.status}</span>
                    {t.status === "confirmed" && t.shared ? " · on the parent's app" : ""}
                    {t.status === "confirmed" && t.shared === null ? " · not sent to the parent yet" : ""}
                  </div>
                  {t.feedback && (
                    <div className="ov-t2-fb" title={t.feedback.by === "family" ? "From the family" : "Noted by us"}>
                      {t.feedback.rating > 0 && (
                        <span className="ov-tour-stars" aria-label={`${t.feedback.rating} out of 5`}>
                          {"★".repeat(t.feedback.rating)}
                          {"☆".repeat(5 - t.feedback.rating)}
                        </span>
                      )}{" "}
                      {t.feedback.text} <em>({t.feedback.by === "family" ? "from the family" : "noted by us"})</em>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
