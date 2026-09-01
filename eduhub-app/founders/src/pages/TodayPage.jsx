import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTodayData, getCurrentStaff, setTaskDone, friendlyError } from "../lib/staffData";
import { daysUntil, isOverdue, isDueToday } from "../lib/workflow";
import "./TodayPage.css";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstNameOf(staff) {
  const name = staff?.full_name || staff?.email || "";
  return name.split(/[\s@]/)[0] || "there";
}

function longDate(d) {
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function shortDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

// "due today" / "3 days overdue" / "in 4 days" / "no date" — the phrasing the
// list uses instead of printing a raw date next to every single row.
function dueLabel(dueDate) {
  const d = daysUntil(dueDate);
  if (d === null) return "no due date";
  if (d === 0) return "due today";
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
  if (d === 1) return "due tomorrow";
  return `due in ${d} days`;
}

function StatTile({ value, label, note, tone }) {
  return (
    <div className="today-stat">
      <div className="today-stat-value">{value}</div>
      <div className="today-stat-label">{label}</div>
      {note && <div className={"today-stat-note" + (tone ? ` is-${tone}` : "")}>{note}</div>}
    </div>
  );
}

export default function TodayPage() {
  const [data, setData] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    getCurrentStaff().then(setMe).catch(() => {});
    getTodayData()
      .then(setData)
      .catch((err) => setError(friendlyError(err, "Couldn't load your dashboard.")));
  }, []);

  async function toggleTask(task) {
    const nowDone = !task.done_at;
    // Optimistic — the checkbox should tick the instant it's clicked, not
    // after a round trip. If the write fails we put it back and say so.
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, done_at: nowDone ? new Date().toISOString() : null } : t)),
    }));
    try {
      await setTaskDone(task.id, nowDone);
    } catch (err) {
      setError(err.message || "Couldn't update that task.");
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, done_at: task.done_at } : t)),
      }));
    }
  }

  if (error && !data) {
    return (
      <div className="today-page">
        <div className="hh-form-banner hh-form-banner-error">{error}</div>
      </div>
    );
  }
  if (!data) return <div className="today-page">Loading…</div>;

  const open = data.tasks.filter((t) => !t.done_at);
  const doneToday = data.tasks.filter(
    (t) => t.done_at && new Date(t.done_at).toDateString() === new Date().toDateString()
  );

  const overdue = open.filter((t) => isOverdue(t.due_date));
  const dueToday = open.filter((t) => isDueToday(t.due_date));
  const thisWeek = open.filter((t) => {
    const d = daysUntil(t.due_date);
    return d !== null && d >= 0 && d <= 7;
  });

  // The main list: what actually needs doing today (overdue first), plus
  // whatever was ticked off today so it doesn't vanish the moment it's done.
  const needsToday = [...overdue, ...dueToday, ...doneToday];
  const listed = showAll ? [...open, ...doneToday] : needsToday;

  return (
    <div className="today-page">
      <div className="today-header">
        <div>
          <h1>
            {greeting()}, {firstNameOf(me)}
          </h1>
          <p className="today-subtitle">
            {longDate(new Date())} · {data.families.length} famil{data.families.length === 1 ? "y" : "ies"} on the
            caseload
          </p>
        </div>
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <div className="today-stats">
        <StatTile
          value={dueToday.length}
          label="Tasks due today"
          note={overdue.length ? `${overdue.length} overdue` : "nothing overdue"}
          tone={overdue.length ? "bad" : "good"}
        />
        <StatTile value={thisWeek.length} label="Deadlines this week" note={`${open.length} open in total`} />
        <StatTile
          value={data.chasingDocs}
          label="Documents to chase"
          note={data.expiringDocs ? `${data.expiringDocs} expiring soon` : "none expiring soon"}
          tone={data.expiringDocs ? "bad" : "good"}
        />
        <StatTile value={data.offersInPlay} label="Offers in play" note="across every child" />
      </div>

      <div className="today-grid">
        <section className="today-card">
          <div className="today-card-head">
            <h2>{showAll ? "All open tasks" : "Needs you today"}</h2>
            <button type="button" className="today-link-btn" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Just today ›" : "Across all families ›"}
            </button>
          </div>

          {listed.length === 0 ? (
            <p className="today-hint">
              {open.length === 0
                ? "No tasks yet. Open a family record and use “Add task” to put something here."
                : "Nothing due today — and nothing overdue."}
            </p>
          ) : (
            <ul className="today-task-list">
              {listed.map((task) => (
                <li key={task.id} className={"today-task" + (task.done_at ? " is-done" : "")}>
                  <button
                    type="button"
                    className={"today-check" + (task.done_at ? " is-checked" : "")}
                    onClick={() => toggleTask(task)}
                    aria-label={task.done_at ? "Mark not done" : "Mark done"}
                  >
                    {task.done_at ? "✓" : ""}
                  </button>
                  <div className="today-task-text">
                    <div className="today-task-title">{task.title}</div>
                    <div className="today-task-meta">
                      {task.family_id ? (
                        <Link to={`/staff/families/${task.family_id}`} className="today-task-family">
                          {task.familyName}
                        </Link>
                      ) : (
                        <span className="today-task-family">{task.familyName}</span>
                      )}
                      {" · "}
                      {task.done_at ? "done" : dueLabel(task.due_date)}
                    </div>
                  </div>
                  {!task.done_at && isOverdue(task.due_date) && <span className="today-pill is-overdue">Overdue</span>}
                  {!task.done_at && isDueToday(task.due_date) && <span className="today-pill is-today">Today</span>}
                  {task.assigneeInitial && <span className="today-assignee">{task.assigneeInitial}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="today-card">
          <div className="today-card-head">
            <h2>Deadlines this week</h2>
          </div>
          {thisWeek.length === 0 ? (
            <p className="today-hint">Nothing due in the next seven days.</p>
          ) : (
            <ul className="today-deadline-list">
              {thisWeek.map((task) => (
                <li key={task.id} className="today-deadline">
                  <div className="today-deadline-date">{shortDate(task.due_date)}</div>
                  <div className="today-deadline-text">
                    <div className="today-deadline-title">{task.title}</div>
                    <div className="today-deadline-meta">{task.familyName}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
