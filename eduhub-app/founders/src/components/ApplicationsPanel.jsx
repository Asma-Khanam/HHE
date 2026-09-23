import { useEffect, useRef, useState } from "react";
import {
  createApplication,
  updateApplication,
  createSchool,
  listShortlistForFamily,
  listApplicationEvents,
  createApplicationEvent,
  listApplicationFees,
  listChecklistItems,
  updateSchool,
} from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import {
  APPLICATION_STATUSES,
  APPLICATION_TRACK_STEPS,
  REJECTION_REASONS,
  daysInStage,
  eventTypeLabel,
  eventSourceLabel,
  trackStepIndex,
  currentStageTone,
  autoNeedsAttentionNote,
} from "../lib/workflow";
import CopyButton from "./CopyButton";
import ApplicationStageTrack from "./ApplicationStageTrack";
import "./panels.css";
import AutosaveField from "./Autosave";
import "./ApplicationsPanel.css";

const TOUR_STATUS_LABEL = { offered: "booked", confirmed: "booked", completed: "toured", cancelled: "cancelled" };

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

function refNumber(ref) {
  const m = String(ref || "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

// What the OpenApply sync pulled for this application: the school's own
// checklist (done / still missing) and its invoices. Read-only -- the
// school's portal is the source of truth, the sync refreshes it.
function OpenApplySynced({ application, items, fees }) {
  const synced = application.openapply_last_synced_at;
  if (!items.length && !fees.length && !synced) return null;
  const sorted = [...items].sort((a, b) => refNumber(a.external_ref) - refNumber(b.external_ref));
  const done = sorted.filter((i) => i.status === "done").length;
  const syncedFees = fees.filter((f) => f.source === "openapply_sync");
  return (
    <div className="ap-oa">
      <div className="ap-oa-head">
        <span className="ap-oa-title">From OpenApply</span>
        {synced && (
          <span className="ap-oa-when">
            Last synced{" "}
            {new Date(synced).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      <div className="ap-oa-grid">
        <div className="ap-oa-box">
          <div className="ap-oa-box-title">
            Checklist {sorted.length > 0 && <span className="ap-oa-count">{done}/{sorted.length} done</span>}
          </div>
          {sorted.length === 0 ? (
            <p className="ap-oa-empty">Nothing synced yet.</p>
          ) : (
            <ul className="ap-oa-list">
              {sorted.map((i) => (
                <li key={i.id} className={"ap-oa-row" + (i.status === "done" ? " is-done" : " is-missing")}>
                  <span className="ap-oa-ic">{i.status === "done" ? "✓" : "○"}</span>
                  <span className="ap-oa-label">{i.title}</span>
                  <span className="ap-oa-status">
                    {i.status === "done" ? (i.completed_at ? formatShortDate(i.completed_at) : "Done") : "Missing"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="ap-oa-box">
          <div className="ap-oa-box-title">Fees</div>
          {syncedFees.length === 0 ? (
            <p className="ap-oa-empty">No invoices on OpenApply.</p>
          ) : (
            <ul className="ap-oa-list">
              {syncedFees.map((f) => (
                <li key={f.id} className={"ap-oa-row" + (f.status === "paid" ? " is-done" : " is-missing")}>
                  <span className="ap-oa-ic">{f.status === "paid" ? "✓" : "○"}</span>
                  <span className="ap-oa-label">
                    {f.label}
                    {f.amount != null ? ` · ${f.currency || "AED"} ${Number(f.amount).toLocaleString()}` : ""}
                  </span>
                  <span className="ap-oa-status">
                    {f.status === "paid" ? "Paid" : f.due_date ? `Due ${formatShortDate(f.due_date)}` : "Unpaid"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
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
  // OpenApply sync data (checklist items + invoices), per application.
  const [checklistByApp, setChecklistByApp] = useState({});
  const [feesByApp, setFeesByApp] = useState({});
  // Which stage panel is open per application (September 2026 redesign) --
  // defaults to wherever the application actually is; a consultant can
  // click back/forward on the track to preview another stage without that
  // changing the real status.
  const [openStepByApp, setOpenStepByApp] = useState({});
  // Card collapse/expand (September 2026 redesign) -- collapsed by default,
  // so a family with several schools shows a scannable stack instead of
  // every application's full timeline open at once. Explicit true/false
  // overrides the default; unset falls back to "expanded if this is the
  // school just linked in from" (see the highlight effect below).
  const [expandedByApp, setExpandedByApp] = useState({});

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
    const group = (rows) => {
      const map = {};
      (rows || []).forEach((r) => {
        (map[r.application_id] = map[r.application_id] || []).push(r);
      });
      return map;
    };
    listChecklistItems(ids)
      .then((rows) => !cancelled && setChecklistByApp(group(rows)))
      .catch(() => {});
    listApplicationFees(ids)
      .then((rows) => !cancelled && setFeesByApp(group(rows)))
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

  // A card is expanded if the consultant explicitly opened/closed it, or
  // -- with no explicit choice yet -- if it's the one just linked in from
  // the school's own page (the highlight effect above sets highlightActive
  // for a couple of seconds after landing here).
  function isExpanded(application) {
    const explicit = expandedByApp[application.id];
    if (explicit !== undefined) return explicit;
    return highlightActive && String(highlightSchoolId) === String(application.school_id);
  }
  function toggleExpanded(application) {
    setExpandedByApp((m) => ({ ...m, [application.id]: !isExpanded(application) }));
  }

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
                  const days = daysInStage(application, eventsByApp[application.id]);
                  const attentionTone = currentStageTone(application, days);
                  const tours = tourBySchool[application.school_id] || [];
                  const isHighlighted =
                    highlightActive && String(highlightSchoolId) === String(application.school_id);
                  const reasonField = reasonFieldFor(application.status);
                  const isWithdrawn = application.status === "withdrawn";
                  const currentStep = trackStepIndex(application.status);
                  const openStep = openStepByApp[application.id] ?? currentStep;
                  const stepMeta = APPLICATION_TRACK_STEPS[openStep];
                  const school = schools.find((sc) => sc.id === application.school_id);
                  const withdrawReasonField = "withdrawn_reason";
                  const expanded = isExpanded(application);
                  const stageLabel = APPLICATION_STATUSES.find((s) => s.key === application.status)?.label || application.status;
                  const hint = isWithdrawn
                    ? "Withdrawn"
                    : attentionTone === "declined"
                      ? application.rejected_reason || "Declined"
                      : attentionTone === "attention"
                        ? `Needs attention${days !== null ? ` — ${days}d at this stage` : ""}`
                        : days !== null
                          ? days === 0
                            ? "On track — since today"
                            : `On track — ${days}d at this stage`
                          : "On track";
                  return (
                    <li
                      key={application.id}
                      id={`app-row-school-${application.school_id}`}
                      className={
                        "ap-card2" +
                        (isWithdrawn ? " is-withdrawn" : "") +
                        (isHighlighted ? " is-highlight" : "") +
                        (expanded ? " is-expanded" : " is-collapsed")
                      }
                    >
                      <button
                        type="button"
                        className="ap-card2-head"
                        onClick={() => toggleExpanded(application)}
                        aria-expanded={expanded}
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

                        {!isWithdrawn && (
                          <div className="ap-card2-status">
                            <span className={"ap-pill ap-tone-" + attentionTone}>{stageLabel}</span>
                            <span className={"ap-hint ap-tone-" + attentionTone}>{hint}</span>
                          </div>
                        )}

                        <span className={"ap-chevron" + (expanded ? " is-open" : "")} aria-hidden="true">
                          ▾
                        </span>
                      </button>

                      {expanded && (
                        <div className="ap-card2-body">
                          <div className="ap-card2-row">
                            <label className="ap-field ap-field-date ap-card2-visit">
                              <span className="ap-label">Visit date</span>
                              <input
                                type="date"
                                className="panel-input"
                                value={application.visit_date || ""}
                                onChange={(e) => patch(child.id, application, { visit_date: e.target.value || null })}
                                title="Also shows on the shared calendar"
                              />
                            </label>
                            {!isWithdrawn && (
                              <button
                                type="button"
                                className="ap-withdraw-link"
                                onClick={() => changeStatus(child.id, application, "withdrawn")}
                              >
                                Withdraw
                              </button>
                            )}
                          </div>

                          {isWithdrawn ? (
                            <div className="ap-withdrawn-summary">
                              <span className="ap-withdrawn-badge">Withdrawn</span>
                              <AutosaveField
                                collapsible
                                label="Reason for withdrawing"
                                placeholder="Why was it withdrawn?"
                                value={application[withdrawReasonField]}
                                onSave={async (v) => {
                                  const ok = await patch(child.id, application, { [withdrawReasonField]: v });
                                  if (!ok) throw new Error("check the message above, then Retry");
                                }}
                              />
                              <button
                                type="button"
                                className="ap-withdraw-undo"
                                onClick={() => changeStatus(child.id, application, "draft")}
                              >
                                Undo — reopen this application
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="ap-vtrack-wrap">
                                <ApplicationStageTrack
                                  status={application.status}
                                  openIndex={openStep}
                                  currentTone={attentionTone}
                                  onSelect={(i) => setOpenStepByApp((m) => ({ ...m, [application.id]: i }))}
                                />

                                <div className={"ap-stagepanel ap-tone-" + (openStep === currentStep ? attentionTone : "neutral")}>
                                  <div className="ap-stagepanel-head">
                                    <span className="ap-stagepanel-title">{stepMeta.label}</span>
                                    {openStep !== currentStep && (
                                      <span className="ap-stagepanel-flag">
                                        {openStep < currentStep ? "Already passed" : "Not reached yet"}
                                      </span>
                                    )}
                                    {openStep === currentStep && days !== null && (
                                      <span className="ap-days">
                                        {days === 0 ? "Since today" : `${days} day${days === 1 ? "" : "s"} at this stage`}
                                      </span>
                                    )}
                                  </div>

                                  {openStep === currentStep && stepMeta.key !== "decision" && (
                                    <label className="ap-attention-toggle">
                                      <input
                                        type="checkbox"
                                        checked={!!application.needs_attention}
                                        onChange={(e) => patch(child.id, application, { needs_attention: e.target.checked })}
                                      />
                                      Flag as needing attention
                                      {autoNeedsAttentionNote(application, days) && (
                                        <span className="ap-attention-auto">
                                          {application.needs_attention ? "" : `— auto-flagged: ${autoNeedsAttentionNote(application, days)}`}
                                        </span>
                                      )}
                                    </label>
                                  )}

                                  {stepMeta.key === "not_submitted" && (
                                    <div className="ap-stagepanel-body">
                                      {/* Founder feedback (Sept 2026): this used to show the same
                                          "nothing to submit yet" line even once the application had
                                          actually moved on -- confusing since there's no button here
                                          to act on once it's passed. Now it says what actually
                                          happened, same as every other passed stage. */}
                                      <p className="ap-stagepanel-hint">
                                        {openStep === currentStep
                                          ? "Nothing to submit yet — once the application goes in, mark it submitted below."
                                          : "Submitted."}
                                      </p>
                                      {openStep === currentStep && (
                                        <button
                                          type="button"
                                          className="panel-btn panel-btn-primary"
                                          onClick={() => changeStatus(child.id, application, "submitted")}
                                        >
                                          Mark as submitted
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {stepMeta.key === "submitted" && (
                                    <div className="ap-stagepanel-body">
                                      <label className="ap-field">
                                        <span className="ap-label">Date submitted</span>
                                        <input
                                          type="date"
                                          className="panel-input"
                                          value={application.submitted_at ? String(application.submitted_at).slice(0, 10) : ""}
                                          onChange={(e) => patch(child.id, application, { submitted_at: e.target.value || null })}
                                        />
                                      </label>
                                      {openStep === currentStep && (
                                        <button
                                          type="button"
                                          className="panel-btn panel-btn-primary"
                                          onClick={() => changeStatus(child.id, application, "assessment_booked")}
                                        >
                                          Mark assessment booked
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {stepMeta.key === "assessment" && (
                                    <div className="ap-stagepanel-body">
                                      <div className="ap-stagepanel-grid">
                                        <label className="ap-field">
                                          <span className="ap-label">Assessment date</span>
                                          <input
                                            type="date"
                                            className="panel-input"
                                            value={application.assessment_date || ""}
                                            onChange={(e) => patch(child.id, application, { assessment_date: e.target.value || null })}
                                          />
                                        </label>
                                        <div>
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
                                      </div>
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
                                      {openStep === currentStep && (
                                        <button
                                          type="button"
                                          className="panel-btn panel-btn-primary"
                                          onClick={() => changeStatus(child.id, application, "under_review")}
                                        >
                                          Mark awaiting decision
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {stepMeta.key === "awaiting_decision" && (
                                    <div className="ap-stagepanel-body">
                                      <p className="ap-stagepanel-hint">
                                        {application.status === "waitlisted"
                                          ? "Waitlisted — no offer or decline yet."
                                          : "Submitted and assessed — waiting on the school's decision."}
                                      </p>
                                      {openStep === currentStep && (
                                        <div className="ap-stagepanel-actions">
                                          <button
                                            type="button"
                                            className="panel-btn"
                                            onClick={() => changeStatus(child.id, application, "waitlisted")}
                                            disabled={application.status === "waitlisted"}
                                          >
                                            Waitlisted
                                          </button>
                                          <button
                                            type="button"
                                            className="panel-btn panel-btn-primary"
                                            onClick={() => changeStatus(child.id, application, "offer")}
                                          >
                                            Offer received
                                          </button>
                                          <button
                                            type="button"
                                            className="panel-btn panel-btn-danger"
                                            onClick={() => changeStatus(child.id, application, "rejected")}
                                          >
                                            Declined
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {stepMeta.key === "decision" && (
                                    <div className="ap-stagepanel-body">
                                      {(application.status === "offer" || application.status === "offer_accepted") && (
                                        <>
                                          <label className="ap-field">
                                            <span className="ap-label">Decision needed by</span>
                                            <input
                                              type="date"
                                              className="panel-input"
                                              value={application.offer_decision_by || ""}
                                              onChange={(e) => patch(child.id, application, { offer_decision_by: e.target.value || null })}
                                            />
                                          </label>
                                          {application.status === "offer" ? (
                                            <button
                                              type="button"
                                              className="panel-btn panel-btn-primary"
                                              onClick={() => changeStatus(child.id, application, "offer_accepted")}
                                            >
                                              Mark offer accepted
                                            </button>
                                          ) : (
                                            <span className="ap-stagepanel-hint">Offer accepted.</span>
                                          )}
                                        </>
                                      )}
                                      {application.status === "rejected" && (
                                        <>
                                          <AutosaveField
                                            collapsible
                                            label="Reason for declining"
                                            placeholder="Why? (no space, fees, etc.)"
                                            value={application[reasonField]}
                                            onSave={async (v) => {
                                              const ok = await patch(child.id, application, { [reasonField]: v });
                                              if (!ok) throw new Error("check the message above, then Retry");
                                            }}
                                          />
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
                                        </>
                                      )}
                                      {openStep === currentStep &&
                                        application.status !== "offer_accepted" &&
                                        application.status !== "rejected" &&
                                        application.status !== "offer" && (
                                          <p className="ap-stagepanel-hint">Pick Offer received or Declined from the previous stage.</p>
                                        )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <OpenApplySynced
                                application={application}
                                items={checklistByApp[application.id] || []}
                                fees={feesByApp[application.id] || []}
                              />

                              <AutosaveField
                                collapsible
                                multiline
                                rows={3}
                                label="Notes on this application"
                                placeholder="Anything the team should know about this application"
                                value={application.notes}
                                onSave={async (v) => {
                                  const ok = await patch(child.id, application, { notes: v });
                                  if (!ok) throw new Error("check the message above, then Retry");
                                }}
                              />

                              <details className="ap-details" open={false}>
                                <summary>Portal login &amp; activity log</summary>
                                <PortalAndLog
                                  application={application}
                                  school={school}
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
                            </>
                          )}
                        </div>
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
