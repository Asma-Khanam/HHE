import { useEffect, useRef, useState } from "react";
import {
  createApplication,
  updateApplication,
  createSchool,
  listShortlistForFamily,
  listApplicationEvents,
  createApplicationEvent,
  updateSchool,
} from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import { APPLICATION_STATUSES, REJECTION_REASONS, daysInStage, eventTypeLabel, eventSourceLabel } from "../lib/workflow";
import CopyButton from "./CopyButton";
import "./panels.css";
import AutosaveField from "./Autosave";
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

const ALIAS_DOMAIN = "applications.heatherharries.com";

// Portal login + activity log for one application, shown when a consultant
// opens the application. Login details are the parent's application alias
// and password (the same ones shown on the Application email panel); nothing
// here is deletable -- log entries are only ever added.
function PortalAndLog({ application, school, parents, events, onEventAdded, onPortalUrlSaved }) {
  const [revealed, setRevealed] = useState(false);
  const [entry, setEntry] = useState("");
  const [saving, setSaving] = useState(false);
  const [logError, setLogError] = useState("");
  const login = (parents || []).find((p) => p.application_alias && p.application_password);
  const email = login ? `${login.application_alias}@${ALIAS_DOMAIN}` : "";
  const portalUrl = school?.openapply_login_url || "";

  async function addEntry() {
    const text = entry.trim();
    if (!text || saving) return;
    setSaving(true);
    setLogError("");
    try {
      const ev = await createApplicationEvent({ applicationId: application.id, eventType: "note", description: text });
      onEventAdded(ev);
      setEntry("");
    } catch (err) {
      setLogError(err.message || "Couldn't add that entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ap-portal">
      <div className="ap-portal-box">
        <div className="ap-portal-title">Portal login</div>
        {school ? (
          <div className="ap-portal-url">
            <AutosaveField
              collapsible
              label={`Portal link for ${school.name} (same field as on the school record)`}
              placeholder="Paste the school's portal login page, e.g. https://school.openapply.com/dashboard"
              value={portalUrl}
              onSave={async (v) => {
                const clean = (v || "").trim();
                const patch = { openapply_login_url: clean || null };
                if (clean && /openapply\.com/i.test(clean) && !school.application_platform) {
                  patch.application_platform = "openapply";
                }
                await updateSchool(school.id, patch);
                onPortalUrlSaved(school.id, clean || null, patch.application_platform);
              }}
            />
            {portalUrl && (
              <div className="ap-portal-row">
                <a href={portalUrl} target="_blank" rel="noreferrer" className="ap-portal-link">
                  Open portal
                </a>
                <CopyButton text={portalUrl} />
              </div>
            )}
          </div>
        ) : null}
        {login ? (
          <>
            <div className="ap-portal-row">
              <span className="ap-portal-label">Email</span>
              <code className="ap-portal-code">{email}</code>
              <CopyButton text={email} />
            </div>
            <div className="ap-portal-row">
              <span className="ap-portal-label">Password</span>
              <code className="ap-portal-code">{revealed ? login.application_password : "••••••••••••"}</code>
              <button type="button" className="ap-portal-toggle" onClick={() => setRevealed((v) => !v)}>
                {revealed ? "Hide" : "Show"}
              </button>
              <CopyButton text={login.application_password} />
            </div>
            <div className="ap-portal-row ap-portal-muted">
              {login.full_name ? `${login.full_name}'s` : "Parent's"} application email. Same login for every school.
            </div>
          </>
        ) : (
          <div className="ap-portal-row ap-portal-muted">
            No application email and password generated yet.{" "}
            <button
              type="button"
              className="ap-portal-toggle"
              onClick={() =>
                document.getElementById("application-email-section")?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              Go to Application email
            </button>
          </div>
        )}
      </div>

      <div className="ap-portal-box">
        <div className="ap-portal-title">Activity log</div>
        <div className="ap-log-add">
          <input
            className="panel-input"
            placeholder="Add a log entry (e.g. logged in, uploaded passport, paid invoice)"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEntry();
              }
            }}
          />
          <button type="button" className="panel-btn" disabled={saving || !entry.trim()} onClick={addEntry}>
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
        {logError && <div className="hh-form-banner hh-form-banner-error">{logError}</div>}
        {events.length === 0 ? (
          <div className="ap-portal-row ap-portal-muted">Nothing logged yet.</div>
        ) : (
          <ul className="ap-log">
            {events.map((ev) => (
              <li key={ev.id} className="ap-log-item">
                <span className="ap-log-date">
                  {new Date(ev.occurred_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                </span>
                <span className="ap-log-body">
                  <strong>{eventTypeLabel(ev.event_type)}</strong>
                  {ev.description ? ` — ${ev.description}` : ""}
                  <span className="ap-log-src"> · {eventSourceLabel(ev.source)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Where each child has applied and how far along each application is.
// Applications are never deleted from here -- a school that falls away is
// set to Withdrawn (with a reason) or Declined instead, so the record stays.
export default function ApplicationsPanel({
  familyId,
  familyChildren,
  applicationsByChild,
  onApplicationsChange,
  schoolCatalog,
  highlightSchoolId,
  parents = [],
}) {
  const [apps, setApps] = useState(applicationsByChild || {});
  // Every change made here is reported to the page above, so leaving this tab
  // and coming back shows the current data, not what was loaded at page open.
  const onChangeRef = useRef(onApplicationsChange);
  onChangeRef.current = onApplicationsChange;
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    onChangeRef.current?.(apps);
  }, [apps]);
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
      setError("");
      return true;
    } catch (err) {
      setError(err.message || "Couldn't save that change.");
      setApps(previous);
      return false;
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
                        <div className="ap-extra">
                          <AutosaveField
                            collapsible
                            label={application.status === "withdrawn" ? "Reason for withdrawing" : "Reason for declining"}
                            placeholder={
                              application.status === "withdrawn" ? "Why was it withdrawn?" : "Why? (no space, fees, etc.)"
                            }
                            value={application[reasonField]}
                            onSave={async (v) => {
                              const ok = await patch(child.id, application, { [reasonField]: v });
                              if (!ok) throw new Error("check the message above, then Retry");
                            }}
                          />
                          {application.status === "rejected" && (
                            <div className="ap-chips">
                              <span className="ap-chips-label">Quick pick</span>
                              {REJECTION_REASONS.filter((r) => r !== "Other").map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  className={"ap-chip" + (application.rejected_reason === r ? " is-on" : "")}
                                  onClick={() => patch(child.id, application, { rejected_reason: r })}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <details
                        className="ap-details"
                        open={!!(application.notes || application.assessment_date || application.assessment_link || application.assessment_notes)}
                      >
                        <summary>Application details, portal login &amp; log</summary>
                        <div className="ap-details-grid">
                          <label className="ap-field">
                            <span className="ap-label">Date submitted</span>
                            <input
                              type="date"
                              className="panel-input"
                              value={application.submitted_at ? String(application.submitted_at).slice(0, 10) : ""}
                              onChange={(e) => patch(child.id, application, { submitted_at: e.target.value || null })}
                            />
                          </label>
                          <label className="ap-field">
                            <span className="ap-label">Assessment date</span>
                            <input
                              type="date"
                              className="panel-input"
                              value={application.assessment_date || ""}
                              onChange={(e) => patch(child.id, application, { assessment_date: e.target.value || null })}
                            />
                          </label>
                          <div className="ap-details-wide">
                            <AutosaveField
                              collapsible
                              label="Assessment meeting link"
                              placeholder="Paste the Zoom / Teams link"
                              value={application.assessment_link}
                              onSave={async (v) => {
                                const ok = await patch(child.id, application, { assessment_link: v });
                                if (!ok) throw new Error("check the message above, then Retry");
                              }}
                            />
                          </div>
                          <div className="ap-details-wide">
                            <AutosaveField
                              collapsible
                              multiline
                              rows={3}
                              label="Assessment details"
                              placeholder="What to bring, who is meeting them, anything the family needs to know"
                              value={application.assessment_notes}
                              onSave={async (v) => {
                                const ok = await patch(child.id, application, { assessment_notes: v });
                                if (!ok) throw new Error("check the message above, then Retry");
                              }}
                            />
                          </div>
                          <div className="ap-details-wide">
                            <AutosaveField
                              collapsible
                              multiline
                              rows={4}
                              label="Notes on this application"
                              placeholder="Anything the team should know about this application"
                              value={application.notes}
                              onSave={async (v) => {
                                const ok = await patch(child.id, application, { notes: v });
                                if (!ok) throw new Error("check the message above, then Retry");
                              }}
                            />
                          </div>
                        </div>
                        <PortalAndLog
                          application={application}
                          school={schools.find((sc) => sc.id === application.school_id)}
                          parents={parents}
                          onPortalUrlSaved={(id, url, platform) =>
                            setSchools((list) =>
                              list.map((sc) =>
                                sc.id === id
                                  ? { ...sc, openapply_login_url: url, application_platform: platform || sc.application_platform }
                                  : sc
                              )
                            )
                          }
                          events={eventsByApp[application.id] || []}
                          onEventAdded={(ev) =>
                            setEventsByApp((m) => ({ ...m, [application.id]: [ev, ...(m[application.id] || [])] }))
                          }
                        />
                      </details>
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
