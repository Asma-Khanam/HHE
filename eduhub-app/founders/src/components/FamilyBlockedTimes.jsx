import { useState } from "react";
import EmailComposer from "./EmailComposer";
import { addBlockedTime, deleteBlockedTime, markParentAvailabilityRequested, friendlyError } from "../lib/staffData";
import { parentAvailabilityEmail } from "../lib/visitEmails";
import { clock12 } from "../lib/tourConflicts";
import "./panels.css";
import "./TourWorkflow.css";

function dayLabel(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// Stage 1 of the School Visits workflow: when is the parent NOT free during
// their visit? Saved on the family, then checked against every tour slot a
// school offers (see TourSlotReview) and written into the school emails.
export default function FamilyBlockedTimes({ familyId, family, familyName, familyChildren, parents, composerCtx, from, to, blocked, onChange, onFamilyChanged }) {
  const [asking, setAsking] = useState(null);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const hasWindow = !!(from && to);
  const canAdd = date && (allDay || (start && end && end > start));

  async function add(e) {
    e.preventDefault();
    if (!canAdd) return;
    setBusy(true);
    setError("");
    try {
      await addBlockedTime({ familyId, date, start: allDay ? null : start, end: allDay ? null : end, reason });
      setDate("");
      setStart("");
      setEnd("");
      setReason("");
      await onChange();
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that time."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    setBusy(true);
    setError("");
    try {
      await deleteBlockedTime(id);
      await onChange();
    } catch (err) {
      setError(friendlyError(err, "Couldn't remove that time."));
    } finally {
      setBusy(false);
    }
  }

  function openAsk() {
    const p = (parents || []).find((x) => x.email) || (parents || [])[0];
    const draft = parentAvailabilityEmail({ parentName: p?.full_name, from, to, consultant: composerCtx.staffName });
    setAsking({ mode: "draft", to: (parents || []).map((x) => x.email).filter(Boolean), subject: draft.subject, text: draft.text });
  }

  async function asked() {
    setAsking(null);
    try {
      await markParentAvailabilityRequested(familyId);
      if (onFamilyChanged) onFamilyChanged();
    } catch (err) {
      setError(friendlyError(err, "The email was sent, but it couldn't be marked as sent. Do not send it again."));
    }
  }

  const askedAt = family?.parent_availability_requested_at;

  // No visit dates yet (Option 2): there is nothing to ask the parent about.
  if (!hasWindow) return null;

  return (
    <section className="panel tw-card tw-slim">
      <div className="panel-head">
        <h2>
          When the parent isn't free
          {blocked.length > 0 && <span className="panel-count">{blocked.length}</span>}
        </h2>
        <div className="tw-head-actions">
          <button type="button" className="panel-btn" onClick={openAsk} disabled={!!asking}>
            {askedAt ? "Ask again" : "Ask the parent"}
          </button>
          <button type="button" className="panel-btn" onClick={() => setAdding((v) => !v)}>
            {adding ? "Close" : "Add a time"}
          </button>
        </div>
      </div>
      {asking && (
        <div className="tw-compose">
          <EmailComposer
            key="ask-parent"
            familyId={familyId}
            familyName={familyName}
            childLines={composerCtx.childLines}
            documents={[]}
            staffName={composerCtx.staffName}
            familyAddress={composerCtx.familyAddress}
            childRows={familyChildren}
            dubaiFrom={from}
            dubaiUntil={to}
            initial={asking}
            onSent={asked}
            onClose={() => setAsking(null)}
          />
        </div>
      )}
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {blocked.length > 0 && (
        <ul className="tw-blocks">
          {blocked.map((b) => (
            <li key={b.id} className="tw-block">
              <span className="tw-block-day">{dayLabel(b.blocks_date)}</span>
              <span className="tw-block-time">
                {b.blocks_start ? `${clock12(b.blocks_start)} – ${clock12(b.blocks_end)}` : "All day"}
              </span>
              {b.reason && <span className="tw-block-reason">{b.reason}</span>}
              <button type="button" className="tw-x" onClick={() => remove(b.id)} disabled={busy} aria-label="Remove this time">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
      <form className="tw-add" onSubmit={add}>
        <label className="tw-field">
          <span>Date</span>
          <input type="date" value={date} min={from || undefined} max={to || undefined} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="tw-seg" role="group" aria-label="Whole day or specific times">
          <button type="button" className={allDay ? "is-on" : ""} onClick={() => setAllDay(true)}>
            All day
          </button>
          <button type="button" className={!allDay ? "is-on" : ""} onClick={() => setAllDay(false)}>
            Specific times
          </button>
        </div>
        {!allDay && (
          <>
            <label className="tw-field">
              <span>From</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="tw-field">
              <span>To</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </>
        )}
        <label className="tw-field tw-field-grow">
          <span>Reason (optional)</span>
          <input type="text" value={reason} placeholder="Flight, meeting, school run…" onChange={(e) => setReason(e.target.value)} />
        </label>
        <button type="submit" className="panel-btn panel-btn-primary" disabled={!canAdd || busy}>
          Add
        </button>
      </form>
      )}
    </section>
  );
}
