import { useEffect, useState } from "react";

// One application as five circles (Apply, Fee, Assessment, Outcome, Placed),
// with just the picked stage's card open underneath, so every card stays
// reachable without a long scroll. Rebuilt on the new layout (29 Oct 2026);
// the cards themselves are the existing ones from ApplicationProcess.jsx.
//
// steps: [{ key, label, state, summary, children }]
//   state: "done" | "current" | "todo" | "skipped" | "bad" | "na"
const SHORT = { application: "Apply", fee: "Fee", assessment: "Assessment", decision: "Outcome", placed: "Placed" };
const MARK = { done: "✓", skipped: "–", bad: "✕", na: "–", current: "", todo: "" };

export default function ApplicationStepper({ steps, aside }) {
  const fallback =
    steps.find((s) => s.state === "current") || steps.find((s) => s.state === "bad") || steps.find((s) => s.state === "todo") || steps[steps.length - 1];
  const [openKey, setOpenKey] = useState(fallback.key);
  // When the application moves on, open the new current stage.
  useEffect(() => setOpenKey(fallback.key), [fallback.key]);
  const openIndex = Math.max(0, steps.findIndex((s) => s.key === openKey));
  const open = steps[openIndex];

  return (
    <div className="ap2-process">
      <div className="ap2-stepper" role="tablist" aria-label="Application stages">
        {steps.map((s, i) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={i === openIndex}
            className={"ap2-step is-" + s.state + (i === openIndex ? " is-pick" : "")}
            onClick={() => setOpenKey(s.key)}
          >
            <span className="ap2-dot">{MARK[s.state] || i + 1}</span>
            <b>{SHORT[s.key] || s.label}</b>
            <small>
              {s.summary ||
                (s.state === "skipped" ? "Skipped" : s.state === "todo" ? "Not yet" : s.state === "na" ? "Not needed" : "")}
            </small>
          </button>
        ))}
      </div>
      <div className={aside ? "sv-cols21" : ""}>
        <div className="sv-blk ap2-card">
          <h3>
            <span>
              Step {openIndex + 1} · {open.label}
            </span>
          </h3>
          {open.children}
        </div>
        {aside}
      </div>
    </div>
  );
}
