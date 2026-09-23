import { APPLICATION_TRACK_STEPS, trackStepState } from "../lib/workflow";

// The stage tracker on an application card. Founder feedback (Sept 2026,
// WhatsApp): "didnt we decide the process timeline thing would be
// horizontal... make them like tabs, like we did in many other places" --
// this reuses the exact same segmented-control tab bar as the rest of the
// app (.family-detail-tabs/.family-detail-tab, from the family page's own
// Overview/Applications/etc. tabs), just one size down since it lives
// inside a card. Clicking a tab only PREVIEWS that stage's panel below --
// it never changes the application's actual status by itself, so a
// consultant can look ahead at "what does Assessment need" without moving
// the record there by accident.
//
// `currentTone` is the ONE signal that colours the tab the application is
// actually at right now (see workflow.js's currentStageTone): "ontrack" =
// green, "attention" = orange (stuck / back-and-forth), "declined" = red.
// Done tabs get a tick; upcoming tabs stay plain -- colour is about what
// needs doing now, not history.
export default function ApplicationStageTrack({ status, openIndex, currentTone, onSelect }) {
  return (
    <div className="family-detail-tabs ap-stage-tabs" role="tablist" aria-label="Application stage">
      {APPLICATION_TRACK_STEPS.map((step, i) => {
        const state = trackStepState(i, status);
        const isOpen = i === openIndex;
        const tone = state === "current" ? currentTone : null;
        return (
          <button
            key={step.key}
            type="button"
            role="tab"
            aria-selected={isOpen}
            title={step.label}
            className={
              "family-detail-tab ap-stage-tab" +
              (isOpen ? " is-active" : "") +
              (state === "done" ? " is-done" : "") +
              (tone ? " ap-tone-" + tone : "")
            }
            onClick={() => onSelect(i)}
          >
            {state === "done" && (
              <span className="ap-stage-tick" aria-hidden="true">
                ✓
              </span>
            )}
            {tone === "attention" && <span className="ap-stage-pip" title="Needs attention" aria-hidden="true" />}
            {step.shortLabel}
          </button>
        );
      })}
    </div>
  );
}
