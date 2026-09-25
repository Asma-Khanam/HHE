import { useEffect, useMemo, useState } from "react";
import {
  loadCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  updateApplication,
  listStaff,
  listFamilies,
  friendlyError,
} from "../lib/staffData";
import "./CalendarPage.css";

const KIND_META = {
  // The database's own default kind for a plain calendar_events row
  // (eduhub_schema_addendum_6_calendar.sql) — needs an entry here so an
  // existing "reminder" event has a matching <option> to select. Without
  // one, the Kind <select> below falls back to showing its first option
  // for a reminder even though the actual value is untouched — confusing.
  reminder: { label: "Reminder", dot: "kind-reminder" },
  deadline: { label: "Deadline", dot: "kind-deadline" },
  team_event: { label: "Team event", dot: "kind-team" },
  other: { label: "Other", dot: "kind-other" },
  // Neither of these is a real, pickable "kind" from the New event form —
  // visits and assessments are only created from a family's Applications
  // panel, where there's an actual child + school to attach the date to.
  // Kept here purely so the calendar pill for one has a label and colour.
  school_visit: { label: "School visit", dot: "kind-visit" },
  assessment: { label: "Assessment", dot: "kind-assessment" },
};

// The subset of KIND_META that can actually be picked when creating or
// editing a plain calendar entry — school_visit/assessment are excluded on
// purpose, see the comment above. Founders (25 Sept 2026): the calendar is
// for tours and assessments, so there's no "Task" kind here any more --
// to-dos live on each family's Tasks list instead.
const PICKABLE_KINDS = Object.entries(KIND_META).filter(([key]) => key !== "school_visit" && key !== "assessment");

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// The 6x7 grid a month view needs, including the trailing days of the month
// before and the leading days of the month after so every week is full.
function buildGrid(monthStart) {
  const firstWeekday = monthStart.getDay();
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - firstWeekday);

  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

const emptyForm = {
  id: null,
  source: "calendar_event",
  title: "",
  kind: "reminder",
  familyId: "",
  childId: "",
  assignedTo: "",
  date: "",
  notes: "",
  visibleToClient: false,
  status: "upcoming",
};

export default function CalendarPage() {
  const [monthStart, setMonthStart] = useState(startOfMonth(new Date()));
  const [events, setEvents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [families, setFamilies] = useState([]);
  const [consultantFilter, setConsultantFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null); // null = modal closed

  const grid = useMemo(() => buildGrid(monthStart), [monthStart]);
  const today = new Date();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const from = new Date(monthStart);
      from.setDate(from.getDate() - 7);
      const to = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 7);
      const [ev, staffList, familyList] = await Promise.all([
        loadCalendarEvents({ from, to }),
        listStaff(),
        listFamilies(),
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
  }, [monthStart]);

  const eventsByDay = useMemo(() => {
    const map = {};
    events
      .filter(
        (e) =>
          consultantFilter === "all" ||
          e.created_by === consultantFilter ||
          e.assigned_to === consultantFilter
      )
      .forEach((e) => {
        const key = toDateKey(new Date(e.starts_at));
        (map[key] ||= []).push(e);
      });
    return map;
  }, [events, consultantFilter]);

  function openCreate(date) {
    setForm({ ...emptyForm, date: toDateKey(date) });
  }

  function openEdit(ev) {
    setForm({
      id: ev.id,
      source: ev.source,
      title: ev.title,
      kind: ev.kind,
      familyId: ev.family_id || "",
      childId: ev.child_id || "",
      assignedTo: ev.assigned_to || "",
      date: toDateKey(new Date(ev.starts_at)),
      notes: ev.notes || "",
      visibleToClient: ev.visible_to_client,
      status: ev.status,
      doneAt: ev.done_at || null,
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    if (form.source === "application_visit") {
      try {
        await updateApplication(form.id, { visit_date: form.date, visit_notes: form.notes });
        setForm(null);
        load();
      } catch (err) {
        setError(friendlyError(err, "Couldn't save that visit."));
      }
      return;
    }
    if (form.source === "application_assessment") {
      try {
        await updateApplication(form.id, { assessment_date: form.date, assessment_notes: form.notes });
        setForm(null);
        load();
      } catch (err) {
        setError(friendlyError(err, "Couldn't save that assessment."));
      }
      return;
    }
    if (!form.title.trim()) return;
    try {
      const payload = {
        familyId: form.familyId || null,
        childId: form.childId || null,
        kind: form.kind,
        title: form.title,
        notes: form.notes,
        startsAt: `${form.date}T00:00:00`,
        allDay: true,
        visibleToClient: form.visibleToClient,
      };
      if (form.id) {
        await updateCalendarEvent(form.id, { ...payload, status: form.status });
      } else {
        await createCalendarEvent(payload);
      }
      setForm(null);
      load();
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that."));
    }
  }

  async function handleDelete() {
    if (!form.id) return;
    try {
      if (form.source === "application_visit") {
        // The application itself stays — only the visit date/notes clear,
        // same as never having scheduled one.
        await updateApplication(form.id, { visit_date: null, visit_notes: null });
      } else if (form.source === "application_assessment") {
        await updateApplication(form.id, { assessment_date: null, assessment_notes: null });
      } else {
        await deleteCalendarEvent(form.id);
      }
      setForm(null);
      load();
    } catch (err) {
      setError(friendlyError(err, "Couldn't delete that."));
    }
  }

  const childrenForFamily = form?.familyId
    ? families.find((f) => f.id === form.familyId)?.children || []
    : [];

  return (
    <div className="cal-page">
      <div className="cal-toolbar">
        <div className="cal-toolbar-left">
          <h1 className="cal-title">
            {monthStart.toLocaleDateString(undefined, { month: "long" })} <span>{monthStart.getFullYear()}</span>
          </h1>
        </div>
        <div className="cal-toolbar-right">
          <select
            className="cal-filter"
            value={consultantFilter}
            onChange={(e) => setConsultantFilter(e.target.value)}
          >
            <option value="all">Everyone</option>
            {staff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name || s.email}
              </option>
            ))}
          </select>
          <div className="cal-nav">
            <button
              type="button"
              onClick={() => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1))}
              aria-label="Previous month"
            >
              ‹
            </button>
            <button type="button" className="cal-today-btn" onClick={() => setMonthStart(startOfMonth(new Date()))}>
              Today
            </button>
            <button
              type="button"
              onClick={() => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
          <button type="button" className="cal-new-btn" onClick={() => openCreate(new Date())}>
            + New event
          </button>
        </div>
      </div>

      {error && <div className="cal-error">{error}</div>}

      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">
            {w}
          </div>
        ))}

        {grid.map((day) => {
          const inMonth = day.getMonth() === monthStart.getMonth();
          const isToday = sameDay(day, today);
          const dayEvents = eventsByDay[toDateKey(day)] || [];
          return (
            <div
              key={day.toISOString()}
              className={"cal-cell" + (inMonth ? "" : " is-outside")}
              onClick={() => openCreate(day)}
            >
              <span className={"cal-daynum" + (isToday ? " is-today" : "")}>{day.getDate()}</span>
              <div className="cal-pills">
                {dayEvents.slice(0, 4).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    className={"cal-pill " + (KIND_META[ev.kind]?.dot || "kind-other") + (ev.done_at ? " is-done" : "")}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(ev);
                    }}
                    title={ev.title}
                  >
                    <span className="cal-pill-dot" />
                    {ev.title}
                    {ev.visible_to_client && <span className="cal-pill-client">· client</span>}
                  </button>
                ))}
                {dayEvents.length > 4 && <div className="cal-more">+{dayEvents.length - 4} more</div>}
              </div>
            </div>
          );
        })}
      </div>

      {loading && <div className="cal-loading">Loading…</div>}

      {form && (form.source === "application_visit" || form.source === "application_assessment") && (
        <div className="cal-modal-backdrop" onClick={() => setForm(null)}>
          <form className="cal-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
            <h2>{form.source === "application_visit" ? "School visit" : "Assessment"}</h2>
            <p className="cal-hint">
              {form.title}
              {form.familyId && (
                <>
                  {" · "}
                  <a href={`/staff/families/${form.familyId}`}>Open family ›</a>
                </>
              )}
            </p>

            <label>
              {form.source === "application_visit" ? "Visit date" : "Assessment date"}
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
                autoFocus
              />
            </label>

            <label>
              Notes
              <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>

            <div className="cal-modal-actions">
              <button type="button" className="cal-delete-btn" onClick={handleDelete}>
                {form.source === "application_visit" ? "Remove visit date" : "Remove assessment date"}
              </button>
              <div className="cal-modal-actions-right">
                <button type="button" onClick={() => setForm(null)}>
                  Cancel
                </button>
                <button type="submit" className="cal-save-btn">
                  Save
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {form && form.source !== "application_visit" && form.source !== "application_assessment" && (
        <div className="cal-modal-backdrop" onClick={() => setForm(null)}>
          <form className="cal-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
            <h2>{form.id ? "Edit event" : "New event"}</h2>

            <label>
              Title
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                autoFocus
              />
            </label>

            <div className="cal-modal-row">
              <label>
                Kind
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {PICKABLE_KINDS.map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </label>
            </div>

            <div className="cal-modal-row">
              <label>
                Family (optional)
                <select
                  value={form.familyId}
                  onChange={(e) => setForm({ ...form, familyId: e.target.value, childId: "" })}
                >
                  <option value="">No family — team event</option>
                  {families.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Child (optional)
                <select
                  value={form.childId}
                  onChange={(e) => setForm({ ...form, childId: e.target.value })}
                  disabled={!form.familyId}
                >
                  <option value="">Whole family</option>
                  {childrenForFamily.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name || c.preferred_name || c.first_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Notes
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>

            {form.id && (
              <label>
                Status
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="upcoming">Upcoming</option>
                  <option value="done">Done</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            )}

            <label className="cal-checkbox-row">
              <input
                type="checkbox"
                checked={form.visibleToClient}
                onChange={(e) => setForm({ ...form, visibleToClient: e.target.checked })}
                disabled={!form.familyId}
              />
              Show on the family's dashboard
            </label>
            {!form.familyId && <p className="cal-hint">Pick a family to be able to show this on their dashboard.</p>}

            <div className="cal-modal-actions">
              {form.id && (
                <button type="button" className="cal-delete-btn" onClick={handleDelete}>
                  Delete
                </button>
              )}
              <div className="cal-modal-actions-right">
                <button type="button" onClick={() => setForm(null)}>
                  Cancel
                </button>
                <button type="submit" className="cal-save-btn">
                  Save
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
