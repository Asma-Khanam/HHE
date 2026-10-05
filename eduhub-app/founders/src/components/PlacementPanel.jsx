import { useEffect, useMemo, useState } from "react";
import {
  listPlacements,
  createPlacement,
  updatePlacementDate,
  listSearchRounds,
  startSearchRound,
  listChildApplications,
  listShortlistForFamily,
  friendlyError,
} from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import { oneMonthAfter, placedByChild, roundInfoByChild } from "../lib/placement";
import "./panels.css";

function fmt(d) {
  return d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

const REASONS = [
  "Not happy at the current school",
  "Moving again / relocating",
  "The place fell through",
  "Wants a different curriculum or type of school",
  "Sibling needs to be at the same school",
  "Other",
];

// Overview > Placement and search rounds. Shows once a family has been
// placed (or has already started another search).
//   * Each child has their own search. "Start new round" lets a placed child
//     look again: the old placement and applications stay as history, the
//     earlier shortlist carries over (untick what should not), and the
//     family goes back to Live until the child is placed again.
//   * Placement: the school and first day for each child. Saving one drops a
//     "wish them good luck" reminder on the calendar and a one-month
//     check-in task.
export default function PlacementPanel({ family, familyChildren, onChanged }) {
  const [rows, setRows] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [apps, setApps] = useState([]);
  const [shortlist, setShortlist] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [childId, setChildId] = useState("");
  const [school, setSchool] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The "Start new round" form, for one child at a time.
  const [startFor, setStartFor] = useState(null);
  const [reason, setReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [dropped, setDropped] = useState(new Set());

  const children = familyChildren || [];
  const childKey = children.map((c) => c.id).join(",");

  async function load() {
    try {
      const [pl, rd, ap, sl] = await Promise.all([
        listPlacements(family.id),
        listSearchRounds(family.id),
        listChildApplications(children.map((c) => c.id)).catch(() => []),
        listShortlistForFamily(family.id).catch(() => []),
      ]);
      setRows(pl || []);
      setRounds(rd);
      setApps(ap);
      setShortlist(sl);
    } catch (e) {
      setRows([]);
      setError(friendlyError(e, "Couldn't load placements."));
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family.id, childKey]);

  const schools = useMemo(
    () => shortlist.map((r) => ({ id: r.school_id, name: r.school?.name || "" })),
    [shortlist]
  );
  const appsByChild = useMemo(() => {
    const out = {};
    apps.forEach((a) => (out[a.child_id] = out[a.child_id] || []).push(a));
    return out;
  }, [apps]);
  const placed = useMemo(
    () => placedByChild({ children, applicationsByChild: appsByChild, placements: rows || [], schools, rounds }),
    [children, appsByChild, rows, schools, rounds]
  );
  const info = useMemo(() => roundInfoByChild(rounds), [rounds]);

  const nameOf = (id) => {
    const idx = children.findIndex((c) => c.id === id);
    return idx === -1 ? "Child" : displayNameForChild(children[idx], idx);
  };

  if (!loaded) return null;
  const anyPlaced = Object.keys(placed).length > 0;
  if (family.client_stage !== "placed" && !rounds.length && !(rows || []).length && !anyPlaced) return null;

  async function add() {
    if (!school.trim() || !date || busy) return;
    setBusy(true);
    setError("");
    try {
      const idx = children.findIndex((c) => c.id === childId);
      const childName = idx === -1 ? "" : displayNameForChild(children[idx], idx);
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

  function openStart(c) {
    setStartFor(c.id);
    setReason("");
    setReasonNote("");
    setDropped(new Set());
  }

  async function confirmStart(c, idx) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await startSearchRound({
        familyId: family.id,
        childId: c.id,
        childName: displayNameForChild(c, idx),
        fromSchoolName: placed[c.id]?.schoolName,
        reason,
        reasonNote,
        droppedSchoolIds: [...dropped],
      });
      setStartFor(null);
      await load();
      onChanged?.();
    } catch (e) {
      setError(friendlyError(e, "Couldn't start a new round. Has addendum 84 been run?"));
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

  const history = [...rounds].sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));

  return (
    <section className="family-detail-card">
      <div className="panel-head">
        <h2>Placement and search rounds</h2>
      </div>
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <p className="family-detail-hint">
        Each child has their own search. If a placed child needs to look again, start a new round: their placement stays
        as history and the family goes back to Live.
      </p>
      <ul className="ref-list">
        {children.map((c, i) => {
          const name = displayNameForChild(c, i);
          const round = info[c.id]?.number || 1;
          const p = placed[c.id];
          return (
            <li key={c.id} className="ref-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span className="ref-main">
                  <strong>{name}</strong> · Round {round} ·{" "}
                  {p ? `placed at ${p.schoolName}${p.startDate ? `, starts ${fmt(p.startDate)}` : ""}` : "searching"}
                </span>
                {p && startFor !== c.id && (
                  <button type="button" className="panel-btn" onClick={() => openStart(c)} disabled={busy}>
                    Start new round
                  </button>
                )}
              </div>
              {startFor === c.id && (
                <div className="ref-form" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <p className="family-detail-hint" style={{ margin: 0 }}>
                    Round {round + 1} for {name}. {p.schoolName} stays on record as where {name} is now.
                  </p>
                  <select className="panel-select" value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="">Reason (optional)</option>
                    {REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <input
                    className="panel-input"
                    placeholder="Note (optional)"
                    value={reasonNote}
                    onChange={(e) => setReasonNote(e.target.value)}
                  />
                  {schools.filter((s) => String(s.id) !== String(p.schoolId)).length > 0 && (
                    <div>
                      <div className="family-detail-hint" style={{ margin: "4px 0" }}>
                        Schools to carry over from the earlier shortlist (untick any to leave out):
                      </div>
                      {schools
                        .filter((s) => String(s.id) !== String(p.schoolId))
                        .map((s) => (
                          <label key={s.id} style={{ display: "block", fontSize: ".9rem" }}>
                            <input
                              type="checkbox"
                              checked={!dropped.has(String(s.id))}
                              onChange={(e) =>
                                setDropped((d) => {
                                  const n = new Set(d);
                                  if (e.target.checked) n.delete(String(s.id));
                                  else n.add(String(s.id));
                                  return n;
                                })
                              }
                            />{" "}
                            {s.name}
                          </label>
                        ))}
                    </div>
                  )}
                  <div>
                    <button type="button" className="panel-btn panel-btn-primary" onClick={() => confirmStart(c, i)} disabled={busy}>
                      {busy ? "Starting…" : `Start round ${round + 1}`}
                    </button>{" "}
                    <button type="button" className="panel-btn" onClick={() => setStartFor(null)} disabled={busy}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {history.length > 0 && (
        <>
          <h3 className="family-detail-hint" style={{ margin: "14px 0 4px" }}>
            Earlier rounds
          </h3>
          <ul className="ref-list">
            {history.map((r) => (
              <li key={r.id} className="ref-item">
                <span className="ref-main">
                  <strong>{nameOf(r.child_id)}</strong> · Round {r.round_number} started {fmt(r.started_at)}
                  {r.from_school_name ? ` · was at ${r.from_school_name}` : ""}
                  {r.reason ? ` · ${r.reason}` : ""}
                  {r.reason_note ? ` (${r.reason_note})` : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="family-detail-hint" style={{ margin: "14px 0 4px" }}>
        Start dates
      </h3>
      <p className="family-detail-hint">
        Add the school and first day for each child. It goes on the calendar as a reminder to wish them good luck, and a
        task is added for one month later to send the family a check-in email.
      </p>
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
          {children.map((c, i) => (
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
