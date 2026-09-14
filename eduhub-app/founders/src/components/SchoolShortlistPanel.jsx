import { useEffect, useState } from "react";
import {
  listShortlistForFamily,
  listSchools,
  addToShortlist,
  updateShortlistEntry,
  removeFromShortlist,
  listChildAvailabilityForShortlistIds,
  upsertChildAvailability,
  updateShortlistTour,
  findTourClashes,
  friendlyError,
} from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import "./panels.css";
import "./SchoolShortlistPanel.css";

const AVAILABILITY_OPTIONS = [
  { value: "awaiting", label: "Awaiting reply" },
  { value: "yes", label: "Yes — place available" },
  { value: "some_year_groups", label: "Some year groups only" },
  { value: "waitlist", label: "Waitlist" },
  { value: "no", label: "No — full" },
];

const CHILD_AVAILABILITY_OPTIONS = [
  { value: "awaiting", label: "Awaiting" },
  { value: "yes", label: "Place" },
  { value: "waitlist", label: "Waitlist" },
  { value: "no", label: "No place" },
  { value: "some_year_groups", label: "Some year groups" },
];

const TOUR_STATUS_OPTIONS = [
  { value: "", label: "Not booked" },
  { value: "offered", label: "Offered" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function availabilityLabel(value) {
  return AVAILABILITY_OPTIONS.find((o) => o.value === value)?.label || value;
}

function availabilityClass(value) {
  if (value === "yes") return "is-yes";
  if (value === "no") return "is-no";
  if (value === "waitlist" || value === "some_year_groups") return "is-partial";
  return "is-awaiting";
}

function childAvailabilityLabel(value) {
  return CHILD_AVAILABILITY_OPTIONS.find((o) => o.value === value)?.label || "Awaiting";
}

function childAvailabilityClass(value) {
  if (value === "yes") return "is-yes";
  if (value === "no") return "is-no";
  if (value === "waitlist" || value === "some_year_groups") return "is-partial";
  return "is-awaiting";
}

function tourStatusClass(status) {
  if (status === "completed") return "is-completed";
  if (status === "confirmed") return "is-confirmed";
  if (status === "cancelled") return "is-cancelled";
  if (status === "offered") return "is-offered";
  return "";
}

function formatTourWhen(row) {
  if (!row.tour_date) return "Not booked";
  const d = new Date(row.tour_date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = row.tour_start_time ? `, ${row.tour_start_time.slice(0, 5)}` : "";
  return `${d}${time}`;
}

function StarRating({ value, onChange, disabled }) {
  return (
    <span className="school-shortlist-stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={"school-shortlist-star" + (value >= n ? " is-filled" : "")}
          disabled={disabled}
          onClick={() => onChange(n)}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

// One shortlisted school's full detail: family-level availability reply,
// per-child answers, tour scheduling with arrival details, and feedback —
// School Visits Tracker Phase 1 + 2 (addenda 36 and 38). Collapsed to a
// summary row by default; expands on click, same pattern as the reference
// mockup's accordion rows.
function ShortlistRow({ row, familyChildren, childAvailability, busy, onStatusChange, onChildStatusChange, onTourSave, onRemove }) {
  const [open, setOpen] = useState(false);
  const [tourDraft, setTourDraft] = useState(null);
  const [savingTour, setSavingTour] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState(row.feedback_text || "");
  const [ratingDraft, setRatingDraft] = useState(row.feedback_rating || 0);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [savedNote, setSavedNote] = useState("");

  function startEditTour() {
    setTourDraft({
      tour_date: row.tour_date || "",
      tour_start_time: row.tour_start_time ? row.tour_start_time.slice(0, 5) : "",
      tour_end_time: row.tour_end_time ? row.tour_end_time.slice(0, 5) : "",
      tour_status: row.tour_status || "",
      tour_gate: row.tour_gate || "",
      tour_building: row.tour_building || "",
      tour_parking: row.tour_parking || "",
      tour_ask_for: row.tour_ask_for || "",
      tour_bring: row.tour_bring || "",
    });
  }

  async function saveTour(e) {
    e.preventDefault();
    setSavingTour(true);
    try {
      await onTourSave(row, {
        ...tourDraft,
        tour_date: tourDraft.tour_date || null,
        tour_start_time: tourDraft.tour_start_time || null,
        tour_end_time: tourDraft.tour_end_time || null,
        tour_status: tourDraft.tour_status || null,
      });
      setTourDraft(null);
    } finally {
      setSavingTour(false);
    }
  }

  async function saveFeedback() {
    setSavingFeedback(true);
    try {
      await onTourSave(row, {
        feedback_text: feedbackDraft || null,
        feedback_rating: ratingDraft || null,
        feedback_by: "staff",
      });
      setSavedNote("Saved");
      setTimeout(() => setSavedNote(""), 2000);
    } finally {
      setSavingFeedback(false);
    }
  }

  const childRows = childAvailability.filter((c) => c.shortlist_id === row.id);

  return (
    <li className="school-shortlist-row">
      <div className="school-shortlist-summary" onClick={() => setOpen((o) => !o)}>
        <div className="school-shortlist-main">
          <div className="school-shortlist-name">{row.school?.name || "Unknown school"}</div>
          {row.school?.area && <div className="school-shortlist-area">{row.school.area}</div>}
        </div>
        <div className="school-shortlist-summary-meta">
          <span className={"school-shortlist-badge " + availabilityClass(row.availability_status)}>
            {availabilityLabel(row.availability_status)}
          </span>
          <span className={"school-shortlist-tour-chip " + tourStatusClass(row.tour_status)}>
            {formatTourWhen(row)}
          </span>
          <span className="school-shortlist-caret">{open ? "▴" : "▾"}</span>
        </div>
      </div>

      {open && (
        <div className="school-shortlist-detail" onClick={(e) => e.stopPropagation()}>
          <div className="school-shortlist-detail-grid">
            <div className="school-shortlist-detail-col">
              <h4>Availability</h4>
              <div className="school-shortlist-controls">
                <select
                  className="panel-select"
                  value={row.availability_status}
                  onChange={(e) => onStatusChange(row, e.target.value)}
                  disabled={busy}
                >
                  {AVAILABILITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {row.availability_replied_at && (
                  <span className="school-shortlist-replied">
                    replied {new Date(row.availability_replied_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              {familyChildren && familyChildren.length > 0 && (
                <div className="school-shortlist-children">
                  {familyChildren.map((c, i) => {
                    const childRow = childRows.find((cr) => cr.child_id === c.id);
                    const status = childRow?.availability_status || "awaiting";
                    return (
                      <div key={c.id} className="school-shortlist-child-row">
                        <span className="school-shortlist-child-name">{displayNameForChild(c, i)}</span>
                        <select
                          className="panel-select"
                          value={status}
                          disabled={busy}
                          onChange={(e) => onChildStatusChange(row, c.id, e.target.value)}
                        >
                          {CHILD_AVAILABILITY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <span className={"school-shortlist-badge " + childAvailabilityClass(status)}>
                          {childAvailabilityLabel(status)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <button type="button" className="panel-btn panel-btn-quiet school-shortlist-remove" disabled={busy} onClick={() => onRemove(row)}>
                Remove from shortlist
              </button>
            </div>

            <div className="school-shortlist-detail-col">
              <h4>Tour</h4>
              {tourDraft ? (
                <form className="school-shortlist-tour-form" onSubmit={saveTour}>
                  <div className="school-shortlist-tour-grid">
                    <label>
                      Date
                      <input type="date" className="panel-input" value={tourDraft.tour_date} onChange={(e) => setTourDraft((d) => ({ ...d, tour_date: e.target.value }))} />
                    </label>
                    <label>
                      Status
                      <select className="panel-select" value={tourDraft.tour_status} onChange={(e) => setTourDraft((d) => ({ ...d, tour_status: e.target.value }))}>
                        {TOUR_STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Start
                      <input type="time" className="panel-input" value={tourDraft.tour_start_time} onChange={(e) => setTourDraft((d) => ({ ...d, tour_start_time: e.target.value }))} />
                    </label>
                    <label>
                      End
                      <input type="time" className="panel-input" value={tourDraft.tour_end_time} onChange={(e) => setTourDraft((d) => ({ ...d, tour_end_time: e.target.value }))} />
                    </label>
                    <label>
                      Gate
                      <input className="panel-input" value={tourDraft.tour_gate} onChange={(e) => setTourDraft((d) => ({ ...d, tour_gate: e.target.value }))} />
                    </label>
                    <label>
                      Building
                      <input className="panel-input" value={tourDraft.tour_building} onChange={(e) => setTourDraft((d) => ({ ...d, tour_building: e.target.value }))} />
                    </label>
                    <label>
                      Parking
                      <input className="panel-input" value={tourDraft.tour_parking} onChange={(e) => setTourDraft((d) => ({ ...d, tour_parking: e.target.value }))} />
                    </label>
                    <label>
                      Ask for
                      <input className="panel-input" value={tourDraft.tour_ask_for} onChange={(e) => setTourDraft((d) => ({ ...d, tour_ask_for: e.target.value }))} />
                    </label>
                    <label className="school-shortlist-tour-wide">
                      What to bring
                      <input className="panel-input" value={tourDraft.tour_bring} onChange={(e) => setTourDraft((d) => ({ ...d, tour_bring: e.target.value }))} />
                    </label>
                  </div>
                  <div className="school-shortlist-tour-actions">
                    <button type="submit" className="panel-btn panel-btn-primary" disabled={savingTour}>
                      {savingTour ? "Saving…" : "Save tour"}
                    </button>
                    <button type="button" className="panel-btn panel-btn-quiet" disabled={savingTour} onClick={() => setTourDraft(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="school-shortlist-tour-summary">
                  {row.tour_date ? (
                    <>
                      <div>{formatTourWhen(row)}{row.tour_end_time ? ` – ${row.tour_end_time.slice(0, 5)}` : ""}</div>
                      <div className="school-shortlist-tour-details">
                        {[row.tour_gate, row.tour_building, row.tour_parking].filter(Boolean).join(" · ")}
                      </div>
                      {row.tour_ask_for && <div className="school-shortlist-tour-details">Ask for {row.tour_ask_for}</div>}
                      {row.tour_bring && <div className="school-shortlist-tour-details">Bring: {row.tour_bring}</div>}
                    </>
                  ) : (
                    <p className="panel-hint">No tour booked yet.</p>
                  )}
                  <button type="button" className="panel-btn" onClick={startEditTour}>
                    {row.tour_date ? "Edit tour" : "Book a tour"}
                  </button>
                </div>
              )}

              <h4 className="school-shortlist-feedback-heading">Feedback</h4>
              <textarea
                className="panel-input school-shortlist-feedback-input"
                rows={3}
                placeholder="How did the tour go?"
                value={feedbackDraft}
                onChange={(e) => setFeedbackDraft(e.target.value)}
              />
              <div className="school-shortlist-feedback-actions">
                <StarRating value={ratingDraft} onChange={setRatingDraft} disabled={savingFeedback} />
                <button type="button" className="panel-btn panel-btn-primary" disabled={savingFeedback} onClick={saveFeedback}>
                  {savingFeedback ? "Saving…" : "Save"}
                </button>
                {savedNote && <span className="school-shortlist-saved-note">{savedNote}</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function ClashBanner({ clash }) {
  const dateLabel = new Date(clash.a.tour_date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <div className="school-shortlist-clash">
      <strong>Clash on {dateLabel}</strong>
      <p>
        {clash.a.school?.name} ends {clash.a.tour_end_time?.slice(0, 5)}, {clash.b.school?.name} starts{" "}
        {clash.b.tour_start_time?.slice(0, 5)} — about {clash.driveMinutes} min apart by drive-time estimate
        {clash.gapMinutes < 0 ? " (they overlap)" : `, only ${clash.gapMinutes} min gap`}.
      </p>
    </div>
  );
}

// The family-facing "School shortlist" panel — School Visits Tracker Phases
// 1 & 2 (addenda 36 and 38): which schools this family is considering, the
// family-level and per-child availability replies, tour scheduling with
// arrival details, feedback, and a same-day clash check across every
// school this family has a tour booked at. The family-facing timetable and
// chase-clock automation (Phase 3) live in the frontend app and Supabase
// respectively — see FamilyTimetablePage.jsx and addendum 38's
// raise_school_shortlist_chase_tasks().
export default function SchoolShortlistPanel({ familyId, familyChildren }) {
  const [rows, setRows] = useState([]);
  const [childAvailability, setChildAvailability] = useState([]);
  const [allSchools, setAllSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingSchoolId, setAddingSchoolId] = useState("");
  const [busy, setBusy] = useState(false);

  // Initial load only — every mutation below patches `rows` in place
  // instead of re-running this, so nothing ever collapses the panel and
  // shoves whatever's below it up the page (see the September 2026 fix for
  // exactly that bug).
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [shortlist, schools] = await Promise.all([listShortlistForFamily(familyId), listSchools()]);
      setRows(shortlist);
      setAllSchools(schools);
      setChildAvailability(await listChildAvailabilityForShortlistIds(shortlist.map((r) => r.id)));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!addingSchoolId) return;
    const schoolId = addingSchoolId;
    setBusy(true);
    setError("");
    try {
      const created = await addToShortlist({ familyId, schoolId });
      const school = allSchools.find((s) => s.id === schoolId) || null;
      setRows((prev) => [{ ...created, school }, ...prev]);
      setAddingSchoolId("");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusChange(row, value) {
    setBusy(true);
    setError("");
    try {
      const updated = await updateShortlistEntry(row.id, { availability_status: value });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated, school: r.school } : r)));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleChildStatusChange(row, childId, value) {
    setBusy(true);
    setError("");
    try {
      const updated = await upsertChildAvailability(row.id, childId, value);
      setChildAvailability((prev) => {
        const others = prev.filter((c) => !(c.shortlist_id === row.id && c.child_id === childId));
        return [...others, updated];
      });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleTourSave(row, patch) {
    setBusy(true);
    setError("");
    try {
      const updated = await updateShortlistTour(row.id, patch);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated, school: r.school } : r)));
    } catch (err) {
      setError(friendlyError(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(row) {
    setBusy(true);
    setError("");
    try {
      await removeFromShortlist(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const shortlistedIds = new Set(rows.map((r) => r.school_id));
  const addableSchools = allSchools.filter((s) => !shortlistedIds.has(s.id));
  const tours = rows.filter((r) => r.tour_date).sort((a, b) => (a.tour_date + (a.tour_start_time || "")).localeCompare(b.tour_date + (b.tour_start_time || "")));
  const clashes = findTourClashes(tours);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          School shortlist
          {rows.length > 0 && <span className="panel-count">{rows.length}</span>}
        </h2>
      </div>

      {error && <p className="panel-hint school-shortlist-error">{error}</p>}

      {loading ? (
        <p className="panel-hint">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="panel-hint">No schools shortlisted for this family yet.</p>
      ) : (
        <ul className="school-shortlist-list">
          {rows.map((row) => (
            <ShortlistRow
              key={row.id}
              row={row}
              familyChildren={familyChildren}
              childAvailability={childAvailability}
              busy={busy}
              onStatusChange={handleStatusChange}
              onChildStatusChange={handleChildStatusChange}
              onTourSave={handleTourSave}
              onRemove={handleRemove}
            />
          ))}
        </ul>
      )}

      {addableSchools.length > 0 && (
        <form className="panel-form" onSubmit={handleAdd}>
          <select
            className="panel-select panel-form-grow"
            value={addingSchoolId}
            onChange={(e) => setAddingSchoolId(e.target.value)}
            disabled={busy}
          >
            <option value="">Add a school to the shortlist…</option>
            {addableSchools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.area ? ` — ${s.area}` : ""}
              </option>
            ))}
          </select>
          <button type="submit" className="panel-btn panel-btn-primary" disabled={busy || !addingSchoolId}>
            Add
          </button>
        </form>
      )}

      {tours.length > 0 && (
        <div className="school-shortlist-tour-schedule">
          <h3>Tour schedule</h3>
          {clashes.map((c, i) => (
            <ClashBanner key={i} clash={c} />
          ))}
          <ul className="school-shortlist-tour-list">
            {tours.map((t) => (
              <li key={t.id} className="school-shortlist-tour-list-row">
                <span className="school-shortlist-tour-list-when">{formatTourWhen(t)}</span>
                <span className="school-shortlist-tour-list-school">{t.school?.name}</span>
                <span className={"school-shortlist-tour-chip " + tourStatusClass(t.tour_status)}>
                  {TOUR_STATUS_OPTIONS.find((o) => o.value === t.tour_status)?.label || "Not booked"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
