import { useEffect, useState } from "react";
import {
  createApplication,
  updateApplication,
  createSchool,
  listShortlistForFamily,
  listApplicationEvents,
  createApplicationEvent,
} from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import { APPLICATION_STATUSES, REJECTION_REASONS, daysInStage } from "../lib/workflow";
import "./panels.css";
import "./ApplicationsPanel.css";

const TOUR_STATUS_LABEL = { offered: "booked", confirmed: "booked", completed: "toured", cancelled: "cancelled" };

// Colour of the stage dropdown, so where each school is up to reads at a
// glance without opening anything.
const STAGE_TONE = {
  draft: "neutral",
  submitted: "progress",
  assessment_booked: "progress",
  under_review: "progress",
  offer: "good",
  offer_accepted: "good",
  waitlisted: "warn",
  rejected: "bad",
  withdrawn: "muted",
};

function formatShortDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function schoolInitials(name) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

// Declined and Withdrawn each keep their own reason column (addendum 52 and 63).
function reasonFieldFor(status) {
  return status === "withdrawn" ? "withdrawn_reason" : "rejected_reason";
}

// A text field that saves itself when you click away -- no Save button.
function ReasonField({ label, placeholder, value, listId, onSave }) {
  const [draft, setDraft] = useState(value || "");
  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  function commit() {
    const next = draft.trim();
    if (next !== (value || "")) onSave(next || null);
  }

  return (
    <label className="ap-extra">
      <span className="ap-label">{label}</span>
      <input
        type="text"
        className="panel-input ap-extra-input"
        list={listId}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}

// Where each child has applied and how far along each application is.
// Applications are never deleted from here -- a school that falls away is
// set to Withdrawn (with a reason) or Declined instead, so the record stays.
export default function ApplicationsPanel({ familyId, familyChildren, applicationsByChild, schoolCatalog, highlightSchoolId }) {
  const [apps, setApps] = useState(applicationsByChild || {});
  const [schools, setSchools] = useState(schoolCatalog || []);
  // Read-only lookup of this family's tour history per school, so a row can
  // say "Toured 15 Sept" without flipping over to the School visits tab.
  const [tourBySchool, setTourBySchool] = useState({});
  // Status-change history, only used for the "days at this stage" figure.
  const [eventsByApp, setEventsByApp] = useState({});

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    listShortlistForFamily(familyId)
      .then((rows) => {
        if (cancelled) return;
        const map = {};
        (rows || []).forEach((r) => {
          const tours = [];
          if (r.tour_date) tours.push({ date: r.tour_date, status: r.tour_status });
          if (r.tour2_date) tours.push({ date: r.tour2_date, status: r.tour2_status });
          if (tours.length) map[r.school_id] = tours;
        });
        setTourBySchool(map);
      })
      .catch(() => {
        if (!cancelled) setTourBySchool({});
      });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  const appIdsKey = Object.values(apps)
    .flat()
    .map((a) => a.id)
    .join(",");
  useEffect(() => {
    const ids = appIdsKey ? appIdsKey.split(",") : [];
    if (!ids.length) return;
    let cancelled = false;
    listApplicationEvents(ids)
      .then((rows) => {
        if (cancelled) return;
        const map = {};
        (rows || []).forEach((e) => {
          (map[e.application_id] = map[e.application_id] || []).push(e);
        });
        setEventsByApp(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [appIdsKey]);

  // A founder pressing through from a school's own page lands on that
  // school's application (?tab=applications&school=<id>).
  const [highlightActive, setHighlightActive] = useState(!!highlightSchoolId);
  useEffect(() => {
    if (!highlightSchoolId) return;
    const el = document.getElementById(`app-row-school-${highlightSchoolId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightActive(true);
    const timer = setTimeout(() => setHighlightActive(false), 2500);
    return () => clearTimeout(timer);
  }, [highlightSchoolId, apps]);

  const [addingFor, setAddingFor] = useState(null); // child id
  const [schoolId, setSchoolId] = useState("");
  const [newSchoolName, setNewSchoolName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function resetForm() {
    setSchoolId("");
    setNewSchoolName("");
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

  // Changing the stage also writes a timeline event in the background, so
  // "days at this stage" stays accurate and the history is kept.
  async function changeStatus(childId, application, nextStatus) {
    patch(childId, application, { status: nextStatus });
    try {
      const label = APPLICATION_STATUSES.find((s) => s.key === nextStatus)?.label || nextStatus;
      const event = await createApplicationEvent({
        applicationId: application.id,
        eventType: "status_change",
        newStatus: nextStatus,
        description: `Stage changed to ${label}`,
      });
      setEventsByApp((m) => ({ ...m, [application.id]: [event, ...(m[application.id] || [])] }));
    } catch {
      // The stage itself already saved; a missing history entry isn't worth an error.
    }
  }

  async function handleAdd(e, child) {
    e.preventDefault();
    const typedName = newSchoolName.trim();
    if (!schoolId && !typedName) return;
    setBusy(true);
    setError("");
    try {
      let targetSchoolId = schoolId;
      // A name that isn't in the catalogue is added to it -- the schools
      // table is shared, so the next family gets it in the dropdown.
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
      const created = await createApplication({ childId: child.id, schoolId: targetSchoolId, status: "draft" });
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
    <section className="panel ap">
      <div className="panel-head">
        <h2>Applications</h2>
      </div>

      <datalist id="rejection-reason-options">
        {REJECTION_REASONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {familyChildren.map((child, i) => {
        // Withdrawn applications sit at the bottom, greyed out.
        const childApps = [...(apps[child.id] || [])].sort(
          (a, b) => (a.status === "withdrawn") - (b.status === "withdrawn")
        );
        const name = displayNameForChild(child, i);
        return (
          <div key={child.id} className="ap-child">
            <div className="ap-child-head">
              <div className="ap-child-title">
                <span className="ap-child-name">{name}</span>
                {child.year_group_applying_for && <span className="ap-child-year">{child.year_group_applying_for}</span>}
              </div>
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

            {addingFor === child.id && (
              <form className="ap-add" onSubmit={(e) => handleAdd(e, child)}>
                <select
                  className="panel-select ap-add-grow"
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
                <span className="ap-add-or">or</span>
                <input
                  type="text"
                  className="panel-input ap-add-grow"
                  placeholder="Type a new school name"
                  value={newSchoolName}
                  onChange={(e) => {
                    setNewSchoolName(e.target.value);
                    if (e.target.value) setSchoolId("");
                  }}
                />
                <button
                  type="submit"
                  className="panel-btn panel-btn-primary"
                  disabled={busy || (!schoolId && !newSchoolName.trim())}
                >
                  {busy ? "Adding…" : "Add"}
                </button>
              </form>
            )}

            {childApps.length === 0 ? (
              <p className="panel-hint ap-empty">No schools added for {name} yet.</p>
            ) : (
              <ul className="ap-list">
                {childApps.map((application) => {
                  const tone = STAGE_TONE[application.status] || "neutral";
                  const tours = tourBySchool[application.school_id] || [];
                  const days = daysInStage(application, eventsByApp[application.id]);
                  const isHighlighted =
                    highlightActive && String(highlightSchoolId) === String(application.school_id);
                  const reasonField = reasonFieldFor(application.status);
                  return (
                    <li
                      key={application.id}
                      id={`app-row-school-${application.school_id}`}
                      className={
                        "ap-card" +
                        (application.status === "withdrawn" ? " is-withdrawn" : "") +
                        (isHighlighted ? " is-highlight" : "")
                      }
                    >
                      <div className="ap-school">
                        <span className="ap-avatar">{schoolInitials(application.schoolName)}</span>
                        <span className="ap-school-text">
                          <span className="ap-school-name">{application.schoolName}</span>
                          <span className="ap-school-meta">
                            {tours.length === 0
                              ? "No tour booked"
                              : tours
                                  .map((t, idx) => {
                                    const prefix = tours.length > 1 ? (idx === 0 ? "Primary " : "Secondary ") : "Tour ";
                                    return `${prefix}${TOUR_STATUS_LABEL[t.status] || "booked"} ${formatShortDate(t.date)}`;
                                  })
                                  .join(" · ")}
                          </span>
                        </span>
                      </div>

                      <label className="ap-field ap-field-stage">
                        <span className="ap-label">Application stage</span>
                        <select
                          className={"ap-stage ap-tone-" + tone}
                          value={application.status}
                          onChange={(e) => changeStatus(child.id, application, e.target.value)}
                        >
                          {APPLICATION_STATUSES.map((s) => (
                            <option key={s.key} value={s.key}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        {days !== null && (
                          <span className="ap-days">
                            {days === 0 ? "Since today" : `${days} day${days === 1 ? "" : "s"} at this stage`}
                          </span>
                        )}
                      </label>

                      <label className="ap-field ap-field-date">
                        <span className="ap-label">Visit date</span>
                        <input
                          type="date"
                          className="panel-input"
                          value={application.visit_date || ""}
                          onChange={(e) => patch(child.id, application, { visit_date: e.target.value || null })}
                          title="Also shows on the shared calendar"
                        />
                      </label>

                      {application.status === "offer" && (
                        <label className="ap-extra">
                          <span className="ap-label">Decision needed by</span>
                          <input
                            type="date"
                            className="panel-input"
                            value={application.offer_decision_by || ""}
                            onChange={(e) => patch(child.id, application, { offer_decision_by: e.target.value || null })}
                          />
                        </label>
                      )}

                      {(application.status === "rejected" || application.status === "withdrawn") && (
                        <ReasonField
                          label={application.status === "withdrawn" ? "Reason for withdrawing" : "Reason for declining"}
                          placeholder={
                            application.status === "withdrawn" ? "Why was it withdrawn?" : "Why? (no space, fees, etc.)"
                          }
                          value={application[reasonField]}
                          listId={application.status === "rejected" ? "rejection-reason-options" : undefined}
                          onSave={(v) => patch(child.id, application, { [reasonField]: v })}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
