import { useState } from "react";
import { createTask, setTaskDone, deleteTask } from "../lib/staffData";
import { daysUntil, isOverdue } from "../lib/workflow";
import "./panels.css";

function dueLabel(dueDate) {
  const d = daysUntil(dueDate);
  if (d === null) return "no due date";
  if (d === 0) return "due today";
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
  if (d === 1) return "due tomorrow";
  return `due in ${d} days`;
}

// The family record's to-do list. Every task written here also shows up on
// the Today page — same `tasks` table, no separate copy.
export default function TasksPanel({ familyId, tasks: initialTasks, staff }) {
  const [tasks, setTasks] = useState(initialTasks || []);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = tasks.filter((t) => !t.done_at);
  const done = tasks.filter((t) => t.done_at);

  async function handleAdd(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const created = await createTask({ familyId, title: title.trim(), dueDate, assignedTo });
      setTasks((list) => [...list, created]);
      setTitle("");
      setDueDate("");
      setAssignedTo("");
      setAdding(false);
    } catch (err) {
      setError(err.message || "Couldn't add that task.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(task) {
    const nowDone = !task.done_at;
    setTasks((list) =>
      list.map((t) => (t.id === task.id ? { ...t, done_at: nowDone ? new Date().toISOString() : null } : t))
    );
    try {
      await setTaskDone(task.id, nowDone);
    } catch (err) {
      setError(err.message || "Couldn't update that task.");
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, done_at: task.done_at } : t)));
    }
  }

  async function handleDelete(task) {
    const previous = tasks;
    setTasks((list) => list.filter((t) => t.id !== task.id));
    try {
      await deleteTask(task.id);
    } catch (err) {
      setError(err.message || "Couldn't remove that task.");
      setTasks(previous);
    }
  }

  function renderTask(task) {
    return (
      <li key={task.id} className={"task-row" + (task.done_at ? " is-done" : "")}>
        <button
          type="button"
          className={"task-check" + (task.done_at ? " is-checked" : "")}
          onClick={() => handleToggle(task)}
          aria-label={task.done_at ? "Mark not done" : "Mark done"}
        >
          {task.done_at ? "✓" : ""}
        </button>
        <div className="task-row-text">
          <div className="task-row-title">{task.title}</div>
          <div className={"task-row-meta" + (!task.done_at && isOverdue(task.due_date) ? " is-overdue" : "")}>
            {task.done_at ? "done" : dueLabel(task.due_date)}
          </div>
        </div>
        <button type="button" className="panel-btn panel-btn-quiet" onClick={() => handleDelete(task)} title="Remove task">
          ✕
        </button>
      </li>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          Tasks
          {open.length > 0 && <span className="panel-count">{open.length}</span>}
        </h2>
        <button type="button" className="panel-btn" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Add task"}
        </button>
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {open.length === 0 && done.length === 0 ? (
        <p className="panel-hint">Nothing on the list for this family yet.</p>
      ) : (
        <ul className="panel-list">
          {open.map(renderTask)}
          {done.map(renderTask)}
        </ul>
      )}

      {adding && (
        <form className="panel-form" onSubmit={handleAdd}>
          <input
            type="text"
            className="panel-input panel-form-grow"
            placeholder="What needs doing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <input type="date" className="panel-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <select className="panel-select" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Anyone</option>
            {(staff || []).map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name || s.email}
              </option>
            ))}
          </select>
          <button type="submit" className="panel-btn panel-btn-primary" disabled={busy || !title.trim()}>
            {busy ? "Adding…" : "Add"}
          </button>
        </form>
      )}
    </section>
  );
}
