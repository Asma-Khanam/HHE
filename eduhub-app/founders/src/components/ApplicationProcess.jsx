import AutosaveField from "./Autosave";
import ProcessSteps from "./ProcessSteps";
import { REJECTION_REASONS } from "../lib/workflow";
import { meetingPlatform } from "../lib/meetingLink";
import { shortDate, oneMonthAfter } from "../lib/placement";

// One application as a process (founders, 25 Sept 2026):
//   Apply -> Assessment -> Outcome -> Placed
// "Awaiting decision" and "Decision" are one step now (Outcome): the school
// either offers a place, waitlists, or declines -- declining closes the
// application.
// Done steps close and go grey, the current one is open, and any step can
// be opened to look back or skip ahead. "Move back to this step" puts the
// application back if something was marked by mistake.

const CURRENT = { draft: 0, submitted: 1, assessment_booked: 1, under_review: 2, waitlisted: 2, offer: 3, rejected: 2, offer_accepted: 4 };
const STEP_ENTRY = ["draft", "submitted", "under_review", "offer"];

function time12(t) {
  if (!t) return "";
  const [h, m] = String(t).split(":");
  const hour = Number(h);
  return `${((hour + 11) % 12) + 1}${m && m !== "00" ? ":" + m : ""}${hour >= 12 ? "pm" : "am"}`;
}
const today = () => new Date().toISOString().slice(0, 10);

export default function ApplicationProcess({
  application: a,
  childName,
  placement,
  onPatch, // (changes) => Promise<boolean>
  onStatus, // (status, extraChanges?) => void
  onMeetingLink, // (text) => Promise<boolean>
  onStartDate, // (date) => void
  onLog, // (description, eventType?) => void -- activity log entry, with who did it
  portalUrl,
}) {
  const cur = CURRENT[a.status] ?? 0;
  const declined = a.status === "rejected";
  const hasAssessment = !!(a.assessment_date || a.assessment_link);
  const state = (i) => (i < cur ? "done" : i === cur ? "current" : "todo");

  const save = (changes) => async (v) => {
    const ok = await onPatch(typeof changes === "function" ? changes(v) : { [changes]: v });
    if (!ok) throw new Error("check the message above, then Retry");
  };

  const moveBack = (i) => (
    <button type="button" className="apx-back" onClick={() => onStatus(STEP_ENTRY[i])}>
      Move back to this step
    </button>
  );

  // 1. Application ----------------------------------------------------------
  const s1 = {
    key: "application",
    label: "Apply",
    state: state(0),
    summary:
      cur > 0
        ? `Submitted${a.submitted_at ? " " + shortDate(a.submitted_at) : ""}`
        : "Fill in the school's form, then add the date submitted",
    children: (
      <>
        {portalUrl && (
          <a className="panel-btn apx-portal-btn" href={portalUrl} target="_blank" rel="noreferrer">
            Open the school&apos;s portal ↗
          </a>
        )}
        <div className="ps-grid">
          <label className="ps-field">
            <span>Date submitted</span>
            <input
              type="date"
              className="panel-input"
              value={a.submitted_at ? String(a.submitted_at).slice(0, 10) : ""}
              onChange={(e) => {
                const v = e.target.value || null;
                // Putting the date in is the "submitted" moment.
                if (v && cur === 0) onStatus("submitted", { submitted_at: v });
                else onPatch({ submitted_at: v }).then((ok) => ok && v && onLog(`Date submitted set to ${shortDate(v)}`));
              }}
            />
          </label>
        </div>
        <p className="ps-hint">The family&apos;s login is in &ldquo;Portal login &amp; activity log&rdquo; at the top of this card.</p>
        <div className="ps-actions">
          {cur === 0 ? (
            <button
              type="button"
              className="panel-btn panel-btn-primary"
              onClick={() => onStatus("submitted", a.submitted_at ? {} : { submitted_at: today() })}
            >
              Mark as submitted ✓
            </button>
          ) : (
            moveBack(0)
          )}
        </div>
      </>
    ),
  };

  // 2. Assessment -----------------------------------------------------------
  const assessWhen = a.assessment_date
    ? `${shortDate(a.assessment_date)}${a.assessment_time ? ", " + time12(a.assessment_time) : ""}${
        a.assessment_link ? " · " + meetingPlatform(a.assessment_link) : ""
      }`
    : "";
  const s2 = {
    key: "assessment",
    label: "Assessment",
    state: cur > 1 && !hasAssessment ? "skipped" : state(1),
    summary:
      cur > 1
        ? hasAssessment
          ? `Done · ${assessWhen || "online"}`
          : "No assessment"
        : assessWhen
        ? `Booked · ${assessWhen}`
        : cur === 1
        ? "Not booked yet"
        : "",
    children: (
      <>
        <p className="apx-family-sees">The family sees these as soon as they save. No need to press Update family.</p>
        <div className="ps-grid">
          <label className="ps-field">
            <span>Date</span>
            <input
              type="date"
              className="panel-input"
              value={a.assessment_date || ""}
              onChange={(e) => {
                const v = e.target.value || null;
                // Booking a date moves a submitted application to "Assessment booked".
                if (v && a.status === "submitted") onStatus("assessment_booked", { assessment_date: v });
                else onPatch({ assessment_date: v }).then((ok) => ok && v && onLog(`Assessment date set to ${shortDate(v)}`, "assessment_booked"));
              }}
            />
          </label>
          <label className="ps-field">
            <span>Time</span>
            <input
              type="time"
              className="panel-input"
              value={(a.assessment_time || "").slice(0, 5)}
              onChange={(e) => onPatch({ assessment_time: e.target.value || null })}
              onBlur={(e) => e.target.value && onLog(`Assessment time set to ${time12(e.target.value)}`, "assessment_booked")}
            />
          </label>
        </div>
        <AutosaveField
          collapsible
          label={a.assessment_link ? `Join link (${meetingPlatform(a.assessment_link)})` : "Join link: paste the whole Teams / Zoom invite"}
          placeholder="Paste the invite. The meeting ID and passcode fill themselves in. Leave blank if it's at the school."
          value={a.assessment_link}
          onSave={async (v) => {
            const ok = await onMeetingLink(v);
            if (!ok) throw new Error("check the message above, then Retry");
            if (v) onLog("Assessment join link saved", "assessment_booked");
          }}
        />
        <div className="ps-grid">
          <AutosaveField label="Meeting ID" placeholder="e.g. 312 456 789 012" value={a.assessment_meeting_id} onSave={save("assessment_meeting_id")} />
          <AutosaveField label="Passcode" placeholder="e.g. aB3cD4" value={a.assessment_passcode} onSave={save("assessment_passcode")} />
        </div>
        <AutosaveField
          collapsible
          multiline
          rows={3}
          label="Details for the family"
          placeholder="What to bring, who they're meeting, anything the family needs to know"
          value={a.assessment_notes}
          onSave={save("assessment_notes")}
        />
        <div className="ps-actions">
          {cur <= 1 ? (
            <>
              <button type="button" className="panel-btn panel-btn-primary" onClick={() => onStatus("under_review")}>
                Assessment done ✓
              </button>
              {!hasAssessment && (
                <button type="button" className="panel-btn" onClick={() => onStatus("under_review")}>
                  No assessment at this school, skip
                </button>
              )}
            </>
          ) : (
            moveBack(1)
          )}
        </div>
      </>
    ),
  };

  // 3. Decision -------------------------------------------------------------
  const s3 = {
    key: "decision",
    label: "Outcome",
    state: declined ? "bad" : state(2),
    summary: declined
      ? `Declined${a.rejected_reason ? " · " + a.rejected_reason : ""}`
      : cur > 2
      ? `Offered a place${a.offer_decision_by && cur === 3 ? " · reply by " + shortDate(a.offer_decision_by) : ""}`
      : a.status === "waitlisted"
      ? "Waitlisted"
      : cur === 2
      ? "Waiting on the school"
      : "",
    children: (
      <>
        {declined ? (
          <>
            <AutosaveField
              collapsible
              label="Why the school said no"
              placeholder="e.g. No space this year"
              value={a.rejected_reason}
              onSave={save("rejected_reason")}
            />
            <div className="ap-chips">
              <span className="ap-chips-label">Quick pick</span>
              {REJECTION_REASONS.filter((r) => r !== "Other").map((r) => (
                <button
                  key={r}
                  type="button"
                  className={"ap-chip" + (a.rejected_reason === r ? " is-on" : "")}
                  onClick={() => onPatch({ rejected_reason: r })}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="ps-actions">{moveBack(2)}</div>
          </>
        ) : (
          <>
            {cur >= 3 && (
              <div className="ps-grid">
                <label className="ps-field">
                  <span>Family must reply by</span>
                  <input
                    type="date"
                    className="panel-input"
                    value={a.offer_decision_by || ""}
                    onChange={(e) =>
                      onPatch({ offer_decision_by: e.target.value || null }).then(
                        (ok) => ok && e.target.value && onLog(`Family must reply to the offer by ${shortDate(e.target.value)}`)
                      )
                    }
                  />
                </label>
              </div>
            )}
            {cur <= 2 ? (
              <>
                <p className="ps-hint">What did the school come back with? Declined closes this application (nothing is deleted).</p>
                <div className="ps-actions">
                  <button type="button" className="panel-btn panel-btn-primary" onClick={() => onStatus("offer")}>
                    Offered a place ✓
                  </button>
                  <button
                    type="button"
                    className="panel-btn"
                    onClick={() => onStatus("waitlisted")}
                    disabled={a.status === "waitlisted"}
                  >
                    Waitlisted
                  </button>
                  <button type="button" className="panel-btn panel-btn-danger" onClick={() => onStatus("rejected")}>
                    Declined
                  </button>
                </div>
              </>
            ) : (
              <div className="ps-actions">{moveBack(2)}</div>
            )}
          </>
        )}
      </>
    ),
  };

  // 4. Placed ---------------------------------------------------------------
  const placed = a.status === "offer_accepted";
  const start = placement?.start_date || "";
  const s4 = {
    key: "placed",
    label: "Placed",
    // Placed but no first day yet: keep this step open until the date is in.
    state: declined ? "na" : placed ? (start ? "done" : "current") : state(3),
    summary: placed
      ? `🎓 Placed${start ? " · starts " + shortDate(start) : " · add the start date"}`
      : cur === 3
      ? `Did ${childName || "the family"} accept the offer?`
      : "",
    children: (
      <>
        {!placed ? (
          <>
            <p className="ps-hint">
              Marking this placed closes {childName ? `${childName}'s` : "the"} other schools (they go grey, nothing is
              deleted).
            </p>
            <div className="ps-actions">
              <button
                type="button"
                className="panel-btn panel-btn-primary"
                onClick={() => onStatus("offer_accepted", a.offer_accepted_on ? {} : { offer_accepted_on: today() })}
              >
                Offer accepted, mark placed 🎓
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="ps-grid">
              <label className="ps-field">
                <span>Accepted on</span>
                <input
                  type="date"
                  className="panel-input"
                  value={a.offer_accepted_on || ""}
                  onChange={(e) =>
                    onPatch({ offer_accepted_on: e.target.value || null }).then(
                      (ok) => ok && e.target.value && onLog(`Offer accepted on ${shortDate(e.target.value)}`)
                    )
                  }
                />
              </label>
              <label className="ps-field">
                <span>First day at school</span>
                <input
                  type="date"
                  className="panel-input"
                  defaultValue={start}
                  key={start}
                  onBlur={(e) => {
                    if (e.target.value && e.target.value !== start) {
                      onStartDate(e.target.value);
                      onLog(`First day at school set to ${shortDate(e.target.value)}`);
                    }
                  }}
                />
              </label>
            </div>
            <p className="ps-hint">
              {start
                ? `On the calendar for ${shortDate(start)} (wish them luck), and a one-month check-in task for ${shortDate(
                    oneMonthAfter(start)
                  )}.`
                : "Add the first day: it goes on the calendar and adds a one-month check-in task."}
            </p>
            <div className="ps-actions">{moveBack(3)}</div>
          </>
        )}
      </>
    ),
  };

  return <ProcessSteps steps={[s1, s2, s3, s4]} />;
}

// For the collapsed card's mini bar.
export function applicationMiniSteps(a) {
  const cur = CURRENT[a.status] ?? 0;
  const st = (i) => (i < cur ? "done" : i === cur ? "current" : "todo");
  if (a.status === "rejected")
    return [
      { key: "1", label: "Apply", state: "done" },
      { key: "2", label: "Assessment", state: a.assessment_date ? "done" : "skipped" },
      { key: "3", label: "Declined", state: "bad" },
      { key: "4", label: "Placed", state: "na" },
    ];
  return ["Apply", "Assessment", "Outcome", "Placed"].map((label, i) => ({
    key: String(i),
    label,
    state: i === 1 && cur > 1 && !(a.assessment_date || a.assessment_link) ? "skipped" : st(i),
  }));
}
