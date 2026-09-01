import { useState } from "react";
import { createApplication, updateApplication, deleteApplication, createSchool } from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import { APPLICATION_STATUSES, APPLICATION_PROGRESS_STEPS, applicationStatus, FIT_OPTIONS, fitLabel } from "../lib/workflow";
import "./panels.css";

function schoolInitials(name) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

function Progress({ status }) {
  const filled = applicationStatus(status).progress;
  return (
    <span className="app-progress" title={applicationStatus(status).label}>
      {Array.from({ length: APPLICATION_PROGRESS_STEPS }).map((_, i) => (
        <span key={i} className={"app-progress-seg" + (i < filled ? " is-filled" : "")} />
      ))}
    </span>
  );
}

// Where each child has actually applied. This is the first thing in the app
// to use the `applications` and `schools` tables, which have existed since
// the original schema and sat empty until now.
export default function ApplicationsPanel({ familyChildren, applicationsByChild, schoolCatalog }) {
  const [apps, setApps] = useState(applicationsByChild || {});
  const [schools, setSchools] = useState(schoolCatalog || []);
  const [addingFor, setAddingFor] = useState(null); // child id
  const [schoolId, setSchoolId] = useState("");
  const [newSchoolName, setNewSchoolName] = useState("");
  const [fit, setFit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function resetForm() {
    setSchoolId("");
    setNewSchoolName("");
    setFit("");
  }

  async function handleAdd(e, child) {
    e.preventDefault();
    const typedName = newSchoolName.trim();
    if (!schoolId && !typedName) return;
    setBusy(true);
    setError("");
    try {
      let targetSchoolId = schoolId;
      // Typing a name that isn't in the catalog adds it to the catalog — the
      // schools table is shared, so the next family gets it in the dropdown.
      if (!targetSchoolId) {
        const existing = schools.find((s) => s.name.toLowerCase() === typedName.toLowerCase());
        if (existing) {
          targetSchoolId = existing.id;
        } else {
          const created = await createSchool({ name: typedName });
          setSchools((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
          targetSchoolId = created.id;
        }
      }
      const created = await createApplication({ childId: child.id, schoolId: targetSchoolId, fit, status: "draft" });
      const schoolName = schools.find((s) => s.id === targetSchoolId)?.name || typedName;
      setApps((map) => ({ ...map, [child.id]: [...(map[child.id] || []), { ...created, schoolName }] }));
      resetForm();
      setAddingFor(null);
    } catch (err) {
      setError(err.message || "Couldn't add that application.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(childId, application, changes) {
    const previous = apps;
    setApps((map) => ({
      ...map,
      [childId]: (map[childId] || []).map((a) => (a.id === application.id ? { ...a, ...changes } : a)),
    }));
    try {
      await updateApplication(application.id, changes);
    } catch (err) {
      setError(err.message || "Couldn't save that change.");
      setApps(previous);
    }
  }

  async function handleRemove(childId, application) {
    const previous = apps;
    setApps((map) => ({ ...map, [childId]: (map[childId] || []).filter((a) => a.id !== application.id) }));
    try {
      await deleteApplication(application.id);
    } catch (err) {
      setError(err.message || "Couldn't remove that application.");
      setApps(previous);
    }
  }

  if (!familyChildren.length) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>Applications</h2>
        </div>
        <p className="panel-hint">No children on this family yet — applications live per child.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Applications</h2>
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {familyChildren.map((child, i) => {
        const childApps = apps[child.id] || [];
        const name = displayNameForChild(child, i);
        return (
          <div key={child.id} className="app-child-block">
            <div className="app-child-head">
              <span className="app-child-name">
                {name}
                {child.year_group_applying_for ? ` · ${child.year_group_applying_for}` : ""}
              </span>
              <button
                type="button"
                className="panel-btn"
                onClick={() => {
                  resetForm();
                  setAddingFor(addingFor === child.id ? null : child.id);
                }}
              >
                {addingFor === child.id ? "Cancel" : "+ Add school"}
              </button>
            </div>

            {childApps.length === 0 ? (
              <p className="panel-hint">No schools added for {name} yet.</p>
            ) : (
              <ul className="panel-list">
                {childApps.map((application) => (
                  <li key={application.id} className="app-row">
                    <span className="app-row-avatar">{schoolInitials(application.schoolName)}</span>
                    <span className="app-row-text">
                      <span className="app-row-school">{application.schoolName}</span>
                      <span className="app-row-fit">
                        {application.fit ? fitLabel(application.fit) : "Fit not judged yet"}
                      </span>
                    </span>
                    <Progress status={application.status} />
                    <select
                      className="panel-select"
                      value={application.fit || ""}
                      onChange={(e) => patch(child.id, application, { fit: e.target.value || null })}
                      title="How good a fit is this school?"
                    >
                      <option value="">Fit…</option>
                      {FIT_OPTIONS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="panel-select"
                      value={application.status}
                      onChange={(e) => patch(child.id, application, { status: e.target.value })}
                    >
                      {APPLICATION_STATUSES.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="panel-btn panel-btn-quiet"
                      onClick={() => handleRemove(child.id, application)}
                      title="Remove this application"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {addingFor === child.id && (
              <form className="panel-form" onSubmit={(e) => handleAdd(e, child)}>
                <select
                  className="panel-select panel-form-grow"
                  value={schoolId}
                  onChange={(e) => {
                    setSchoolId(e.target.value);
                    if (e.target.value) setNewSchoolName("");
                  }}
                >
                  <option value="">Pick a school…</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className="panel-input panel-form-grow"
                  placeholder="…or type a new school name"
                  value={newSchoolName}
                  onChange={(e) => {
                    setNewSchoolName(e.target.value);
                    if (e.target.value) setSchoolId("");
                  }}
                />
                <select className="panel-select" value={fit} onChange={(e) => setFit(e.target.value)}>
                  <option value="">Fit…</option>
                  {FIT_OPTIONS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="panel-btn panel-btn-primary"
                  disabled={busy || (!schoolId && !newSchoolName.trim())}
                >
                  {busy ? "Adding…" : "Add"}
                </button>
              </form>
            )}
          </div>
        );
      })}
    </section>
  );
}
