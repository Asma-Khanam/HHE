import { useEffect, useMemo, useState } from "react";
import {
  listShortlistForFamily,
  listChildAvailabilityForShortlistIds,
  updateShortlistTour,
  friendlyError,
} from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import { slotsFromShortlist, conflictFor, clock12 } from "../lib/tourConflicts";
import "./panels.css";
import "./TourWorkflow.css";

const AVAIL_LABEL = {
  awaiting: "Awaiting reply",
  yes: "Place",
  no: "No place",
  waitlist: "Waitlist",
  some_year_groups: "Some years",
};
const availTone = (v) => (v === "yes" ? "is-yes" : v === "no" ? "is-no" : v === "waitlist" || v === "some_year_groups" ? "is-partial" : "is-wait");

function dayLabel(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// Stage 4 of the School Visits workflow: one screen, every school, what it
// has said and the tour slot it offered. The schedule is settled with the
// schools here first; only then does the parent get one finished timetable.
export default function TourSlotReview({ familyId, familyChildren, blocked, hasVisitDates, refreshKey, onChanged }) {
  const [rows, setRows] = useState([]);
  const [childStatus, setChildStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState(null);

  const children = familyChildren || [];

  async function load() {
    setError("");
    try {
      const shortlist = await listShortlistForFamily(familyId);
      const cs = await listChildAvailabilityForShortlistIds(shortlist.map((r) => r.id));
      setRows(shortlist);
      setChildStatus(cs);
    } catch (err) {
      setError(friendlyError(err, "Couldn't load the tour slots."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, refreshKey]);

  const allSlots = useMemo(() => slotsFromShortlist(rows), [rows]);

  // One entry per school: availability per child, plus its tour slots.
  const schools = useMemo(() => {
    return rows
      .map((row) => {
        const perChild = children.map((c, i) => {
          const s = childStatus.find((x) => x.shortlist_id === row.id && x.child_id === c.id);
          return { id: c.id, name: displayNameForChild(c, i), year: c.year_group_applying_for || "", value: s?.availability_status || "awaiting" };
        });
        const slots = allSlots.filter((s) => s.rowId === row.id).map((s) => ({ ...s, conflict: conflictFor(s, blocked, allSlots) }));
        const allNo = perChild.length > 0 && perChild.every((c) => c.value === "no");
        const allAwaiting = perChild.every((c) => c.value === "awaiting");
        return { row, name: row.school?.name || "School", perChild, slots, allNo, allAwaiting };
      })
      .sort((a, b) => Number(a.allNo) - Number(b.allNo) || a.name.localeCompare(b.name));
  }, [rows, childStatus, children, allSlots, blocked]);

  const active = schools.filter((s) => !s.allNo);
  const withSlots = active.filter((s) => s.slots.length > 0);
  const confirmedCount = allSlots.filter((s) => s.status === "confirmed").length;
  const conflictCount = allSlots.filter((s) => conflictFor(s, blocked, allSlots)).length;
  const ready = allSlots.length > 0 && confirmedCount === allSlots.length && conflictCount === 0;

  async function accept(slot) {
    setBusyKey(slot.key);
    setError("");
    try {
      await updateShortlistTour(slot.rowId, {
        [slot.prefix + "status"]: "confirmed",
        [slot.prefix + "confirmed_at"]: new Date().toISOString(),
      });
      await load();
      if (onChanged) onChanged();
    } catch (err) {
      setError(friendlyError(err, "Couldn't confirm that tour."));
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <section className="panel tw-card">
        <p className="panel-hint">Loading…</p>
      </section>
    );
  }

  return (
    <section className="panel tw-card">
      <div className="panel-head">
        <h2>Tour slot review</h2>
        <span className={"tw-progress" + (ready ? " is-ready" : "")}>
          {allSlots.length === 0
            ? "No tour slots offered yet"
            : ready
            ? "Ready for the parent"
            : `${confirmedCount} of ${allSlots.length} confirmed by schools`}
        </span>
      </div>
      <p className="panel-hint tw-hint">
        Settle every tour with the schools first. The parent then gets one finished schedule to confirm.
      </p>
      {conflictCount > 0 && (
        <div className="tw-alert">
          {conflictCount === 1 ? "1 slot needs a look" : `${conflictCount} slots need a look`}: it clashes with a time the parent can't do, or
          with another tour.
        </div>
      )}
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {schools.length === 0 ? (
        <p className="panel-hint">Add schools to the shortlist below and they'll appear here.</p>
      ) : (
        <ul className="tw-rows">
          {schools.map((s) => (
            <li key={s.row.id} className={"tw-row" + (s.allNo ? " is-closed" : "")}>
              <div className="tw-school">
                <strong>{s.name}</strong>
                <span className="tw-opt">{hasVisitDates ? "Dates known" : "No dates yet"}</span>
              </div>

              <div className="tw-kids">
                {s.perChild.map((c) => (
                  <div key={c.id} className="tw-kid">
                    <span className="tw-kid-name">
                      {c.name}
                      {c.year ? <em> · {c.year}</em> : null}
                    </span>
                    <span className={"tw-chip " + availTone(c.value)}>{AVAIL_LABEL[c.value]}</span>
                  </div>
                ))}
              </div>

              <div className="tw-slots">
                {s.allNo ? (
                  <span className="tw-muted">No availability. Closed for this family.</span>
                ) : s.slots.length === 0 ? (
                  <span className="tw-muted">
                    {s.allAwaiting ? "Awaiting reply" : hasVisitDates ? "No tour slot offered yet" : "Tour slots can be requested once the family has dates"}
                  </span>
                ) : (
                  s.slots.map((slot) => (
                    <div key={slot.key} className={"tw-slot" + (slot.conflict ? " has-conflict" : "")}>
                      <div className="tw-slot-when">
                        <strong>{dayLabel(slot.date)}</strong>
                        <span>
                          {clock12(slot.start)}
                          {slot.end ? ` – ${clock12(slot.end)}` : ""}
                        </span>
                      </div>
                      <div className="tw-slot-check">
                        {slot.conflict ? <span className="tw-warn">{slot.conflict}</span> : <span className="tw-clear">Clear</span>}
                      </div>
                      <div className="tw-slot-act">
                        {slot.status === "confirmed" ? (
                          <span className="tw-status is-done">Tour confirmed by school</span>
                        ) : (
                          <>
                            <span className="tw-status">Slot offered</span>
                            <button type="button" className="panel-btn panel-btn-primary" disabled={busyKey === slot.key} onClick={() => accept(slot)}>
                              {busyKey === slot.key ? "Saving…" : "Accept"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {withSlots.length > 0 && !ready && allSlots.length > 0 && (
        <p className="panel-hint tw-foot">The schedule can go to the parent once every tour above is confirmed and clear.</p>
      )}
    </section>
  );
}
