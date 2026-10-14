import { useEffect, useState } from "react";
import { listShortlistForFamily, friendlyError } from "../lib/staffData";
import "./panels.css";
import "./OverviewPanel.css";

const STATUS_LABEL = { offered: "Booked", confirmed: "Confirmed", completed: "Completed" };

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

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
        <ul className="ov-tours">
          {tours.map((t) => (
            <li key={t.key} className={"ov-tour" + (t.date < today || t.status === "completed" ? " is-past" : "")}>
              <span className="ov-tour-date">{fmtDate(t.date)}</span>
              <span className="ov-tour-time">{fmtTime(t.start)}{t.end ? `–${fmtTime(t.end)}` : ""}</span>
              <span className="ov-tour-school">{t.school}</span>
              {t.status && <span className="ov-pill">{STATUS_LABEL[t.status] || t.status}</span>}
              {t.feedback && (
                <span className="ov-tour-feedback" title={t.feedback.by === "family" ? "From the family" : "Noted by us"}>
                  {t.feedback.rating > 0 && (
                    <span className="ov-tour-stars" aria-label={`${t.feedback.rating} out of 5`}>
                      {"★".repeat(t.feedback.rating)}
                      {"☆".repeat(5 - t.feedback.rating)}
                    </span>
                  )}
                  {t.feedback.text && <span className="ov-tour-note">{t.feedback.text}</span>}
                  <span className="ov-tour-fby">{t.feedback.by === "family" ? "from the family" : "noted by us"}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
