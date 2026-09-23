import { useEffect, useMemo, useRef, useState } from "react";
import { useApplicationData } from "../context/ApplicationDataContext";
import { fetchFamilyTimetable, fetchFamilyApplications, setSchoolInterest } from "../lib/timetableData";
import { displayNameForChild } from "../lib/completeness";
import { childPhaseFor, nearestTourInfo } from "../lib/schoolJourney";
import { IconSchool, IconChevronDown } from "../components/icons";
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

// A real .ics file, so "Add to calendar" works with Apple, Google and
// Outlook calendars alike.
function downloadIcs(tour) {
  const d = tour.date.replace(/-/g, "");
  const t = (x) => x.replace(/:/g, "").slice(0, 6).padEnd(6, "0");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Heather Harries//School tours//EN",
    "BEGIN:VEVENT",
    `UID:${tour.key}@heatherharries`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    tour.start ? `DTSTART:${d}T${t(tour.start)}` : `DTSTART;VALUE=DATE:${d}`,
    tour.start && tour.end ? `DTEND:${d}T${t(tour.end)}` : null,
    `SUMMARY:School tour: ${tour.school?.name || "School"}`,
    tour.school?.address ? `LOCATION:${tour.school.address.replace(/[,;]/g, "\\$&")}` : null,
    tour.notes ? `DESCRIPTION:${tour.notes.replace(/\n/g, "\\n").replace(/[,;]/g, "\\$&")}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(tour.school?.name || "school").replace(/[^a-z0-9]+/gi, "-")}-tour.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
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
    list.push({ key: `${row.id}-1`, rowId: row.id, school: row.school, date: row.tour_date, start: row.tour_start_time, end: row.tour_end_time, status: row.tour_status, notes: logistics });
  if (row.tour2_date && row.tour2_status !== "cancelled")
    list.push({ key: `${row.id}-2`, rowId: row.id, school: row.school, date: row.tour2_date, start: row.tour2_start_time, end: row.tour2_end_time, status: row.tour2_status, notes: logistics });
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

  const sortedRows = useMemo(() => {
    const rank = (row) => {
      if (row.family_decision === "declined" || row.family_interest === "not_for_us") return 3;
      if (row.priority === "primary") return 0;
      if (row.priority === "secondary") return 1;
      return 2;
    };
    return [...rows].sort((a, b) => rank(a) - rank(b));
  }, [rows]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const upcomingTours = rows
    .flatMap(toursOf)
    .filter((t) => t.status !== "completed" && t.date >= todayKey)
    .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));

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
          <div className="ys-stats">
            <Stat label="Shortlisted" value={rows.length} />
            <Stat label="Tours booked" value={upcomingTours.length} />
            <Stat label="Applications" value={counts.applied + counts.offers} />
            <Stat label="Offers" value={counts.offers} good={counts.offers > 0} />
          </div>

          <section className="ys-card">
            <div className="ys-card-head">
              <h2>Coming up</h2>
              <span className="ys-card-sub">Your booked school tours</span>
            </div>
            {upcomingTours.length === 0 ? (
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
                        <button type="button" className="ys-btn" onClick={() => downloadIcs(t)}>
                          Add to calendar
                        </button>
                        <a className="ys-btn" href={mapsUrl(t.school)} target="_blank" rel="noopener noreferrer">
                          Directions
                        </a>
                      </div>
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

function SchoolCard({ row, apps, childList, childStatus, open, onToggle, onPatch, refCb }) {
  const declined = row.family_decision === "declined";
  const tours = toursOf(row);
  const interest = INTEREST.find((i) => i.key === row.family_interest);

  return (
    <li ref={refCb} className={"ys-school" + (open ? " is-open" : "") + (declined || row.family_interest === "not_for_us" ? " is-faded" : "")}>
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
            {[row.school?.area, interest ? `You: ${interest.label}` : null].filter(Boolean).join(" · ") || "\u00a0"}
          </span>
        </span>
        <span className="ys-school-kids">
          {childList.map((c) => {
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
                      <button type="button" className="ys-link" onClick={() => downloadIcs(t)}>
                        Add to calendar
                      </button>
                    )}
                  </div>
                ))
              )}
              {[
                ["Gate", row.tour_gate],
                ["Building", row.tour_building],
                ["Parking", row.tour_parking],
                ["Ask for", row.tour_ask_for],
                ["Bring", row.tour_bring],
              ].some(([, v]) => v) && (
                <dl className="ys-kv">
                  {[
                    ["Gate", row.tour_gate],
                    ["Building", row.tour_building],
                    ["Parking", row.tour_parking],
                    ["Ask for", row.tour_ask_for],
                    ["Bring", row.tour_bring],
                  ]
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                </dl>
              )}
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

          <YourView row={row} onPatch={onPatch} />
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
