import { useEffect, useMemo, useRef, useState } from "react";
import { useApplicationData } from "../context/ApplicationDataContext";
import { fetchFamilyTimetable, fetchFamilyApplications } from "../lib/timetableData";
import { displayNameForChild } from "../lib/completeness";
import { childPhaseFor } from "../lib/schoolJourney";
import { IconSchool, IconChevronRight } from "../components/icons";
import "./TimetablePage.css";

const TOUR_STATUS_LABEL = {
  offered: "Booked",
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

const APPLICATION_STATUS_LABEL_FULL = {
  draft: "Application started",
  submitted: "Submitted",
  assessment_booked: "Assessment booked",
  under_review: "Awaiting decision",
  offer: "Offer received",
  offer_accepted: "Offer accepted",
  waitlisted: "Waitlisted",
  rejected: "Declined",
  withdrawn: "Withdrawn",
};

const APPLICATION_PROGRESS_STEPS = 4;
const APPLICATION_PROGRESS = {
  draft: 0,
  submitted: 1,
  assessment_booked: 2,
  under_review: 3,
  waitlisted: 3,
  offer: 4,
  offer_accepted: 4,
  rejected: 4,
  withdrawn: 0,
};

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d) {
  // Monday-first week.
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const s = new Date(d);
  s.setDate(s.getDate() + diff);
  s.setHours(0, 0, 0, 0);
  return s;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
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

// September 2026 redesign (Asma via WhatsApp, working from a design canvas
// mockup first): "Your schools" -- one table, one row per school, one
// column per child, showing what phase of the process each child is at --
// instead of the old two-list "Upcoming tours" / "Your shortlist" page.
//
// This is the first time the family side reads from `applications` at all
// (previously only the founders side did) -- an application's status, fit
// and outcome are all set PER CHILD, so a school can be "Offer" for one
// sibling and "Not applying yet" for another, which a single family-wide
// list could never show. Tapping a row expands it for the full detail
// (tour date/time, on-the-day logistics, our notes from the visit,
// application progress) without cluttering the table itself.
// "The family needs to clearly see their week and the tours they are booked
// onto" (Heather's tracker, Sept 2026). A Mon-Sun strip replaces the old
// flat "Coming up" list -- each day is its own card, tours on it show as
// small tappable chips, and tapping one opens that school's row below
// (onOpenTour) rather than duplicating the tour detail up here.
function WeekStrip({ rows, onOpenTour }) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  // Land on the week that actually has something in it: the week of the
  // next upcoming tour if there is one, otherwise this week.
  const initialWeekStart = useMemo(() => {
    let earliest = null;
    rows.forEach((row) => {
      [
        [row.tour_date, row.tour_status],
        [row.tour2_date, row.tour2_status],
      ].forEach(([date, status]) => {
        if (!date || status === "cancelled" || status === "completed") return;
        const d = new Date(date + "T00:00:00");
        if (d >= today && (!earliest || d < earliest)) earliest = d;
      });
    });
    return startOfWeek(earliest || today);
  }, [rows, today]);

  const [weekStart, setWeekStart] = useState(() => initialWeekStart);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const toursByDay = useMemo(() => {
    const map = {};
    rows.forEach((row) => {
      const hasBoth = !!(row.tour_date && row.tour2_date);
      [
        [row.tour_date, row.tour_status, hasBoth ? "Primary" : null],
        [row.tour2_date, row.tour2_status, "Secondary"],
      ].forEach(([date, status, label]) => {
        if (!date || status === "cancelled") return;
        const key = date;
        (map[key] = map[key] || []).push({
          rowId: row.id,
          school: row.school?.name || "School",
          time: label === "Primary" || label === null ? timeRange(row.tour_start_time, row.tour_end_time) : timeRange(row.tour2_start_time, row.tour2_end_time),
          status,
          label,
        });
      });
    });
    return map;
  }, [rows]);

  const weekLabel = `${days[0].toLocaleDateString(undefined, { day: "numeric", month: days[0].getMonth() === days[6].getMonth() ? undefined : "short" })} – ${days[6].toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="tt-week">
      <div className="tt-week-head">
        <button type="button" className="tt-week-nav" onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="Previous week">
          &lsaquo;
        </button>
        <span className="tt-week-label">{weekLabel}</span>
        <button type="button" className="tt-week-nav" onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="Next week">
          &rsaquo;
        </button>
      </div>
      <div className="tt-week-grid">
        {days.map((d) => {
          const key = dateKey(d);
          const isToday = key === dateKey(today);
          const tours = toursByDay[key] || [];
          return (
            <div key={key} className={"tt-week-day" + (isToday ? " is-today" : "")}>
              <span className="tt-week-day-label">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
              <span className="tt-week-day-num">{d.getDate()}</span>
              <div className="tt-week-chips">
                {tours.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    className={"tt-week-chip is-" + t.status}
                    onClick={() => onOpenTour(t.rowId)}
                    title={`${t.school}${t.label ? " \u2014 " + t.label + " tour" : ""}`}
                  >
                    <span className="tt-week-chip-school">{t.school}</span>
                    {t.time && <span className="tt-week-chip-time">{t.time}</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TimetablePage()
 {
  const { familyId, data } = useApplicationData();
  const [rows, setRows] = useState([]);
  const [childStatus, setChildStatus] = useState([]);
  const [applications, setApplications] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const rowRefs = useRef({});

  function openTour(rowId) {
    setExpandedId(rowId);
    requestAnimationFrame(() => {
      rowRefs.current[rowId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  const children = data?.children || [];
  const childIds = useMemo(() => children.map((c) => c.id), [children]);

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ shortlist, childStatus: cs }, apps] = await Promise.all([
          fetchFamilyTimetable(familyId),
          fetchFamilyApplications(childIds),
        ]);
        if (cancelled) return;
        setRows(shortlist);
        setChildStatus(cs);
        setApplications(apps);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err.message || "Couldn't load your schools.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, childIds.join(",")]);

  const childList = useMemo(
    () => children.map((c, i) => ({ id: c.id, name: displayNameForChild(c, i) })),
    [children]
  );

  // Same ranking as the founders' School shortlist panel: the family's
  // primary choice floats to the top, a declined school sinks to the
  // bottom, everything else keeps its existing order in between.
  const sortedRows = useMemo(() => {
    const rank = (row) => {
      if (row.family_decision === "declined") return 3;
      if (row.priority === "primary") return 0;
      if (row.priority === "secondary") return 1;
      return 2;
    };
    return [...rows].sort((a, b) => rank(a) - rank(b));
  }, [rows]);

  if (status === "loading") return <p className="dashboard-status">Loading your schools...</p>;
  if (status === "error") return <p className="dashboard-status">{error}</p>;

  return (
    <div className="tt">
      <header className="tt-head">
        <h1>Your schools</h1>
        <p className="tt-head-sub">One row per school, one column per child — tap a school for the full detail on tours and applications.</p>
      </header>

      {rows.length > 0 && <WeekStrip rows={rows} onOpenTour={openTour} />}

      <div className="tt-table">
        {rows.length === 0 ? (
          <p className="tt-empty">No schools on your shortlist yet.</p>
        ) : (
          <>
            <div className="tt-table-head" style={{ gridTemplateColumns: `1.6fr repeat(${Math.max(childList.length, 1)}, 1fr)` }}>
              <span>School</span>
              {childList.map((c) => (
                <span key={c.id}>{c.name}</span>
              ))}
            </div>

            {sortedRows.map((row) => {
              const declined = row.family_decision === "declined";
              const isExpanded = expandedId === row.id;
              const occurrences = [];
              const hasBoth = !!(row.tour_date && row.tour2_date);
              if (row.tour_date && row.tour_status !== "cancelled") {
                occurrences.push({
                  key: `${row.id}-o1`,
                  label: hasBoth ? "Primary tour" : null,
                  date: row.tour_date,
                  time: timeRange(row.tour_start_time, row.tour_end_time),
                  status: row.tour_status,
                });
              }
              if (row.tour2_date && row.tour2_status !== "cancelled") {
                occurrences.push({
                  key: `${row.id}-o2`,
                  label: "Secondary tour",
                  date: row.tour2_date,
                  time: timeRange(row.tour2_start_time, row.tour2_end_time),
                  status: row.tour2_status,
                });
              }

              const applicationsForSchool = applications.filter((a) => a.school_id === row.school_id);

              return (
                <div
                  key={row.id}
                  ref={(el) => (rowRefs.current[row.id] = el)}
                  className={"tt-row" + (declined ? " is-declined" : "")}
                >
                  <button
                    type="button"
                    className="tt-row-toggle"
                    style={{ gridTemplateColumns: `1.6fr repeat(${Math.max(childList.length, 1)}, 1fr)` }}
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    aria-expanded={isExpanded}
                  >
                    <span className="tt-row-school">
                      <span className="tt-row-school-icon">
                        <IconSchool size={14} />
                      </span>
                      <span className="tt-row-school-text">
                        <span className="tt-row-school-name-line">
                          <span className="tt-row-school-name">{row.school?.name || "School"}</span>
                          {row.priority === "primary" && <span className="tt-priority-badge is-primary">★ Primary</span>}
                          {row.priority === "secondary" && <span className="tt-priority-badge is-secondary">Backup</span>}
                        </span>
                        {row.school?.area && <span className="tt-row-school-area">{row.school.area}</span>}
                      </span>
                    </span>

                    {childList.map((c) => {
                      const appsForChild = applicationsForSchool.filter((a) => a.child_id === c.id);
                      const { phase, tone, sub } = childPhaseFor(row, appsForChild);
                      return (
                        <span key={c.id} className="tt-row-child-cell">
                          <span className={"tt-phase-pill is-" + tone}>{phase}</span>
                          {sub && <span className="tt-phase-sub">{sub}</span>}
                        </span>
                      );
                    })}

                    <span className={"tt-row-chevron" + (isExpanded ? " is-open" : "")}>
                      <IconChevronRight size={16} />
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="tt-row-detail">
                      {declined && (
                        <p className="tt-declined-note">
                          Marked as not proceeding{row.family_decision_note ? `: "${row.family_decision_note}"` : "."}
                        </p>
                      )}

                      {row.school?.fees_url && (
                        <a className="tt-fees-link" href={row.school.fees_url} target="_blank" rel="noopener noreferrer">
                          View fee schedule ↗
                        </a>
                      )}

                      <div className="tt-detail-section">
                        <span className="tt-detail-label">Availability</span>
                        <div className="tt-detail-body">
                          <span className={"tt-availability tt-availability-" + row.availability_status}>
                            {AVAILABILITY_LABEL[row.availability_status] || row.availability_status}
                          </span>
                          {childStatus
                            .filter((cs) => cs.shortlist_id === row.id)
                            .map((cs) => (
                              <span key={cs.id} className="tt-child-chip">
                                {childList.find((c) => c.id === cs.child_id)?.name || "Child"}:{" "}
                                {AVAILABILITY_LABEL[cs.availability_status] || cs.availability_status}
                              </span>
                            ))}
                        </div>
                      </div>

                      {occurrences.length > 0 && (
                        <div className="tt-detail-section">
                          <span className="tt-detail-label">Tour</span>
                          <div className="tt-detail-body tt-detail-body-stack">
                            {occurrences.map((occ) => (
                              <div key={occ.key} className="tt-occurrence">
                                <div className="tt-occurrence-when">
                                  {occ.label && <span className="tt-occurrence-label">{occ.label}</span>}
                                  <span className="tt-occurrence-date">{formatDate(occ.date)}</span>
                                  {occ.time && <span className="tt-occurrence-time">{occ.time}</span>}
                                </div>
                                <span className={"tt-chip is-" + occ.status}>{TOUR_STATUS_LABEL[occ.status]}</span>
                              </div>
                            ))}
                          </div>

                          {(row.school?.address || row.school?.admissions_contact_phone || row.tour_gate || row.tour_building || row.tour_parking || row.tour_ask_for || row.tour_bring) && (
                            <dl className="tt-tour-details">
                              {row.school?.address && (
                                <>
                                  <dt>Address</dt>
                                  <dd>{row.school.address}</dd>
                                </>
                              )}
                              {row.school?.admissions_contact_phone && (
                                <>
                                  <dt>Phone</dt>
                                  <dd>
                                    <a href={`tel:${row.school.admissions_contact_phone}`}>{row.school.admissions_contact_phone}</a>
                                  </dd>
                                </>
                              )}
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

                          {(row.feedback_text || row.feedback_rating) && (
                            <div className="tt-visit-note">
                              <div className="tt-visit-note-head">
                                <span>Our notes from the visit</span>
                                <Stars rating={row.feedback_rating} />
                              </div>
                              {row.feedback_text && <p>{row.feedback_text}</p>}
                            </div>
                          )}
                        </div>
                      )}

                      {applicationsForSchool.length > 0 && (
                        <div className="tt-detail-section">
                          <span className="tt-detail-label">Application</span>
                          <div className="tt-detail-body tt-detail-body-stack">
                            {applicationsForSchool.map((app) => {
                              const childName = childList.find((c) => c.id === app.child_id)?.name || "Child";
                              const filled = APPLICATION_PROGRESS[app.status] ?? 0;
                              const tone = app.status === "offer" || app.status === "offer_accepted" ? "good" : app.status === "rejected" ? "bad" : "neutral";
                              return (
                                <div key={app.id} className="tt-application-card">
                                  <div className="tt-application-head">
                                    <span className="tt-application-child">{childName}</span>
                                    <span className={"tt-application-status is-" + tone}>{APPLICATION_STATUS_LABEL_FULL[app.status]}</span>
                                  </div>
                                  <div className="tt-application-progress">
                                    {Array.from({ length: APPLICATION_PROGRESS_STEPS }, (_, i) => (
                                      <span key={i} className={"tt-progress-seg" + (i < filled ? " is-filled is-" + tone : "")} />
                                    ))}
                                  </div>
                                  {app.status === "rejected" && app.rejected_reason && (
                                    <p className="tt-rejection-reason">Reason: {app.rejected_reason}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
