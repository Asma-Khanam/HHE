import { useEffect, useState } from "react";
import {
  listShortlistForFamily,
  listYearGroupAvailabilityForSchoolIds,
  listSchools,
  addToShortlist,
  updateShortlistEntry,
  removeFromShortlist,
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

function availabilityLabel(value) {
  return AVAILABILITY_OPTIONS.find((o) => o.value === value)?.label || value;
}

function availabilityClass(value) {
  if (value === "yes") return "is-yes";
  if (value === "no") return "is-no";
  if (value === "waitlist" || value === "some_year_groups") return "is-partial";
  return "is-awaiting";
}

// A child's per-school status, read off school_year_group_availability by
// matching the child's own year_group_applying_for against that school's
// year-group rows. This is a best-effort text match (both sides are free
// text — see addendum 36's own note on why year groups aren't a closed
// list) rather than a stored per-child field, so it's shown as a hint next
// to the family-level reply, not in place of it.
function childYearGroupStatus(child, schoolId, availabilityRows) {
  const yg = (child.year_group_applying_for || "").trim().toLowerCase();
  if (!yg) return null;
  const row = availabilityRows.find(
    (r) => r.school_id === schoolId && (r.year_group || "").trim().toLowerCase() === yg
  );
  return row ? row.status : null;
}

function yearGroupStatusLabel(status) {
  if (status === "open") return "Place";
  if (status === "waitlist") return "Waitlist";
  if (status === "full") return "No place";
  return "Not checked yet";
}

// The family-facing "School shortlist" panel Heather's mockup showed living
// on the family's own page (per-child status, availability replies) — Phase
// 1 only: which schools this family is considering, the family-level
// availability reply, and (where a child's year group has been checked at
// that school) a per-child place/waitlist/full hint. Tour scheduling,
// on-the-day info, feedback and the stage timeline from the mockup are
// Phase 2/3 per Heather's own build order and aren't built yet.
export default function SchoolShortlistPanel({ familyId, familyChildren }) {
  const [rows, setRows] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [allSchools, setAllSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingSchoolId, setAddingSchoolId] = useState("");
  const [busy, setBusy] = useState(false);

  // Initial load only — this is the one place the list is allowed to
  // disappear behind "Loading…". Every mutation below updates `rows` (and
  // `availability` where relevant) in place instead of re-running this, so
  // picking an option in a dropdown never blanks the panel out and jumps
  // the page — that was making the Applications panel underneath appear
  // to jump up and grab the click, which read as "it goes back to the
  // application page."
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [shortlist, schools] = await Promise.all([listShortlistForFamily(familyId), listSchools()]);
      setRows(shortlist);
      setAllSchools(schools);
      const schoolIds = shortlist.map((r) => r.school_id);
      setAvailability(await listYearGroupAvailabilityForSchoolIds(schoolIds));
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
      // Only this school's year-group rows are new to us — no need to
      // refetch every shortlisted school's availability again.
      listYearGroupAvailabilityForSchoolIds([schoolId])
        .then((rows) => setAvailability((prev) => [...prev, ...rows]))
        .catch(() => {});
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
            <li key={row.id} className="school-shortlist-row">
              <div className="school-shortlist-main">
                <div className="school-shortlist-name">{row.school?.name || "Unknown school"}</div>
                {row.school?.area && <div className="school-shortlist-area">{row.school.area}</div>}
                {familyChildren && familyChildren.length > 0 && (
                  <div className="school-shortlist-children">
                    {familyChildren.map((c, i) => {
                      const status = childYearGroupStatus(c, row.school_id, availability);
                      return (
                        <span key={c.id} className={"school-shortlist-child-chip" + (status ? " is-" + status : "")}>
                          {displayNameForChild(c, i)}: {yearGroupStatusLabel(status)}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="school-shortlist-controls">
                <select
                  className="panel-select"
                  value={row.availability_status}
                  onChange={(e) => handleStatusChange(row, e.target.value)}
                  disabled={busy}
                >
                  {AVAILABILITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className={"school-shortlist-badge " + availabilityClass(row.availability_status)}>
                  {availabilityLabel(row.availability_status)}
                </span>
                {row.availability_replied_at && (
                  <span className="school-shortlist-replied">
                    replied {new Date(row.availability_replied_at).toLocaleDateString()}
                  </span>
                )}
                <button type="button" className="panel-btn panel-btn-quiet" disabled={busy} onClick={() => handleRemove(row)}>
                  Remove
                </button>
              </div>
            </li>
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
    </section>
  );
}
