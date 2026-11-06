import { useEffect, useRef, useState } from "react";
import {
  createApplication,
  updateApplication,
  deleteApplication,
  createCaseNote,
  createSchool,
  listApplicationEvents,
  createApplicationEvent,
  listApplicationFees,
  listChecklistItems,
  updateSchool,
  listPlacements,
  listSearchRounds,
  createPlacement,
  updatePlacementDate,
  listReplySuggestions,
  trimReplySuggestion,
  resolveReplySuggestion,
} from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import {
  APPLICATION_STATUSES,
  REJECTION_REASONS,
  daysInStage,
  eventTypeLabel,
  eventSourceLabel,
  currentStageTone,
} from "../lib/workflow";
import CopyButton from "./CopyButton";
import ApplicationProcess, { applicationMiniSteps } from "./ApplicationProcess";
import { KidTag, WhoTag } from "./SchoolVisitsParts";
import UpdateFamilyButton from "./UpdateFamilyButton";
import "./panels.css";
import AutosaveField from "./Autosave";
import { placedByChild, closedForChild, shortDate, roundInfoByChild, inCurrentRound } from "../lib/placement";
import { parseMeetingInvite, looksLikeInvite } from "../lib/meetingLink";
import "./ApplicationsPanel.css";
import AssessmentGuide from "./AssessmentGuide";
import "./SchoolVisits.css";
import "./ApplicationsRebuild.css";


function formatShortDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const ALIAS_DOMAIN = "applications.heatherharries.com";

// A small note box that lives on the row itself: saves when you click away.
function NoteCell({ value, onSave }) {
  const [text, setText] = useState(value || "");
  const [state, setState] = useState("");
  async function commit() {
    const clean = text.trim();
    if (clean === (value || "").trim()) return;
    setState("Saving…");
    const ok = await onSave(clean);
    setState(ok === false ? "Not saved" : "Saved");
    setTimeout(() => setState(""), 1500);
  }
  return (
    <>
      <textarea
        className="ap2-note-in"
        rows={2}
        value={text}
        placeholder="Add a note or feedback"
        aria-label="Notes and feedback"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
      {state && <span className="ap2-note-state">{state}</span>}
    </>
  );
}

// Portal login + activity log for one application, shown when a consultant
// opens the application. Login details are the parent's application alias
// and password (the same ones shown on the Application email panel); nothing
// here is deletable -- log entries are only ever added.
function PortalAndLog({ application, school, parents, events, onEventAdded, onPortalUrlSaved, staffNames = {}, part }) {
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
      {(!part || part === "login") && (
      <div className="ap-portal-box">
        {!part && <div className="ap-portal-title">Portal login</div>}
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
      )}

      {(!part || part === "log") && (
      <div className="ap-portal-box">
        {!part && <div className="ap-portal-title">Activity log</div>}
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
                  <span className="ap-log-src">
                    {" · "}
                    {ev.source === "openapply_sync"
                      ? eventSourceLabel(ev.source)
                      : staffNames[ev.created_by]
                      ? `by ${staffNames[ev.created_by]}`
                      : "by a former team member"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
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
function OpenApplySynced({ application, items, fees, isOpenApply }) {
  const synced = application.openapply_last_synced_at;
  // Set by the sync when it couldn't read this application (addendum 92).
  const syncProblem =
    application.openapply_sync_status && application.openapply_sync_status !== "ok" ? application.openapply_sync_note : null;
  if (!items.length && !fees.length && !synced && !syncProblem) {
    // An OpenApply school with nothing pulled in yet: say when it will be.
    if (!isOpenApply) return null;
    return (
      <div className="ap-oa ap-oa-empty-card">
        <div className="ap-oa-head">
          <span className="ap-oa-title">From OpenApply</span>
          <span className="ap-oa-when">Checked automatically every other day</span>
        </div>
        <p className="ap-oa-empty">
          Nothing pulled in yet. It needs the family&apos;s application email and password (Application email, below) and the
          school&apos;s portal link (Portal login, below).
        </p>
      </div>
    );
  }
  const sorted = [...items].sort((a, b) => refNumber(a.external_ref) - refNumber(b.external_ref));
  if (!items.length && !fees.length && syncProblem) {
    return (
      <div className="ap-oa ap-oa-problem-card">
        <div className="ap-oa-head">
          <span className="ap-oa-title">From OpenApply</span>
          <span className="ap-oa-when">Last tried {new Date(synced).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <p className="ap-oa-problem">{syncProblem}</p>
      </div>
    );
  }
  const done = sorted.filter((i) => i.status === "done").length;
  const syncedFees = fees.filter((f) => f.source === "openapply_sync");
  return (
    <div className="ap-oa">
      <div className="ap-oa-head">
        <span className="ap-oa-title">From OpenApply</span>
        {synced && (
          <span className="ap-oa-when">
            Checked every other day · last{" "}
            {new Date(synced).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      {syncProblem && <p className="ap-oa-problem">Last check had a problem: {syncProblem}</p>}
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
// A school that falls away is set to Withdrawn (with a reason) or Declined, so
// the record stays. Delete is only for a school added by mistake, e.g. to the
// wrong child, and is refused once money or an accepted offer is attached.
export default function ApplicationsPanel({
  familyId,
  familyName,
  familyChildren,
  applicationsByChild,
  onApplicationsChange,
  schoolCatalog,
  highlightSchoolId,
  parents = [],
  onProgressChange,
  onGoToVisits,
  staff = [],
}) {
  // Who did what, for the activity log (founders: many consultants).
  const staffNames = Object.fromEntries((staff || []).map((s) => [s.user_id, s.full_name || s.email]));
  const [apps, setApps] = useState(applicationsByChild || {});
  const [tab, setTab] = useState("overview");
  const [addOpen, setAddOpen] = useState(false);
  const [addChild, setAddChild] = useState("");
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
  // Status-change history, only used for the "days at this stage" figure.
  const [eventsByApp, setEventsByApp] = useState({});
  // OpenApply sync data (checklist items + invoices), per application.
  const [checklistByApp, setChecklistByApp] = useState({});
  const [feesByApp, setFeesByApp] = useState({});
  // "Accepted on" / "Placed?" / "Start date" cards on the Decision stage --
  // reuses the same family_placements rows the Overview's Placement panel
  // shows, matched to this application by child + school name.
  const [placements, setPlacements] = useState([]);
  const [rounds, setRounds] = useState([]);
  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    listSearchRounds(familyId).then((rows) => !cancelled && setRounds(rows || []));
    listPlacements(familyId)
      .then((rows) => !cancelled && setPlacements(rows || []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [familyId]);
  function placementFor(childId, schoolName) {
    return placements.find((p) => p.child_id === childId && p.school_name === schoolName);
  }
  async function savePlacementDate(child, childIndex, schoolName, value) {
    if (!value) return;
    const existing = placementFor(child.id, schoolName);
    try {
      if (existing) {
        const updated = await updatePlacementDate(existing, value);
        setPlacements((list) => list.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const row = await createPlacement({
          familyId,
          childId: child.id,
          childName: displayNameForChild(child, childIndex),
          schoolName,
          startDate: value,
        });
        setPlacements((list) => [...list, row]);
      }
      onProgressChange?.();
    } catch (err) {
      setError(err.message || "Couldn't save the start date.");
    }
  }
  // Card collapse/expand (September 2026 redesign) -- collapsed by default,
  // so a family with several schools shows a scannable stack instead of
  // every application's full timeline open at once. Explicit true/false
  // overrides the default; unset falls back to "expanded if this is the
  // school just linked in from" (see the highlight effect below).
  const [expandedByApp, setExpandedByApp] = useState({});


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
  // Read the current applications without making the effect below re-run on
  // every edit. It used to depend on `apps`, so any change to any school
  // re-opened and scrolled back to the school the page was linked in from.
  const appsRef = useRef(apps);
  appsRef.current = apps;
  useEffect(() => {
    if (!highlightSchoolId) return;
    // Arriving from a school visit: open that school's application(s) and keep them open.
    setExpandedByApp((m) => {
      const next = { ...m };
      Object.values(appsRef.current)
        .flat()
        .filter((a) => String(a.school_id) === String(highlightSchoolId))
        .forEach((a) => {
          // Only the first time: never override a card the consultant has closed since.
          if (next[a.id] === undefined) next[a.id] = true;
        });
      return next;
    });
    const owner = Object.entries(appsRef.current).find(([, list]) => list.some((a) => String(a.school_id) === String(highlightSchoolId)));
    if (owner) setTab(owner[0]);
    // Land exactly on the assessment dates to choose from if there are any, else on the school's row.
    const target = () =>
      document.querySelector(`[id^="assess-dates-"].is-flash`) || document.getElementById(`app-row-school-${highlightSchoolId}`);
    const scroll = () => target()?.scrollIntoView({ behavior: "smooth", block: "center" });
    scroll();
    const again = setTimeout(scroll, 500); // the card opens a moment after this runs
    setHighlightActive(true);
    const timer = setTimeout(() => setHighlightActive(false), 2500);
    return () => {
      clearTimeout(timer);
      clearTimeout(again);
    };
  }, [highlightSchoolId]);

  const [schoolId, setSchoolId] = useState("");
  const [newSchoolName, setNewSchoolName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Deleting an application (as opposed to withdrawing it) removes it entirely:
  // used when a school was added to the wrong child. The database refuses it
  // once money or an accepted offer is attached (addendum 113).
  const [confirmDelete, setConfirmDelete] = useState(null); // { child, application, name }
  const [deleting, setDeleting] = useState(false);

  async function removeApplication() {
    if (!confirmDelete) return;
    const { child, application, name } = confirmDelete;
    setDeleting(true);
    setError("");
    try {
      await deleteApplication(application.id);
      setApps((map) => ({ ...map, [child.id]: (map[child.id] || []).filter((a) => a.id !== application.id) }));
      setConfirmDelete(null);
      onProgressChange?.();
      // The application's own timeline goes with it, so leave one line on the family's case notes.
      createCaseNote({
        familyId,
        childId: child.id,
        schoolId: application.school_id,
        kind: "school",
        body: `Deleted the ${application.schoolName} application for ${name}. It was removed completely, not withdrawn.`,
      }).catch(() => {});
    } catch (err) {
      setConfirmDelete(null);
      setError(err?.message || "Couldn't delete that application.");
    } finally {
      setDeleting(false);
    }
  }

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
  async function changeStatus(childId, application, nextStatus, extra = {}) {
    patch(childId, application, { status: nextStatus, ...extra }).then((ok) => ok && onProgressChange?.());
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

  // Assessment dates the school sent by email, waiting for a consultant (read from the same
  // school replies the School visits tab uses; that tab takes availability and tour times).
  const [replySugs, setReplySugs] = useState([]);
  useEffect(() => {
    let alive = true;
    listReplySuggestions(familyId)
      .then((l) => alive && setReplySugs((l || []).filter((x) => (x.assessment_dates || []).length)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [familyId]);

  const dayText = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const clock = (t) => {
    if (!t) return "";
    const [h, m] = String(t).split(":");
    const hh = Number(h);
    return `${hh % 12 || 12}:${m} ${hh >= 12 ? "PM" : "AM"}`;
  };
  const childForDate = (d) =>
    familyChildren.find((c) => c.id === d.child_id) ||
    familyChildren.find((c) => [c.preferred_name, c.first_name].filter(Boolean).some((n) => String(d.child_name || "").toLowerCase().includes(String(n).toLowerCase()))) ||
    (familyChildren.length === 1 ? familyChildren[0] : null);

  async function finishAssessmentPart(sug, remaining, status) {
    if ((sug.availability || []).length || (sug.tour_slots || []).length || remaining.length) {
      const updated = await trimReplySuggestion(sug.id, { assessment_dates: remaining });
      setReplySugs((l) => (remaining.length ? l.map((x) => (x.id === sug.id ? { ...x, ...updated } : x)) : l.filter((x) => x.id !== sug.id)));
    } else {
      await resolveReplySuggestion(sug.id, status);
      setReplySugs((l) => l.filter((x) => x.id !== sug.id));
    }
  }

  // The same date is often in several emails from the school: show each one once.
  const sugsForSchool = (application) => replySugs.filter((sug) => String(sug.school_id) === String(application.school_id));
  const pendingDates = (child, application) => {
    const seen = new Set();
    const out = [];
    sugsForSchool(application).forEach((sug) =>
      (sug.assessment_dates || []).forEach((d) => {
        if (childForDate(d)?.id !== child.id) return;
        const key = [d.date, d.time || "", d.how || ""].join("|");
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ key, d });
      })
    );
    return out.sort((x, y) => String(x.d.date).localeCompare(String(y.d.date)));
  };

  // Take the child's dates off every email at this school (chosen or dismissed).
  async function clearChildDates(child, application, status) {
    for (const sug of sugsForSchool(application)) {
      const remaining = (sug.assessment_dates || []).filter((x) => childForDate(x)?.id !== child.id);
      if (remaining.length !== (sug.assessment_dates || []).length) await finishAssessmentPart(sug, remaining, status);
    }
  }

  // "Use this date": fills the application's own assessment fields, exactly as typing it in would.
  async function useAssessmentDate(child, application, d) {
    const fields = {
      assessment_date: d.date,
      assessment_time: d.time || null,
      assessment_in_person: d.how === "at the school" || d.how === "in person",
      assessment_video_requested: d.how === "video",
    };
    if (application.status === "submitted") await changeStatus(child.id, application, "assessment_booked", fields);
    else if (!(await patch(child.id, application, fields))) return;
    logEvent(application, `Assessment date set to ${dayText(d.date)}${d.time ? ", " + clock(d.time) : ""} (from the school's email)`, "assessment_booked");
    await clearChildDates(child, application, "accepted").catch((err) => setError(err.message || "Couldn't update that suggestion."));
  }

  async function dismissAssessmentDates(child, application) {
    try {
      await clearChildDates(child, application, "dismissed");
    } catch (err) {
      setError(err.message || "Couldn't dismiss that.");
    }
  }

  // Shown at the top of the school's own application card, so it is obvious which school and child it is for.
  function assessmentSuggestionsFor(child, application, name) {
    const list = pendingDates(child, application);
    if (!list.length) return null;
    const highlighted = highlightActive && String(highlightSchoolId) === String(application.school_id);
    return (
      <div className={"sv-new ag-sug" + (highlighted ? " is-flash" : "")} id={`assess-dates-${application.id}`}>
        <div className="sv-new-head">
          <b>
            {application.schoolName} sent assessment dates for {name}
          </b>
          <span className="sv-sub">Read from their email. Pick the one that was agreed. Nothing changes until you do.</span>
        </div>
        <ul className="sv-new-list">
          {list.map(({ key, d }) => (
            <li key={key}>
              {dayText(d.date)}
              {d.time ? `, ${clock(d.time)}` : ""}
              {d.how && d.how !== "unknown" ? `, ${d.how}` : ""}{" "}
              <button type="button" className="sv-btn is-sm" onClick={() => useAssessmentDate(child, application, d)}>
                Use this date
              </button>
            </li>
          ))}
        </ul>
        <div className="sv-pills">
          <button type="button" className="sv-btn is-sm" onClick={() => dismissAssessmentDates(child, application)}>
            None of these, dismiss
          </button>
        </div>
      </div>
    );
  }

  // Dates for a school this child has no application with: they can't go on a card, so say so.
  function renderAssessmentSuggestions() {
    const homeless = replySugs.filter((sug) =>
      (sug.assessment_dates || []).some((d) => {
        const child = childForDate(d);
        return (!activeChild || child?.id === activeChild.id) && !(child && (apps[child.id] || []).some((a) => String(a.school_id) === String(sug.school_id)));
      })
    );
    return homeless.map((sug) => {
      const school = schools.find((x) => String(x.id) === String(sug.school_id))?.name;
      return (
        <div className="sv-new" key={sug.id}>
          <div className="sv-new-head">
            <b>{school ? `${school} sent assessment dates` : "A school sent assessment dates"}</b>
            <span className="sv-sub">There is no application for this child at that school yet. Add it, and the dates will appear on it.</span>
          </div>
          <div className="sv-pills">
            <button type="button" className="sv-btn is-sm" onClick={() => finishAssessmentPart(sug, [], "dismissed")}>
              Dismiss
            </button>
          </div>
        </div>
      );
    });
  }

  // One line in the activity log, stamped with the signed-in consultant.
  async function logEvent(application, description, eventType = "note") {
    try {
      const ev = await createApplicationEvent({ applicationId: application.id, eventType, description });
      setEventsByApp((m) => ({ ...m, [application.id]: [ev, ...(m[application.id] || [])] }));
    } catch {
      // The change itself saved; a missing log line isn't worth an error.
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
      // Adding a school for a child who's already placed elsewhere is the
      // explicit signal that this one should stay open (a second school
      // through us, e.g. the family isn't happy at the placement) -- the
      // placement and every other closed school for this child are untouched.
      const created = await createApplication({
        childId: child.id,
        schoolId: targetSchoolId,
        status: "draft",
        keepOpen: !!placed[child.id],
      });
      const schoolName = schools.find((s) => s.id === targetSchoolId)?.name || typedName;
      setApps((map) => ({ ...map, [child.id]: [...(map[child.id] || []), { ...created, schoolName }] }));
      resetForm();
      setAddOpen(false);
    } catch (err) {
      setError(err.message || "Couldn't add that application.");
    } finally {
      setBusy(false);
    }
  }

  // Founders (25 Sept 2026): once a child is placed, their other schools
  // close -- dark grey, at the bottom, view-only. Worked out, never saved,
  // so undoing the placement reopens them.
  const placed = placedByChild({ children: familyChildren, applicationsByChild: apps, placements, schools, rounds });
  const roundInfo = roundInfoByChild(rounds);

  // Paste a whole Teams / Zoom invite into the link box and the meeting ID
  // and passcode fill themselves in.
  async function saveMeetingLink(childId, application, value) {
    const text = (value || "").trim();
    if (text && looksLikeInvite(text)) {
      const parsed = parseMeetingInvite(text);
      const changes = { assessment_link: parsed.link || text };
      if (parsed.meetingId) changes.assessment_meeting_id = parsed.meetingId;
      if (parsed.passcode) changes.assessment_passcode = parsed.passcode;
      return patch(childId, application, changes);
    }
    return patch(childId, application, { assessment_link: text || null });
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

  /* ---------- new layout (29 Oct 2026) ---------- */

  const childIdx = (childId) => familyChildren.findIndex((c) => c.id === childId);
  const activeTab = tab !== "overview" && familyChildren.some((c) => c.id === tab) ? tab : "overview";
  const activeChild = familyChildren.find((c) => c.id === activeTab) || null;

  // Everything the rows and the open card need to know about one application.
  function infoFor(child, application) {
    const i = childIdx(child.id);
    const name = displayNameForChild(child, i);
    const childPlaced = placed[child.id];
    const days = daysInStage(application, eventsByApp[application.id]);
    const attentionTone = currentStageTone(application, days);
    const isWithdrawn = application.status === "withdrawn";
    const isDeclined = application.status === "rejected";
    const placedElsewhere = !isWithdrawn && closedForChild(placed, child.id, application.school_id, application.schoolName, application.keep_open);
    const isPlacedHere = childPlaced && !placedElsewhere && !isWithdrawn && application.status === "offer_accepted";
    const school = schools.find((sc) => sc.id === application.school_id);
    const schoolName = school?.name || application.schoolName;
    const start = placementFor(child.id, schoolName)?.start_date;
    const fees = feesByApp[application.id] || [];
    const hint = placedElsewhere
      ? `Closed · ${name} placed at ${childPlaced.schoolName}`
      : isDeclined
      ? `Closed · declined${application.rejected_reason ? `: ${application.rejected_reason}` : ""}`
      : isWithdrawn
      ? `Withdrawn${application.withdrawn_reason ? `: ${application.withdrawn_reason}` : ""}`
      : isPlacedHere
      ? start
        ? `🎓 Placed · starts ${shortDate(start)}`
        : "🎓 Placed · add the first day"
      : application.status === "waitlisted"
      ? "Waitlisted"
      : attentionTone === "attention"
      ? `Needs attention · ${days ?? "?"} days at this step`
      : days !== null
      ? days === 0
        ? "Moved today"
        : `${days} day${days === 1 ? "" : "s"} at this step`
      : "";
    return {
      i, name, childPlaced, days, attentionTone, isWithdrawn, isDeclined, placedElsewhere, isPlacedHere, school, schoolName,
      start, fees, hint, closedCard: placedElsewhere || isDeclined || isWithdrawn,
      portalUrl: school?.openapply_login_url || school?.application_url || "",
      events: eventsByApp[application.id] || [],
    };
  }

  // The one thing to do next on a live application, and how urgent it is.
  function nextStepFor(application, info) {
    const a = application;
    const openFees = info.fees.filter((f) => f.status !== "paid" && f.status !== "waived" && !f.paid_direct_by_family);
    const unpaid = openFees.length > 0;
    // If HHE has already paid the school, the next step is to get the money back
    // from the family (invoice them), not to pay the school again.
    const weStillOwe = openFees.some((f) => !f.hhe_paid_school_on_behalf);
    const notInvoiced = openFees.some((f) => f.hhe_paid_school_on_behalf && !f.sent_to_family_at);
    if (isHeld(a)) return ["Held: confirm once the family decides", "a", "family"];
    const child = familyChildren.find((c) => c.id === a.child_id);
    if (child && !a.assessment_date && ["submitted", "assessment_booked"].includes(a.status) && pendingDates(child, a).length) {
      return ["Choose the assessment date the school emailed", "a", "us"];
    }
    switch (a.status) {
      case "draft":
        return ["Submit the application", "a", "us"];
      case "submitted":
      case "assessment_booked": {
        if (unpaid) {
          if (weStillOwe) return ["Pay the application fee", "a", "us"];
          return notInvoiced ? ["Invoice the family", "a", "us"] : ["Waiting for the family to pay HHE", "", "family"];
        }
        if (!a.assessment_date && !a.assessment_in_person && !a.assessment_video_requested) return ["Add assessment details", "a", "us"];
        if (a.assessment_date) {
          const online = !a.assessment_in_person && !a.assessment_video_requested;
          if (online && !a.assessment_link) return ["Add the join link", "a", "us"];
          return [`Assessment ${shortDate(a.assessment_date)}`, ""];
        }
        return ["Assessment details from the school", "", "school"];
      }
      case "under_review":
        return ["Decision from the school", "", "school"];
      case "waitlisted":
        return ["On the waitlist", "", "school"];
      case "offer": {
        if (!a.offer_decision_by) return ["Offer: add the reply-by date", "a", "us"];
        const late = a.offer_decision_by < new Date().toLocaleDateString("en-CA");
        return [`${late ? "Reply was due" : "Answer by"} ${shortDate(a.offer_decision_by)}`, "a", "family"];
      }
      case "offer_accepted":
        return info.start ? [`Starts ${shortDate(info.start)}`, "g"] : ["Add the first day", "a", "us"];
      default:
        return ["–", ""];
    }
  }

  // The start term the family chose, from the child's own record
  // ("Term 1 (September start), 2027/2028"). Flexible is left out.
  function entryLabel(child) {
    const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
    const terms = list(child.terms).filter((x) => !/flexible/i.test(x));
    const years = list(child.academic_years_of_entry).sort();
    return [terms.join(" or "), years.join(" or ")].filter(Boolean).join(", ");
  }

  const isHeld = (a) => a.status === "offer_accepted" && !!a.placement_hold;

  function chevrons(application, info) {
    const flow = applicationMiniSteps(application, info.fees);
    return (
      <div className={"ap2-where" + (info.isPlacedHere ? " is-placed" : "")}>
        <div className="ap2-cm" role="img" aria-label={flow.map((s) => `${s.label}: ${s.state}`).join(", ")}>
          {flow.map((s) => (
            <span key={s.key} className={"is-" + s.state}>
              {s.state === "done" ? "✓ " : s.state === "bad" ? "✕ " : ""}
              {s.label === "Assessment" ? "Assess." : s.label}
            </span>
          ))}
        </div>
        <div className={"sv-sb" + (info.attentionTone === "attention" ? " is-warn" : "")}>{info.hint}</div>
      </div>
    );
  }

  function reopenApplication(child, application, info) {
    if (info.placedElsewhere) {
      return patch(child.id, application, { keep_open: true }).then((ok) => ok && logEvent(application, "Kept open alongside the placement"));
    }
    return changeStatus(child.id, application, info.isDeclined ? "under_review" : "draft");
  }

  function onRowKey(e, fn) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  }

  /* ---------- the open application ---------- */

  function renderLiveDetail(child, application, info) {
    const { name, childPlaced, school, schoolName, events } = info;
    const lastEvent = events[0];
    const logSummary = lastEvent
      ? `Last: ${lastEvent.description}${staffNames[lastEvent.created_by] ? ` · ${staffNames[lastEvent.created_by]}` : ""} · ${new Date(lastEvent.occurred_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
      : "Nothing logged yet";
    const portalProps = {
      application,
      school,
      parents,
      staffNames,
      events,
      onPortalUrlSaved: (id, url, platform) =>
        setSchools((list) => list.map((sc) => (sc.id === id ? { ...sc, openapply_login_url: url, application_platform: platform || sc.application_platform } : sc))),
      onEventAdded: (ev) => setEventsByApp((m) => ({ ...m, [application.id]: [ev, ...(m[application.id] || [])] })),
    };
    return (
      <div className="sv-open" onClick={(e) => e.stopPropagation()}>
        <div className="ap2-head">
          <div>
            <span className="ap2-title">{application.schoolName}</span>
            <span className="ap2-sub">
              {name}
              {child.year_group_applying_for ? ` · ${child.year_group_applying_for}` : ""}
              {info.hint ? " · " : ""}
              <span className={info.attentionTone === "attention" ? "is-warn" : ""}>{info.hint}</span>
            </span>
          </div>
          <div className="sv-pills">
            {info.portalUrl && (
              <a className="sv-btn is-sm" href={info.portalUrl} target="_blank" rel="noreferrer">
                Open school portal
              </a>
            )}
          </div>
        </div>

        <div className="ap2-bar">
          <UpdateFamilyButton
            familyId={familyId}
            schoolId={application.school_id}
            childId={child.id}
            suggested={
              {
                submitted: "applied",
                assessment_booked: "assessment",
                under_review: "assessment",
                offer: "offer",
                offer_accepted: "placed",
                waitlisted: "waitlisted",
              }[application.status] || "applied"
            }
          />
          <div className="ap2-bar-tools">
            {application.status !== "offer_accepted" && (
              <label className="ap2-flag">
                <input
                  type="checkbox"
                  checked={!!application.needs_attention}
                  onChange={(e) => patch(child.id, application, { needs_attention: e.target.checked })}
                />
                Needs attention
              </label>
            )}
            {onGoToVisits && (
              <button type="button" className="sv-btn is-sm is-quiet" onClick={() => onGoToVisits(application.school_id)}>
                ← School visit
              </button>
            )}
            <button type="button" className="sv-btn is-sm is-quiet" onClick={() => changeStatus(child.id, application, "withdrawn")}>
              Withdraw
            </button>
            <button type="button" className="sv-btn is-sm is-quiet" onClick={() => setConfirmDelete({ child, application, name })}>
              Delete
            </button>
            <button type="button" className="sv-btn is-sm is-quiet" onClick={() => toggleExpanded(application)}>
              Close
            </button>
          </div>
        </div>

        {childPlaced && application.keep_open && (
          <p className="ap2-note">
            Kept open even though {name} is placed at {childPlaced.schoolName}.{" "}
            <button
              type="button"
              className="apx-link"
              onClick={() =>
                patch(child.id, application, { keep_open: false }).then((ok) => ok && logEvent(application, "No longer kept open -- closed with the placement"))
              }
            >
              Let it close instead
            </button>
          </p>
        )}

        {assessmentSuggestionsFor(child, application, name)}

        <ApplicationProcess
          application={application}
          childName={name}
          portalUrl={info.portalUrl}
          placement={placementFor(child.id, schoolName)}
          onPatch={(changes) =>
            patch(child.id, application, changes).then((ok) => {
              if (ok && "placement_hold" in changes) onProgressChange?.();
              return ok;
            })
          }
          onStatus={(next, extra) => changeStatus(child.id, application, next, extra)}
          onMeetingLink={(v) => saveMeetingLink(child.id, application, v)}
          onStartDate={(v) => savePlacementDate(child, info.i, schoolName, v)}
          onLog={(text, type) => logEvent(application, text, type)}
          fees={info.fees}
          familyId={familyId}
          onFeesChange={(update) => setFeesByApp((m) => ({ ...m, [application.id]: update(m[application.id] || []) }))}
          aside={
            <OpenApplySynced
              application={application}
              items={checklistByApp[application.id] || []}
              fees={info.fees}
              isOpenApply={school?.application_platform === "openapply"}
            />
          }
        />

        <div className="ap2-mini">
          <details className="ap2-mini-card">
            <summary>
              <span className="ap2-mini-name">Portal login</span>
              <span className="ap2-mini-hint">Link, email, password</span>
            </summary>
            <div className="ap2-row-body">
              <PortalAndLog {...portalProps} part="login" />
            </div>
          </details>
          <details className="ap2-mini-card">
            <summary>
              <span className="ap2-mini-name">Activity log{events.length ? ` (${events.length})` : ""}</span>
              <span className="ap2-mini-hint">{logSummary}</span>
            </summary>
            <div className="ap2-row-body">
              <PortalAndLog {...portalProps} part="log" />
            </div>
          </details>
        </div>
      </div>
    );
  }

  // Closed applications are view-only: what was recorded, plus the way back.
  function renderClosedDetail(child, application, info) {
    const { name, childPlaced, isDeclined } = info;
    return (
      <div className="sv-open" onClick={(e) => e.stopPropagation()}>
        {info.placedElsewhere ? (
          <>
            <p className="ap2-note">
              View only. {name} was placed at {childPlaced.schoolName}, so this application is closed. If that placement falls through, it opens again by itself. If {name} is applying here as well (a second school through us), you can keep it open instead.
            </p>
            <ApplicationProcess
              application={application}
              childName={name}
              placement={placementFor(child.id, application.schoolName)}
              onPatch={async () => false}
              onStatus={() => {}}
              onMeetingLink={async () => false}
              onStartDate={() => {}}
              onLog={() => {}}
              fees={info.fees}
              familyId={familyId}
              portalUrl={info.portalUrl}
              readOnly
            />
          </>
        ) : (
          <div className="sv-blk">
            <h3>
              <span>{isDeclined ? "Declined" : "Withdrawn"}</span>
            </h3>
            <p style={{ margin: "0 0 12px" }}>
              {isDeclined ? `${application.schoolName} declined ${name}.` : "This application was withdrawn."} It&apos;s closed and kept here for the record.
            </p>
            <AutosaveField
              collapsible
              label={isDeclined ? "Why the school said no" : "Why it was withdrawn"}
              placeholder={isDeclined ? "e.g. No space this year" : "e.g. family chose another school"}
              value={isDeclined ? application.rejected_reason : application.withdrawn_reason}
              onSave={async (v) => {
                const ok = await patch(child.id, application, { [isDeclined ? "rejected_reason" : "withdrawn_reason"]: v });
                if (!ok) throw new Error("check the message above, then Retry");
                if (v) logEvent(application, `Reason: ${v}`);
              }}
            />
            {isDeclined && (
              <div className="ap-chips">
                <span className="ap-chips-label">Quick pick</span>
                {REJECTION_REASONS.filter((r) => r !== "Other").map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={"ap-chip" + (application.rejected_reason === r ? " is-on" : "")}
                    onClick={() => patch(child.id, application, { rejected_reason: r }).then((ok) => ok && logEvent(application, `Reason: ${r}`))}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ---------- the table ---------- */

  const overviewCols = "minmax(0,1.6fr) minmax(0,0.8fr) minmax(0,2.5fr) minmax(0,1.4fr) minmax(0,1.8fr)";
  const childCols = "minmax(0,1.6fr) minmax(0,2.6fr) minmax(0,1.4fr) minmax(0,1.9fr)";

  function renderTable(list, withChild) {
    const cols = withChild ? overviewCols : childCols;
    const rankApp = (child, a) =>
      a.status === "offer_accepted" && !closedForChild(placed, child.id, a.school_id, a.schoolName, a.keep_open)
        ? 0
        : a.status === "withdrawn"
        ? 4
        : a.status === "rejected"
        ? 3
        : closedForChild(placed, child.id, a.school_id, a.schoolName, a.keep_open)
        ? 2
        : 1;
    const items = list
      .map(({ child, application }) => ({ child, application, info: infoFor(child, application) }))
      .sort((x, y) => rankApp(x.child, x.application) - rankApp(y.child, y.application));
    const live = items.filter((x) => !x.info.closedCard);
    const closed = items.filter((x) => x.info.closedCard);
    return (
      <div className="sv-card" style={{ overflow: "hidden" }}>
        {items.length === 0 ? (
          <p className="sv-hint" style={{ margin: 20 }}>No schools added here yet. Use + Add school, or Proceed to application on the School visits tab.</p>
        ) : (
          <div className="sv-scroll">
            <div className="sv-tbl">
              <div className="sv-tb is-head" style={{ "--sv-cols": cols }}>
                <span>School</span>
                {withChild && <span>Child</span>}
                <span>Where it is</span>
                <span>Next step</span>
                <span>Notes</span>
              </div>
              {live.map(({ child, application, info }) => {
                const open = isExpanded(application);
                const [nextLabel, tone, nextWho] = nextStepFor(application, info);
                const highlighted = highlightActive && String(highlightSchoolId) === String(application.school_id);
                return (
                  <div key={application.id} id={`app-row-school-${application.school_id}`}>
                    <div
                      className={"sv-tb" + (open || highlighted ? " is-sel" : "")}
                      style={{ "--sv-cols": cols }}
                      tabIndex={0}
                      role="button"
                      aria-expanded={open}
                      onClick={() => toggleExpanded(application)}
                      onKeyDown={(e) => onRowKey(e, () => toggleExpanded(application))}
                    >
                      <div>
                        <div className={"sv-nm" + (open ? " is-sel" : "")}>{application.schoolName}</div>
                        {entryLabel(child) && <div className="sv-sb">{entryLabel(child)}</div>}
                      </div>
                      {withChild && <span className="sv-st"><KidTag name={info.name} index={info.i} /></span>}
                      {chevrons(application, info)}
                      <span className="sv-st sv-next">
                        <WhoTag who={nextWho} />
                        <span>
                          {tone && <i className={"sv-d is-" + tone} />}
                          {nextLabel}
                        </span>
                      </span>
                      <span className="sv-st ap2-notecell" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <NoteCell
                          key={application.id + ":" + (application.notes || "")}
                          value={application.notes}
                          onSave={(v) => patch(child.id, application, { notes: v })}
                        />
                      </span>
                    </div>
                    {open && renderLiveDetail(child, application, info)}
                  </div>
                );
              })}
              {closed.length > 0 && (
                <>
                  <div className="sv-tb is-band" style={{ "--sv-cols": cols }}>
                    <span className="sv-band-label">Closed · {closed.length}</span>
                    {withChild && <span />}
                    <span />
                    <span className="sv-sub" style={{ textAlign: "right" }}>Greyed out, kept for the record</span>
                    <span />
                  </div>
                  {closed.map(({ child, application, info }) => {
                    const open = isExpanded(application);
                    return (
                      <div key={application.id} id={`app-row-school-${application.school_id}`}>
                        <div
                          className={"sv-tb is-closed" + (open ? " is-sel" : "")}
                          style={{ "--sv-cols": cols, cursor: "pointer" }}
                          tabIndex={0}
                          role="button"
                          aria-expanded={open}
                          onClick={() => toggleExpanded(application)}
                          onKeyDown={(e) => onRowKey(e, () => toggleExpanded(application))}
                        >
                          <div>
                            <div className="sv-nm">{application.schoolName}</div>
                            <div className="sv-sb">{info.hint}</div>
                          </div>
                          {withChild && <span className="sv-st">{info.name}</span>}
                          <span className="ap2-pill">{info.placedElsewhere ? "Placed elsewhere" : info.isDeclined ? "Declined" : "Withdrawn"}</span>
                          <span className="sv-st" onClick={(e) => e.stopPropagation()}>
                            <button type="button" className="sv-btn is-link" onClick={() => reopenApplication(child, application, info)}>
                              Reopen
                            </button>
                            <button
                              type="button"
                              className="sv-btn is-link"
                              style={{ color: "var(--sv-mute)", marginLeft: 12 }}
                              onClick={() => setConfirmDelete({ child, application, name: info.name })}
                            >
                              Delete
                            </button>
                          </span>
                          <span className="sv-st ap2-notecell is-closed">{application.notes || ""}</span>
                        </div>
                        {open && renderClosedDetail(child, application, info)}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const countFor = (child) => (apps[child.id] || []).filter((a) => inCurrentRound(a, roundInfo)).length;
  const allApps = familyChildren.flatMap((child) =>
    (apps[child.id] || []).filter((a) => inCurrentRound(a, roundInfo)).map((application) => ({ child, application }))
  );
  const shownApps = activeChild
    ? (apps[activeChild.id] || []).filter((a) => inCurrentRound(a, roundInfo)).map((application) => ({ child: activeChild, application }))
    : allApps;
  const addTarget = familyChildren.find((c) => c.id === addChild) || activeChild || familyChildren[0];

  return (
    <section className="sv ap2">
      {error && <p className="sv-error">{error}</p>}

      <div className="sv-vrow">
        <div className="sv-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={activeTab === "overview"} className={activeTab === "overview" ? "is-on" : ""} onClick={() => setTab("overview")}>
            Overview
          </button>
          {familyChildren.map((c, i) => (
            <button key={c.id} type="button" role="tab" aria-selected={activeTab === c.id} className={activeTab === c.id ? "is-on" : ""} onClick={() => setTab(c.id)}>
              {displayNameForChild(c, i)}
              <span className="sv-n">{countFor(c)}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="sv-btn is-primary"
          style={{ marginBottom: 8 }}
          onClick={() => {
            resetForm();
            setAddChild(activeChild ? activeChild.id : familyChildren[0].id);
            setAddOpen(true);
          }}
        >
          + Add school
        </button>
      </div>

      {activeChild && placed[activeChild.id] && (
        <div className="sv-placed">
          <span aria-hidden="true">🎓</span>
          <span>
            <strong>
              {displayNameForChild(activeChild, childIdx(activeChild.id))} is placed at {placed[activeChild.id].schoolName}
            </strong>
            {placed[activeChild.id].startDate ? ` · starts ${shortDate(placed[activeChild.id].startDate)}` : " · add the first day under Placed"}
            <span className="sv-placed-sub">Their other schools are closed and kept below for reference.</span>
          </span>
        </div>
      )}

      {renderAssessmentSuggestions()}

      <div className="ag-launch">
        <AssessmentGuide familyName={familyName} children={familyChildren} applicationsByChild={apps} />
      </div>

      {renderTable(shownApps, !activeChild)}

      {(activeChild ? [activeChild] : familyChildren).map((child) => {
        const earlier = (apps[child.id] || []).filter((a) => !inCurrentRound(a, roundInfo));
        if (earlier.length === 0) return null;
        return (
          <details key={child.id} className="ap-earlier">
            <summary>
              {displayNameForChild(child, childIdx(child.id))}: earlier rounds ({earlier.length} application{earlier.length === 1 ? "" : "s"}, kept as history)
            </summary>
            <ul className="ap-list">
              {earlier.map((a) => (
                <li key={a.id} className="ap-closed-note">
                  Round {a.round_number || 1} · {a.schoolName || schools.find((x) => x.id === a.school_id)?.name || "School"} · {String(a.status || "").replace(/_/g, " ")}
                </li>
              ))}
            </ul>
          </details>
        );
      })}

      {addOpen && addTarget && (
        <div className="sv-modal-back" onClick={() => !busy && setAddOpen(false)}>
          <form className="sv-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} onSubmit={(e) => handleAdd(e, addTarget)}>
            <h3>Add a school</h3>
            {familyChildren.length > 1 && (
              <label className="sv-fld">
                For
                <select value={addTarget.id} onChange={(e) => setAddChild(e.target.value)}>
                  {familyChildren.map((c, i) => (
                    <option key={c.id} value={c.id}>
                      {displayNameForChild(c, i)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="sv-fld">
              School
              <select
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
            </label>
            <label className="sv-fld">
              Or type a new school name
              <input
                type="text"
                placeholder="Type a new school name"
                value={newSchoolName}
                onChange={(e) => {
                  setNewSchoolName(e.target.value);
                  if (e.target.value) setSchoolId("");
                }}
              />
            </label>
            <div className="sv-modal-actions">
              <button type="button" className="sv-btn is-sm is-quiet" onClick={() => setAddOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="sv-btn is-primary is-sm" disabled={busy || (!schoolId && !newSchoolName.trim())}>
                {busy ? "Adding…" : "Add school"}
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmDelete && (
        <div className="ap-confirm" role="dialog" aria-modal="true" onClick={() => !deleting && setConfirmDelete(null)}>
          <div className="ap-confirm-box" onClick={(e) => e.stopPropagation()}>
            <h3>Delete this application?</h3>
            <p>
              {confirmDelete.application.schoolName} for {confirmDelete.name}. This removes the application completely,
              with its timeline, checklist and fees, as if it was never added. It can&rsquo;t be undone.
            </p>
            <p className="ap-confirm-note">
              If the family simply isn&rsquo;t going ahead, use Withdraw instead so the history is kept. A school with an
              accepted offer, a paid fee, or a fee on an invoice can&rsquo;t be deleted.
            </p>
            <div className="ap-confirm-actions">
              <button type="button" className="panel-btn panel-btn-quiet" disabled={deleting} onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button type="button" className="ap-confirm-danger" disabled={deleting} onClick={removeApplication}>
                {deleting ? "Deleting…" : "Delete application"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
