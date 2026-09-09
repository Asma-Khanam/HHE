import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTodayData, getCurrentStaff, setTaskDone, friendlyError } from "../lib/staffData";
import { daysUntil, isOverdue, isDueToday, noteKindLabel, relativeDay } from "../lib/workflow";
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
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// Trim a case-note body down to a single glanceable line — the full text is
// still one click away on the family's page, this is just the "at a glance"
// dashboard, not the case file itself.
function snippet(text, max = 80) {
  if (!text) return "";
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
}

// Five stat tiles used to sit in a plain 4-column grid, which left an
// orphaned 5th tile on its own row — the actual "alignment gap" the number
// row had. This lays them out so all five always sit evenly on one line
// (or wrap in full pairs), and swaps the old plain-text note for a small
// colored pill so tone reads at a glance instead of by reading words.
function StatTile({ value, label, note, tone }) {
  return (
    <div className={"today-stat" + (tone ? ` is-${tone}` : "")}>
      <div className="today-stat-value">{value}</div>
      <div className="today-stat-label">{label}</div>
      {note && <span className={"today-stat-pill" + (tone ? ` is-${tone}` : "")}>{note}</span>}
    </div>
  );
}

export default function TodayPage() {
  const [data, setData] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");
  const [busyTaskId, setBusyTaskId] = useState(null);

  function load() {
    getCurrentStaff().then(setMe).catch(() => {});
    getTodayData()
      .then(setData)
      .catch((err) => setError(friendlyError(err, "Couldn't load your dashboard.")));
  }

  useEffect(load, []);

  async function handleToggleTask(task) {
    setBusyTaskId(task.id);
    const wasDone = !!task.done_at;
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, done_at: wasDone ? null : new Date().toISOString() } : t)),
    }));
    try {
      await setTaskDone(task.id, !wasDone);
    } catch (err) {
      setError(friendlyError(err, "Couldn't update that task."));
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === task.id ? task : t)) }));
    } finally {
      setBusyTaskId(null);
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
  const overdue = open.filter((t) => isOverdue(t.due_date));
  const dueToday = open.filter((t) => isDueToday(t.due_date));
  const thisWeek = open.filter((t) => {
    const d = daysUntil(t.due_date);
    return d !== null && d >= 0 && d <= 7;
  });

  const myOpenTasks = open.filter((t) => t.assigned_to === me?.user_id);
  const unassignedOpenTasks = open.filter((t) => !t.assigned_to);
  const myTasks = [...myOpenTasks, ...unassignedOpenTasks]
    .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"))
    .slice(0, 6);

  const upcomingPayments = data.payments.slice(0, 4);
  const upcomingDeadlines = thisWeek.slice(0, 4);
  const activity = (data.recentActivity || []).slice(0, 5);

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

      {data.unownedFamilies.length > 0 && (
        <div className="today-owner-banner">
          <span>
            <strong>{data.unownedFamilies.length}</strong> famil{data.unownedFamilies.length === 1 ? "y needs" : "ies need"} an
            owner:
          </span>
          <div className="today-owner-chips">
            {data.unownedFamilies.map((f) => (
              <Link key={f.id} to={`/staff/families/${f.id}`} className="today-owner-chip">
                {f.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="today-stats">
        <StatTile
          value={dueToday.length}
          label="Due today"
          note={overdue.length ? `${overdue.length} overdue` : "on track"}
          tone={overdue.length ? "bad" : "good"}
        />
        <StatTile value={thisWeek.length} label="Due this week" note={`${open.length} open`} tone="neutral" />
        <StatTile
          value={data.chasingDocs}
          label="Docs to chase"
          note={data.expiringDocs ? `${data.expiringDocs} expiring` : "none expiring"}
          tone={data.expiringDocs ? "bad" : "good"}
        />
        <StatTile value={data.offersInPlay} label="Offers in play" note="every child" tone="neutral" />
        <StatTile
          value={data.payments.length}
          label="Payments owed"
          note={
            data.overduePayments ? `${data.overduePayments} overdue` : data.paymentsToConfirm ? `${data.paymentsToConfirm} to confirm` : "none overdue"
          }
          tone={data.overduePayments ? "bad" : data.paymentsToConfirm ? "progress" : "good"}
        />
      </div>

      <div className="today-main-grid">
        <section className="today-card">
          <div className="today-card-head">
            <h2>Your tasks</h2>
            <Link to="/staff/calendar" className="today-link-btn">
              Calendar ›
            </Link>
          </div>
          {myTasks.length === 0 ? (
            <p className="today-hint">All clear — nothing assigned or unclaimed.</p>
          ) : (
            <ul className="today-task-list">
              {myTasks.map((task) => {
                const overdueTask = isOverdue(task.due_date) && !task.done_at;
                const todayTask = isDueToday(task.due_date) && !task.done_at;
                return (
                  <li key={task.id} className={"today-task" + (task.done_at ? " is-done" : "")}>
                    <button
                      type="button"
                      className={"today-check" + (task.done_at ? " is-checked" : "")}
                      onClick={() => handleToggleTask(task)}
                      disabled={busyTaskId === task.id}
                      aria-label={task.done_at ? "Mark not done" : "Mark done"}
                    >
                      {task.done_at ? "✓" : ""}
                    </button>
                    <div className="today-task-text">
                      <div className="today-task-title">{task.title}</div>
                      <div className="today-task-meta">
                        {task.due_date ? shortDate(task.due_date) : "No date"}
                        {" · "}
                        {task.family_id ? (
                          <Link className="today-task-family" to={`/staff/families/${task.family_id}`}>
                            {task.familyName}
                          </Link>
                        ) : (
                          task.familyName
                        )}
                        {!task.assigned_to && " · unclaimed"}
                      </div>
                    </div>
                    {overdueTask && <span className="today-pill is-overdue">Overdue</span>}
                    {!overdueTask && todayTask && <span className="today-pill is-today">Today</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="today-side-stack">
          <section className="today-card today-card-compact">
            <div className="today-card-head">
              <h2>Payments owed</h2>
            </div>
            {upcomingPayments.length === 0 ? (
              <p className="today-hint">Nothing outstanding.</p>
            ) : (
              <ul className="today-mini-list">
                {upcomingPayments.map((payment) => (
                  <li key={payment.id} className="today-mini-row">
                    <div className="today-mini-text">
                      <span className="today-mini-title">{payment.label}</span>
                      <span className="today-mini-meta">
                        {payment.family_id ? (
                          <Link to={`/staff/families/${payment.family_id}`}>{payment.familyName}</Link>
                        ) : (
                          payment.familyName
                        )}
                      </span>
                    </div>
                    {payment.status === "submitted" ? (
                      <span className="today-pill is-today">To confirm</span>
                    ) : payment.isOverdue ? (
                      <span className="today-pill is-overdue">Overdue</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="today-card today-card-compact">
            <div className="today-card-head">
              <h2>Deadlines this week</h2>
            </div>
            {upcomingDeadlines.length === 0 ? (
              <p className="today-hint">Nothing due in 7 days.</p>
            ) : (
              <ul className="today-mini-list">
                {upcomingDeadlines.map((task) => (
                  <li key={task.id} className="today-mini-row">
                    <span className="today-mini-date">{shortDate(task.due_date)}</span>
                    <div className="today-mini-text">
                      <span className="today-mini-title">{task.title}</span>
                      <span className="today-mini-meta">
                        {task.family_id ? (
                          <Link to={`/staff/families/${task.family_id}`}>{task.familyName}</Link>
                        ) : (
                          task.familyName
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="today-card">
        <div className="today-card-head">
          <h2>Recent activity</h2>
        </div>
        {activity.length === 0 ? (
          <p className="today-hint">Nothing logged yet.</p>
        ) : (
          <ul className="today-activity-list">
            {activity.map((note) => (
              <li key={note.id} className="today-activity">
                <div className="today-activity-avatar">{note.staffName.charAt(0).toUpperCase()}</div>
                <div className="today-activity-text">
                  <span className="today-activity-line">
                    <strong>{note.staffName}</strong> · {noteKindLabel(note.kind)} ·{" "}
                    {note.family_id ? <Link to={`/staff/families/${note.family_id}`}>{note.familyName}</Link> : note.familyName}
                    {" — "}
                    {snippet(note.body)}
                  </span>
                  <span className="today-activity-time">{relativeDay(note.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
