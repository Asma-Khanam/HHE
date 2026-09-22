import { APPLICATION_TRACK_STEPS, trackStepState } from "../lib/workflow";

// The stage timeline on an application card (redesigned Sept 2026 as a
// vertical list, one row per stage, connected by a line down the left --
// more room per stage for real content than the old horizontal row of
// dots, and it reads like a log of what happened rather than a countdown.
// Clicking a row just opens that stage's panel (ApplicationsPanel owns
// `openIndex`/`onSelect`) -- it never changes the application's actual
// status by itself, so a consultant can look ahead at "what does
// Assessment need" without moving the record there by accident.
//
// `currentTone` is the ONE signal that colours the node the application is
// actually at right now (see workflow.js's currentStageTone): "ontrack" =
// green, "attention" = orange (stuck / back-and-forth), "declined" = red.
// Done and upcoming nodes never take a tone -- grey either way, since the
// colour is about what needs doing now, not history.
export default function ApplicationStageTrack({ status, openIndex, currentTone, onSelect }) {
  return (
    <div className="ap-vtrack" role="tablist" aria-label="Application stage">
      {APPLICATION_TRACK_STEPS.map((step, i) => {
        const state = trackStepState(i, status);
        const isOpen = i === openIndex;
        const tone = state === "current" ? currentTone : null;
        const isLast = i === APPLICATION_TRACK_STEPS.length - 1;
        return (
          <div className="ap-vtrack-row" key={step.key}>
            <div className="ap-vtrack-rail">
              <button
                type="button"
                role="tab"
                aria-selected={isOpen}
                className={"ap-vtrack-node is-" + state + (tone ? " ap-tone-" + tone : "") + (isOpen ? " is-open" : "")}
                onClick={() => onSelect(i)}
                title={step.label}
              >
                <span className="ap-vtrack-dot" aria-hidden="true">
                  {state === "done" ? "✓" : i + 1}
                </span>
              </button>
              {!isLast && (
                <span
                  className={
                    "ap-vtrack-line" + (state === "done" ? " is-filled" : "") + (tone ? " ap-tone-" + tone : "")
                  }
                  aria-hidden="true"
                />
              )}
            </div>
            <button
              type="button"
              className={"ap-vtrack-label" + (isOpen ? " is-open" : "") + (state === "upcoming" ? " is-upcoming" : "")}
              onClick={() => onSelect(i)}
            >
              {step.label}
              {tone === "attention" && <span className="ap-vtrack-pip ap-tone-attention" title="Needs attention" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
