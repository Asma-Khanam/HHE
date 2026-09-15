import { useEffect, useState } from "react";
import { listShortlistForFamily } from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import "./panels.css";

const TOUR_STATUS_LABEL = { offered: "Offered", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled" };

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// The Overview tab (September 2026 change request) -- a one-glance summary
// so the founders don't have to open Family details, Applications and
// School visits just to answer "who is this family and where are they up
// to". Tours are fetched here rather than passed down, since nothing else
// on this page already loads the shortlist.
export default function OverviewPanel({ family, displayName, namedParents, familyChildren }) {
  const [tours, setTours] = useState([]);
  const [toursLoaded, setToursLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listShortlistForFamily(family.id)
      .then((rows) => {
        if (cancelled) return;
        setTours(
          (rows || [])
            .filter((r) => r.tour_date)
            .sort((a, b) => a.tour_date.localeCompare(b.tour_date))
        );
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

  return (
    <div className="family-detail-stack">
      <section className="family-detail-card">
        <h2>Family</h2>
        <div className="rec-grid">
          <div className="rec-field rec-field-wide">
            <span className="rec-field-label">Family</span>
            <span className="rec-field-value">{displayName}</span>
          </div>
          <div className="rec-field rec-field-wide">
            <span className="rec-field-label">Household address</span>
            <span className={"rec-field-value" + (family.home_address ? "" : " is-empty")}>
              {family.home_address || "Not on file"}
            </span>
          </div>
        </div>
      </section>

      <section className="family-detail-card">
        <h2>Parents</h2>
        <div className="rec-grid">
          {namedParents.map((p) => (
            <div className="rec-field" key={p.relationship}>
              <span className="rec-field-label">{p.relationship}</span>
              <span className={"rec-field-value" + (p.full_name ? "" : " is-empty")}>
                {p.full_name || "Not on file"}
              </span>
              {(p.email || p.phone) && (
                <span className="overview-contact-line">{[p.email, p.phone].filter(Boolean).join(" · ")}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="family-detail-card">
        <h2>
          Children
          {familyChildren.length > 0 && <span className="family-detail-card-count">{familyChildren.length}</span>}
        </h2>
        {familyChildren.length === 0 ? (
          <p className="family-detail-hint">No children on file yet.</p>
        ) : (
          <ul className="overview-plain-list">
            {familyChildren.map((c, i) => (
              <li key={c.id}>{displayNameForChild(c, i)}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="family-detail-card">
        <h2>
          Tours
          {tours.length > 0 && <span className="family-detail-card-count">{tours.length}</span>}
        </h2>
        {!toursLoaded ? (
          <p className="family-detail-hint">Loading…</p>
        ) : tours.length === 0 ? (
          <p className="family-detail-hint">No tours booked yet.</p>
        ) : (
          <ul className="overview-plain-list">
            {tours.map((t) => (
              <li key={t.id}>
                <strong>{t.school?.name || "Unknown school"}</strong> — {formatDate(t.tour_date)}
                {t.tour_status && ` · ${TOUR_STATUS_LABEL[t.tour_status] || t.tour_status}`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
