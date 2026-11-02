import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getTodayData, getCurrentStaff, setTaskDone, updateTask, listFamilyActionRows, loadCalendarEvents, friendlyError } from "../lib/staffData";
import { comingUpItems } from "../lib/comingUp";
import TaskPanel from "../components/TaskPanel";
import { computeFamilyActions, ACTION_HINT } from "../lib/familyActions";
import { taskPath, taskRow, taskWhere, taskState } from "../lib/taskLinks";
import { daysUntil, isOverdue, isDueToday } from "../lib/workflow";
import "./TodayPage.css";

const SECTION_KEY = "hh_today_section";
function readSavedSection() {
  try {
    return localStorage.getItem(SECTION_KEY);
  } catch {
    return null;
  }
}

function payMoney(p) {
  if (p.amount === null || p.amount === undefined || p.amount === "") return "";
  return `${p.currency || "AED"} ${Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function payState(p) {
  const what = p.status === "submitted" ? "The family says they have paid. Check and confirm." : p.isOverdue ? "Overdue." : "Not paid yet.";
  const m = payMoney(p);
  return m ? `${m}. ${what}` : what;
}

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


// Five stat tiles used to sit in a plain 4-column grid, which left an
// orphaned 5th tile on its own row — the actual "alignment gap" the number
// row had. This lays them out so all five always sit evenly on one line
// (or wrap in full pairs), and swaps the old plain-text note for a small
// colored pill so tone reads at a glance instead of by reading words.

export default function TodayPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [actions, setActions] = useState({});
  const [shortlistRows, setShortlistRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("all");
  const [section, setSection] = useState(readSavedSection);
  const [panel, setPanel] = useState(null); // null, "new", or the id of the open task
  const [toast, setToast] = useState("");

  function load() {
    getCurrentStaff().then(setMe).catch(() => {});
    getTodayData()
      .then(setData)
      .catch((err) => setError(friendlyError(err, "Couldn't load your dashboard.")));
    listFamilyActionRows()
      .then(({ rows, suggestions }) => {
        setShortlistRows(rows);
        setActions(computeFamilyActions(rows, suggestions));
      })
      .catch(() => {});
  }

  useEffect(() => {
    // The next 7 days of tours, assessments, consultations and first days (read only).
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 8);
    loadCalendarEvents({ from, to })
      .then(setEvents)
      .catch(() => {});
  }, []);

  useEffect(load, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleToggleTask(task) {
    setBusyTaskId(task.id);
    const wasDone = !!task.done_at;
    if (!wasDone) setToast(`Done. It is off the list and kept on ${task.familyName}\u2019s page.`);
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

  function mergeTask(updated) {
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)) }));
  }
  function addTask(created) {
    setData((d) => ({ ...d, tasks: [...d.tasks, { ...created, familyName: d.familyNames[created.family_id] || "Unknown family" }] }));
  }
  async function handleTake(task) {
    if (!me) return;
    try {
      mergeTask(await updateTask(task.id, { assignedTo: me.user_id }));
    } catch (err) {
      setError(friendlyError(err, "Couldn't take that task."));
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

  const staffById = Object.fromEntries((data.staff || []).map((x) => [x.user_id, x]));
  const nameOf = (id) => (id ? staffById[id]?.full_name || staffById[id]?.email || "Someone" : null);
  const familyChoices = data.families
    .map((f) => ({ id: f.id, name: data.familyNames[f.id] || "Unnamed family" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const panelTask = panel && panel !== "new" ? data.tasks.find((t) => t.id === panel && !t.done_at) || null : null;

  // What the school visits steps are waiting on us for. They are worked out live, so they
  // finish themselves when the step is done (nothing to tick) and open the exact school.
  const familyById = Object.fromEntries(data.families.map((f) => [f.id, f]));
  const actionItems = Object.entries(actions).flatMap(([fid, list]) =>
    familyById[fid] && !familyById[fid].archived_at && familyById[fid].client_stage === "live"
      ? list.map((a) => ({
          id: "act:" + a.key,
          isAction: true,
          family_id: fid,
          familyName: data.familyNames[fid] || "Unknown family",
          title: a.label,
          state: ACTION_HINT[a.step] || "",
          due_date: null,
          assigned_to: familyById[fid].owner_staff_id || null,
          link_tab: "visits",
          link_school_id: a.schoolId,
          link_step: a.step,
        }))
      : []
  );
  const open = [...data.tasks.filter((t) => !t.done_at), ...actionItems];

  // Every open task, in groups, in the page itself (no cap). Tabs say whose.
  const byDate = (x, y) => (x.due_date || "9999").localeCompare(y.due_date || "9999");
  const counts = {
    all: open.length,
    mine: open.filter((t) => t.assigned_to === me?.user_id).length,
    unclaimed: open.filter((t) => !t.assigned_to).length,
  };
  const shown = open
    .filter((t) => filter === "all" || (filter === "mine" && t.assigned_to === me?.user_id) || (filter === "unclaimed" && !t.assigned_to))
    .sort(byDate);
  const groupOf = (t) => {
    if (t.isAction) return "today";
    if (isOverdue(t.due_date)) return "overdue";
    if (isDueToday(t.due_date)) return "today";
    const d = daysUntil(t.due_date);
    return d !== null && d >= 0 && d <= 7 ? "week" : "later";
  };
  const GROUPS = [
    { key: "overdue", label: "Overdue" },
    { key: "today", label: "Today", sub: "Due today" },
    { key: "week", label: "This week", sub: "Due in the next 7 days" },
    { key: "later", label: "Later", sub: "Due after that, or no date" },
  ];
  const sections = GROUPS.map((g) => {
    const tasks = shown.filter((t) => groupOf(t) === g.key);
    const sub = g.key === "overdue" ? (tasks[0]?.due_date ? `Oldest due ${shortDate(tasks[0].due_date)}` : "Late") : g.sub;
    return { ...g, tasks, sub };
  });
  // Payments owed live in the same list, so everything is in one place.
  const payRows = [...data.payments].sort(
    (a, b) => (b.isOverdue ? 1 : 0) - (a.isOverdue ? 1 : 0) || (a.due_date || "9999").localeCompare(b.due_date || "9999")
  );
  const upRows = comingUpItems(events, shortlistRows).filter((u) => {
    const d = daysUntil(u.date);
    return d !== null && d >= 0 && d <= 7;
  });
  const allSections = [
    ...sections,
    {
      key: "payments",
      label: "Payments owed",
      tasks: payRows,
      sub: data.overduePayments > 0 ? `${data.overduePayments} overdue` : "Money families owe",
    },
    {
      key: "upcoming",
      label: "Coming up",
      tasks: upRows,
      sub: "Tours, assessments and calls in the next 7 days",
    },
  ];
  // Opens on whatever was open last time; if that is empty now, the first section with something in it.
  const firstFull = allSections.find((x) => x.tasks.length)?.key || "overdue";
  const activeKey = allSections.find((x) => x.key === section && x.tasks.length) ? section : firstFull;
  const active = allSections.find((x) => x.key === activeKey);
  function pickSection(key) {
    setSection(key);
    try {
      localStorage.setItem(SECTION_KEY, key);
    } catch {
      /* private window: just do not remember it */
    }
  }
  const overdueAll = open.filter((t) => isOverdue(t.due_date)).length;
  const TABS = [
    { key: "all", label: "Everyone\u2019s" },
    { key: "mine", label: "Mine" },
    { key: "unclaimed", label: "Waiting to be taken" },
  ];

  // Families still being worked on need a consultant; placed / archived ones don't.
  const liveIds = new Set(data.families.filter((f) => f.client_stage === "live").map((f) => f.id));
  const unowned = data.unownedFamilies.filter((f) => liveIds.has(f.id));


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
        <button type="button" className="today-add" onClick={() => setPanel("new")}>
          + Add a task
        </button>
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {toast && (
        <div className="today-toast" role="status">
          ✓ {toast}
        </div>
      )}

      {unowned.length > 0 && (
        <div className="today-owner-banner">
          <span>
            <strong>{unowned.length}</strong> live famil{unowned.length === 1 ? "y needs" : "ies need"} a
            consultant:
          </span>
          <div className="today-owner-chips">
            {unowned.map((f) => {
              const n = (actions[f.id] || []).length;
              return (
                <Link
                  key={f.id}
                  to={n > 0 ? `/staff/families/${f.id}?tab=visits` : `/staff/families/${f.id}`}
                  className="today-owner-chip"
                  title={n > 0 ? (actions[f.id] || []).map((a) => a.label).join("\n") : undefined}
                >
                  {f.name}
                  {n > 0 && <span className="today-owner-badge">{n}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="today-main-grid">
        <section className="today-card today-tasks">
          <div className="today-card-head">
            <h2>
              Tasks <span className="today-count">{counts.all}</span>
              {overdueAll > 0 && <span className="today-count is-bad">{overdueAll} overdue</span>}
            </h2>
            <Link to="/staff/activity" className="today-link-btn">
              Activity ›
            </Link>
            <Link to="/staff/calendar" className="today-link-btn">
              Calendar ›
            </Link>
          </div>

          {activeKey !== "payments" && activeKey !== "upcoming" && (
          <div className="today-tabs" role="tablist" aria-label="Which tasks">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={filter === t.key}
                className={"today-tab" + (filter === t.key ? " is-on" : "")}
                onClick={() => setFilter(t.key)}
              >
                {t.label} <span className="today-tab-count">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          )}

          <div className="today-split">
            <nav className="today-sections" aria-label="Task sections">
              {allSections.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  className={"today-section" + (x.key === activeKey ? " is-on" : "")}
                  aria-current={x.key === activeKey ? "true" : undefined}
                  disabled={!x.tasks.length}
                  onClick={() => pickSection(x.key)}
                >
                  <span className="today-section-name">
                    {x.label} <span className="today-section-count">{x.tasks.length}</span>
                  </span>
                  <span className="today-section-sub">{x.sub}</span>
                </button>
              ))}
            </nav>

            <div className="today-section-list">
              {active.tasks.length === 0 ? (
                <p className="today-hint">All clear. Nothing here.</p>
              ) : activeKey === "upcoming" ? (
                <ul className="today-task-list">
                  {active.tasks.map((u) => (
                    <li key={u.id} className="today-task">
                      <div className="today-task-text">
                        <div className="today-task-title">
                          {u.when} · {u.title}
                        </div>
                        {u.state && <div className="today-task-state">{u.state}</div>}
                        <div className="today-task-meta">
                          <span className="today-task-family-name">{u.familyName || u.kind}</span>
                          {" · "}
                          {u.kind}
                        </div>
                      </div>
                      <div className="today-task-actions">
                        {u.path && (
                          <Link to={u.path} className="today-open">
                            Open →
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : activeKey === "payments" ? (
                <ul className="today-task-list">
                  {active.tasks.map((p) => {
                    const path = `/staff/families/${p.family_id}?tab=${p.kind === "fee" ? "applications" : "accounting"}${p.schoolId ? `&school=${p.schoolId}` : ""}`;
                    return (
                      <li key={p.id} className="today-task">
                        <div className="today-task-text">
                          <div className="today-task-title">{p.label}</div>
                          <div className="today-task-state">{payState(p)}</div>
                          <div className="today-task-meta">
                            <span className="today-task-family-name">{p.familyName}</span>
                            {" · "}
                            <span className={p.isOverdue ? "today-due-late" : ""}>{p.due_date ? `Due ${shortDate(p.due_date)}` : "No due date"}</span>
                          </div>
                        </div>
                        <div className="today-task-actions">
                          <Link to={path} className="today-open">
                            Open →
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="today-task-list">
                  {active.tasks.map((task) => {
                    const row = taskRow(task, shortlistRows);
                    const state = task.isAction ? task.state : taskState(task, row);
                    const path = taskPath(task);
                    const late = isOverdue(task.due_date);
                    return (
                      <li key={task.id} className="today-task">
                        {task.isAction ? (
                          <span className="today-check is-auto" title="Clears itself when the step is done" aria-hidden="true" />
                        ) : (
                          <button
                            type="button"
                            className="today-check"
                            onClick={() => handleToggleTask(task)}
                            disabled={busyTaskId === task.id}
                            aria-label="Mark done"
                            title="Mark done"
                          />
                        )}
                        <div
                          className="today-task-text is-clickable"
                          role="button"
                          tabIndex={0}
                          onClick={() => (task.isAction ? navigate(path) : setPanel(task.id))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (task.isAction) navigate(path);
                              else setPanel(task.id);
                            }
                          }}
                        >
                          <div className="today-task-title">{task.title}</div>
                          {state && <div className="today-task-state">{state}</div>}
                          <div className="today-task-meta">
                            <span className="today-task-family-name">{task.familyName}</span>
                            {" · "}
                            {!task.isAction && (
                              <>
                                <span className={late ? "today-due-late" : ""}>{task.due_date ? `Due ${shortDate(task.due_date)}` : "No date"}</span>
                                {" · "}
                              </>
                            )}
                            {task.isAction && "Needs doing now · "}
                            {task.assigned_to
                              ? task.assigned_to === me?.user_id
                                ? "Yours"
                                : `With ${nameOf(task.assigned_to)}`
                              : "No consultant yet"}
                          </div>
                        </div>
                        <div className="today-task-actions">
                          {path && (
                            <Link to={path} className="today-open" title={`Opens ${taskWhere(task, row)}`}>
                              Open →
                            </Link>
                          )}
                          {!task.assigned_to && me && !task.isAction && (
                            <button type="button" className="today-take" onClick={() => handleTake(task)}>
                              Take this
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>

      </div>


      {panel && (panel === "new" || panelTask) && (
        <TaskPanel
          task={panelTask}
          families={familyChoices}
          staff={data.staff || []}
          me={me}
          shortlistRows={shortlistRows}
          nameOf={nameOf}
          onClose={() => setPanel(null)}
          onChanged={mergeTask}
          onCreated={(t) => {
            addTask(t);
            setPanel(null);
            setToast("Task added.");
          }}
          onDone={(t) => {
            mergeTask({ id: t.id, done_at: new Date().toISOString() });
            setPanel(null);
            setToast(`Done. It is off the list and kept on ${t.familyName}\u2019s page.`);
          }}
        />
      )}
    </div>
  );
}
