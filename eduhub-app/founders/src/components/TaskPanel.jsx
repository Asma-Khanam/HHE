import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AutosaveField from "./Autosave";
import { createTask, updateTask, setTaskDone, friendlyError } from "../lib/staffData";
import { isOverdue } from "../lib/workflow";
import { taskPath, taskRow, taskWhere, taskState } from "../lib/taskLinks";
import "./TaskPanel.css";

// The Today page's task panel (Nov 2026): click a task and everything about it is here --
// what to do, where it is at, who has it, a note for the next person, and how it got here.
// With no task it is the "Add a task" form. Same panel, so there is one place to learn.

const TAB_CHOICES = [
  ["", "Just the family page"],
  ["visits", "School visits"],
  ["applications", "Applications"],
  ["emails", "Emails"],
  ["accounting", "Accounting"],
  ["documents", "Documents"],
];

const shortDay = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

// Only things we really know: who made it, who it was given to, and why a automatic one was raised.
function historyLines(task, nameOf) {
  const lines = [];
  if (task.assigned_to) {
    const by = task.assigned_by ? ` by ${nameOf(task.assigned_by)}` : "";
    lines.push({ when: task.assigned_at || task.created_at, text: `Given to ${nameOf(task.assigned_to)}${by}` });
  }
  let made;
  if (task.link_step === "escalate") made = "Raised automatically: 5 working days with no reply";
  else if (task.link_step === "chase") made = "Raised automatically: 3 working days with no reply";
  else if (task.link_step === "month_checkin") made = "Raised automatically: one month after the start date";
  else if (task.created_by) made = `Added by ${nameOf(task.created_by)}`;
  else made = "Added automatically";
  lines.push({ when: task.created_at, text: made });
  return lines;
}

function Shell({ title, onClose, children }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="tp-scrim" onMouseDown={onClose}>
      <aside className="tp" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="tp-top">
          <span className="tp-kicker">{title}</span>
          <button type="button" ref={closeRef} className="tp-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function TaskView({ task, staff, me, shortlistRows, nameOf, onClose, onChanged, onDone }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const row = taskRow(task, shortlistRows);
  const state = taskState(task, row);
  const path = taskPath(task);
  const late = isOverdue(task.due_date);

  async function patch(fields) {
    const updated = await updateTask(task.id, fields);
    onChanged(updated);
    return updated;
  }
  async function give(userId) {
    setError("");
    try {
      await patch({ assignedTo: userId });
    } catch (err) {
      setError(friendlyError(err, "Couldn't change who has it."));
    }
  }
  async function markDone() {
    setBusy(true);
    setError("");
    try {
      await setTaskDone(task.id, true);
      onDone(task);
    } catch (err) {
      setError(friendlyError(err, "Couldn't mark that done."));
      setBusy(false);
    }
  }

  return (
    <Shell title="Task" onClose={onClose}>
      <div className="tp-body">
        <div className="tp-chips">
          <span className={"tp-chip" + (late ? " is-late" : "")}>
            {task.due_date ? (late ? "Overdue · due " : "Due ") + shortDay(task.due_date) : "No due date"}
          </span>
          {task.link_tab && <span className="tp-chip">{taskWhere({ link_tab: task.link_tab }, null)}</span>}
        </div>

        <div>
          <AutosaveField
            label="What needs doing"
            value={task.title}
            className="tp-title"
            onSave={(v) => {
              if (!v) throw new Error("A task needs a name.");
              return patch({ title: v });
            }}
          />
          <div className="tp-family">
            {task.family_id ? <Link to={`/staff/families/${task.family_id}`}>{task.familyName}</Link> : task.familyName}
          </div>
        </div>

        {path && (
          <div className="tp-where">
            <span className="tp-label">Where it is at</span>
            {state && <span className="tp-where-text">{state}</span>}
            <Link to={path} className="tp-open">
              Open {taskWhere(task, row)} →
            </Link>
          </div>
        )}

        <div className="tp-two">
          <AutosaveField
            label="Due"
            type="date"
            value={task.due_date || ""}
            onSave={(v) => patch({ dueDate: v })}
          />
          <div className="tp-who">
            <span className="tp-label">Who has it</span>
            <span className="tp-who-name">
              {task.assigned_to ? (task.assigned_to === me?.user_id ? "You" : nameOf(task.assigned_to)) : "Waiting to be taken"}
            </span>
            <div className="tp-who-actions">
              {me && task.assigned_to !== me.user_id && (
                <button type="button" className="tp-btn-line" onClick={() => give(me.user_id)}>
                  Take this
                </button>
              )}
              <select
                className="tp-select"
                aria-label="Give to someone else"
                value=""
                onChange={(e) => e.target.value !== "" && give(e.target.value === "__none" ? "" : e.target.value)}
              >
                <option value="">Give to…</option>
                {staff
                  .filter((s) => s.user_id !== task.assigned_to)
                  .map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.full_name || s.email}
                    </option>
                  ))}
                {task.assigned_to && <option value="__none">Nobody (leave for anyone)</option>}
              </select>
            </div>
          </div>
        </div>

        <AutosaveField
          label="Note for whoever picks this up"
          multiline
          rows={3}
          value={task.note || ""}
          placeholder="For example: rang the school, they are closed until Wednesday."
          onSave={(v) => patch({ note: v })}
        />

        <div>
          <span className="tp-label">History</span>
          <ul className="tp-history">
            {historyLines(task, nameOf).map((h, i) => (
              <li key={i}>
                <span className="tp-when">{h.when ? shortDay(h.when) : ""}</span>
                <span>{h.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
      </div>
      <div className="tp-foot">
        <button type="button" className="tp-btn-done" onClick={markDone} disabled={busy}>
          Mark done
        </button>
        <button type="button" className="tp-btn-line" onClick={onClose}>
          Close
        </button>
      </div>
    </Shell>
  );
}

function TaskCreate({ families, staff, me, onClose, onCreated }) {
  const [familyId, setFamilyId] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }));
  const [who, setWho] = useState(me?.user_id || "");
  const [tab, setTab] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(e) {
    e.preventDefault();
    if (!familyId) return setError("Choose which family this is for.");
    if (!title.trim()) return setError("Say what needs doing.");
    setBusy(true);
    setError("");
    try {
      const created = await createTask({ familyId, title: title.trim(), dueDate: due, assignedTo: who, linkTab: tab });
      onCreated(created);
    } catch (err) {
      setError(friendlyError(err, "Couldn't add that task."));
      setBusy(false);
    }
  }

  return (
    <Shell title="Add a task" onClose={onClose}>
      <form className="tp-body" onSubmit={add}>
        <label className="tp-field">
          <span className="tp-label">Which family</span>
          <select className="tp-select" value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
            <option value="">Choose a family</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tp-field">
          <span className="tp-label">What needs doing</span>
          <input className="tp-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: call the parent about the tour" />
        </label>
        <div className="tp-two">
          <label className="tp-field">
            <span className="tp-label">Due</span>
            <input className="tp-input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label className="tp-field">
            <span className="tp-label">Who does it</span>
            <select className="tp-select" value={who} onChange={(e) => setWho(e.target.value)}>
              {me && <option value={me.user_id}>Me</option>}
              {staff
                .filter((s) => s.user_id !== me?.user_id)
                .map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.full_name || s.email}
                  </option>
                ))}
              <option value="">Leave it for anyone to take</option>
            </select>
          </label>
        </div>
        <label className="tp-field">
          <span className="tp-label">When someone clicks Open, go to</span>
          <select className="tp-select" value={tab} onChange={(e) => setTab(e.target.value)}>
            {TAB_CHOICES.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
        <div className="tp-foot tp-foot-inline">
          <button type="submit" className="tp-btn-done" disabled={busy}>
            Add task
          </button>
          <button type="button" className="tp-btn-line" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Shell>
  );
}

export default function TaskPanel(props) {
  return props.task ? <TaskView key={props.task.id} {...props} /> : <TaskCreate {...props} />;
}
