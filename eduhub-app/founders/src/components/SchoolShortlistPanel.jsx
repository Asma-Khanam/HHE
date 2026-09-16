import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listShortlistForFamily,
  listSchools,
  addToShortlist,
  updateShortlistEntry,
  removeFromShortlist,
  listChildAvailabilityForShortlistIds,
  upsertChildAvailability,
  updateShortlistTour,
  listOtherFeedbackForSchools,
  createApplication,
  friendlyError,
  autoCompletePastTours,
} from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import "./panels.css";
import "./SchoolShortlistPanel.css";

const AVAILABILITY_OPTIONS = [
  { value: "awaiting", label: "Awaiting reply" },
  { value: "yes", label: "Yes — place available" },
  { value: "some_year_groups", label: "Some year groups only" },
  { value: "waitlist", label: "Waitlist" },
  { value: "no", label: "No — full" },
];

const CHIP_LABEL = {
  awaiting: "—",
  yes: "Place",
  no: "No place",
  waitlist: "Waitlist",
  some_year_groups: "Some yrs",
};

function chipClass(value) {
  if (value === "yes") return "is-yes";
  if (value === "no") return "is-no";
  if (value === "waitlist" || value === "some_year_groups") return "is-partial";
  return "is-awaiting";
}

const TOUR_STATUS_OPTIONS = ["offered", "confirmed", "completed", "cancelled"];
const TOUR_STATUS_LABEL = { offered: "Offered", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled" };

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(dateStr, timeStr) {
  if (!dateStr) return "";
  const d = formatDate(dateStr + "T00:00:00");
  if (!timeStr) return d;
  const [h, m] = timeStr.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = ((hour + 11) % 12) + 1;
  return `${d}, ${hour12}${m && m !== "00" ? ":" + m : ""}${suffix}`;
}

function daysBetween(a, b) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

function relativeToNow(iso, futureLabel) {
  if (!iso) return "";
  const days = daysBetween(new Date().toISOString(), iso);
  if (days === 0) return "today";
  if (days > 0) return `${futureLabel || "in"} ${days} day${days === 1 ? "" : "s"}`;
  const ago = Math.abs(days);
  return `${ago} day${ago === 1 ? "" : "s"} ago`;
}

// "Where it is up to" — one line summarising the furthest stage this school
// has reached for this family, and how long ago (or how soon) that was.
// Applications are looked up from the family's own applicationsByChild data
// (already loaded on FamilyDetailPage) rather than a second fetch.
function stageInfo(row, applicationsForSchool) {
  const offer = applicationsForSchool.find((a) => a.status === "offer");
  if (offer) return { label: "Offer received", when: relativeToNow(offer.offer_at || offer.submitted_at) };

  const applied = applicationsForSchool.filter((a) => a.status !== "draft" && a.status !== "withdrawn");
  if (applied.length > 0) {
    const earliest = applied.reduce((min, a) => (a.submitted_at && (!min || a.submitted_at < min) ? a.submitted_at : min), null);
    return { label: "Applied", when: relativeToNow(earliest) };
  }

  if (row.tour_status === "completed") {
    return row.feedback_text
      ? { label: "Toured, feedback in", when: relativeToNow(row.feedback_at || row.tour_completed_at) }
      : { label: "Toured, feedback pending", when: relativeToNow(row.tour_completed_at) };
  }
  if (row.tour_status === "cancelled") return { label: "Tour cancelled", when: relativeToNow(row.tour_cancelled_at) };
  if (row.tour_date) return { label: "Tour booked", when: relativeToNow(row.tour_date) };

  if (row.availability_status !== "awaiting") return { label: "Awaiting tour date", when: relativeToNow(row.availability_replied_at) };
  return { label: "Awaiting reply", when: relativeToNow(row.shortlisted_at) };
}

function admissionsProcessText(school) {
  return (
    [
      school.requires_cat4 && "CAT4",
      school.requires_map && "MAP",
      school.requires_interview && "Interview",
      school.requires_taster_day && "Taster day",
      school.application_fee != null && `Application fee: ${school.application_fee}`,
      school.deposit_amount != null && `Deposit: ${school.deposit_amount}`,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
}

// The family-facing "School shortlist" panel — redesigned per Heather's own
// mockup: a table with one column per child, a tour column, and a "where
// it's up to" summary, each row expanding into full admissions/tour/
// feedback detail. Phase 1 (add/remove/family-level status) is preserved
// underneath the new Phase 2 layer (per-child availability, tours,
// feedback) rather than replaced by it. (Addendum 44 removed the same-day
// tour clash check that used to sit alongside these.)
export default function SchoolShortlistPanel({ familyId, familyChildren, applicationsByChild, onFamilyRefresh, onGoToApplications }) {
  const [rows, setRows] = useState([]);
  const [childStatus, setChildStatus] = useState([]);
  const [otherFeedback, setOtherFeedback] = useState({});
  const [allSchools, setAllSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingSchoolId, setAddingSchoolId] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [tourDraftById, setTourDraftById] = useState({});
  const [savedNoteId, setSavedNoteId] = useState(null);
  const [decliningId, setDecliningId] = useState(null);
  const [declineNote, setDeclineNote] = useState("");

  const children = familyChildren || [];

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [shortlist, schools] = await Promise.all([listShortlistForFamily(familyId), listSchools()]);
      const shortlistWithAutoCompletedTours = await autoCompletePastTours(shortlist);
      setRows(shortlistWithAutoCompletedTours);
      setAllSchools(schools);
      const shortlistIds = shortlist.map((r) => r.id);
      const schoolIds = [...new Set(shortlist.map((r) => r.school_id))];
      const [cs, other] = await Promise.all([
        listChildAvailabilityForShortlistIds(shortlistIds),
        listOtherFeedbackForSchools(schoolIds, familyId),
      ]);
      setChildStatus(cs);
      setOtherFeedback(other);
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

  const allApplications = useMemo(() => Object.values(applicationsByChild || {}).flat(), [applicationsByChild]);

  // The interconnection the founders asked for: once a tour is done and the
  // family wants to move forward with a school, this is the one click that
  // should exist -- no separately remembering to go create the application
  // on a different tab. Creates a draft application for whichever of the
  // family's children don't already have one at this school, then jumps to
  // the Applications tab so staff can see it land (and take it from there --
  // fit, submitting it, etc. still happen normally on that tab).
  async function handleReadyToApply(row) {
    setBusy(true);
    setError("");
    try {
      const applicationsForSchool = allApplications.filter((a) => a.school_id === row.school_id);
      const childrenNeedingApplication = children.filter(
        (c) => !applicationsForSchool.some((a) => a.child_id === c.id)
      );
      if (childrenNeedingApplication.length > 0) {
        await Promise.all(
          childrenNeedingApplication.map((c) =>
            createApplication({ childId: c.id, schoolId: row.school_id, status: "draft" })
          )
        );
        if (onFamilyRefresh) await onFamilyRefresh();
      }
      if (row.family_decision !== "proceeding") {
        const updated = await updateShortlistTour(row.id, {
          family_decision: "proceeding",
          family_decision_at: new Date().toISOString(),
        });
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
      }
      onGoToApplications?.();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // The other half of that same handoff: the family toured a school and
  // decided NOT to apply there. Recorded on the tour itself (not the
  // applications table -- no application exists yet at this point), so a
  // "no answer yet" tour and a "family said no" tour don't look identical.
  async function handleDeclineFamily(row) {
    setBusy(true);
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
      setBusy(false);
    }
  }

  // In case staff logged a decline by mistake, or the family changes their
  // mind later -- clears the decision back to "no answer yet" so the normal
  // proceed/decline choice reappears.
  async function handleUndoDecision(row) {
    setBusy(true);
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
      setBusy(false);
    }
  }

  // Founders' request: some way to flag the family's actual top choice
  // versus schools that are just backups. Only one "primary" is meant to
  // exist per family at a time -- setting a new one clears whichever school
  // held it before, in the same round trip.
  async function handleSetPriority(row, priority) {
    setBusy(true);
    setError("");
    try {
      const jobs = [];
      if (priority === "primary") {
        rows
          .filter((r) => r.id !== row.id && r.priority === "primary")
          .forEach((r) => jobs.push(updateShortlistTour(r.id, { priority: null })));
      }
      jobs.push(updateShortlistTour(row.id, { priority: priority || null }));
      const updates = await Promise.all(jobs);
      const byId = Object.fromEntries(updates.map((u) => [u.id, u]));
      setRows((prev) => prev.map((r) => (byId[r.id] ? { ...r, ...byId[r.id] } : r)));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const stats = useMemo(() => {
    const replied = rows.filter((r) => r.availability_status !== "awaiting").length;
    const toursBooked = rows.filter((r) => r.tour_date).length;
    const toured = rows.filter((r) => r.tour_status === "completed").length;
    const appliedSchools = new Set(
      allApplications.filter((a) => a.status !== "draft" && a.status !== "withdrawn").map((a) => a.school_id)
    );
    const earliestShortlisted = rows.reduce(
      (min, r) => (r.shortlisted_at && (!min || r.shortlisted_at < min) ? r.shortlisted_at : min),
      null
    );
    return {
      shortlisted: rows.length,
      replied,
      toursBooked,
      toured,
      applied: appliedSchools.size,
      daysSinceBrief: earliestShortlisted ? Math.abs(daysBetween(new Date().toISOString(), earliestShortlisted)) : null,
    };
  }, [rows, allApplications]);

  const tours = rows.filter((r) => r.tour_date);

  async function handleAdd(e) {
    e.preventDefault();
    if (!addingSchoolId) return;
    setBusy(true);
    setError("");
    try {
      await addToShortlist({ familyId, schoolId: addingSchoolId });
      setAddingSchoolId("");
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusChange(row, value) {
    setBusy(true);
    setError("");
    try {
      const updated = await updateShortlistEntry(row.id, { availability_status: value });
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleChildStatusChange(row, childId, value) {
    setBusy(true);
    setError("");
    try {
      const updated = await upsertChildAvailability(row.id, childId, value);
      setChildStatus((cs) => {
        const next = cs.filter((c) => !(c.shortlist_id === row.id && c.child_id === childId));
        return [...next, updated];
      });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(row) {
    setBusy(true);
    setError("");
    try {
      await removeFromShortlist(row.id);
      setRows((rs) => rs.filter((r) => r.id !== row.id));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function startTourEdit(row) {
    setTourDraftById((d) => ({
      ...d,
      [row.id]: {
        tour_date: row.tour_date || "",
        tour_start_time: row.tour_start_time || "",
        tour_end_time: row.tour_end_time || "",
        tour_status: row.tour_status || "offered",
        feedback_text: row.feedback_text || "",
      },
    }));
  }

  function cancelTourEdit(rowId) {
    setTourDraftById((d) => {
      const next = { ...d };
      delete next[rowId];
      return next;
    });
  }

  async function saveTour(row) {
    const draft = tourDraftById[row.id];
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const patch = {
        tour_date: draft.tour_date || null,
        tour_start_time: draft.tour_start_time || null,
        tour_end_time: draft.tour_end_time || null,
        tour_status: draft.tour_date ? draft.tour_status : null,
        feedback_text: draft.feedback_text || null,
        feedback_by: draft.feedback_text ? "staff" : null,
      };
      const updated = await updateShortlistTour(row.id, patch);
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
      cancelTourEdit(row.id);
      setSavedNoteId(row.id);
      setTimeout(() => setSavedNoteId((id) => (id === row.id ? null : id)), 2000);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // The family's primary choice floats to the top, a declined school
  // sinks to the bottom, everything else keeps its existing order in
  // between -- Array.sort is stable, so this only moves those two groups.
  const sortedRows = useMemo(() => {
    const rank = (row) => {
      if (row.family_decision === "declined") return 2;
      if (row.priority === "primary") return 0;
      return 1;
    };
    return [...rows].sort((a, b) => rank(a) - rank(b));
  }, [rows]);

  const shortlistedIds = new Set(rows.map((r) => r.school_id));
  const addableSchools = allSchools.filter((s) => !shortlistedIds.has(s.id));

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          School shortlist
          {rows.length > 0 && <span className="panel-count">{rows.length}</span>}
        </h2>
      </div>

      {rows.length > 0 && (
        <div className="svt-stats-row">
          <div className="svt-stat">
            <span className="svt-stat-value">{stats.shortlisted}</span>
            <span className="svt-stat-label">shortlisted</span>
          </div>
          <div className="svt-stat">
            <span className="svt-stat-value">{stats.replied}</span>
            <span className="svt-stat-label">replied</span>
          </div>
          <div className="svt-stat">
            <span className="svt-stat-value">{stats.toursBooked}</span>
            <span className="svt-stat-label">tours booked</span>
          </div>
          <div className="svt-stat">
            <span className="svt-stat-value">{stats.toured}</span>
            <span className="svt-stat-label">toured</span>
          </div>
          <div className="svt-stat">
            <span className="svt-stat-value">{stats.applied}</span>
            <span className="svt-stat-label">applied</span>
          </div>
          {stats.daysSinceBrief !== null && (
            <div className="svt-stat">
              <span className="svt-stat-value">{stats.daysSinceBrief}</span>
              <span className="svt-stat-label">days since brief</span>
            </div>
          )}
        </div>
      )}

      {error && <p className="panel-hint svt-error">{error}</p>}

      {loading ? (
        <p className="panel-hint">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="panel-hint">No schools shortlisted for this family yet.</p>
      ) : (
        <div className="svt-table">
          <div className="svt-head-row" style={{ gridTemplateColumns: svtColumns(children.length) }}>
            <span>School</span>
            {children.map((c, i) => (
              <span key={c.id}>{displayNameForChild(c, i)}{c.year_group_applying_for ? ` · ${c.year_group_applying_for}` : ""}</span>
            ))}
            <span>Tour</span>
            <span>Where it is up to</span>
            <span />
          </div>

          {sortedRows.map((row) => {
            const expanded = expandedId === row.id;
            const rowChildStatuses = childStatus.filter((cs) => cs.shortlist_id === row.id);
            const applicationsForSchool = allApplications.filter((a) => a.school_id === row.school_id);
            const stage = stageInfo(row, applicationsForSchool);
            const draft = tourDraftById[row.id];
            const feedbackRows = otherFeedback[row.school_id] || [];
            const process = admissionsProcessText(row.school || {});

            const declined = row.family_decision === "declined";

            return (
              <div key={row.id} className={"svt-row-wrap" + (declined ? " is-declined" : "")}>
                <div
                  className="svt-row"
                  style={{ gridTemplateColumns: svtColumns(children.length) }}
                  onClick={() => setExpandedId(expanded ? null : row.id)}
                >
                  <div className="svt-cell svt-cell-school">
                    <div className="svt-school-name">{row.school?.name || "Unknown school"}</div>
                    {row.school?.area && <div className="svt-school-area">{row.school.area}</div>}
                    <select
                      className={"svt-priority-select" + (row.priority ? " is-" + row.priority : "")}
                      value={row.priority || ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleSetPriority(row, e.target.value);
                      }}
                      disabled={busy}
                    >
                      <option value="">Not ranked</option>
                      <option value="primary">★ Primary choice</option>
                      <option value="secondary">Backup option</option>
                    </select>
                  </div>
                  {children.map((c) => {
                    const cs = rowChildStatuses.find((r) => r.child_id === c.id);
                    const value = cs?.availability_status || "awaiting";
                    return (
                      <div className="svt-cell" key={c.id}>
                        <span className={"svt-chip " + chipClass(value)}>{CHIP_LABEL[value]}</span>
                      </div>
                    );
                  })}
                  <div className="svt-cell">
                    {row.tour_date ? (
                      <span className="svt-tour-chip">
                        <span className="svt-dot is-ok" />
                        {formatDateTime(row.tour_date, row.tour_start_time)}
                      </span>
                    ) : (
                      <span className="svt-muted">—</span>
                    )}
                  </div>
                  <div className="svt-cell">
                    <div className="svt-stage-label">{stage.label}</div>
                    {stage.when && <div className="svt-stage-when">{stage.when}</div>}
                  </div>
                  <div className="svt-cell svt-cell-caret">
                    <span className={"svt-caret" + (expanded ? " is-open" : "")}>▾</span>
                  </div>
                </div>

                {expanded && (
                  <div className="svt-detail">
                    <div className="svt-detail-grid">
                      <div className="svt-detail-col">
                        <h3 className="svt-detail-heading">Admissions</h3>
                        <dl className="svt-kv">
                          {row.school?.admissions_contact_name && (
                            <>
                              <dt>Contact</dt>
                              <dd>{row.school.admissions_contact_name}</dd>
                            </>
                          )}
                          {row.school?.admissions_contact_email && (
                            <>
                              <dt>Email</dt>
                              <dd>{row.school.admissions_contact_email}</dd>
                            </>
                          )}
                          {row.school?.admissions_contact_phone && (
                            <>
                              <dt>Phone</dt>
                              <dd>{row.school.admissions_contact_phone}</dd>
                            </>
                          )}
                          {row.school?.address && (
                            <>
                              <dt>Address</dt>
                              <dd>{row.school.address}</dd>
                            </>
                          )}
                          {row.school?.website_url && (
                            <>
                              <dt>Website</dt>
                              <dd>
                                <a href={row.school.website_url} target="_blank" rel="noreferrer">
                                  {row.school.website_url}
                                </a>
                              </dd>
                            </>
                          )}
                        </dl>

                        <div className="svt-btn-row">
                          {row.school?.website_url && (
                            <a className="panel-btn" href={row.school.website_url} target="_blank" rel="noreferrer">
                              Website
                            </a>
                          )}
                          {row.school?.tour_booking_url && (
                            <a className="panel-btn" href={row.school.tour_booking_url} target="_blank" rel="noreferrer">
                              Book a tour
                            </a>
                          )}
                          {row.school?.application_url && (
                            <a className="panel-btn" href={row.school.application_url} target="_blank" rel="noreferrer">
                              Apply
                            </a>
                          )}
                          <Link className="panel-btn" to={`/staff/schools/${row.school_id}`}>
                            Full school record
                          </Link>
                        </div>

                        {process && (
                          <>
                            <h4 className="svt-sub-heading">Admissions process</h4>
                            <p className="svt-process-text">{process}</p>
                          </>
                        )}

                        <h4 className="svt-sub-heading">Overall status &amp; per-child availability</h4>
                        <div className="svt-availability-list">
                          <div className="svt-availability-row">
                            <span className="svt-availability-name">Overall</span>
                            <select
                              className="panel-select"
                              value={row.availability_status}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handleStatusChange(row, e.target.value)}
                              disabled={busy}
                            >
                              {AVAILABILITY_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          {children.map((c, i) => {
                            const cs = rowChildStatuses.find((r) => r.child_id === c.id);
                            const value = cs?.availability_status || "awaiting";
                            return (
                              <div className="svt-availability-row" key={c.id}>
                                <span className="svt-availability-name">{displayNameForChild(c, i)}</span>
                                <select
                                  className="panel-select"
                                  value={value}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => handleChildStatusChange(row, c.id, e.target.value)}
                                  disabled={busy}
                                >
                                  {AVAILABILITY_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          className="panel-btn panel-btn-quiet svt-remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(row);
                          }}
                          disabled={busy}
                        >
                          Remove from shortlist
                        </button>
                      </div>

                      <div className="svt-detail-col">
                        <h3 className="svt-detail-heading">On the day</h3>
                        {!draft ? (
                          <>
                            {row.tour_date ? (
                              <>
                                <p className="svt-on-the-day">
                                  {formatDateTime(row.tour_date, row.tour_start_time)}
                                  {row.tour_end_time ? ` – ${row.tour_end_time}` : ""}
                                  {row.tour_status && ` · ${TOUR_STATUS_LABEL[row.tour_status]}`}
                                </p>
                                <p className="svt-on-the-day">
                                  {[
                                    row.school?.default_tour_gate && `Gate: ${row.school.default_tour_gate}`,
                                    row.school?.default_tour_building && `Building: ${row.school.default_tour_building}`,
                                    row.school?.default_tour_parking && `Parking: ${row.school.default_tour_parking}`,
                                    row.school?.default_tour_ask_for && `Ask for: ${row.school.default_tour_ask_for}`,
                                    row.school?.default_tour_bring && `Bring: ${row.school.default_tour_bring}`,
                                  ]
                                    .filter(Boolean)
                                    .join(". ") || "No on-the-day details set on the school record yet."}
                                </p>
                              </>
                            ) : (
                              <p className="svt-muted">No tour booked yet.</p>
                            )}
                            <button
                              type="button"
                              className="panel-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                startTourEdit(row);
                              }}
                            >
                              {row.tour_date ? "Edit tour" : "Book a tour"}
                            </button>
                          </>
                        ) : (
                          <form
                            className="svt-tour-form"
                            onClick={(e) => e.stopPropagation()}
                            onSubmit={(e) => {
                              e.preventDefault();
                              saveTour(row);
                            }}
                          >
                            <div className="svt-tour-grid">
                              <label>
                                Date
                                <input
                                  type="date"
                                  className="panel-input"
                                  value={draft.tour_date}
                                  onChange={(e) => setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], tour_date: e.target.value } }))}
                                />
                              </label>
                              <label>
                                Status
                                <select
                                  className="panel-select"
                                  value={draft.tour_status}
                                  onChange={(e) => setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], tour_status: e.target.value } }))}
                                >
                                  {TOUR_STATUS_OPTIONS.map((s) => (
                                    <option key={s} value={s}>
                                      {TOUR_STATUS_LABEL[s]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Start time
                                <input
                                  type="time"
                                  className="panel-input"
                                  value={draft.tour_start_time}
                                  onChange={(e) => setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], tour_start_time: e.target.value } }))}
                                />
                              </label>
                              <label>
                                End time
                                <input
                                  type="time"
                                  className="panel-input"
                                  value={draft.tour_end_time}
                                  onChange={(e) => setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], tour_end_time: e.target.value } }))}
                                />
                              </label>
                              <div className="svt-tour-wide svt-tour-defaults">
                                <span className="svt-tour-defaults-label">
                                  On-the-day details (set on the school record)
                                </span>
                                <p className="svt-tour-defaults-value">
                                  {[
                                    row.school?.default_tour_gate && `Gate: ${row.school.default_tour_gate}`,
                                    row.school?.default_tour_building && `Building: ${row.school.default_tour_building}`,
                                    row.school?.default_tour_parking && `Parking: ${row.school.default_tour_parking}`,
                                    row.school?.default_tour_ask_for && `Ask for: ${row.school.default_tour_ask_for}`,
                                    row.school?.default_tour_bring && `Bring: ${row.school.default_tour_bring}`,
                                  ]
                                    .filter(Boolean)
                                    .join(". ") || "Not set yet — add these on the school's record."}
                                </p>
                              </div>
                            </div>
                            <div className="svt-tour-actions">
                              <button type="submit" className="panel-btn panel-btn-primary" disabled={busy}>
                                Save
                              </button>
                              <button
                                type="button"
                                className="panel-btn panel-btn-quiet"
                                onClick={() => cancelTourEdit(row.id)}
                                disabled={busy}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        )}

                        <h3 className="svt-detail-heading svt-feedback-heading">Feedback &amp; notes</h3>
                        <textarea
                          className="svt-feedback-input"
                          rows={3}
                          placeholder="How did the tour go? Anything worth noting for the family record."
                          value={draft ? draft.feedback_text : row.feedback_text || ""}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (draft) {
                              setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], feedback_text: e.target.value } }));
                            } else {
                              startTourEdit(row);
                              setTourDraftById((d) => ({
                                ...d,
                                [row.id]: { ...d[row.id], tour_date: row.tour_date || "", feedback_text: e.target.value },
                              }));
                            }
                          }}
                        />
                        <div className="svt-feedback-actions">
                          {draft && (
                            <button
                              type="button"
                              className="panel-btn panel-btn-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                saveTour(row);
                              }}
                              disabled={busy}
                            >
                              Save
                            </button>
                          )}
                          {savedNoteId === row.id && <span className="svt-saved-note">Saved</span>}
                        </div>

                        {row.tour_status === "completed" && (() => {
                          const stillNeeded = children.filter(
                            (c) => !applicationsForSchool.some((a) => a.child_id === c.id)
                          ).length;

                          if (row.family_decision === "declined") {
                            return (
                              <div className="svt-ready-to-apply svt-family-declined">
                                <p className="svt-family-declined-text">
                                  Family decided not to proceed with this school
                                  {row.family_decision_note ? `: "${row.family_decision_note}"` : "."}
                                </p>
                                <button
                                  type="button"
                                  className="panel-btn panel-btn-quiet"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUndoDecision(row);
                                  }}
                                  disabled={busy}
                                >
                                  Undo
                                </button>
                              </div>
                            );
                          }

                          return (
                            <div className="svt-ready-to-apply">
                              <button
                                type="button"
                                className="panel-btn panel-btn-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReadyToApply(row);
                                }}
                                disabled={busy}
                              >
                                {stillNeeded > 0 ? "Family wants to proceed → start application" : "View application →"}
                              </button>
                              {stillNeeded > 0 && (
                                <>
                                  <p className="svt-ready-to-apply-hint">
                                    Creates a draft application at this school for{" "}
                                    {stillNeeded > 1 ? "each child who doesn't have one yet" : "this child"}, and
                                    takes you to Applications.
                                  </p>
                                  {decliningId === row.id ? (
                                    <div className="svt-decline-form" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="text"
                                        className="panel-input svt-decline-input"
                                        placeholder="Reason (optional)"
                                        value={declineNote}
                                        onChange={(e) => setDeclineNote(e.target.value)}
                                      />
                                      <div className="svt-tour-actions">
                                        <button
                                          type="button"
                                          className="panel-btn panel-btn-quiet"
                                          onClick={() => handleDeclineFamily(row)}
                                          disabled={busy}
                                        >
                                          Confirm decline
                                        </button>
                                        <button
                                          type="button"
                                          className="panel-btn panel-btn-quiet"
                                          onClick={() => {
                                            setDecliningId(null);
                                            setDeclineNote("");
                                          }}
                                          disabled={busy}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="panel-btn panel-btn-quiet svt-decline-trigger"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDecliningId(row.id);
                                        setDeclineNote("");
                                      }}
                                      disabled={busy}
                                    >
                                      Family isn't proceeding
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })()}

                        {feedbackRows.length > 0 && (
                          <>
                            <h4 className="svt-sub-heading">Other families on this school</h4>
                            <div className="svt-other-feedback">
                              {feedbackRows.slice(0, 3).map((f) => (
                                <blockquote key={f.id} className="svt-other-feedback-item">
                                  <p>{f.feedback_text}</p>
                                  <cite>
                                    {f.familyName}
                                    {f.feedback_at ? `, ${formatDate(f.feedback_at)}` : ""}
                                  </cite>
                                </blockquote>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addableSchools.length > 0 && (
        <form className="panel-form" onSubmit={handleAdd}>
          <select
            className="panel-select panel-form-grow"
            value={addingSchoolId}
            onChange={(e) => setAddingSchoolId(e.target.value)}
            disabled={busy}
          >
            <option value="">Add a school to the shortlist…</option>
            {addableSchools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.area ? ` — ${s.area}` : ""}
              </option>
            ))}
          </select>
          <button type="submit" className="panel-btn panel-btn-primary" disabled={busy || !addingSchoolId}>
            Add
          </button>
        </form>
      )}

      {tours.length > 0 && (
        <div className="svt-schedule">
          <h3 className="svt-sub-heading">Tour schedule</h3>
          <ul className="svt-schedule-list">
            {[...tours]
              .sort((a, b) => (a.tour_date + (a.tour_start_time || "")).localeCompare(b.tour_date + (b.tour_start_time || "")))
              .map((row) => (
                <li key={row.id} className="svt-schedule-row">
                  <span className="svt-schedule-when">{formatDateTime(row.tour_date, row.tour_start_time)}</span>
                  <span className="svt-schedule-school">{row.school?.name}</span>
                  {row.tour_status && <span className="svt-tour-chip-inline">{TOUR_STATUS_LABEL[row.tour_status]}</span>}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function svtColumns(childCount) {
  return `minmax(150px,2fr) repeat(${childCount || 0}, minmax(80px,1fr)) minmax(120px,1fr) minmax(150px,1.3fr) 24px`;
}
