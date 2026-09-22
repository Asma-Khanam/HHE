import { APPLICATION_TRACK_STEPS, trackStepState } from "../lib/workflow";

// The horizontal stage tracker on an application card (September 2026
// redesign) -- five nodes, connected by a line that fills in as the
// application moves along. Clicking a node just opens that stage's panel
// below (ApplicationsPanel owns `openIndex`/`onSelect`) -- it never changes
// the application's actual status by itself, so a consultant can look ahead
// at "what does Assessment need" without accidentally moving the record
// there. `currentTone` colours only the node the application is actually
// AT right now (done/upcoming nodes stay neutral) -- e.g. green once an
// offer comes in, amber if waitlisted, red if declined.
export default function ApplicationStageTrack({ status, openIndex, currentTone, onSelect }) {
  return (
    <div className="ap-track" role="tablist" aria-label="Application stage">
      {APPLICATION_TRACK_STEPS.map((step, i) => {
        const state = trackStepState(i, status);
        const isOpen = i === openIndex;
        const tone = state === "current" && currentTone ? currentTone : null;
        return (
          <div className="ap-track-item" key={step.key}>
            {i > 0 && <span className={"ap-track-line" + (state !== "upcoming" ? " is-filled" : "")} aria-hidden="true" />}
            <div className={"ap-track-step is-" + state + (tone ? " ap-tone-" + tone : "") + (isOpen ? " is-open" : "")}>
              <button
                type="button"
                role="tab"
                aria-selected={isOpen}
                className="ap-track-node"
                onClick={() => onSelect(i)}
                title={step.label}
              >
                <span className="ap-track-dot" aria-hidden="true">
                  {state === "done" ? "✓" : i + 1}
                </span>
              </button>
              <span className="ap-track-label">{step.shortLabel}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
