import { useEffect, useMemo, useState } from "react";
import {
  listShortlistForFamily,
  updateShortlistTour,
  createApplication,
  updateApplication,
  autoCompletePastTours,
  friendlyError,
} from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import { SCHOOL_PIPELINE_STAGES, pipelineStage, applicationStatus, REJECTION_REASONS } from "../lib/workflow";
import { TourIcon } from "./icons";
import "./panels.css";
import "./SchoolPipelinePanel.css";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// A quiet colour cue per card, using only the app's own brand tokens --
// gold for "needs a decision", green/red for a school's own offer or
// rejection, red (muted) for a family decline, burgundy for everything
// still in motion. Never a colour invented just for this widget.
function cardTone(stage, apps) {
  if (stage === "declined") return "bad";
  if (stage === "awaiting_decision") return "attention";
  if (stage === "decision") {
    if (apps.some((a) => a.status === "offer")) return "good";
    if (apps.some((a) => a.status === "rejected")) return "bad";
  }
  return "neutral";
}

// The Overview tab's school pipeline -- the same school_shortlist and
// applications rows the School visits and Applications tabs manage, reduced
// to "where is this school up to" and laid out so it moves itself left to
// right. Deliberately thin: booking tours and running the full application
// form still happen on those tabs (this doesn't rebuild them), but the two
// decisions that used to require a trip over there -- the family saying no
// after a tour, and a rejection needing a reason -- can be made right here.
export default function SchoolPipelinePanel({
  familyId,
  familyChildren,
  applicationsByChild,
  onFamilyRefresh,
  onGoToVisits,
  onGoToApplications,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [decliningId, setDecliningId] = useState(null);
  const [declineNote, setDeclineNote] = useState("");
  const [rejectingAppId, setRejectingAppId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const children = familyChildren || [];
  const allApplications = useMemo(() => Object.values(applicationsByChild || {}).flat(), [applicationsByChild]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const shortlist = await listShortlistForFamily(familyId);
      const withAutoCompleted = await autoCompletePastTours(shortlist);
      setRows(withAutoCompleted);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  const grouped = useMemo(() => {
    const byStage = {};
    SCHOOL_PIPELINE_STAGES.forEach((s) => {
      byStage[s.key] = [];
    });
    rows.forEach((row) => {
      const appsForSchool = allApplications.filter((a) => a.school_id === row.school_id && a.status !== "withdrawn");
      const stage = pipelineStage(row, appsForSchool);
      (byStage[stage] || (byStage[stage] = [])).push({ row, apps: appsForSchool });
    });
    return byStage;
  }, [rows, allApplications]);

  async function handleProceed(row, appsForSchool) {
    setBusyId(row.id);
    setError("");
    try {
      const childrenNeedingApplication = children.filter((c) => !appsForSchool.some((a) => a.child_id === c.id));
      if (childrenNeedingApplication.length > 0) {
        await Promise.all(
          childrenNeedingApplication.map((c) =>
            createApplication({ childId: c.id, schoolId: row.school_id, status: "draft" })
          )
        );
      }
      if (row.family_decision !== "proceeding") {
        const updated = await updateShortlistTour(row.id, {
          family_decision: "proceeding",
          family_decision_at: new Date().toISOString(),
        });
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
      }
      if (onFamilyRefresh) await onFamilyRefresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(row) {
    setBusyId(row.id);
    setError("");
    try {
      const updated = await updateShortlistTour(row.id, {
        family_decision: "declined",
        family_decision_note: declineNote.trim() || null,
        family_decision_at: new Date().toISOString(),
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
      setDecliningId(null);
      setDeclineNote("");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleUndoDecision(row) {
    setBusyId(row.id);
    setError("");
    try {
      const updated = await updateShortlistTour(row.id, {
        family_decision: null,
        family_decision_note: null,
        family_decision_at: null,
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleOffer(application) {
    setBusyId(application.id);
    setError("");
    try {
      await updateApplication(application.id, { status: "offer" });
      if (onFamilyRefresh) await onFamilyRefresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(application) {
    setBusyId(application.id);
    setError("");
    try {
      await updateApplication(application.id, { status: "rejected", rejected_reason: rejectReason.trim() || null });
      setRejectingAppId(null);
      setRejectReason("");
      if (onFamilyRefresh) await onFamilyRefresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <section className="family-detail-card">
        <h2>
          <TourIcon />
          School pipeline
        </h2>
        <p className="panel-hint">Loading…</p>
      </section>
    );
  }

  const totalSchools = rows.length;

  return (
    <section className="family-detail-card sp-panel">
      <h2>
        <TourIcon />
        School pipeline
        {totalSchools > 0 && <span className="panel-count">{totalSchools}</span>}
      </h2>

      {error && <p className="panel-hint sp-error">{error}</p>}

      <datalist id="sp-rejection-reasons">
        {REJECTION_REASONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {totalSchools === 0 ? (
        <p className="panel-hint">No schools shortlisted yet — add one on School visits.</p>
      ) : (
        <div className="sp-board">
          {SCHOOL_PIPELINE_STAGES.map((stage) => {
            const items = grouped[stage.key] || [];
            return (
              <div className="sp-column" key={stage.key} data-stage={stage.key}>
                <div className="sp-column-head" title={stage.hint}>
                  <h3>{stage.label}</h3>
                  <span className="sp-column-count">{items.length}</span>
                </div>
                <div className="sp-column-body">
                  {items.length === 0 ? (
                    <div className="sp-column-empty">—</div>
                  ) : (
                    items.map(({ row, apps }) => (
                      <SchoolCard
                        key={row.id}
                        row={row}
                        apps={apps}
                        familyChildren={children}
                        stage={stage.key}
                        busy={busyId === row.id}
                        decliningId={decliningId}
                        declineNote={declineNote}
                        onDeclineNoteChange={setDeclineNote}
                        onStartDecline={() => {
                          setDecliningId(row.id);
                          setDeclineNote("");
                        }}
                        onCancelDecline={() => {
                          setDecliningId(null);
                          setDeclineNote("");
                        }}
                        onConfirmDecline={() => handleDecline(row)}
                        onProceed={() => handleProceed(row, apps)}
                        onUndo={() => handleUndoDecision(row)}
                        rejectingAppId={rejectingAppId}
                        rejectReason={rejectReason}
                        onRejectReasonChange={setRejectReason}
                        onStartReject={(appId) => {
                          setRejectingAppId(appId);
                          setRejectReason("");
                        }}
                        onCancelReject={() => {
                          setRejectingAppId(null);
                          setRejectReason("");
                        }}
                        onConfirmReject={handleReject}
                        onOffer={handleOffer}
                        busyAppId={busyId}
                        onGoToVisits={onGoToVisits}
                        onGoToApplications={onGoToApplications}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SchoolCard({
  row,
  apps,
  familyChildren,
  stage,
  busy,
  decliningId,
  declineNote,
  onDeclineNoteChange,
  onStartDecline,
  onCancelDecline,
  onConfirmDecline,
  onProceed,
  onUndo,
  rejectingAppId,
  rejectReason,
  onRejectReasonChange,
  onStartReject,
  onCancelReject,
  onConfirmReject,
  onOffer,
  busyAppId,
  onGoToVisits,
  onGoToApplications,
}) {
  const childName = (childId) => {
    const i = familyChildren.findIndex((c) => c.id === childId);
    return i === -1 ? "" : displayNameForChild(familyChildren[i], i);
  };

  const tone = cardTone(stage, apps);

  return (
    <article className={`sp-card sp-card--${tone}` + (stage === "declined" ? " is-declined" : "")}>
      <div className="sp-card-school">{row.school?.name || "Unknown school"}</div>

      {stage === "declined" && (
        <>
          <p className="sp-card-note">
            Family decided not to proceed{row.family_decision_note ? `: "${row.family_decision_note}"` : "."}
          </p>
          <button type="button" className="panel-btn panel-btn-quiet" onClick={onUndo} disabled={busy}>
            Undo
          </button>
        </>
      )}

      {(stage === "shortlisted" || stage === "tour_scheduled") && (
        <>
          <p className="sp-card-note">
            {row.tour_date ? `Tour ${formatDate(row.tour_date)}` : "No tour booked yet"}
          </p>
          <button type="button" className="panel-btn panel-btn-quiet sp-link" onClick={onGoToVisits}>
            Manage on School visits →
          </button>
        </>
      )}

      {stage === "awaiting_decision" && (
        <>
          <p className="sp-card-note">
            Toured {formatDate(row.tour_completed_at ? row.tour_completed_at.slice(0, 10) : row.tour_date)}
          </p>
          {decliningId === row.id ? (
            <div className="sp-inline-form">
              <input
                type="text"
                className="panel-input"
                placeholder="Reason (optional)"
                value={declineNote}
                onChange={(e) => onDeclineNoteChange(e.target.value)}
                autoFocus
              />
              <div className="sp-inline-actions">
                <button type="button" className="panel-btn panel-btn-quiet" onClick={onConfirmDecline} disabled={busy}>
                  Confirm decline
                </button>
                <button type="button" className="panel-btn panel-btn-quiet" onClick={onCancelDecline} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="sp-card-actions">
              <button type="button" className="panel-btn panel-btn-primary" onClick={onProceed} disabled={busy}>
                Family's proceeding →
              </button>
              <button type="button" className="panel-btn panel-btn-quiet sp-decline-trigger" onClick={onStartDecline} disabled={busy}>
                Family isn't proceeding
              </button>
            </div>
          )}
        </>
      )}

      {(stage === "application_started" || stage === "application_progress") &&
        apps.map((app) => (
          <div className="sp-app-row" key={app.id}>
            <span className="sp-app-child">
              {childName(app.child_id)} · {applicationStatus(app.status).label}
            </span>
            {rejectingAppId === app.id ? (
              <div className="sp-inline-form">
                <input
                  type="text"
                  className="panel-input"
                  list="sp-rejection-reasons"
                  placeholder="Why? (no space, fees, etc.)"
                  value={rejectReason}
                  onChange={(e) => onRejectReasonChange(e.target.value)}
                  autoFocus
                />
                <div className="sp-inline-actions">
                  <button
                    type="button"
                    className="panel-btn panel-btn-quiet"
                    onClick={() => onConfirmReject(app)}
                    disabled={busyAppId === app.id}
                  >
                    Confirm rejected
                  </button>
                  <button type="button" className="panel-btn panel-btn-quiet" onClick={onCancelReject}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="sp-card-actions">
                <button
                  type="button"
                  className="panel-btn panel-btn-quiet"
                  onClick={() => onOffer(app)}
                  disabled={busyAppId === app.id}
                >
                  Record offer
                </button>
                <button
                  type="button"
                  className="panel-btn panel-btn-quiet sp-decline-trigger"
                  onClick={() => onStartReject(app.id)}
                  disabled={busyAppId === app.id}
                >
                  Mark rejected
                </button>
              </div>
            )}
          </div>
        ))}

      {stage === "decision" &&
        apps
          .filter((a) => a.status === "offer" || a.status === "rejected")
          .map((app) => (
            <p className="sp-card-note" key={app.id}>
              {childName(app.child_id)} · {applicationStatus(app.status).label}
              {app.status === "rejected" && app.rejected_reason ? ` — ${app.rejected_reason}` : ""}
            </p>
          ))}

      {(stage === "application_started" || stage === "application_progress" || stage === "decision") && (
        <button type="button" className="panel-btn panel-btn-quiet sp-link" onClick={onGoToApplications}>
          Full detail on Applications →
        </button>
      )}
    </article>
  );
}
