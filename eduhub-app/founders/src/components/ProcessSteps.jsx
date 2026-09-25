import { useEffect, useState } from "react";
import "./ProcessSteps.css";

// A school's progress as a process (founders, 25 Sept 2026): "when each
// step is done it closes as completed, once a stage is passed it goes grey,
// a consultant can skip ahead or go back to any stage."
//
// steps: [{ key, label, state, summary, children }]
//   state: "done" | "current" | "todo" | "skipped" | "bad" | "na"
// The current step opens by itself. Any step can be opened by clicking it.

export function stepStates(doneFlags) {
  // doneFlags: booleans in order. The step after the last done one is
  // current; anything before it that isn't done was skipped.
  const lastDone = doneFlags.lastIndexOf(true);
  return doneFlags.map((done, i) => (done ? "done" : i < lastDone ? "skipped" : i === lastDone + 1 ? "current" : "todo"));
}

const MARK = { done: "✓", skipped: "–", bad: "✕", na: "", current: "", todo: "" };

export default function ProcessSteps({ steps, openKey: forcedOpen }) {
  const current = steps.find((s) => s.state === "current")?.key || null;
  const [openKey, setOpenKey] = useState(forcedOpen ?? current);
  // When the process moves on (a step is marked done), open the new current step.
  useEffect(() => {
    setOpenKey(forcedOpen ?? current);
  }, [current, forcedOpen]);

  return (
    <ol className="ps">
      {steps.map((s, i) => {
        const open = openKey === s.key;
        return (
          <li key={s.key} className={"ps-step is-" + s.state + (open ? " is-open" : "")}>
            <button
              type="button"
              className="ps-head"
              onClick={() => setOpenKey(open ? null : s.key)}
              aria-expanded={open}
            >
              <span className="ps-dot" aria-hidden="true">
                {MARK[s.state] || i + 1}
              </span>
              <span className="ps-label">{s.label}</span>
              <span className="ps-summary">
                {s.summary ||
                  (s.state === "skipped"
                    ? "Skipped"
                    : s.state === "todo"
                    ? "Not reached yet"
                    : s.state === "na"
                    ? "Not needed"
                    : "")}
              </span>
              <span className={"ps-caret" + (open ? " is-open" : "")} aria-hidden="true">
                ▾
              </span>
            </button>
            {open && <div className="ps-body">{s.children}</div>}
          </li>
        );
      })}
    </ol>
  );
}

// The flow as arrows, for a card's header: Apply › Assessment › Outcome › Placed.
// Done = grey with a tick, current = burgundy, later = pale.
export function FlowBar({ steps }) {
  return (
    <span className="ps-flow" role="img" aria-label={steps.map((s) => `${s.label}: ${s.state}`).join(", ")}>
      {steps.map((s) => (
        <span key={s.key} className={"ps-flow-seg is-" + s.state} title={s.summary || s.label}>
          {s.state === "done" && "✓ "}
          {s.state === "bad" && "✕ "}
          {s.label}
        </span>
      ))}
    </span>
  );
}

// The compact version for a card's header: one segment per step.
export function MiniSteps({ steps }) {
  return (
    <span className="ps-mini" aria-hidden="true">
      {steps.map((s) => (
        <span key={s.key} className={"ps-mini-seg is-" + s.state} title={`${s.label}: ${s.summary || s.state}`} />
      ))}
    </span>
  );
}
