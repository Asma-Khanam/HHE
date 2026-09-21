import { useEffect, useState } from "react";
import {
  createApplication,
  updateApplication,
  deleteApplication,
  createSchool,
  listShortlistForFamily,
  listApplicationEvents,
  createApplicationEvent,
  listApplicationFees,
  createApplicationFee,
  updateApplicationFee,
  deleteApplicationFee,
} from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import {
  APPLICATION_STATUSES,
  APPLICATION_PROGRESS_STEPS,
  applicationStatus,
  REJECTION_REASONS,
  EVENT_TYPES,
  eventTypeLabel,
  eventSourceLabel,
  FEE_STATUSES,
  feeStatusLabel,
  daysInStage,
} from "../lib/workflow";
import "./panels.css";

function formatEventWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatShortDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const TOUR_STATUS_LABEL = { offered: "Tour booked", confirmed: "Tour booked", completed: "Toured", cancelled: "Tour cancelled" };

// Declined and Withdrawn each keep their own reason column (addendum 52 and 63).
function reasonFieldFor(status) {
  return status === "withdrawn" ? "withdrawn_reason" : "rejected_reason";
}

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
export default function ApplicationsPanel({ familyId, familyChildren, applicationsByChild, schoolCatalog, highlightSchoolId }) {
  const [apps, setApps] = useState(applicationsByChild || {});
  const [schools, setSchools] = useState(schoolCatalog || []);
  // Read-only lookup of this family's own tour history, keyed by school --
  // so an application shows "Toured 15 Sept" without staff having to flip
  // over to the School visits tab to check. Fetched separately since the
  // shortlist isn't otherwise loaded on this tab.
  const [tourBySchool, setTourBySchool] = useState({});

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    listShortlistForFamily(familyId)
      .then((rows) => {
        if (cancelled) return;
        const map = {};
        (rows || []).forEach((r) => {
          if (r.tour_date) map[r.school_id] = { date: r.tour_date, status: r.tour_status };
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

  // School record's "Shortlisted families" list links straight here
  // (?tab=applications&school=<id>) so a founder pressing through from a
  // school's own page lands on that specific application, not just
  // somewhere on the Applications tab generally (Sept 2026 founder
  // feedback: "can this take me directly to where they are with the
  // application with that school?").
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
  // Reason capture for a rejection -- opens right after staff pick
  // "Rejected" on an application that doesn't have one recorded yet, so
  // the reason lands at the moment it's freshest in mind, not as a
  // separate step someone has to remember to go back for.
  const [reasonEditingId, setReasonEditingId] = useState(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [newSchoolName, setNewSchoolName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Expanded detail (Stage Timeline + Fees) for one application at a time --
  // fetched lazily on first expand, same pattern as tourBySchool above, so
  // the tab doesn't pull every application's whole history up front.
  const [expandedId, setExpandedId] = useState(null);
  const [eventsByApp, setEventsByApp] = useState({});
  const [feesByApp, setFeesByApp] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [logEventType, setLogEventType] = useState("note");
  const [logDescription, setLogDescription] = useState("");
  const [addingFeeFor, setAddingFeeFor] = useState(null);
  const [feeLabel, setFeeLabel] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeDueDate, setFeeDueDate] = useState("");

  async function toggleExpand(application) {
    if (expandedId === application.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(application.id);
    setAddingFeeFor(null);
    setLogDescription("");
    setLogEventType("note");
    if (eventsByApp[application.id] && feesByApp[application.id]) return;
    setDetailLoading(true);
    try {
      const [events, fees] = await Promise.all([
        listApplicationEvents([application.id]),
        listApplicationFees([application.id]),
      ]);
      setEventsByApp((m) => ({ ...m, [application.id]: events }));
      setFeesByApp((m) => ({ ...m, [application.id]: fees }));
    } catch (err) {
      setError(err.message || "Couldn't load this application's history.");
    } finally {
      setDetailLoading(false);
    }
  }

  // The Status dropdown is the common case, so changing it writes a
  // status_change event automatically -- staff never have to remember to
  // also "log" the fact separately. The Stage Timeline is built from this,
  // never typed by hand for the common path.
  async function changeStatus(childId, application, nextStatus) {
    patch(childId, application, { status: nextStatus });
    if (
      (nextStatus === "rejected" && !application.rejected_reason) ||
      (nextStatus === "withdrawn" && !application.withdrawn_reason)
    ) {
      setReasonDraft("");
      setReasonEditingId(application.id);
    }
    try {
      const event = await createApplicationEvent({
        applicationId: application.id,
        eventType: "status_change",
        newStatus: nextStatus,
        description: `Status changed to ${applicationStatus(nextStatus).label}`,
      });
      setEventsByApp((m) =>
        m[application.id] ? { ...m, [application.id]: [event, ...m[application.id]] } : m
      );
    } catch {
      // The status change itself already saved via patch() above -- a
      // failure here only means the timeline entry is missing, which
      // isn't worth surfacing as an error on top of a successful save.
    }
  }

  async function submitLogEvent(application) {
    const description = logDescription.trim();
    if (!description) return;
    setDetailLoading(true);
    try {
      const event = await createApplicationEvent({
        applicationId: application.id,
        eventType: logEventType,
        description,
      });
      setEventsByApp((m) => ({ ...m, [application.id]: [event, ...(m[application.id] || [])] }));
      setLogDescription("");
    } catch (err) {
      setError(err.message || "Couldn't log that update.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function submitAddFee(e, application) {
    e.preventDefault();
    const label = feeLabel.trim();
    if (!label) return;
    setDetailLoading(true);
    try {
      const fee = await createApplicationFee({
        applicationId: application.id,
        label,
        amount: feeAmount,
        dueDate: feeDueDate,
      });
      setFeesByApp((m) => ({ ...m, [application.id]: [...(m[application.id] || []), fee] }));
      setFeeLabel("");
      setFeeAmount("");
      setFeeDueDate("");
      setAddingFeeFor(null);
    } catch (err) {
      setError(err.message || "Couldn't add that fee.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function setFeeStatus(application, fee, status) {
    const previous = feesByApp[application.id] || [];
    setFeesByApp((m) => ({
      ...m,
      [application.id]: previous.map((f) => (f.id === fee.id ? { ...f, status } : f)),
    }));
    try {
      const paidAt = status === "paid" ? new Date().toISOString() : null;
      await updateApplicationFee(fee.id, { status, paid_at: paidAt });
      if (status === "paid") {
        const event = await createApplicationEvent({
          applicationId: application.id,
          eventType: "fee_paid",
          description: `${fee.label} marked paid`,
        });
        setEventsByApp((m) => ({ ...m, [application.id]: [event, ...(m[application.id] || [])] }));
      }
    } catch (err) {
      setError(err.message || "Couldn't update that fee.");
      setFeesByApp((m) => ({ ...m, [application.id]: previous }));
    }
  }

  async function removeFee(application, fee) {
    const previous = feesByApp[application.id] || [];
    setFeesByApp((m) => ({ ...m, [application.id]: previous.filter((f) => f.id !== fee.id) }));
    try {
      await deleteApplicationFee(fee.id);
    } catch (err) {
      setError(err.message || "Couldn't remove that fee.");
      setFeesByApp((m) => ({ ...m, [application.id]: previous }));
    }
  }

  function resetForm() {
    setSchoolId("");
    setNewSchoolName("");
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

  function saveRejectionReason(childId, application) {
    const reason = reasonDraft.trim();
    setReasonEditingId(null);
    setReasonDraft("");
    const field = reasonFieldFor(application.status);
    if (reason === (application[field] || "")) return;
    patch(childId, application, { [field]: reason || null });
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

      <datalist id="rejection-reason-options">
        {REJECTION_REASONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {familyChildren.map((child, i) => {
        // Withdrawn applications drop to the bottom of the list (greyed out
        // in the row below) rather than disappearing. Stable sort, so
        // everything else keeps its order.
        const childApps = [...(apps[child.id] || [])].sort(
          (a, b) => (a.status === "withdrawn") - (b.status === "withdrawn")
        );
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
                  <li
                    key={application.id}
                    id={`app-row-school-${application.school_id}`}
                    className={"app-row" + (highlightActive && String(highlightSchoolId) === String(application.school_id) ? " app-row-highlight" : "") + (application.status === "withdrawn" ? " app-row-inactive" : "")}
                  >
                    <span className="app-row-avatar">{schoolInitials(application.schoolName)}</span>
                    <span className="app-row-text">
                      <span className="app-row-school">{application.schoolName}</span>
                      <span className="app-row-fit">
                        {tourBySchool[application.school_id] && (
                          <>{TOUR_STATUS_LABEL[tourBySchool[application.school_id].status] || "Tour booked"}{" "}
                          {formatShortDate(tourBySchool[application.school_id].date)}</>
                        )}
                      </span>
                    </span>
                    <span className="app-row-controls">
                      <Progress status={application.status} />
                      <input
                        type="date"
                        className="panel-input"
                        value={application.visit_date || ""}
                        onChange={(e) => patch(child.id, application, { visit_date: e.target.value || null })}
                        title="Visit date — also shows on the shared calendar"
                      />
                      <select
                        className="panel-select"
                        value={application.status}
                        onChange={(e) => changeStatus(child.id, application, e.target.value)}
                      >
                        {APPLICATION_STATUSES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <span className="app-days-in-stage" title="Days since this application entered its current status -- derived from the Stage Timeline, not typed by hand">
                        {(() => {
                          const d = daysInStage(application, eventsByApp[application.id]);
                          return d === null ? "" : `${d}d in stage`;
                        })()}
                      </span>
                      <button
                        type="button"
                        className="panel-btn panel-btn-quiet"
                        onClick={() => toggleExpand(application)}
                      >
                        {expandedId === application.id ? "Hide timeline" : "Timeline & fees"}
                      </button>
                      <button
                        type="button"
                        className="panel-btn panel-btn-quiet"
                        onClick={() => handleRemove(child.id, application)}
                        title="Remove this application"
                      >
                        ✕
                      </button>
                    </span>
                    {(application.status === "rejected" || application.status === "withdrawn") && (
                      <div className="app-row-reason" onClick={(e) => e.stopPropagation()}>
                        {reasonEditingId === application.id ? (
                          <>
                            <input
                              type="text"
                              className="panel-input"
                              list={application.status === "rejected" ? "rejection-reason-options" : undefined}
                              placeholder={application.status === "withdrawn" ? "Why was it withdrawn?" : "Why? (no space, fees, etc.)"}
                              value={reasonDraft}
                              autoFocus
                              onChange={(e) => setReasonDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRejectionReason(child.id, application);
                                if (e.key === "Escape") {
                                  setReasonEditingId(null);
                                  setReasonDraft("");
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="panel-btn panel-btn-quiet"
                              onClick={() => saveRejectionReason(child.id, application)}
                            >
                              Save
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="app-row-reason-chip"
                            onClick={() => {
                              setReasonDraft(application[reasonFieldFor(application.status)] || "");
                              setReasonEditingId(application.id);
                            }}
                          >
                            {application[reasonFieldFor(application.status)]
                              ? `Reason: ${application[reasonFieldFor(application.status)]}`
                              : "+ Add reason"}
                          </button>
                        )}
                      </div>
                    )}

                    {application.status === "offer" && (
                      <div className="app-row-reason" onClick={(e) => e.stopPropagation()}>
                        <label className="app-row-reason-chip" style={{ textDecoration: "none", cursor: "default" }}>
                          Decision needed by{" "}
                        </label>
                        <input
                          type="date"
                          className="panel-input"
                          value={application.offer_decision_by || ""}
                          onChange={(e) => patch(child.id, application, { offer_decision_by: e.target.value || null })}
                        />
                      </div>
                    )}

                    {expandedId === application.id && (
                      <div className="app-detail" onClick={(e) => e.stopPropagation()}>
                        <div className="app-detail-col">
                          <h4 className="app-detail-heading">Fees</h4>
                          {(feesByApp[application.id] || []).length === 0 && !detailLoading && (
                            <p className="panel-hint">No fees logged yet.</p>
                          )}
                          <ul className="app-fee-list">
                            {(feesByApp[application.id] || []).map((fee) => (
                              <li key={fee.id} className="app-fee-row">
                                <span className="app-fee-label">
                                  {fee.label}
                                  {fee.source === "openapply_sync" && (
                                    <span className="app-source-chip">Synced</span>
                                  )}
                                </span>
                                <span className="app-fee-amount">
                                  {fee.amount != null ? `${fee.currency} ${fee.amount}` : "—"}
                                </span>
                                <span className="app-fee-due">
                                  {fee.due_date ? formatShortDate(fee.due_date) : ""}
                                </span>
                                <select
                                  className="panel-select"
                                  value={fee.status}
                                  onChange={(e) => setFeeStatus(application, fee, e.target.value)}
                                >
                                  {FEE_STATUSES.map((f) => (
                                    <option key={f.key} value={f.key}>
                                      {f.label}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="panel-btn panel-btn-quiet"
                                  onClick={() => removeFee(application, fee)}
                                  title="Remove this fee"
                                >
                                  ✕
                                </button>
                              </li>
                            ))}
                          </ul>
                          {addingFeeFor === application.id ? (
                            <form className="panel-form" onSubmit={(e) => submitAddFee(e, application)}>
                              <input
                                type="text"
                                className="panel-input panel-form-grow"
                                placeholder="Label (e.g. Application fee)"
                                value={feeLabel}
                                autoFocus
                                onChange={(e) => setFeeLabel(e.target.value)}
                              />
                              <input
                                type="number"
                                step="0.01"
                                className="panel-input"
                                placeholder="Amount"
                                value={feeAmount}
                                onChange={(e) => setFeeAmount(e.target.value)}
                              />
                              <input
                                type="date"
                                className="panel-input"
                                value={feeDueDate}
                                onChange={(e) => setFeeDueDate(e.target.value)}
                              />
                              <button type="submit" className="panel-btn panel-btn-primary" disabled={!feeLabel.trim()}>
                                Add
                              </button>
                              <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setAddingFeeFor(null)}>
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <button type="button" className="panel-btn" onClick={() => setAddingFeeFor(application.id)}>
                              + Add fee
                            </button>
                          )}
                        </div>

                        <div className="app-detail-col">
                          <h4 className="app-detail-heading">Stage timeline</h4>
                          <div className="app-log-form">
                            <select
                              className="panel-select"
                              value={logEventType}
                              onChange={(e) => setLogEventType(e.target.value)}
                            >
                              {EVENT_TYPES.filter((t) => t.key !== "status_change").map((t) => (
                                <option key={t.key} value={t.key}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              className="panel-input panel-form-grow"
                              placeholder="What happened?"
                              value={logDescription}
                              onChange={(e) => setLogDescription(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") submitLogEvent(application);
                              }}
                            />
                            <button
                              type="button"
                              className="panel-btn panel-btn-primary"
                              disabled={!logDescription.trim() || detailLoading}
                              onClick={() => submitLogEvent(application)}
                            >
                              Log
                            </button>
                          </div>
                          {(eventsByApp[application.id] || []).length === 0 && !detailLoading && (
                            <p className="panel-hint">No history yet -- changes to Status log here automatically.</p>
                          )}
                          <ul className="app-timeline">
                            {(eventsByApp[application.id] || []).map((event) => (
                              <li key={event.id} className="app-timeline-row">
                                <span className="app-timeline-when">{formatEventWhen(event.occurred_at)}</span>
                                <span className="app-timeline-body">
                                  <span className="app-timeline-type">{eventTypeLabel(event.event_type)}</span>
                                  {" — "}
                                  {event.description}
                                  <span
                                    className={
                                      "app-source-chip" + (event.source === "openapply_sync" ? " is-synced" : "")
                                    }
                                  >
                                    {eventSourceLabel(event.source)}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
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
