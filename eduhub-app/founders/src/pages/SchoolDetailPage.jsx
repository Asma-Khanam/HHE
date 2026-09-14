import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getSchoolDetail,
  updateSchool,
  upsertYearGroupAvailability,
  deleteYearGroupAvailability,
  addToShortlist,
  updateShortlistEntry,
  removeFromShortlist,
  listFamilies,
  friendlyError,
} from "../lib/staffData";
import "../components/panels.css";
import "./FamilyDetailPage.css";
import "./SchoolDetailPage.css";

const AVAILABILITY_LABELS = {
  awaiting: "Awaiting reply",
  yes: "Yes",
  no: "No",
  waitlist: "Waitlist",
  some_year_groups: "Some year groups",
};

const YEAR_GROUP_STATUS_LABELS = {
  open: "Open",
  waitlist: "Waitlist",
  full: "Full",
};

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

// One school's full record, its year group availability, and every
// family that has it shortlisted — the school-side view that complements
// SchoolVisitsPanel on FamilyDetailPage (Phase 1 of the School visits
// tracker; see eduhub_schema_addendum_36_school_visits_tracker.sql).
export default function SchoolDetailPage() {
  const { schoolId } = useParams();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const [newYearGroup, setNewYearGroup] = useState("");
  const [newYearGroupStatus, setNewYearGroupStatus] = useState("open");

  const [families, setFamilies] = useState(null);
  const [addFamilyId, setAddFamilyId] = useState("");
  const [addingFamily, setAddingFamily] = useState(false);

  function load() {
    return getSchoolDetail(schoolId)
      .then(setDetail)
      .catch((err) => setError(friendlyError(err, "Couldn't load this school.")));
  }

  useEffect(() => {
    setDetail(null);
    setError("");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  useEffect(() => {
    listFamilies()
      .then(setFamilies)
      .catch(() => {});
  }, []);

  if (error) {
    return (
      <div className="family-detail-page">
        <Link to="/staff/schools" className="hh-link-btn">
          ‹ Back to schools
        </Link>
        <div className="hh-form-banner hh-form-banner-error" style={{ marginTop: 16 }}>
          {error}
        </div>
      </div>
    );
  }

  if (!detail) return <div className="family-detail-page">Loading…</div>;

  const { school, availability, shortlist, stats } = detail;

  function startEdit() {
    setDraft({
      name: school.name || "",
      area: school.area || "",
      address: school.address || "",
      latitude: school.latitude ?? "",
      longitude: school.longitude ?? "",
      curriculum: school.curriculum || "",
      website_url: school.website_url || "",
      admissions_contact_name: school.admissions_contact_name || "",
      admissions_contact_email: school.admissions_contact_email || "",
      admissions_contact_phone: school.admissions_contact_phone || "",
      tour_booking_url: school.tour_booking_url || "",
      application_url: school.application_url || "",
      requires_cat4: !!school.requires_cat4,
      requires_map: !!school.requires_map,
      requires_interview: !!school.requires_interview,
      requires_taster_day: !!school.requires_taster_day,
      application_fee: school.application_fee ?? "",
      deposit_amount: school.deposit_amount ?? "",
      documents_required: school.documents_required || "",
      notes: school.notes || "",
    });
    setEditing(true);
  }

  async function saveRecord(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const patch = {
        ...draft,
        application_fee: draft.application_fee === "" ? null : Number(draft.application_fee),
        deposit_amount: draft.deposit_amount === "" ? null : Number(draft.deposit_amount),
        latitude: draft.latitude === "" ? null : Number(draft.latitude),
        longitude: draft.longitude === "" ? null : Number(draft.longitude),
      };
      const updated = await updateSchool(schoolId, patch);
      setDetail((d) => ({ ...d, school: updated }));
      setEditing(false);
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that."));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddYearGroup(e) {
    e.preventDefault();
    if (!newYearGroup.trim()) return;
    try {
      const row = await upsertYearGroupAvailability(schoolId, {
        yearGroup: newYearGroup.trim(),
        status: newYearGroupStatus,
      });
      setDetail((d) => ({
        ...d,
        availability: [...d.availability.filter((a) => a.id !== row.id), row].sort((a, b) =>
          a.year_group.localeCompare(b.year_group)
        ),
      }));
      setNewYearGroup("");
      setNewYearGroupStatus("open");
    } catch (err) {
      setError(friendlyError(err, "Couldn't add that year group."));
    }
  }

  async function handleYearGroupStatusChange(row, status) {
    try {
      const updated = await upsertYearGroupAvailability(schoolId, { id: row.id, yearGroup: row.year_group, status });
      setDetail((d) => ({ ...d, availability: d.availability.map((a) => (a.id === row.id ? updated : a)) }));
    } catch (err) {
      setError(friendlyError(err, "Couldn't update that."));
    }
  }

  async function handleRemoveYearGroup(row) {
    try {
      await deleteYearGroupAvailability(row.id);
      setDetail((d) => ({ ...d, availability: d.availability.filter((a) => a.id !== row.id) }));
    } catch (err) {
      setError(friendlyError(err, "Couldn't remove that."));
    }
  }

  async function handleAvailabilityChange(entry, availability_status) {
    try {
      const updated = await updateShortlistEntry(entry.id, { availability_status });
      setDetail((d) => ({
        ...d,
        shortlist: d.shortlist.map((s) => (s.id === entry.id ? { ...s, ...updated } : s)),
      }));
    } catch (err) {
      setError(friendlyError(err, "Couldn't update that."));
    }
  }

  async function handleRemoveShortlistEntry(entry) {
    try {
      await removeFromShortlist(entry.id);
      setDetail((d) => ({ ...d, shortlist: d.shortlist.filter((s) => s.id !== entry.id) }));
    } catch (err) {
      setError(friendlyError(err, "Couldn't remove that."));
    }
  }

  async function handleAddFamily(e) {
    e.preventDefault();
    if (!addFamilyId) return;
    setAddingFamily(true);
    setError("");
    try {
      await addToShortlist({ familyId: addFamilyId, schoolId });
      await load();
      setAddFamilyId("");
    } catch (err) {
      setError(friendlyError(err, "Couldn't add that family — they may already be on this school's shortlist."));
    } finally {
      setAddingFamily(false);
    }
  }

  const shortlistedFamilyIds = new Set(shortlist.map((s) => s.family_id));
  const availableFamilies = (families || []).filter((f) => !shortlistedFamilyIds.has(f.id));

  return (
    <div className="family-detail-page">
      <Link to="/staff/schools" className="hh-link-btn">
        ‹ Back to schools
      </Link>

      <div className="family-detail-header">
        <div className="family-detail-avatar">{(school.name || "?").charAt(0).toUpperCase()}</div>
        <div className="family-detail-header-text">
          <h1>{school.name}</h1>
          <div className="family-detail-meta">
            {school.area && <span>{school.area}</span>}
            {school.curriculum && <span>{school.curriculum}</span>}
            <span>
              {shortlist.length} famil{shortlist.length === 1 ? "y" : "ies"} shortlisted
            </span>
          </div>
        </div>
      </div>

      {stats && (
        <div className="school-stats-row">
          <div className="school-stat">
            <span className="school-stat-value">{stats.toursBooked}</span>
            <span className="school-stat-label">tours booked</span>
          </div>
          <div className="school-stat">
            <span className="school-stat-value">{stats.toured}</span>
            <span className="school-stat-label">toured</span>
          </div>
          <div className="school-stat">
            <span className="school-stat-value">{stats.applications}</span>
            <span className="school-stat-label">applications</span>
          </div>
          <div className="school-stat">
            <span className="school-stat-value">{stats.assessments}</span>
            <span className="school-stat-label">assessments</span>
          </div>
          <div className="school-stat">
            <span className="school-stat-value">{stats.offers}</span>
            <span className="school-stat-label">offers</span>
          </div>
        </div>
      )}

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <section className="family-detail-card">
        <div className="panel-head">
          <h2>School record</h2>
          {!editing && (
            <button type="button" className="panel-btn" onClick={startEdit}>
              Edit
            </button>
          )}
        </div>

        {!editing ? (
          <div className="rec-grid">
            <div className="rec-field">
              <span className="rec-field-label">Area</span>
              <span className={"rec-field-value" + (school.area ? "" : " is-empty")}>{school.area || "—"}</span>
            </div>
            <div className="rec-field rec-field-wide">
              <span className="rec-field-label">Address</span>
              <span className={"rec-field-value" + (school.address ? "" : " is-empty")}>{school.address || "—"}</span>
            </div>
            <div className="rec-field">
              <span className="rec-field-label">Curriculum</span>
              <span className={"rec-field-value" + (school.curriculum ? "" : " is-empty")}>{school.curriculum || "—"}</span>
            </div>
            <div className="rec-field">
              <span className="rec-field-label">Website</span>
              {school.website_url ? (
                <a className="rec-field-value" href={school.website_url} target="_blank" rel="noreferrer">
                  {school.website_url}
                </a>
              ) : (
                <span className="rec-field-value is-empty">—</span>
              )}
            </div>
            <div className="rec-field">
              <span className="rec-field-label">Admissions contact</span>
              <span className="rec-field-value">
                {[school.admissions_contact_name, school.admissions_contact_email, school.admissions_contact_phone]
                  .filter(Boolean)
                  .join(" · ") || <span className="is-empty">—</span>}
              </span>
            </div>
            <div className="rec-field">
              <span className="rec-field-label">Book a tour</span>
              {school.tour_booking_url ? (
                <a className="rec-field-value" href={school.tour_booking_url} target="_blank" rel="noreferrer">
                  {school.tour_booking_url}
                </a>
              ) : (
                <span className="rec-field-value is-empty">—</span>
              )}
            </div>
            <div className="rec-field">
              <span className="rec-field-label">Start an application</span>
              {school.application_url ? (
                <a className="rec-field-value" href={school.application_url} target="_blank" rel="noreferrer">
                  {school.application_url}
                </a>
              ) : (
                <span className="rec-field-value is-empty">—</span>
              )}
            </div>
            <div className="rec-field rec-field-wide">
              <span className="rec-field-label">Admissions process</span>
              <span className="rec-field-value">
                {[
                  school.requires_cat4 && "CAT4",
                  school.requires_map && "MAP",
                  school.requires_interview && "Interview",
                  school.requires_taster_day && "Taster day",
                  school.application_fee != null && `Application fee: ${school.application_fee}`,
                  school.deposit_amount != null && `Deposit: ${school.deposit_amount}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || <span className="is-empty">—</span>}
              </span>
            </div>
            <div className="rec-field rec-field-wide">
              <span className="rec-field-label">Documents required</span>
              <span className={"rec-field-value" + (school.documents_required ? "" : " is-empty")}>
                {school.documents_required || "—"}
              </span>
            </div>
            <div className="rec-field rec-field-wide">
              <span className="rec-field-label">Notes</span>
              <span className={"rec-field-value" + (school.notes ? "" : " is-empty")}>{school.notes || "—"}</span>
            </div>
          </div>
        ) : (
          <form className="school-edit-form" onSubmit={saveRecord}>
            <div className="school-edit-grid">
              <label>
                School name
                <input className="panel-input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} required />
              </label>
              <label>
                Area
                <input className="panel-input" value={draft.area} onChange={(e) => setDraft((d) => ({ ...d, area: e.target.value }))} />
              </label>
              <label className="school-edit-wide">
                Address
                <input className="panel-input" value={draft.address} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))} />
              </label>
              <label>
                Latitude
                <input
                  type="number"
                  step="any"
                  className="panel-input"
                  placeholder="e.g. 25.1122"
                  value={draft.latitude}
                  onChange={(e) => setDraft((d) => ({ ...d, latitude: e.target.value }))}
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  step="any"
                  className="panel-input"
                  placeholder="e.g. 55.2000"
                  value={draft.longitude}
                  onChange={(e) => setDraft((d) => ({ ...d, longitude: e.target.value }))}
                />
              </label>
              <label>
                Curriculum
                <input className="panel-input" value={draft.curriculum} onChange={(e) => setDraft((d) => ({ ...d, curriculum: e.target.value }))} />
              </label>
              <label>
                Website
                <input className="panel-input" value={draft.website_url} onChange={(e) => setDraft((d) => ({ ...d, website_url: e.target.value }))} />
              </label>
              <label>
                Admissions contact name
                <input
                  className="panel-input"
                  value={draft.admissions_contact_name}
                  onChange={(e) => setDraft((d) => ({ ...d, admissions_contact_name: e.target.value }))}
                />
              </label>
              <label>
                Admissions contact email
                <input
                  className="panel-input"
                  type="email"
                  value={draft.admissions_contact_email}
                  onChange={(e) => setDraft((d) => ({ ...d, admissions_contact_email: e.target.value }))}
                />
              </label>
              <label>
                Admissions contact phone
                <input
                  className="panel-input"
                  value={draft.admissions_contact_phone}
                  onChange={(e) => setDraft((d) => ({ ...d, admissions_contact_phone: e.target.value }))}
                />
              </label>
              <label>
                Tour booking link
                <input
                  className="panel-input"
                  value={draft.tour_booking_url}
                  onChange={(e) => setDraft((d) => ({ ...d, tour_booking_url: e.target.value }))}
                />
              </label>
              <label>
                Application link
                <input
                  className="panel-input"
                  value={draft.application_url}
                  onChange={(e) => setDraft((d) => ({ ...d, application_url: e.target.value }))}
                />
              </label>
              <label>
                Application fee
                <input
                  className="panel-input"
                  type="number"
                  step="0.01"
                  value={draft.application_fee}
                  onChange={(e) => setDraft((d) => ({ ...d, application_fee: e.target.value }))}
                />
              </label>
              <label>
                Deposit
                <input
                  className="panel-input"
                  type="number"
                  step="0.01"
                  value={draft.deposit_amount}
                  onChange={(e) => setDraft((d) => ({ ...d, deposit_amount: e.target.value }))}
                />
              </label>
              <div className="school-edit-checkboxes">
                <label className="school-edit-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.requires_cat4}
                    onChange={(e) => setDraft((d) => ({ ...d, requires_cat4: e.target.checked }))}
                  />
                  CAT4
                </label>
                <label className="school-edit-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.requires_map}
                    onChange={(e) => setDraft((d) => ({ ...d, requires_map: e.target.checked }))}
                  />
                  MAP
                </label>
                <label className="school-edit-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.requires_interview}
                    onChange={(e) => setDraft((d) => ({ ...d, requires_interview: e.target.checked }))}
                  />
                  Interview
                </label>
                <label className="school-edit-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.requires_taster_day}
                    onChange={(e) => setDraft((d) => ({ ...d, requires_taster_day: e.target.checked }))}
                  />
                  Taster day
                </label>
              </div>
              <label className="school-edit-wide">
                Documents required
                <textarea
                  className="panel-input"
                  rows={2}
                  value={draft.documents_required}
                  onChange={(e) => setDraft((d) => ({ ...d, documents_required: e.target.value }))}
                />
              </label>
              <label className="school-edit-wide">
                Notes
                <textarea className="panel-input" rows={2} value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
              </label>
            </div>
            <div className="school-edit-actions">
              <button type="submit" className="panel-btn panel-btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="family-detail-card">
        <h2>Year group availability</h2>
        {availability.length === 0 ? (
          <p className="family-detail-hint">No year groups added yet.</p>
        ) : (
          <ul className="panel-list school-year-group-list">
            {availability.map((row) => (
              <li key={row.id} className="school-year-group-row">
                <span className="school-year-group-name">{row.year_group}</span>
                <select
                  className="panel-select"
                  value={row.status}
                  onChange={(e) => handleYearGroupStatusChange(row, e.target.value)}
                >
                  {Object.entries(YEAR_GROUP_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <span className="school-year-group-checked">
                  {row.last_checked_at ? `Checked ${formatDate(row.last_checked_at)}` : "Not checked yet"}
                </span>
                <button type="button" className="panel-btn panel-btn-quiet" onClick={() => handleRemoveYearGroup(row)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="school-year-group-add" onSubmit={handleAddYearGroup}>
          <input
            type="text"
            className="panel-input"
            placeholder="Year group (e.g. Year 4)"
            value={newYearGroup}
            onChange={(e) => setNewYearGroup(e.target.value)}
          />
          <select className="panel-select" value={newYearGroupStatus} onChange={(e) => setNewYearGroupStatus(e.target.value)}>
            {Object.entries(YEAR_GROUP_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="panel-btn" disabled={!newYearGroup.trim()}>
            Add year group
          </button>
        </form>
      </section>

      <section className="family-detail-card">
        <h2>
          Shortlisted families
          {shortlist.length > 0 && <span className="family-detail-card-count">{shortlist.length}</span>}
        </h2>
        {shortlist.length === 0 ? (
          <p className="family-detail-hint">No family has shortlisted this school yet.</p>
        ) : (
          <ul className="panel-list schooldetail-shortlist-list">
            {shortlist.map((entry) => {
              const waitingDays = entry.availability_status === "awaiting" ? daysSince(entry.shortlisted_at) : null;
              return (
                <li key={entry.id} className="schooldetail-shortlist-row">
                  <Link to={`/staff/families/${entry.family_id}`} className="schooldetail-shortlist-family">
                    {entry.familyName}
                  </Link>
                  <select
                    className="panel-select"
                    value={entry.availability_status}
                    onChange={(e) => handleAvailabilityChange(entry, e.target.value)}
                  >
                    {Object.entries(AVAILABILITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <span className="schooldetail-shortlist-meta">
                    Shortlisted {formatDate(entry.shortlisted_at)}
                    {entry.availability_replied_at && ` · replied ${formatDate(entry.availability_replied_at)}`}
                    {waitingDays !== null && waitingDays >= 3 && (
                      <span className="is-overdue"> · {waitingDays} days, no reply</span>
                    )}
                  </span>
                  <button type="button" className="panel-btn panel-btn-quiet" onClick={() => handleRemoveShortlistEntry(entry)}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {availableFamilies.length > 0 && (
          <form className="school-year-group-add" onSubmit={handleAddFamily}>
            <select className="panel-select" value={addFamilyId} onChange={(e) => setAddFamilyId(e.target.value)}>
              <option value="">Add a family to this shortlist…</option>
              {availableFamilies.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.displayName}
                </option>
              ))}
            </select>
            <button type="submit" className="panel-btn" disabled={!addFamilyId || addingFamily}>
              {addingFamily ? "Adding…" : "Add"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
