import { useEffect, useMemo, useRef, useState } from "react";
import { useApplicationData } from "../context/ApplicationDataContext";
import { fetchFamilyTimetable, fetchFamilyApplications, setSchoolInterest } from "../lib/timetableData";
import { displayNameForChild } from "../lib/completeness";
import { childPhaseFor, nearestTourInfo } from "../lib/schoolJourney";
import { IconSchool, IconChevronDown } from "../components/icons";
import TourDetailsCard from "../components/TourDetailsCard";
import { downloadTourIcs } from "../lib/tourDetails";
import AssessmentCard from "../components/AssessmentCard";
import { hasAssessment, assessmentOf, assessmentWhen } from "../lib/assessment";
import { placedByChild, schoolClosed, appClosed } from "../lib/placement";
import "./TimetablePage.css";

// "Your schools" -- rebuilt September 2026 ("every feature should have a
// purpose and should be working"). Three parts, each doing one job:
//   1. Four counts at the top -- where things stand at a glance.
//   2. "Coming up" -- the tours actually booked, with Add to calendar and
//      Directions buttons that work.
//   3. "Your shortlist" -- one card per school. Open it for the progress
//      tracker per child, tour details, our visit notes, and "Your view"
//      (Keen / Maybe / Not for us + a note), which the consultant sees.

const TOUR_STATUS_LABEL = { offered: "Booked", confirmed: "Confirmed", completed: "Done", cancelled: "Cancelled" };

const AVAILABILITY_LABEL = {
  awaiting: "Checking with the school",
  yes: "Place available",
  some_year_groups: "Places in some year groups",
  waitlist: "Waitlist only",
  no: "No places right now",
};

const INTEREST = [
  { key: "keen", label: "Keen" },
  { key: "maybe", label: "Maybe" },
  { key: "not_for_us", label: "Not for us" },
];

const FILTERS = [
  { key: "all", label: "All" },
  { key: "tours", label: "Tours" },
  { key: "applied", label: "Applications" },
  { key: "offers", label: "Offers" },
];

function formatDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = Number(h);
  return `${((hour + 11) % 12) + 1}${m && m !== "00" ? ":" + m : ""}${hour >= 12 ? "pm" : "am"}`;
}

function timeRange(start, end) {
  if (!start) return "";
  return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
}

function relativeDay(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((formatDay(dateStr) - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  return "";
}

function mapsUrl(school) {
  const q = [school?.name, school?.address || school?.area, "Dubai"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function toursOf(row) {
  const logistics = [
    row.tour_gate && `Gate: ${row.tour_gate}`,
    row.tour_building && `Building: ${row.tour_building}`,
    row.tour_parking && `Parking: ${row.tour_parking}`,
    row.tour_ask_for && `Ask for: ${row.tour_ask_for}`,
    row.tour_bring && `Bring: ${row.tour_bring}`,
  ]
    .filter(Boolean)
    .join("\n");
  const list = [];
  if (row.tour_date && row.tour_status !== "cancelled")
    list.push({ key: `${row.id}-1`, rowId: row.id, row, school: row.school, date: row.tour_date, start: row.tour_start_time, end: row.tour_end_time, status: row.tour_status, notes: logistics });
  if (row.tour2_date && row.tour2_status !== "cancelled")
    list.push({ key: `${row.id}-2`, rowId: row.id, row, school: row.school, date: row.tour2_date, start: row.tour2_start_time, end: row.tour2_end_time, status: row.tour2_status, notes: logistics });
  return list;
}

// The five-step tracker for one child at one school, worked out from the
// tour and application data we already have.
const APP_LEVEL = { draft: 0, submitted: 1, assessment_booked: 2, under_review: 2, waitlisted: 3, offer: 3, offer_accepted: 3, rejected: 3 };
const DECISION = {
  offer: { label: "Offer received", tone: "good" },
  offer_accepted: { label: "Offer accepted", tone: "good" },
  waitlisted: { label: "Waitlisted", tone: "wait" },
  rejected: { label: "Not successful", tone: "bad" },
};

function trackFor(row, apps) {
  const app = apps.find((a) => a.status !== "withdrawn");
  const { completed, upcoming } = nearestTourInfo(row);
  const lvl = app ? APP_LEVEL[app.status] ?? 0 : -1;
  const decision = app ? DECISION[app.status] : null;
  return [
    { label: "Shortlisted", state: "done" },
    { label: completed ? "Toured" : upcoming ? "Tour booked" : "Tour", state: completed ? "done" : upcoming ? "current" : "todo" },
    { label: lvl === 0 ? "Preparing" : "Applied", state: lvl >= 1 ? "done" : lvl === 0 ? "current" : "todo" },
    { label: "Assessment", state: lvl >= 3 ? "done" : lvl === 2 ? "current" : "todo" },
    { label: decision ? decision.label : "Decision", state: lvl >= 3 ? decision?.tone || "good" : "todo" },
  ];
}

export default function TimetablePage() {
  const { familyId, data } = useApplicationData();
  const [rows, setRows] = useState([]);
  const [childStatus, setChildStatus] = useState([]);
  const [applications, setApplications] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [detailsKey, setDetailsKey] = useState(null);
  const cardRefs = useRef({});

  const children = data?.children || [];
  const childIds = useMemo(() => children.map((c) => c.id), [children]);
  const childList = useMemo(() => children.map((c, i) => ({ id: c.id, name: displayNameForChild(c, i) })), [children]);

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

  const appsFor = (row) => applications.filter((a) => a.school_id === row.school_id && a.status !== "withdrawn");

  // Founders (25 Sept 2026): once every child has accepted a place, the
  // other schools close -- greyed out at the bottom, no more tour reminders.
  const placed = placedByChild(applications);
  const isClosed = (row) => schoolClosed(placed, childIds, row.school_id);
  const schoolNameById = Object.fromEntries(rows.map((r) => [r.school_id, r.school?.name || "School"]));
  const placedGroups = {};
  childList
    .filter((c) => placed[c.id])
    .forEach((c) => (placedGroups[placed[c.id]] = placedGroups[placed[c.id]] || []).push(c.name));
  const placedLines = Object.entries(placedGroups).map(([schoolId, names]) =>
    names.length === 1
      ? `${names[0]} has a place at ${schoolNameById[schoolId] || "their new school"}`
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} have places at ${schoolNameById[schoolId] || "their new school"}`
  );
  const placedCount = childList.filter((c) => placed[c.id]).length;
  const childNameOf = (id) => childList.find((c) => c.id === id)?.name || "";

  // Assessments the consultant has saved (date, join link, meeting ID,
  // passcode), soonest first -- shown as soon as they're saved.
  const ACTIVE = ["draft", "submitted", "assessment_booked", "under_review", "waitlisted"];
  const assessmentsFor = (row) =>
    appsFor(row)
      .filter((a) => hasAssessment(a) && !appClosed(placed, a))
      .map((a) => assessmentOf(a, { school: row.school, childName: childList.length > 1 ? childNameOf(a.child_id) : "" }));

  const sortedRows = useMemo(() => {
    const rank = (row) => {
      if (schoolClosed(placedByChild(applications), childIds, row.school_id)) return 4;
      if (row.family_decision === "declined" || row.family_interest === "not_for_us") return 3;
      if (row.priority === "primary") return 0;
      if (row.priority === "secondary") return 1;
      return 2;
    };
    return [...rows].sort((a, b) => rank(a) - rank(b));
  }, [rows, applications, childIds]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const upcomingTours = rows
    .filter((r) => !isClosed(r))
    .flatMap(toursOf)
    .filter((t) => t.status !== "completed" && t.date >= todayKey)
    .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));
  const upcomingAssessments = rows
    .filter((r) => !isClosed(r))
    .flatMap((r) => assessmentsFor(r).map((a) => ({ ...a, rowId: r.id })))
    .filter((a) => ACTIVE.includes(a.app.status) && (!a.date || a.date >= todayKey))
    .sort((x, y) => (x.date || "9999").localeCompare(y.date || "9999"));

  const categoryOf = (row) => {
    const apps = appsFor(row);
    if (apps.some((a) => a.status === "offer" || a.status === "offer_accepted")) return "offers";
    if (apps.length) return "applied";
    if (toursOf(row).length) return "tours";
    return "shortlisted";
  };
  const counts = { all: rows.length, tours: 0, applied: 0, offers: 0 };
  rows.forEach((r) => {
    const c = categoryOf(r);
    if (counts[c] !== undefined) counts[c] += 1;
  });
  const visible = sortedRows.filter((r) => filter === "all" || categoryOf(r) === filter);

  function openSchool(rowId) {
    setFilter("all");
    setOpenId(rowId);
    requestAnimationFrame(() => cardRefs.current[rowId]?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function patchRow(rowId, changes) {
    setRows((list) => list.map((r) => (r.id === rowId ? { ...r, ...changes } : r)));
  }

  if (status === "loading") return <p className="dashboard-status">Loading your schools...</p>;
  if (status === "error") return <p className="dashboard-status">{error}</p>;

  return (
    <div className="ys">
      <header className="ys-head">
        <h1>Your schools</h1>
        <p>Where each school is at, your tours, and what you think of them.</p>
      </header>

      {rows.length === 0 ? (
        <div className="ys-card ys-empty">
          <IconSchool size={28} />
          <h2>No schools yet</h2>
          <p>Your consultant is putting your shortlist together. Schools will appear here as soon as they're added.</p>
        </div>
      ) : (
        <>
          {placedLines.length > 0 && (
            <div className="ys-placed-banner">
              <span aria-hidden="true">🎓</span>
              <span>
                <strong>{placedLines.join(" · ")}</strong>
                {placedCount === childList.length && (
                  <span className="ys-placed-sub">Your other schools are closed and kept at the bottom for reference.</span>
                )}
              </span>
            </div>
          )}

          <div className="ys-stats">
            <Stat label="Shortlisted" value={rows.length} />
            <Stat label="Tours booked" value={upcomingTours.length} />
            <Stat label="Applications" value={counts.applied + counts.offers} />
            <Stat label="Offers" value={counts.offers} good={counts.offers > 0} />
          </div>

          <section className="ys-card">
            <div className="ys-card-head">
              <h2>Coming up</h2>
              <span className="ys-card-sub">Your booked school tours and assessments</span>
            </div>
            {upcomingAssessments.length > 0 && (
              <ul className="ys-tours ys-assessments">
                {upcomingAssessments.map((a) => {
                  const d = a.date ? formatDay(a.date) : null;
                  return (
                    <li key={a.key} className="ys-tour is-assessment">
                      <div className="ys-tour-date">
                        <span>{d ? d.toLocaleDateString(undefined, { month: "short" }) : "TBC"}</span>
                        <strong>{d ? d.getDate() : "–"}</strong>
                        <span>{d ? d.toLocaleDateString(undefined, { weekday: "short" }) : ""}</span>
                      </div>
                      <div className="ys-tour-main">
                        <button type="button" className="ys-tour-school" onClick={() => openSchool(a.rowId)}>
                          {a.school.name || "School"}
                        </button>
                        <span className="ys-tour-when">
                          Assessment{a.childName ? ` for ${a.childName}` : ""} · {assessmentWhen(a)}
                          {a.date && relativeDay(a.date) && <span className="ys-tour-rel">{relativeDay(a.date)}</span>}
                        </span>
                      </div>
                      <div className="ys-tour-actions">
                        {a.link && (
                          <a className="ys-btn ys-btn-primary" href={a.link} target="_blank" rel="noopener noreferrer">
                            Join
                          </a>
                        )}
                        <button
                          type="button"
                          className="ys-btn"
                          onClick={() => setDetailsKey(detailsKey === a.key ? null : a.key)}
                          aria-expanded={detailsKey === a.key}
                        >
                          {detailsKey === a.key ? "Hide details" : "Details"}
                        </button>
                      </div>
                      {detailsKey === a.key && (
                        <div className="ys-tour-details">
                          <AssessmentCard assessment={a} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {upcomingTours.length === 0 && upcomingAssessments.length > 0 ? null : upcomingTours.length === 0 ? (
              <p className="ys-muted">No tours booked right now. We'll add them here as soon as a school confirms a date.</p>
            ) : (
              <ul className="ys-tours">
                {upcomingTours.map((t) => {
                  const d = formatDay(t.date);
                  const rel = relativeDay(t.date);
                  return (
                    <li key={t.key} className="ys-tour">
                      <div className="ys-tour-date">
                        <span>{d.toLocaleDateString(undefined, { month: "short" })}</span>
                        <strong>{d.getDate()}</strong>
                        <span>{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                      </div>
                      <div className="ys-tour-main">
                        <button type="button" className="ys-tour-school" onClick={() => openSchool(t.rowId)}>
                          {t.school?.name || "School"}
                        </button>
                        <span className="ys-tour-when">
                          {timeRange(t.start, t.end) || "Time to be confirmed"}
                          {rel && <span className="ys-tour-rel">{rel}</span>}
                          <span className={"ys-chip is-" + t.status}>{TOUR_STATUS_LABEL[t.status] || "Booked"}</span>
                        </span>
                      </div>
                      <div className="ys-tour-actions">
                        <button
                          type="button"
                          className="ys-btn"
                          onClick={() => setDetailsKey(detailsKey === t.key ? null : t.key)}
                          aria-expanded={detailsKey === t.key}
                        >
                          {detailsKey === t.key ? "Hide details" : "Tour details"}
                        </button>
                        <button type="button" className="ys-btn" onClick={() => downloadTourIcs(t)}>
                          Add to calendar
                        </button>
                      </div>
                      {detailsKey === t.key && (
                        <div className="ys-tour-details">
                          <TourDetailsCard tour={t} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="ys-card">
            <div className="ys-card-head">
              <h2>Your shortlist</h2>
              <div className="ys-filters" role="tablist">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.key}
                    className={"ys-filter" + (filter === f.key ? " is-on" : "")}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label} <span>{counts[f.key]}</span>
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 && <p className="ys-muted">Nothing here yet.</p>}

            <ul className="ys-schools">
              {visible.map((row) => (
                <SchoolCard
                  key={row.id}
                  row={row}
                  apps={appsFor(row)}
                  childList={childList}
                  childStatus={childStatus.filter((cs) => cs.shortlist_id === row.id)}
                  closed={isClosed(row)}
                  placed={placed}
                  placedLines={placedLines}
                  assessments={assessmentsFor(row)}
                  open={openId === row.id}
                  onToggle={() => setOpenId(openId === row.id ? null : row.id)}
                  onPatch={(changes) => patchRow(row.id, changes)}
                  refCb={(el) => (cardRefs.current[row.id] = el)}
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, good }) {
  return (
    <div className={"ys-stat" + (good ? " is-good" : "")}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SchoolCard({ row, apps, childList, childStatus, open, onToggle, onPatch, refCb, closed, placed, placedLines, assessments }) {
  const declined = row.family_decision === "declined";
  const tours = toursOf(row);
  const interest = INTEREST.find((i) => i.key === row.family_interest);

  return (
    <li
      ref={refCb}
      className={
        "ys-school" +
        (open ? " is-open" : "") +
        (closed ? " is-closed" : declined || row.family_interest === "not_for_us" ? " is-faded" : "")
      }
    >
      <button type="button" className="ys-school-head" onClick={onToggle} aria-expanded={open}>
        <span className="ys-school-icon">
          <IconSchool size={16} />
        </span>
        <span className="ys-school-text">
          <span className="ys-school-name">
            {row.school?.name || "School"}
            {row.priority === "primary" && <span className="ys-badge is-primary">★ Top choice</span>}
            {row.priority === "secondary" && <span className="ys-badge">Backup</span>}
          </span>
          <span className="ys-school-meta">
            {closed
              ? "Closed · every child has a place elsewhere"
              : [row.school?.area, interest ? `You: ${interest.label}` : null].filter(Boolean).join(" · ") || "\u00a0"}
          </span>
        </span>
        <span className="ys-school-kids">
          {childList.map((c) => {
            if (placed[c.id]) {
              const here = String(placed[c.id]) === String(row.school_id);
              return (
                <span key={c.id} className={"ys-pill " + (here ? "is-good" : "is-closed")}>
                  {childList.length > 1 && <em>{c.name}</em>}
                  {here ? "Place accepted 🎓" : "Closed"}
                </span>
              );
            }
            const { phase, tone } = childPhaseFor(row, apps.filter((a) => a.child_id === c.id));
            return (
              <span key={c.id} className={"ys-pill is-" + tone}>
                {childList.length > 1 && <em>{c.name}</em>}
                {phase === "—" ? "Not proceeding" : phase}
              </span>
            );
          })}
        </span>
        <span className="ys-school-caret">
          <IconChevronDown size={18} />
        </span>
      </button>

      {open && (
        <div className="ys-school-body">
          {closed && (
            <p className="ys-note is-closed">
              This school is closed now: {placedLines.join(" · ")}. Everything below is kept for reference.
            </p>
          )}
          {!closed && assessments.length > 0 && (
            <div className="ys-block">
              <h3>Assessment</h3>
              {assessments.map((a) => (
                <div key={a.key} className="ys-tour-details">
                  <AssessmentCard assessment={a} showHeading={false} />
                </div>
              ))}
            </div>
          )}
          {declined && (
            <p className="ys-note is-muted">
              Not going ahead with this school{row.family_decision_note ? ` — ${row.family_decision_note}` : "."}
            </p>
          )}

          <div className="ys-block">
            <h3>Progress</h3>
            {childList.map((c) => (
              <div key={c.id} className="ys-track-row">
                {childList.length > 1 && <span className="ys-track-child">{c.name}</span>}
                <ol className="ys-track">
                  {trackFor(row, apps.filter((a) => a.child_id === c.id)).map((s, i) => (
                    <li key={i} className={"ys-step is-" + s.state}>
                      <span className="ys-dot">{s.state === "bad" ? "✕" : s.state === "todo" || s.state === "current" ? "" : "✓"}</span>
                      <span className="ys-step-label">{s.label}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <div className="ys-grid">
            <div className="ys-block">
              <h3>Tour</h3>
              {tours.length === 0 ? (
                <p className="ys-muted">No tour booked yet.</p>
              ) : (
                tours.map((t) => (
                  <div key={t.key} className="ys-tour-line">
                    <span>
                      <strong>{formatDay(t.date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</strong>
                      {timeRange(t.start, t.end) && ` · ${timeRange(t.start, t.end)}`}
                    </span>
                    <span className={"ys-chip is-" + t.status}>{TOUR_STATUS_LABEL[t.status] || "Booked"}</span>
                    {t.status !== "completed" && (
                      <button type="button" className="ys-link" onClick={() => downloadTourIcs(t)}>
                        Add to calendar
                      </button>
                    )}
                  </div>
                ))
              )}
              {tours
                .filter((t) => !closed && t.status !== "completed")
                .map((t) => (
                  <div key={`d-${t.key}`} className="ys-tour-details">
                    <TourDetailsCard tour={t} />
                  </div>
                ))}
            </div>

            <div className="ys-block">
              <h3>The school</h3>
              <p className="ys-avail">
                <span className={"ys-avail-dot is-" + (row.availability_status || "awaiting")} />
                {AVAILABILITY_LABEL[row.availability_status] || "Checking with the school"}
              </p>
              {childStatus.length > 0 &&
                childStatus.map((cs) => (
                  <p key={cs.id} className="ys-avail ys-avail-child">
                    {childList.find((c) => c.id === cs.child_id)?.name || "Child"}: {AVAILABILITY_LABEL[cs.availability_status] || "Checking"}
                  </p>
                ))}
              <div className="ys-links">
                <a className="ys-btn" href={mapsUrl(row.school)} target="_blank" rel="noopener noreferrer">
                  Directions
                </a>
                {row.school?.admissions_contact_phone && (
                  <a className="ys-btn" href={`tel:${row.school.admissions_contact_phone}`}>
                    Call admissions
                  </a>
                )}
                {row.school?.fees_url && (
                  <a className="ys-btn" href={row.school.fees_url} target="_blank" rel="noopener noreferrer">
                    Fee schedule ↗
                  </a>
                )}
              </div>
            </div>
          </div>

          {(row.feedback_text || row.feedback_rating) && (
            <div className="ys-block ys-visit">
              <h3>
                Our notes from the visit
                {row.feedback_rating ? (
                  <span className="ys-stars" aria-label={`${row.feedback_rating} out of 5`}>
                    {"★".repeat(row.feedback_rating)}
                    <span>{"★".repeat(5 - row.feedback_rating)}</span>
                  </span>
                ) : null}
              </h3>
              {row.feedback_text && <p>{row.feedback_text}</p>}
            </div>
          )}

          {apps.some((a) => a.status === "rejected" && a.rejected_reason) && (
            <p className="ys-note is-bad">
              {apps
                .filter((a) => a.status === "rejected" && a.rejected_reason)
                .map((a) => `${childList.find((c) => c.id === a.child_id)?.name || "Child"}: ${a.rejected_reason}`)
                .join(" · ")}
            </p>
          )}

          {!closed && <YourView row={row} onPatch={onPatch} />}
        </div>
      )}
    </li>
  );
}

// The family's own say -- saved straight away, and shown to the
// consultant on their School visits tab.
function YourView({ row, onPatch }) {
  const [note, setNote] = useState(row.family_interest_note || "");
  const [state, setState] = useState(""); // "" | saving | saved | error
  const [err, setErr] = useState("");

  async function save(interest, nextNote) {
    setState("saving");
    setErr("");
    try {
      await setSchoolInterest(row.id, interest, nextNote);
      onPatch({ family_interest: interest, family_interest_note: nextNote?.trim() || null });
      setState("saved");
    } catch (e) {
      setState("error");
      setErr(
        /function|schema cache/i.test(e.message || "")
          ? "This isn't switched on yet — please let your consultant know."
          : e.message || "Couldn't save that."
      );
    }
  }

  return (
    <div className="ys-block ys-view">
      <h3>
        Your view
        {state === "saving" && <span className="ys-saved">Saving…</span>}
        {state === "saved" && <span className="ys-saved is-ok">✓ Saved — your consultant can see this</span>}
      </h3>
      <div className="ys-view-choices">
        {INTEREST.map((i) => (
          <button
            key={i.key}
            type="button"
            className={"ys-choice is-" + i.key + (row.family_interest === i.key ? " is-on" : "")}
            onClick={() => save(row.family_interest === i.key ? null : i.key, note)}
          >
            <span className="ys-choice-dot" aria-hidden="true" /> {i.label}
          </button>
        ))}
      </div>
      <textarea
        className="ys-view-note"
        rows={2}
        placeholder="Anything you'd like us to know? (e.g. loved the sports facilities, too far from work)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => {
          if ((row.family_interest_note || "") !== note.trim()) save(row.family_interest || null, note);
        }}
      />
      {err && <p className="ys-note is-bad">{err}</p>}
    </div>
  );
}
