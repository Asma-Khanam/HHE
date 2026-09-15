import { useEffect, useState } from "react";
import { useApplicationData } from "../context/ApplicationDataContext";
import { fetchFamilyTimetable } from "../lib/timetableData";
import { displayNameForChild } from "../lib/completeness";
import { IconSchool } from "../components/icons";
import "./TimetablePage.css";

const TOUR_STATUS_LABEL = {
  offered: "Offered",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

const AVAILABILITY_LABEL = {
  awaiting: "Awaiting reply",
  yes: "Place available",
  some_year_groups: "Some year groups only",
  waitlist: "Waitlist",
  no: "No — full",
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  // tour_date is a plain date (no time zone) — parse it as one so it never
  // shifts a day depending on where the family happens to be reading this.
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = ((hour + 11) % 12) + 1;
  return `${hour12}${m && m !== "00" ? ":" + m : ""}${suffix}`;
}

function timeRange(row) {
  if (!row.tour_start_time) return "";
  return row.tour_end_time ? `${formatTime(row.tour_start_time)}–${formatTime(row.tour_end_time)}` : formatTime(row.tour_start_time);
}

function Stars({ rating }) {
  if (!rating) return null;
  return (
    <span className="tt-stars" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={"tt-star" + (i < rating ? " is-filled" : "")}>
          ★
        </span>
      ))}
    </span>
  );
}

// The family's own school visits, all in one place: the tours booked for
// them, on-the-day details, and where each school on their shortlist stands
// — the read-only mirror of the founders' School shortlist panel.
export default function TimetablePage() {
  const { familyId, data } = useApplicationData();
  const [rows, setRows] = useState([]);
  const [childStatus, setChildStatus] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const children = data?.children || [];

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { shortlist, childStatus: cs } = await fetchFamilyTimetable(familyId);
        if (cancelled) return;
        setRows(shortlist);
        setChildStatus(cs);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err.message || "Couldn't load your school timetable.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  if (status === "loading") return <p className="dashboard-status">Loading your timetable...</p>;
  if (status === "error") return <p className="dashboard-status">{error}</p>;

  const tours = rows
    .filter((r) => r.tour_date && r.tour_status !== "cancelled")
    .sort((a, b) => {
      const ad = a.tour_date + (a.tour_start_time || "");
      const bd = b.tour_date + (b.tour_start_time || "");
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    });

  const childNameById = new Map(children.map((c, i) => [c.id, displayNameForChild(c, i)]));

  return (
    <div className="tt">
      <header className="tt-head">
        <h1>Your school visits</h1>
        <p className="tt-head-sub">Tours we've booked for you, and where things stand with each school on your shortlist.</p>
      </header>

      <section className="tt-card">
        <div className="tt-card-head">
          <h2>Upcoming tours</h2>
        </div>
        {tours.length === 0 ? (
          <p className="tt-empty">Nothing booked yet — this will fill in as soon as a tour is arranged.</p>
        ) : (
          <ul className="tt-tour-list">
            {tours.map((row) => (
              <li key={row.id} className="tt-tour-row">
                <div className="tt-tour-when">
                  <div className="tt-tour-date">{formatDate(row.tour_date)}</div>
                  {timeRange(row) && <div className="tt-tour-time">{timeRange(row)}</div>}
                </div>
                <div className="tt-tour-main">
                  <div className="tt-tour-school">
                    <IconSchool size={16} />
                    <span>{row.school?.name || "School"}</span>
                    {row.tour_status && (
                      <span className={"tt-chip is-" + row.tour_status}>{TOUR_STATUS_LABEL[row.tour_status]}</span>
                    )}
                  </div>
                  {(row.tour_gate || row.tour_building || row.tour_parking || row.tour_ask_for || row.tour_bring) && (
                    <dl className="tt-tour-details">
                      {row.tour_gate && (
                        <>
                          <dt>Gate</dt>
                          <dd>{row.tour_gate}</dd>
                        </>
                      )}
                      {row.tour_building && (
                        <>
                          <dt>Building</dt>
                          <dd>{row.tour_building}</dd>
                        </>
                      )}
                      {row.tour_parking && (
                        <>
                          <dt>Parking</dt>
                          <dd>{row.tour_parking}</dd>
                        </>
                      )}
                      {row.tour_ask_for && (
                        <>
                          <dt>Ask for</dt>
                          <dd>{row.tour_ask_for}</dd>
                        </>
                      )}
                      {row.tour_bring && (
                        <>
                          <dt>Bring</dt>
                          <dd>{row.tour_bring}</dd>
                        </>
                      )}
                    </dl>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tt-card">
        <div className="tt-card-head">
          <h2>Your shortlist</h2>
        </div>
        {rows.length === 0 ? (
          <p className="tt-empty">No schools on your shortlist yet.</p>
        ) : (
          <ol className="tt-shortlist-list">
            {rows.map((row, index) => {
              const rowChildStatuses = childStatus.filter((cs) => cs.shortlist_id === row.id);
              return (
                <li key={row.id} className="tt-shortlist-row">
                  <span className="tt-shortlist-number">{index + 1}.</span>
                  <div className="tt-shortlist-main">
                    <div className="tt-shortlist-name">{row.school?.name || "School"}</div>
                    {row.school?.area && <div className="tt-shortlist-area">{row.school.area}</div>}
                  </div>
                  <div className="tt-shortlist-side">
                    <span className={"tt-availability tt-availability-" + row.availability_status}>
                      {AVAILABILITY_LABEL[row.availability_status] || row.availability_status}
                    </span>
                    {rowChildStatuses.length > 0 && (
                      <div className="tt-child-chips">
                        {rowChildStatuses.map((cs) => (
                          <span key={cs.id} className="tt-child-chip">
                            {childNameById.get(cs.child_id) || "Child"}: {AVAILABILITY_LABEL[cs.availability_status] || cs.availability_status}
                          </span>
                        ))}
                      </div>
                    )}
                    {row.feedback_text || row.feedback_rating ? (
                      <div className="tt-feedback">
                        <Stars rating={row.feedback_rating} />
                        {row.feedback_text && <p className="tt-feedback-text">{row.feedback_text}</p>}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
