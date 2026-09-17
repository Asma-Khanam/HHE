import { useEffect, useMemo, useState } from "react";
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

function timeRange(start, end) {
  if (!start) return "";
  return end ? `${formatTime(start)}–${formatTime(end)}` : formatTime(start);
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
//
// September 2026 redesign (Asma via WhatsApp: "see everything we build on
// the founders end of school and applications and see everything that
// needs to be reflected here... neat, organised, easy, seamless and
// aesthetic") -- this page had fallen behind the founders panel it mirrors
// (Primary/Secondary tour slots, the Primary choice/Backup ranking, a
// declined-school note, the fees link) and was styled in plain greys
// instead of the app's own burgundy/cream/gold look used everywhere else.
// Both are fixed here: every field the founders side can set now shows up
// here read-only, and the whole page reuses the same card/chip language as
// the rest of the app instead of its own one-off grey version.
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

  const childNameById = useMemo(() => new Map(children.map((c, i) => [c.id, displayNameForChild(c, i)])), [children]);

  // One card per school with a booked tour, holding one or two occurrences
  // (Primary tour / Secondary tour, addendum 58) rather than a flat list of
  // occurrences -- a school with both keeps its on-the-day details (gate,
  // parking, etc, which aren't duplicated per-slot) in one place instead of
  // repeating them under each date.
  const tourGroups = useMemo(() => {
    const groups = rows
      .map((row) => {
        const occurrences = [];
        const hasBoth = !!(row.tour_date && row.tour2_date);
        if (row.tour_date && row.tour_status !== "cancelled") {
          occurrences.push({
            key: `${row.id}-1`,
            label: hasBoth ? "Primary tour" : null,
            date: row.tour_date,
            time: timeRange(row.tour_start_time, row.tour_end_time),
            status: row.tour_status,
          });
        }
        if (row.tour2_date && row.tour2_status !== "cancelled") {
          occurrences.push({
            key: `${row.id}-2`,
            label: "Secondary tour",
            date: row.tour2_date,
            time: timeRange(row.tour2_start_time, row.tour2_end_time),
            status: row.tour2_status,
          });
        }
        occurrences.sort((a, b) => (a.date + (a.time || "") < b.date + (b.time || "") ? -1 : 1));
        return { row, occurrences, earliest: occurrences[0]?.date || "" };
      })
      .filter((g) => g.occurrences.length > 0);
    groups.sort((a, b) => (a.earliest < b.earliest ? -1 : a.earliest > b.earliest ? 1 : 0));
    return groups;
  }, [rows]);

  // Same ranking as the founders' School shortlist panel: the family's
  // primary choice floats to the top, a declined school sinks to the
  // bottom, everything else keeps its existing order in between.
  const sortedShortlist = useMemo(() => {
    const rank = (row) => {
      if (row.family_decision === "declined") return 3;
      if (row.priority === "primary") return 0;
      if (row.priority === "secondary") return 1;
      return 2;
    };
    return rows.map((row, index) => ({ row, index })).sort((a, b) => rank(a.row) - rank(b.row));
  }, [rows]);

  if (status === "loading") return <p className="dashboard-status">Loading your timetable...</p>;
  if (status === "error") return <p className="dashboard-status">{error}</p>;

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
        {tourGroups.length === 0 ? (
          <p className="tt-empty">Nothing booked yet — this will fill in as soon as a tour is arranged.</p>
        ) : (
          <ul className="tt-tour-list">
            {tourGroups.map(({ row, occurrences }) => (
              <li key={row.id} className="tt-tour-card">
                <div className="tt-tour-card-head">
                  <span className="tt-tour-school-icon">
                    <IconSchool size={16} />
                  </span>
                  <div className="tt-tour-card-head-text">
                    <span className="tt-tour-school-name">{row.school?.name || "School"}</span>
                    {row.school?.area && <span className="tt-tour-school-area">{row.school.area}</span>}
                  </div>
                </div>

                <div className="tt-tour-occurrences">
                  {occurrences.map((occ) => (
                    <div key={occ.key} className="tt-tour-occurrence">
                      <div className="tt-tour-when">
                        {occ.label && <span className="tt-tour-occurrence-label">{occ.label}</span>}
                        <span className="tt-tour-date">{formatDate(occ.date)}</span>
                        {occ.time && <span className="tt-tour-time">{occ.time}</span>}
                      </div>
                      {occ.status && <span className={"tt-chip is-" + occ.status}>{TOUR_STATUS_LABEL[occ.status]}</span>}
                    </div>
                  ))}
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
            {sortedShortlist.map(({ row, index }) => {
              const rowChildStatuses = childStatus.filter((cs) => cs.shortlist_id === row.id);
              const declined = row.family_decision === "declined";
              return (
                <li key={row.id} className={"tt-shortlist-row" + (declined ? " is-declined" : "")}>
                  <span className="tt-shortlist-number">{index + 1}</span>
                  <div className="tt-shortlist-main">
                    <div className="tt-shortlist-name-row">
                      <span className="tt-shortlist-name">{row.school?.name || "School"}</span>
                      {row.priority === "primary" && <span className="tt-priority-badge is-primary">★ Primary choice</span>}
                      {row.priority === "secondary" && <span className="tt-priority-badge is-secondary">Backup option</span>}
                    </div>
                    {row.school?.area && <div className="tt-shortlist-area">{row.school.area}</div>}
                    {row.school?.fees_url && (
                      <a className="tt-fees-link" href={row.school.fees_url} target="_blank" rel="noopener noreferrer">
                        View fee schedule ↗
                      </a>
                    )}
                    {declined && (
                      <p className="tt-declined-note">
                        Marked as not proceeding{row.family_decision_note ? `: "${row.family_decision_note}"` : "."}
                      </p>
                    )}
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
