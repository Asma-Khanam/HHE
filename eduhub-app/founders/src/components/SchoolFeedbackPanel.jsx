import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listFeedbackForSchool, friendlyError } from "../lib/staffData";
import "./panels.css";

const stars = (n) => "\u2605".repeat(n || 0) + "\u2606".repeat(5 - (n || 0));
const when = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

// A school's Feedback tab: every family's tour review in one place, plus our
// own visit notes. Families write theirs from their dashboard; our notes are
// written on that family's School visits tab. Both live on the family's
// shortlist row, so this only reads.
export default function SchoolFeedbackPanel({ schoolId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listFeedbackForSchool(schoolId)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && (setRows([]), setError(friendlyError(e, "Couldn't load feedback. Has addendum 85 been run?"))));
    return () => {
      alive = false;
    };
  }, [schoolId]);

  const average = useMemo(() => {
    const ratings = (rows || []).map((r) => r.family_feedback_rating).filter(Boolean);
    return ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  }, [rows]);

  if (!rows) return <section className="family-detail-card"><p className="family-detail-hint">Loading…</p></section>;

  return (
    <section className="family-detail-card">
      <div className="panel-head">
        <h2>
          Tour feedback
          {average != null && (
            <span style={{ marginLeft: 10, color: "#b8902f", fontSize: ".95rem" }}>
              {stars(Math.round(average))} {average.toFixed(1)} from {rows.filter((r) => r.family_feedback_rating).length} famil
              {rows.filter((r) => r.family_feedback_rating).length === 1 ? "y" : "ies"}
            </span>
          )}
        </h2>
      </div>
      <p className="family-detail-hint">
        What families said after touring this school, with our own notes from the visit. Families add theirs from their
        dashboard; ours are added on the family&rsquo;s School visits tab.
      </p>
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
      {rows.length === 0 && !error && <p className="family-detail-hint">No feedback yet.</p>}
      <ul className="ref-list">
        {rows.map((r) => (
          <li key={r.id} className="ref-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
            <div>
              <Link to={`/staff/families/${r.family_id}?tab=visits`}><strong>{r.familyName}</strong></Link>
              {r.tour_date && <span className="pl-checkin"> · toured {when(r.tour_date)}</span>}
            </div>
            {(r.family_feedback_rating || r.family_feedback_text) && (
              <div>
                <span style={{ color: "#b8902f" }}>{r.family_feedback_rating ? stars(r.family_feedback_rating) : ""}</span>{" "}
                <em>Family{r.family_feedback_at ? `, ${when(r.family_feedback_at)}` : ""}:</em>{" "}
                {r.family_feedback_text || "no comment"}
              </div>
            )}
            {(r.feedback_text || r.feedback_rating) && (
              <div>
                <em>Our notes{r.feedback_at ? `, ${when(r.feedback_at)}` : ""}:</em> {r.feedback_text || ""}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
