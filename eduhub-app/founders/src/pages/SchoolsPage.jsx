import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listSchoolsWithStats, createSchool, friendlyError } from "../lib/staffData";
import SchoolAnalytics from "../components/SchoolAnalytics";
import "../components/panels.css";
import "./FamiliesListPage.css";
import "./AccountingPage.css";
import "./SchoolsPage.css";
import { EMIRATES, OUTSIDE_UAE, EMIRATE_CHOICES } from "../data/emirates";

// The School visits tracker's catalog — Phase 1 of Heather's own build
// order (see eduhub_schema_addendum_36_school_visits_tracker.sql): the
// school record and the shortlist counts against it. A school is created
// once here and reused across every family that shortlists it — adding a
// family to a school's shortlist happens from that family's own page
// (SchoolVisitsPanel), not from here, since staff think "which schools is
// this family considering" far more often than the reverse.
const OUTSIDE = OUTSIDE_UAE;
const NONE = "none";

export default function SchoolsPage() {
  const navigate = useNavigate();
  const [schools, setSchools] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newEmirate, setNewEmirate] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem("schools-emirate-tab") || "all"; } catch { return "all"; }
  });
  function pickTab(key) {
    setTab(key);
    try { sessionStorage.setItem("schools-emirate-tab", key); } catch { /* ignore */ }
  }
  const [view, setView] = useState(() => (window.location.hash === "#analytics" ? "analytics" : "list"));
  function switchView(next) {
    setView(next);
    window.history.replaceState(null, "", next === "analytics" ? "#analytics" : window.location.pathname);
  }

  function load() {
    listSchoolsWithStats()
      .then(setSchools)
      .catch((err) => setError(friendlyError(err, "Couldn't load schools.")));
  }

  useEffect(() => {
    load();
  }, []);

  // One tab per emirate that has schools, in a fixed order, plus Outside UAE and "No emirate yet".
  const tabs = useMemo(() => {
    if (!schools) return [{ key: "all", label: "All", count: 0 }];
    const count = (fn) => schools.filter(fn).length;
    const list = [{ key: "all", label: "All", count: schools.length }];
    for (const e of EMIRATES) {
      list.push({ key: e, label: e, count: count((x) => x.emirate === e) });
    }
    list.push({ key: OUTSIDE, label: OUTSIDE, count: count((x) => x.emirate === OUTSIDE) });
    const none = count((x) => !x.emirate);
    if (none) list.push({ key: NONE, label: "No emirate yet", count: none });
    return list;
  }, [schools]);

  const activeTab = tabs.some((t) => t.key === tab) ? tab : "all";

  const filtered = useMemo(() => {
    if (!schools) return [];
    const q = search.trim().toLowerCase();
    // Searching looks through every school, not just the open tab (same as Caseload).
    if (q) {
      return schools.filter(
        (s) =>
          (s.name || "").toLowerCase().includes(q) ||
          (s.area || "").toLowerCase().includes(q) ||
          (s.emirate || "").toLowerCase().includes(q) ||
          (s.curriculum || "").toLowerCase().includes(q)
      );
    }
    if (activeTab === "all") return schools;
    if (activeTab === NONE) return schools.filter((s) => !s.emirate);
    return schools.filter((s) => s.emirate === activeTab);
  }, [schools, search, activeTab]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const created = await createSchool({ name: newName.trim(), area: newArea.trim() || null, emirate: newEmirate || (activeTab !== "all" && activeTab !== NONE ? activeTab : null) });
      setNewName("");
      setNewArea("");
      setNewEmirate("");
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
          <div className="in-seg schools-view-toggle" role="tablist" aria-label="View">
            <button type="button" role="tab" aria-selected={view === "list"} className={view === "list" ? "is-on" : ""} onClick={() => switchView("list")}>
              All schools
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "analytics"}
              className={view === "analytics" ? "is-on" : ""}
              onClick={() => switchView("analytics")}
            >
              Analytics
            </button>
          </div>
          {view === "list" && (
            <>
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
            </>
          )}
        </div>
      </div>

      {view === "analytics" && <SchoolAnalytics />}

      {view === "list" && schools && schools.length > 0 && (
        <div className="acct-pills" role="tablist" aria-label="Emirate">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              className={"acct-pill" + (activeTab === t.key ? " is-active" : "")}
              onClick={() => pickTab(t.key)}
            >
              {t.label}
              {t.count > 0 && <span className="acct-pill-count">{t.count}</span>}
            </button>
          ))}
        </div>
      )}

      {view === "list" && error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {view === "list" && adding && (
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
          <select className="panel-select" value={newEmirate} onChange={(e) => setNewEmirate(e.target.value)} aria-label="Emirate">
            <option value="">{activeTab !== "all" && activeTab !== NONE ? `Emirate (${activeTab})` : "Emirate"}</option>
            {EMIRATE_CHOICES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <button type="submit" className="panel-btn panel-btn-primary" disabled={saving || !newName.trim()}>
            {saving ? "Adding…" : "Add"}
          </button>
        </form>
      )}

      {view === "list" && schools && schools.length === 0 && !error && (
        <p className="families-empty-hint">No schools yet — add the first one above.</p>
      )}

      {view === "list" && schools && schools.length > 0 && filtered.length === 0 && <p className="families-empty-hint">Nothing matches that.</p>}

      {view === "list" && filtered.length > 0 && (
        <div className="families-table-wrap">
          <table className="families-table">
            <thead>
              <tr>
                <th>School</th>
                <th>Curriculum</th>
                <th>Main contact</th>
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
                      {(s.area || (activeTab === "all" && s.emirate)) && (
                        <span className="families-cell-sub">
                          {s.area}
                          {activeTab === "all" && s.emirate && s.area ? " · " : ""}
                          {activeTab === "all" && s.emirate}
                        </span>
                      )}
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
