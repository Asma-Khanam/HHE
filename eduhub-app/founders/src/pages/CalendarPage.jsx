import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  loadCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  updateApplication,
  updateShortlistTour,
  listStaff,
  listFamilies,
  friendlyError,
} from "../lib/staffData";
import "./CalendarPage.css";

// Consultant calendar (redesign, 25 Sept 2026). Founders: "the calendar
// needs to be for us to know when tours and assessments are". Month view
// for the overview, a Notion-style Week view with a time grid for the
// detail. Tours come straight off School visits, assessments straight off
// Applications -- editing one here edits it there.

const CATEGORIES = [
  { key: "tour", label: "Tours" },
  { key: "assessment", label: "Assessments" },
  { key: "other", label: "Other" },
];

// Plain calendar_events kinds that can be picked in "New event".
const PICKABLE_KINDS = [
  ["reminder", "Reminder"],
  ["deadline", "Deadline"],
  ["team_event", "Team event"],
  ["other", "Other"],
];

const TOUR_STATUS = [
  ["offered", "Offered"],
  ["confirmed", "Confirmed"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_PX = 52;
const DAY_START_SCROLL = 7; // the week view opens scrolled to 7am

// ---- dates ----------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");
function toDateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d) {
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -d.getDay());
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function monthGrid(anchor) {
  const first = startOfWeek(startOfMonth(anchor));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}
function sameDay(a, b) {
  return toDateKey(a) === toDateKey(b);
}
const toMin = (t) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const fromMin = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
function time12(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}${m ? ":" + pad(m) : ""}${suffix}`;
}
function weekTitle(start) {
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const a = start.toLocaleDateString("en-GB", { day: "numeric", ...(sameMonth ? {} : { month: "short" }) });
  const b = end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${a} – ${b}`;
}

// ---- per-viewer preference (last view used) ---------------------------------
function readView() {
  try {
    return localStorage.getItem("hhe-cal-view") === "week" ? "week" : "month";
  } catch {
    return "month";
  }
}
function saveView(v) {
  try {
    localStorage.setItem("hhe-cal-view", v);
  } catch {
    /* private window etc. -- fine */
  }
}

// ---- how an event looks -----------------------------------------------------
function tone(ev) {
  if (ev.category === "tour") return "tone-tour";
  if (ev.category === "assessment") return "tone-assessment";
  if (ev.kind === "deadline") return "tone-deadline";
  if (ev.kind === "team_event") return "tone-team";
  if (ev.kind === "reminder") return "tone-reminder";
  return "tone-other";
}
function isStruck(ev) {
  return ev.status === "cancelled" || (ev.source === "calendar_event" && ev.status === "done");
}
function whoLine(ev) {
  return [ev.familyName, ev.childName].filter(Boolean).join(" · ");
}

// Side-by-side columns for events that overlap in the week view.
function layoutDay(events) {
  const items = events
    .map((ev) => {
      const s = toMin(ev.start);
      const e = Math.max(toMin(ev.end) ?? s + 60, s + 30);
      return { ev, s, e };
    })
    .sort((a, b) => a.s - b.s || b.e - a.e);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = [];
    cluster.forEach((it) => {
      let c = cols.findIndex((end) => end <= it.s);
      if (c === -1) {
        c = cols.length;
        cols.push(it.e);
      } else cols[c] = it.e;
      it.col = c;
    });
    cluster.forEach((it) => out.push({ ...it, cols: cols.length }));
    cluster = [];
  };
  items.forEach((it) => {
    if (cluster.length && it.s >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  });
  if (cluster.length) flush();
  return out;
}

// ============================================================================
export default function CalendarPage() {
  const [view, setView] = useState(readView);
  const [anchor, setAnchor] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [families, setFamilies] = useState([]);
  const [consultantFilter, setConsultantFilter] = useState("all");
  const [shown, setShown] = useState({ tour: true, assessment: true, other: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null); // null = modal closed

  const days = useMemo(
    () => (view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)) : monthGrid(anchor)),
    [view, anchor]
  );
  const rangeKey = `${toDateKey(days[0])}|${toDateKey(days[days.length - 1])}`;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const from = days[0];
      const to = addDays(days[days.length - 1], 1);
      const [ev, staffList, familyList] = await Promise.all([
        loadCalendarEvents({ from, to }),
        staff.length ? staff : listStaff(),
        families.length ? families : listFamilies(),
      ]);
      setEvents(ev);
      setStaff(staffList);
      setFamilies(familyList);
    } catch (err) {
      setError(friendlyError(err, "Couldn't load the calendar."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  function changeView(v) {
    setView(v);
    saveView(v);
  }
  function step(dir) {
    if (view === "week") setAnchor((a) => addDays(a, 7 * dir));
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));
  }
  function openWeekOf(date) {
    setAnchor(date);
    changeView("week");
  }

  // Keyboard: T today, M month, W week, arrows to move.
  useEffect(() => {
    function onKey(e) {
      if (form || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (["input", "select", "textarea"].includes(tag)) return;
      const k = e.key.toLowerCase();
      if (k === "t") setAnchor(new Date());
      else if (k === "m") changeView("month");
      else if (k === "w") changeView("week");
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const visible = useMemo(
    () =>
      events.filter(
        (e) =>
          shown[e.category] &&
          (consultantFilter === "all" ||
            e.created_by === consultantFilter ||
            e.assigned_to === consultantFilter ||
            e.ownerId === consultantFilter)
      ),
    [events, shown, consultantFilter]
  );
  const counts = useMemo(() => {
    const c = { tour: 0, assessment: 0, other: 0 };
    const inView =
      view === "month"
        ? events.filter((e) => fromKey(e.date).getMonth() === anchor.getMonth())
        : events;
    inView.forEach((e) => (c[e.category] += 1));
    return c;
  }, [events, view, anchor]);

  const byDay = useMemo(() => {
    const map = {};
    visible.forEach((e) => (map[e.date] ||= []).push(e));
    Object.values(map).forEach((list) =>
      list.sort((a, b) => (a.start ? 1 : 0) - (b.start ? 1 : 0) || (a.start || "").localeCompare(b.start || ""))
    );
    return map;
  }, [visible]);

  // ---- modal ---------------------------------------------------------------
  function openCreate(date, start) {
    const s = start || null;
    setForm({
      mode: "event",
      id: null,
      title: "",
      kind: "reminder",
      familyId: "",
      childId: "",
      date: toDateKey(date),
      allDay: !s,
      start: s || "09:00",
      end: s ? fromMin(toMin(s) + 60) : "10:00",
      notes: "",
      visibleToClient: false,
      status: "upcoming",
    });
  }

  function openEvent(ev) {
    if (ev.source === "shortlist_tour") {
      setForm({ mode: "tour", ev, date: ev.date, start: ev.start || "", end: ev.end || "", status: ev.status });
    } else if (ev.source === "application_assessment") {
      setForm({ mode: "assessment", ev, date: ev.date, start: ev.start || "", notes: ev.notes || "" });
    } else if (ev.source === "application_visit") {
      setForm({ mode: "visit", ev, date: ev.date, notes: ev.notes || "" });
    } else {
      setForm({
        mode: "event",
        id: ev.id,
        title: ev.title,
        kind: ev.kind || "reminder",
        familyId: ev.family_id || "",
        childId: ev.child_id || "",
        date: ev.date,
        allDay: !ev.start,
        start: ev.start || "09:00",
        end: ev.end || (ev.start ? fromMin(toMin(ev.start) + 60) : "10:00"),
        notes: ev.notes || "",
        visibleToClient: !!ev.visible_to_client,
        status: ev.status || "upcoming",
      });
    }
  }

  async function run(fn, fallback) {
    try {
      await fn();
      setForm(null);
      load();
    } catch (err) {
      setError(friendlyError(err, fallback));
      setForm(null);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    const f = form;
    if (f.mode === "tour") {
      const p = f.ev.slot === 2 ? "tour2_" : "tour_";
      return run(
        () =>
          updateShortlistTour(f.ev.id, {
            [`${p}date`]: f.date,
            [`${p}start_time`]: f.start || null,
            [`${p}end_time`]: f.end || null,
            [`${p}status`]: f.status,
          }),
        "Couldn't save that tour."
      );
    }
    if (f.mode === "assessment") {
      return run(
        () =>
          updateApplication(f.ev.id, {
            assessment_date: f.date,
            assessment_time: f.start || null,
            assessment_notes: f.notes || null,
          }),
        "Couldn't save that assessment."
      );
    }
    if (f.mode === "visit") {
      return run(() => updateApplication(f.ev.id, { visit_date: f.date, visit_notes: f.notes }), "Couldn't save that visit.");
    }
    if (!f.title.trim()) return;
    const endMin = toMin(f.end);
    const payload = {
      familyId: f.familyId || null,
      childId: f.childId || null,
      kind: f.kind,
      title: f.title,
      notes: f.notes,
      startsAt: `${f.date}T${f.allDay ? "00:00" : f.start}:00`,
      endsAt: f.allDay || endMin == null || endMin <= toMin(f.start) ? null : `${f.date}T${f.end}:00`,
      allDay: f.allDay,
      visibleToClient: f.visibleToClient,
    };
    return run(
      () => (f.id ? updateCalendarEvent(f.id, { ...payload, status: f.status }) : createCalendarEvent(payload)),
      "Couldn't save that."
    );
  }

  async function handleRemove() {
    const f = form;
    if (f.mode === "assessment")
      return run(() => updateApplication(f.ev.id, { assessment_date: null, assessment_time: null }), "Couldn't remove that.");
    if (f.mode === "visit")
      return run(() => updateApplication(f.ev.id, { visit_date: null, visit_notes: null }), "Couldn't remove that.");
    if (f.mode === "event" && f.id) return run(() => deleteCalendarEvent(f.id), "Couldn't delete that.");
  }

  const today = new Date();
  const title =
    view === "week" ? weekTitle(days[0]) : anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="cal-page">
      <div className="cal-toolbar">
        <div className="cal-toolbar-left">
          <h1 className="cal-title">{title}</h1>
          <div className="cal-nav">
            <button type="button" onClick={() => step(-1)} aria-label={view === "week" ? "Previous week" : "Previous month"}>
              ‹
            </button>
            <button type="button" className="cal-today-btn" onClick={() => setAnchor(new Date())}>
              Today
            </button>
            <button type="button" onClick={() => step(1)} aria-label={view === "week" ? "Next week" : "Next month"}>
              ›
            </button>
          </div>
          {loading && <span className="cal-spinner" aria-label="Loading" />}
        </div>
        <div className="cal-toolbar-right">
          <div className="cal-seg" role="tablist" aria-label="Calendar view">
            {[
              ["month", "Month", "M"],
              ["week", "Week", "W"],
            ].map(([v, label, key]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                className={view === v ? "is-on" : ""}
                onClick={() => changeView(v)}
                title={`${label} (${key})`}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="cal-new-btn" onClick={() => openCreate(view === "week" ? days[0] : today)}>
            + New event
          </button>
        </div>
      </div>

      <div className="cal-filters">
        <div className="cal-chips">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={"cal-chip chip-" + c.key + (shown[c.key] ? " is-on" : "")}
              aria-pressed={shown[c.key]}
              onClick={() => setShown((s) => ({ ...s, [c.key]: !s[c.key] }))}
            >
              <span className="cal-chip-dot" />
              {c.label}
              <span className="cal-chip-count">{counts[c.key]}</span>
            </button>
          ))}
        </div>
        <select className="cal-filter" value={consultantFilter} onChange={(e) => setConsultantFilter(e.target.value)}>
          <option value="all">Everyone&apos;s families</option>
          {staff.map((s) => (
            <option key={s.user_id} value={s.user_id}>
              {s.full_name || s.email}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="cal-error">{error}</div>}

      {view === "month" ? (
        <MonthView
          days={days}
          anchor={anchor}
          today={today}
          byDay={byDay}
          onOpen={openEvent}
          onCreate={(d) => openCreate(d)}
          onOpenWeek={openWeekOf}
        />
      ) : (
        <WeekView days={days} today={today} byDay={byDay} onOpen={openEvent} onCreate={openCreate} />
      )}

      <p className="cal-keys">
        Shortcuts: <kbd>T</kbd> today · <kbd>M</kbd> month · <kbd>W</kbd> week · <kbd>←</kbd> <kbd>→</kbd> move
      </p>

      {form && (
        <EventModal
          form={form}
          setForm={setForm}
          families={families}
          onSave={handleSave}
          onRemove={handleRemove}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}

// ---- Month -------------------------------------------------------------------
function MonthView({ days, anchor, today, byDay, onOpen, onCreate, onOpenWeek }) {
  const MAX = 3;
  return (
    <div className="cal-month">
      {WEEKDAYS.map((w) => (
        <div key={w} className="cal-weekday">
          {w}
        </div>
      ))}
      {days.map((day) => {
        const key = toDateKey(day);
        const list = byDay[key] || [];
        const inMonth = day.getMonth() === anchor.getMonth();
        const isToday = sameDay(day, today);
        const weekend = day.getDay() === 0 || day.getDay() === 6;
        return (
          <div
            key={key}
            className={"cal-cell" + (inMonth ? "" : " is-outside") + (weekend ? " is-weekend" : "")}
            onClick={() => onCreate(day)}
          >
            <button
              type="button"
              className={"cal-daynum" + (isToday ? " is-today" : "")}
              onClick={(e) => {
                e.stopPropagation();
                onOpenWeek(day);
              }}
              title="Open this week"
            >
              {day.getDate() === 1 ? day.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : day.getDate()}
            </button>
            <div className="cal-pills">
              {list.slice(0, list.length > MAX ? MAX - 1 : MAX).map((ev) => (
                <Pill key={ev.key} ev={ev} onOpen={onOpen} />
              ))}
              {list.length > MAX && (
                <button
                  type="button"
                  className="cal-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenWeek(day);
                  }}
                >
                  +{list.length - (MAX - 1)} more
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Pill({ ev, onOpen }) {
  const who = whoLine(ev);
  return (
    <button
      type="button"
      className={"cal-pill " + tone(ev) + (isStruck(ev) ? " is-struck" : "")}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(ev);
      }}
      title={[ev.start ? time12(ev.start) : "All day", ev.title, who].filter(Boolean).join(" · ")}
    >
      {ev.start && <span className="cal-pill-time">{time12(ev.start)}</span>}
      {/* Colour already says tour / assessment, so the month grid spends the
          space on the school and the family instead. */}
      <span className="cal-pill-title">{ev.schoolName || ev.title}</span>
      {ev.familyName && <span className="cal-pill-who">{ev.familyName}</span>}
    </button>
  );
}

// ---- Week (Notion-style time grid) --------------------------------------------
function WeekView({ days, today, byDay, onOpen, onCreate }) {
  const scrollRef = useRef(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Open at 7am, or earlier if something starts before then this week.
  const firstStart = useMemo(() => {
    let min = DAY_START_SCROLL * 60;
    days.forEach((d) =>
      (byDay[toDateKey(d)] || []).forEach((ev) => {
        if (ev.start) min = Math.min(min, toMin(ev.start));
      })
    );
    return min;
  }, [days, byDay]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (firstStart / 60) * HOUR_PX - 8);
  }, [firstStart]);

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  function slotFromClick(e, day) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const mins = Math.min(23 * 60 + 30, Math.max(0, Math.floor(((y / HOUR_PX) * 60) / 30) * 30));
    onCreate(day, fromMin(mins));
  }

  return (
    <div className="cw">
      <div className="cw-head">
        <div className="cw-gutter" />
        {days.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <div key={toDateKey(d)} className={"cw-dayhead" + (isToday ? " is-today" : "")}>
              <span className="cw-dow">{WEEKDAYS[d.getDay()]}</span>
              <span className="cw-dnum">{d.getDate()}</span>
            </div>
          );
        })}
      </div>

      <div className="cw-allday">
        <div className="cw-gutter cw-allday-label">All day</div>
        {days.map((d) => {
          const list = (byDay[toDateKey(d)] || []).filter((ev) => !ev.start);
          return (
            <div key={toDateKey(d)} className="cw-allday-cell" onClick={() => onCreate(d)}>
              {list.map((ev) => (
                <Pill key={ev.key} ev={ev} onOpen={onOpen} />
              ))}
            </div>
          );
        })}
      </div>

      <div className="cw-scroll" ref={scrollRef}>
        <div className="cw-body" style={{ height: 24 * HOUR_PX }}>
          <div className="cw-gutter cw-hours">
            {hours.map((h) => (
              <span key={h} className="cw-hour" style={{ top: h * HOUR_PX }}>
                {h === 0 ? "" : time12(`${pad(h)}:00`)}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const key = toDateKey(d);
            const timed = (byDay[key] || []).filter((ev) => ev.start);
            const isToday = sameDay(d, today);
            return (
              <div
                key={key}
                className={"cw-col" + (isToday ? " is-today" : "")}
                style={{ backgroundSize: `100% ${HOUR_PX}px` }}
                onClick={(e) => slotFromClick(e, d)}
              >
                {layoutDay(timed).map(({ ev, s, e, col, cols }) => {
                  const height = ((e - s) / 60) * HOUR_PX - 2;
                  return (
                    <button
                      key={ev.key}
                      type="button"
                      className={"cw-event " + tone(ev) + (isStruck(ev) ? " is-struck" : "") + (height < 40 ? " is-short" : "")}
                      style={{
                        top: (s / 60) * HOUR_PX + 1,
                        height,
                        left: `calc(${(col / cols) * 100}% + 2px)`,
                        width: `calc(${100 / cols}% - 4px)`,
                      }}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        onOpen(ev);
                      }}
                      title={[time12(ev.start) + (ev.end ? "–" + time12(ev.end) : ""), ev.title, whoLine(ev)].join(" · ")}
                    >
                      <span className="cw-event-title">{ev.title}</span>
                      <span className="cw-event-time">
                        {time12(ev.start)}
                        {ev.end ? ` – ${time12(ev.end)}` : ""}
                      </span>
                      {whoLine(ev) && <span className="cw-event-who">{whoLine(ev)}</span>}
                    </button>
                  );
                })}
                {isToday && (
                  <div className="cw-now" style={{ top: (nowMin / 60) * HOUR_PX }}>
                    <span />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- Modal ---------------------------------------------------------------------
function familyLink(ev, tab) {
  if (!ev.family_id) return null;
  const q = new URLSearchParams({ tab });
  if (ev.school_id) q.set("school", ev.school_id);
  return `/staff/families/${ev.family_id}?${q.toString()}`;
}

function EventModal({ form, setForm, families, onSave, onRemove, onClose }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const f = form;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  let body;
  let heading;
  let removeLabel = null;

  if (f.mode === "tour" || f.mode === "assessment" || f.mode === "visit") {
    const ev = f.ev;
    const tab = f.mode === "assessment" ? "applications" : "visits";
    const link = familyLink(ev, tab);
    heading = f.mode === "tour" ? (ev.slot === 2 ? "Second tour" : "School tour") : f.mode === "assessment" ? "Assessment" : "School visit";
    removeLabel = f.mode === "assessment" ? "Remove assessment date" : f.mode === "visit" ? "Remove visit date" : null;
    body = (
      <>
        <div className={"cal-modal-tag " + tone(ev)}>
          <strong>{ev.schoolName}</strong>
          <span>{whoLine(ev) || "No family"}</span>
          {link && (
            <Link to={link} className="cal-modal-link">
              Open {f.mode === "assessment" ? "Applications" : "School visits"} ›
            </Link>
          )}
        </div>

        <div className="cal-modal-row cal-modal-row-3">
          <label>
            Date
            <input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} required autoFocus />
          </label>
          {f.mode !== "visit" && (
            <label>
              {f.mode === "tour" ? "Starts" : "Time"}
              <input type="time" value={f.start} onChange={(e) => set({ start: e.target.value })} />
            </label>
          )}
          {f.mode === "tour" && (
            <label>
              Ends
              <input type="time" value={f.end} onChange={(e) => set({ end: e.target.value })} />
            </label>
          )}
        </div>

        {f.mode === "tour" && (
          <div className="cal-status-row" role="radiogroup" aria-label="Tour status">
            {TOUR_STATUS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={f.status === k}
                className={"cal-status" + (f.status === k ? " is-on" : "") + " st-" + k}
                onClick={() => set({ status: k })}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {f.mode === "assessment" && (ev.link || ev.meetingId || ev.passcode) && (
          <div className="cal-join">
            {ev.link && (
              <a href={ev.link} target="_blank" rel="noreferrer" className="cal-join-btn">
                Open join link ↗
              </a>
            )}
            {ev.meetingId && <span>Meeting ID: <code>{ev.meetingId}</code></span>}
            {ev.passcode && <span>Passcode: <code>{ev.passcode}</code></span>}
          </div>
        )}

        {f.mode !== "tour" && (
          <label>
            {f.mode === "assessment" ? "Details for the family" : "Notes"}
            <textarea rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
          </label>
        )}
        <p className="cal-hint">
          {f.mode === "tour"
            ? "Same tour as on the family's School visits tab. Changes show there, and in the family's app."
            : f.mode === "assessment"
            ? "Same assessment as on the Applications tab. The family sees the date and details in their app."
            : "Same visit date as on the Applications tab."}
        </p>
      </>
    );
  } else {
    heading = f.id ? "Edit event" : "New event";
    removeLabel = f.id ? "Delete" : null;
    const childrenForFamily = f.familyId ? families.find((x) => x.id === f.familyId)?.children || [] : [];
    body = (
      <>
        <label>
          Title
          <input type="text" value={f.title} onChange={(e) => set({ title: e.target.value })} required autoFocus placeholder="e.g. Team catch-up" />
        </label>
        <div className="cal-modal-row">
          <label>
            Kind
            <select value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
              {PICKABLE_KINDS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} required />
          </label>
        </div>
        <div className="cal-modal-row cal-modal-row-time">
          <label className="cal-checkbox-row">
            <input type="checkbox" checked={f.allDay} onChange={(e) => set({ allDay: e.target.checked })} />
            All day
          </label>
          {!f.allDay && (
            <div className="cal-times">
              <input type="time" value={f.start} onChange={(e) => set({ start: e.target.value })} aria-label="Starts" />
              <span>–</span>
              <input type="time" value={f.end} onChange={(e) => set({ end: e.target.value })} aria-label="Ends" />
            </div>
          )}
        </div>
        <div className="cal-modal-row">
          <label>
            Family (optional)
            <select value={f.familyId} onChange={(e) => set({ familyId: e.target.value, childId: "" })}>
              <option value="">No family (team event)</option>
              {families.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Child (optional)
            <select value={f.childId} onChange={(e) => set({ childId: e.target.value })} disabled={!f.familyId}>
              <option value="">Whole family</option>
              {childrenForFamily.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.preferred_name || c.first_name || c.full_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Notes
          <textarea rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        {f.id && (
          <label>
            Status
            <select value={f.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="upcoming">Upcoming</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        )}
        <label className="cal-checkbox-row">
          <input
            type="checkbox"
            checked={f.visibleToClient}
            onChange={(e) => set({ visibleToClient: e.target.checked })}
            disabled={!f.familyId}
          />
          Show on the family&apos;s dashboard
        </label>
        {!f.familyId && <p className="cal-hint">Pick a family to be able to show this on their dashboard.</p>}
      </>
    );
  }

  return (
    <div className="cal-modal-backdrop" onClick={onClose}>
      <form className="cal-modal" onClick={(e) => e.stopPropagation()} onSubmit={onSave}>
        <div className="cal-modal-head">
          <h2>{heading}</h2>
          <button type="button" className="cal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {body}
        <div className="cal-modal-actions">
          {removeLabel && (
            <button type="button" className="cal-delete-btn" onClick={onRemove}>
              {removeLabel}
            </button>
          )}
          <div className="cal-modal-actions-right">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="cal-save-btn">
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
