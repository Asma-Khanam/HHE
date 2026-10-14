import AutosaveField from "./Autosave";
import ProcessSteps from "./ProcessSteps";
import ApplicationFeeStep from "./ApplicationFeeStep";
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
  fees = [], // this application's application_fees rows
  familyId = null, // the family's id (invoice files are kept under it)
  onFeesChange = () => {}, // (updater) => void
}) {
  const cur = CURRENT[a.status] ?? 0;
  const declined = a.status === "rejected";
  const hasAssessment = !!(a.assessment_date || a.assessment_link || a.assessment_video_requested);
  const assessMode = a.assessment_video_requested ? "video" : a.assessment_in_person ? "in_person" : "online";
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
  const videoNote = a.assessment_video_requested
    ? a.assessment_video_sent_at
      ? `video sent ${shortDate(a.assessment_video_sent_at)}`
      : "video requested, not sent yet"
    : "";
  const s2 = {
    key: "assessment",
    label: "Assessment",
    state: cur > 1 && !hasAssessment ? "skipped" : state(1),
    summary:
      cur > 1
        ? hasAssessment
          ? `Done · ${assessWhen || videoNote || (a.assessment_in_person ? "in person" : "online")}`
          : "No assessment"
        : assessWhen
        ? `Booked · ${assessWhen}${a.assessment_in_person ? " · in person" : ""}`
        : videoNote
        ? `Booked · ${videoNote}`
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
        {/* How the assessment happens -- one choice, not two independent
            ticks (Miss Lyndsay, 14 Oct 2026, asked for the video option to
            improve on the earlier cramped layout). Online / in person / video
            are mutually exclusive, so picking one clears the fields that only
            belong to the others. */}
        <div className="apx-mode-row" role="radiogroup" aria-label="How the assessment happens">
          {[
            { k: "online", t: "Online", s: "Join link, meeting ID & passcode" },
            { k: "in_person", t: "At the school", s: "In person" },
            { k: "video", t: "Video (under 10)", s: "Child sends a video instead" },
          ].map((o) => (
            <label key={o.k} className={"apx-mode-opt" + (assessMode === o.k ? " is-on" : "")}>
              <input
                type="radio"
                name={`assess-mode-${a.id}`}
                checked={assessMode === o.k}
                onChange={() => {
                  if (assessMode === o.k) return;
                  const patch = { assessment_in_person: o.k === "in_person", assessment_video_requested: o.k === "video" };
                  if (o.k !== "video") patch.assessment_video_sent_at = null;
                  if (o.k !== "online") {
                    patch.assessment_link = null;
                    patch.assessment_meeting_id = null;
                    patch.assessment_passcode = null;
                  }
                  const label = o.k === "in_person" ? "in person at the school" : o.k === "video" ? "a video from the child (under 10)" : "online";
                  onPatch(patch).then((ok) => ok && onLog(`Assessment set as ${label}`, "assessment_booked"));
                }}
              />
              <span>
                <span className="apx-mode-t">{o.t}</span>
                <span className="apx-mode-s">{o.s}</span>
              </span>
            </label>
          ))}
        </div>
        {assessMode === "video" && (
          <div className="ps-grid">
            <label className="ps-field">
              <span>Video sent on</span>
              <input
                type="date"
                className="panel-input"
                value={a.assessment_video_sent_at || ""}
                onChange={(e) =>
                  onPatch({ assessment_video_sent_at: e.target.value || null }).then(
                    (ok) => ok && e.target.value && onLog(`Assessment video sent ${shortDate(e.target.value)}`, "assessment_booked")
                  )
                }
              />
            </label>
          </div>
        )}
        {assessMode === "online" && a.assessment_link && (
          <a className="panel-btn apx-portal-btn" href={a.assessment_link} target="_blank" rel="noreferrer">
            Open join link ↗
          </a>
        )}
        {assessMode === "online" && (
          <>
            <AutosaveField
              collapsible
              label={a.assessment_link ? `Join link (${meetingPlatform(a.assessment_link)})` : "Join link: paste the whole Teams / Zoom invite"}
              placeholder="Paste the invite. The meeting ID and passcode fill themselves in."
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
          </>
        )}
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

  // 1b. Application fee (Miss Lyndsay, 7 Oct 2026): between Apply and Assessment.
  const feeRows = fees || [];
  const unpaid = feeRows.filter((f) => f.status === "unpaid");
  const allPaid = feeRows.length > 0 && unpaid.length === 0;
  const money = (f) => (f.amount ? `AED ${Number(f.amount).toLocaleString()}` : "");
  const sFee = {
    key: "fee",
    label: "Application fee",
    state: allPaid ? "done" : feeRows.length ? "todo" : "na",
    summary: allPaid
      ? `Paid${feeRows[0].paid_at ? " " + shortDate(String(feeRows[0].paid_at).slice(0, 10)) : ""}`
      : feeRows.length
      ? `${unpaid.length} unpaid${money(unpaid[0]) ? " · " + money(unpaid[0]) : ""}${unpaid[0]?.sent_to_family_at ? " · sent to family" : ""}`
      : "No fee added yet",
    children: (
      <ApplicationFeeStep
        application={a}
        fees={feeRows}
        familyId={familyId}
        onFeesChange={onFeesChange}
        onLog={onLog}
      />
    ),
  };

  return <ProcessSteps steps={[s1, sFee, s2, s3, s4]} />;
}

// For the collapsed card's mini bar. Fee is its own stage between Apply
// and Assessment (Miss Heather, 12 Oct 2026): shown as done when every fee
// on the application is paid, as current (highlighted) while any is unpaid,
// and as to-do when none has been added yet.
export function applicationMiniSteps(a, fees = []) {
  const cur = CURRENT[a.status] ?? 0;
  const applied = cur >= 1; // past Apply
  const feeRows = (fees || []).filter((f) => f.status !== "waived");
  const feeExists = feeRows.length > 0;
  const feeUnpaid = feeRows.some((f) => f.status !== "paid");
  const feeAllPaid = feeExists && !feeUnpaid;
  const feeState = feeAllPaid
    ? "done"
    : feeExists && feeUnpaid
    ? "current"
    : applied
    ? "todo"
    : "todo";

  // Shared helpers for the three later stages.
  const assessmentDone = cur >= 2 || a.status === "under_review" || a.status === "waitlisted" || a.status === "offer" || a.status === "offer_accepted" || a.status === "rejected";
  const outcomeDone = a.status === "offer_accepted";
  const outcomeBad = a.status === "rejected";
  const outcomeCurrent = a.status === "under_review" || a.status === "waitlisted" || a.status === "offer";
  const placedDone = a.status === "offer_accepted";

  if (a.status === "rejected") {
    return [
      { key: "1", label: "Apply", state: "done" },
      { key: "2", label: "Fee", state: feeState === "done" ? "done" : feeExists ? "skipped" : "skipped" },
      { key: "3", label: "Assessment", state: a.assessment_date ? "done" : "skipped" },
      { key: "4", label: "Declined", state: "bad" },
      { key: "5", label: "Placed", state: "na" },
    ];
  }

  return [
    { key: "1", label: "Apply", state: applied ? "done" : "current" },
    { key: "2", label: "Fee", state: feeState },
    {
      key: "3",
      label: "Assessment",
      state: assessmentDone ? "done" : cur === 1 && (a.assessment_date || a.assessment_link || a.assessment_video_requested) ? "current" : applied ? "todo" : "todo",
    },
    { key: "4", label: "Outcome", state: outcomeDone ? "done" : outcomeBad ? "bad" : outcomeCurrent ? "current" : "todo" },
    { key: "5", label: "Placed", state: placedDone ? "done" : "todo" },
  ];
}
