import { useEffect, useRef, useState } from "react";
import {
  createApplication,
  updateApplication,
  createSchool,
  listApplicationEvents,
  createApplicationEvent,
  listApplicationFees,
  listChecklistItems,
  updateSchool,
  listPlacements,
  createPlacement,
  updatePlacementDate,
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
import { FlowBar } from "./ProcessSteps";
import UpdateFamilyButton from "./UpdateFamilyButton";
import "./panels.css";
import AutosaveField from "./Autosave";
import { placedByChild, closedForChild, shortDate } from "../lib/placement";
import { parseMeetingInvite, looksLikeInvite } from "../lib/meetingLink";
import "./ApplicationsPanel.css";


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


const ALIAS_DOMAIN = "applications.heatherharries.com";

// Portal login + activity log for one application, shown when a consultant
// opens the application. Login details are the parent's application alias
// and password (the same ones shown on the Application email panel); nothing
// here is deletable -- log entries are only ever added.
function PortalAndLog({ application, school, parents, events, onEventAdded, onPortalUrlSaved, staffNames = {} }) {
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
  if (!items.length && !fees.length && !synced) {
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
  onProgressChange,
  onGoToVisits,
  staff = [],
}) {
  // Who did what, for the activity log (founders: many consultants).
  const staffNames = Object.fromEntries((staff || []).map((s) => [s.user_id, s.full_name || s.email]));
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
  // Status-change history, only used for the "days at this stage" figure.
  const [eventsByApp, setEventsByApp] = useState({});
  // OpenApply sync data (checklist items + invoices), per application.
  const [checklistByApp, setChecklistByApp] = useState({});
  const [feesByApp, setFeesByApp] = useState({});
  // "Accepted on" / "Placed?" / "Start date" cards on the Decision stage --
  // reuses the same family_placements rows the Overview's Placement panel
  // shows, matched to this application by child + school name.
  const [placements, setPlacements] = useState([]);
  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
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
  useEffect(() => {
    if (!highlightSchoolId) return;
    // Arriving from a school visit: open that school's application(s) and keep them open.
    setExpandedByApp((m) => {
      const next = { ...m };
      Object.values(apps)
        .flat()
        .filter((a) => String(a.school_id) === String(highlightSchoolId))
        .forEach((a) => (next[a.id] = true));
      return next;
    });
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
      setAddingFor(null);
    } catch (err) {
      setError(err.message || "Couldn't add that application.");
    } finally {
      setBusy(false);
    }
  }

  // Founders (25 Sept 2026): once a child is placed, their other schools
  // close -- dark grey, at the bottom, view-only. Worked out, never saved,
  // so undoing the placement reopens them.
  const placed = placedByChild({ children: familyChildren, applicationsByChild: apps, placements, schools });

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

  return (
    <section className="panel ap">
      <div className="panel-head">
        <h2>Applications</h2>
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {familyChildren.map((child, i) => {
        // The school they're placed at first, then open applications, then
        // closed ones (placed elsewhere, withdrawn) at the bottom.
        const childPlaced = placed[child.id];
        const isClosedApp = (a) => closedForChild(placed, child.id, a.school_id, a.schoolName, a.keep_open);
        const rankApp = (a) =>
          a.status === "offer_accepted" && !isClosedApp(a)
            ? 0
            : a.status === "withdrawn"
            ? 4
            : a.status === "rejected"
            ? 3
            : isClosedApp(a)
            ? 2
            : 1;
        const childApps = [...(apps[child.id] || [])].sort((a, b) => rankApp(a) - rankApp(b));
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

            {childPlaced && (
              <div className="ap-placed-banner">
                <span className="ap-placed-banner-icon" aria-hidden="true">
                  🎓
                </span>
                <span>
                  <strong>
                    {name} is placed at {childPlaced.schoolName}
                  </strong>
                  {childPlaced.startDate ? ` · starts ${shortDate(childPlaced.startDate)}` : " · add the first day under Placed"}
                  <span className="ap-placed-banner-sub">Their other schools are closed and kept below for reference.</span>
                </span>
              </div>
            )}

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
                  const isHighlighted =
                    highlightActive && String(highlightSchoolId) === String(application.school_id);
                  const isWithdrawn = application.status === "withdrawn";
                  const isDeclined = application.status === "rejected";
                  const placedElsewhere = !isWithdrawn && isClosedApp(application);
                  const isPlacedHere = childPlaced && !placedElsewhere && !isWithdrawn && application.status === "offer_accepted";
                  const school = schools.find((sc) => sc.id === application.school_id);
                  const portalUrl = school?.openapply_login_url || school?.application_url || "";
                  const expanded = isExpanded(application);
                  const events = eventsByApp[application.id] || [];
                  const lastEvent = events[0];
                  const flow = applicationMiniSteps(application);
                  const hint = placedElsewhere
                    ? `Closed · ${name} placed at ${childPlaced.schoolName}`
                    : isDeclined
                    ? `Closed · declined${application.rejected_reason ? `: ${application.rejected_reason}` : ""}`
                    : isWithdrawn
                    ? `Withdrawn${application.withdrawn_reason ? `: ${application.withdrawn_reason}` : ""}`
                    : isPlacedHere
                    ? childPlaced.startDate
                      ? `🎓 Placed · starts ${shortDate(childPlaced.startDate)}`
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
                  const closedCard = placedElsewhere || isDeclined || isWithdrawn;
                  return (
                    <li
                      key={application.id}
                      id={`app-row-school-${application.school_id}`}
                      className={
                        "ap-card2" +
                        (closedCard ? " is-closed" : "") +
                        (isPlacedHere ? " is-placed" : "") +
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
                            <span className={"ap-school-meta apx-hint" + (attentionTone === "attention" && !closedCard ? " is-attention" : "")}>
                              {hint}
                            </span>
                          </span>
                        </div>
                        {closedCard ? (
                          <span className="ap-pill ap-pill-closed">
                            {placedElsewhere ? "Closed" : isDeclined ? "Declined" : "Withdrawn"}
                          </span>
                        ) : (
                          <FlowBar steps={flow} />
                        )}
                        <span className={"ap-chevron" + (expanded ? " is-open" : "")} aria-hidden="true">
                          ▾
                        </span>
                      </button>

                      {expanded && (
                        <div className="ap-card2-body">
                          {/* 1. Portal login & activity log -- at the top, open/close. */}
                          <details className="apx-portal">
                            <summary>
                              <span className="apx-portal-title">Portal login &amp; activity log</span>
                              <span className="apx-portal-sub">
                                {lastEvent
                                  ? `Last: ${lastEvent.description}${
                                      staffNames[lastEvent.created_by] ? ` · ${staffNames[lastEvent.created_by]}` : ""
                                    } · ${new Date(lastEvent.occurred_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                                  : "Nothing logged yet"}
                              </span>
                            </summary>
                            <div className="apx-portal-body">
                              <PortalAndLog
                                application={application}
                                school={school}
                                parents={parents}
                                staffNames={staffNames}
                                onPortalUrlSaved={(id, url, platform) =>
                                  setSchools((list) =>
                                    list.map((sc) =>
                                      sc.id === id
                                        ? { ...sc, openapply_login_url: url, application_platform: platform || sc.application_platform }
                                        : sc
                                    )
                                  )
                                }
                                events={events}
                                onEventAdded={(ev) =>
                                  setEventsByApp((m) => ({ ...m, [application.id]: [ev, ...(m[application.id] || [])] }))
                                }
                              />
                              <OpenApplySynced
                                application={application}
                                items={checklistByApp[application.id] || []}
                                fees={feesByApp[application.id] || []}
                                isOpenApply={school?.application_platform === "openapply"}
                              />
                            </div>
                          </details>

                          {/* 2. The process, or why it's closed. */}
                          {placedElsewhere ? (
                            <>
                              <p className="ap-closed-note">
                                View only. {name} was placed at {childPlaced.schoolName}, so this application is closed. If
                                that placement falls through, it opens again by itself. If {name} is applying here as well
                                (a second school through us), you can keep it open instead:
                              </p>
                              <button
                                type="button"
                                className="apx-link"
                                onClick={() =>
                                  patch(child.id, application, { keep_open: true }).then(
                                    (ok) => ok && logEvent(application, "Kept open alongside the placement")
                                  )
                                }
                              >
                                Keep this application open too
                              </button>
                              <fieldset className="apx-readonly" disabled>
                                <ApplicationProcess
                                  application={application}
                                  childName={name}
                                  placement={null}
                                  onPatch={async () => false}
                                  onStatus={() => {}}
                                  onMeetingLink={async () => false}
                                  onStartDate={() => {}}
                                  onLog={() => {}}
                                />
                              </fieldset>
                            </>
                          ) : isDeclined || isWithdrawn ? (
                            <div className="apx-closed-box">
                              <p className="apx-closed-title">
                                {isDeclined ? `${application.schoolName} declined ${name}.` : "This application was withdrawn."} It&apos;s
                                closed and kept here for the record.
                              </p>
                              <AutosaveField
                                collapsible
                                label={isDeclined ? "Why the school said no" : "Why it was withdrawn"}
                                placeholder={isDeclined ? "e.g. No space this year" : "e.g. family chose another school"}
                                value={isDeclined ? application.rejected_reason : application.withdrawn_reason}
                                onSave={async (v) => {
                                  const ok = await patch(child.id, application, {
                                    [isDeclined ? "rejected_reason" : "withdrawn_reason"]: v,
                                  });
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
                                      onClick={() =>
                                        patch(child.id, application, { rejected_reason: r }).then(
                                          (ok) => ok && logEvent(application, `Reason: ${r}`)
                                        )
                                      }
                                    >
                                      {r}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <button
                                type="button"
                                className="apx-link"
                                onClick={() => changeStatus(child.id, application, isDeclined ? "under_review" : "draft")}
                              >
                                {isDeclined ? "Reopen: the school changed its mind" : "Reopen this application"}
                              </button>
                            </div>
                          ) : (
                            <>
                              {childPlaced && application.keep_open && (
                                <p className="ap-closed-note">
                                  Kept open even though {name} is placed at {childPlaced.schoolName}.{" "}
                                  <button
                                    type="button"
                                    className="apx-link"
                                    onClick={() =>
                                      patch(child.id, application, { keep_open: false }).then(
                                        (ok) => ok && logEvent(application, "No longer kept open -- closed with the placement")
                                      )
                                    }
                                  >
                                    Let it close instead
                                  </button>
                                </p>
                              )}
                              <ApplicationProcess
                                application={application}
                                childName={name}
                                portalUrl={portalUrl}
                                placement={placementFor(child.id, school?.name || application.schoolName)}
                                onPatch={(changes) => patch(child.id, application, changes)}
                                onStatus={(next, extra) => changeStatus(child.id, application, next, extra)}
                                onMeetingLink={(v) => saveMeetingLink(child.id, application, v)}
                                onStartDate={(v) => savePlacementDate(child, i, school?.name || application.schoolName, v)}
                                onLog={(text, type) => logEvent(application, text, type)}
                              />
                            </>
                          )}

                          {/* 3. Everything else, kept small. */}
                          {!closedCard && (
                            <div className="apx-foot">
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
                              <AutosaveField
                                collapsible
                                multiline
                                rows={2}
                                label="Team notes"
                                placeholder="Anything the team should know. The family can't see this."
                                value={application.notes}
                                onSave={async (v) => {
                                  const ok = await patch(child.id, application, { notes: v });
                                  if (!ok) throw new Error("check the message above, then Retry");
                                }}
                              />
                              <div className="apx-foot-row">
                                {application.status !== "offer_accepted" && (
                                  <label className="apx-inline apx-flag">
                                    <input
                                      type="checkbox"
                                      checked={!!application.needs_attention}
                                      onChange={(e) => patch(child.id, application, { needs_attention: e.target.checked })}
                                    />
                                    Flag as needing attention
                                  </label>
                                )}
                                {onGoToVisits && (
                                  <button type="button" className="apx-link" onClick={() => onGoToVisits(application.school_id)}>
                                    ← School visit
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="ap-withdraw-link"
                                  onClick={() => changeStatus(child.id, application, "withdrawn")}
                                >
                                  Withdraw
                                </button>
                              </div>
                            </div>
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
