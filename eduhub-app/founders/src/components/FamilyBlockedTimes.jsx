import { useState } from "react";
import { addBlockedTime, deleteBlockedTime, friendlyError } from "../lib/staffData";
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
export default function FamilyBlockedTimes({ familyId, from, to, blocked, onChange }) {
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

  return (
    <section className="panel tw-card">
      <div className="panel-head">
        <h2>
          When the parent isn't free
          {blocked.length > 0 && <span className="panel-count">{blocked.length}</span>}
        </h2>
        {hasWindow && (
          <span className="tw-window">
            In Dubai {dayLabel(from)} – {dayLabel(to)}
          </span>
        )}
      </div>
      <p className="panel-hint tw-hint">
        {hasWindow
          ? "Flights, meetings, school runs. Every tour slot a school offers is checked against these."
          : "Set the visit dates (In Dubai from / until) above first, so the blocked times can sit inside the window."}
      </p>
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
    </section>
  );
}
