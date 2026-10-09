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
          for (const p of ["tour_", "tour2_"]) {
            const date = r[p + "date"];
            const status = r[p + "status"];
            if (!date || status === "cancelled") continue;
            out.push({
              key: r.id + p,
              date,
              start: r[p + "start_time"],
              end: r[p + "end_time"],
              status,
              school: r.school?.name || "School",
            });
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
