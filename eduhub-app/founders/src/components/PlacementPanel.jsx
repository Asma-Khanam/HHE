import { useEffect, useState } from "react";
import { listPlacements, createPlacement, updatePlacementDate, friendlyError } from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import { oneMonthAfter } from "../lib/placement";
import "./panels.css";

function fmt(d) {
  return d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

// Shown on a Placed family's Overview: the school and start date for each
// child. Saving one drops a "wish them good luck" reminder on the calendar
// for that day; changing the date moves the same reminder.
export default function PlacementPanel({ family, familyChildren, onChanged }) {
  const [rows, setRows] = useState(null);
  const [childId, setChildId] = useState("");
  const [school, setSchool] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listPlacements(family.id)
      .then((r) => alive && setRows(r))
      .catch((e) => {
        if (alive) {
          setRows([]);
          setError(friendlyError(e, "Couldn't load placements."));
        }
      });
    return () => {
      alive = false;
    };
  }, [family.id]);

  const nameOf = (id) => {
    const idx = (familyChildren || []).findIndex((c) => c.id === id);
    return idx === -1 ? "Child" : displayNameForChild(familyChildren[idx], idx);
  };

  async function add() {
    if (!school.trim() || !date || busy) return;
    setBusy(true);
    setError("");
    try {
      const idx = (familyChildren || []).findIndex((c) => c.id === childId);
      const childName = idx === -1 ? "" : displayNameForChild(familyChildren[idx], idx);
      const row = await createPlacement({ familyId: family.id, childId, childName, schoolName: school, startDate: date });
      setRows((l) => [...(l || []), row]);
      onChanged?.();
      setSchool("");
      setDate("");
      setChildId("");
    } catch (e) {
      setError(friendlyError(e, "Couldn't save that placement."));
    } finally {
      setBusy(false);
    }
  }

  async function changeDate(row, value) {
    if (!value || value === row.start_date) return;
    try {
      const updated = await updatePlacementDate(row, value);
      setRows((l) => l.map((r) => (r.id === row.id ? updated : r)));
      onChanged?.();
    } catch (e) {
      setError(friendlyError(e, "Couldn't update that date."));
    }
  }

  return (
    <section className="family-detail-card">
      <div className="panel-head">
        <h2>Placement</h2>
      </div>
      <p className="family-detail-hint">
        Add the school and first day for each child. It goes on the calendar as a reminder to wish them good luck, and
        a task is added for one month later to send the family a check-in email.
      </p>
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {rows && rows.length > 0 && (
        <ul className="ref-list">
          {rows.map((r) => (
            <li key={r.id} className="ref-item">
              <span className="ref-main">
                <strong>{nameOf(r.child_id)}</strong> · {r.school_name}
                <span className="pl-checkin">One-month check-in: {fmt(oneMonthAfter(r.start_date))}</span>
              </span>
              <input
                type="date"
                className="panel-input pl-date"
                defaultValue={r.start_date}
                onBlur={(e) => changeDate(r, e.target.value)}
                aria-label={`Start date, currently ${fmt(r.start_date)}`}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="ref-form">
        <select className="panel-select" value={childId} onChange={(e) => setChildId(e.target.value)}>
          <option value="">Which child?</option>
          {(familyChildren || []).map((c, i) => (
            <option key={c.id} value={c.id}>
              {displayNameForChild(c, i)}
            </option>
          ))}
        </select>
        <input className="panel-input" placeholder="School" value={school} onChange={(e) => setSchool(e.target.value)} />
        <input className="panel-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="button" className="panel-btn panel-btn-primary" onClick={add} disabled={busy || !school.trim() || !date}>
          {busy ? "Saving…" : "+ Add start date"}
        </button>
      </div>
    </section>
  );
}
