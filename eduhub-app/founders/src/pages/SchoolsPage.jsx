import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listSchoolsWithStats, createSchool, friendlyError } from "../lib/staffData";
import "../components/panels.css";
import "./FamiliesListPage.css";
import "./SchoolsPage.css";

// The School visits tracker's catalog — Phase 1 of Heather's own build
// order (see eduhub_schema_addendum_36_school_visits_tracker.sql): the
// school record and the shortlist counts against it. A school is created
// once here and reused across every family that shortlists it — adding a
// family to a school's shortlist happens from that family's own page
// (SchoolVisitsPanel), not from here, since staff think "which schools is
// this family considering" far more often than the reverse.
export default function SchoolsPage() {
  const navigate = useNavigate();
  const [schools, setSchools] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newArea, setNewArea] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    listSchoolsWithStats()
      .then(setSchools)
      .catch((err) => setError(friendlyError(err, "Couldn't load schools.")));
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!schools) return [];
    const q = search.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.area || "").toLowerCase().includes(q) ||
        (s.curriculum || "").toLowerCase().includes(q)
    );
  }, [schools, search]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const created = await createSchool({ name: newName.trim(), area: newArea.trim() || null });
      setNewName("");
      setNewArea("");
      setAdding(false);
      load();
      navigate(`/staff/schools/${created.id}`);
    } catch (err) {
      setError(friendlyError(err, "Couldn't add that school."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="schools-page">
      <div className="schools-page-header">
        <div>
          <h1>Schools</h1>
          <p className="schools-page-subtitle">
            {schools ? `${schools.length} school${schools.length === 1 ? "" : "s"}` : "Loading…"} · one record, reused
            across every family
          </p>
        </div>
        <div className="schools-page-header-actions">
          <input
            type="text"
            className="families-search"
            placeholder="Search name, area or curriculum…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className="panel-btn panel-btn-primary" onClick={() => setAdding((v) => !v)}>
            {adding ? "Cancel" : "+ Add school"}
          </button>
        </div>
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {adding && (
        <form className="schools-add-form" onSubmit={handleAdd}>
          <input
            type="text"
            className="panel-input"
            placeholder="School name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            className="panel-input"
            placeholder="Area (e.g. Al Barsha South)"
            value={newArea}
            onChange={(e) => setNewArea(e.target.value)}
          />
          <button type="submit" className="panel-btn panel-btn-primary" disabled={saving || !newName.trim()}>
            {saving ? "Adding…" : "Add"}
          </button>
        </form>
      )}

      {schools && schools.length === 0 && !error && (
        <p className="families-empty-hint">No schools yet — add the first one above.</p>
      )}

      {schools && schools.length > 0 && filtered.length === 0 && <p className="families-empty-hint">Nothing matches that.</p>}

      {filtered.length > 0 && (
        <div className="families-table-wrap">
          <table className="families-table">
            <thead>
              <tr>
                <th>School</th>
                <th>Curriculum</th>
                <th>Admissions contact</th>
                <th>Shortlisted</th>
                <th>Awaiting reply</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} onClick={() => navigate(`/staff/schools/${s.id}`)}>
                  <td>
                    <div className="families-cell-family-text">
                      <span className="families-table-name">{s.name}</span>
                      {s.area && <span className="families-cell-sub">{s.area}</span>}
                    </div>
                  </td>
                  <td>{s.curriculum || <span className="is-muted">—</span>}</td>
                  <td>
                    {s.admissions_contact_name || s.admissions_contact_email ? (
                      <span className="families-cell-sub">
                        {s.admissions_contact_name}
                        {s.admissions_contact_name && s.admissions_contact_email ? " · " : ""}
                        {s.admissions_contact_email}
                      </span>
                    ) : (
                      <span className="is-muted">—</span>
                    )}
                  </td>
                  <td>{s.shortlistCount}</td>
                  <td>{s.awaitingCount > 0 ? <span className="is-overdue">{s.awaitingCount}</span> : "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="families-table-foot">Click a school to open its record and shortlist.</p>
        </div>
      )}
    </div>
  );
}
