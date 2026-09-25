import { useEffect, useMemo, useState } from "react";
import UpdateFamilyButton from "./UpdateFamilyButton";
import TourDetailsEditor from "./TourDetailsEditor";
import { Link } from "react-router-dom";
import {
  listShortlistForFamily,
  listSchools,
  addToShortlist,
  removeFromShortlist,
  listChildAvailabilityForShortlistIds,
  upsertChildAvailability,
  updateShortlistTour,
  listOtherFeedbackForSchools,
  createApplication,
  friendlyError,
  autoCompletePastTours,
  listShortlistNotes,
  saveShortlistNote,
  listPlacements,
  listSchoolContacts,
} from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import { placedByChild, placedHere, shortDate, childClosedReason, rowClosedReason, CLOSED_TEXT } from "../lib/placement";
import "./panels.css";
import AutosaveField from "./Autosave";
import "./SchoolShortlistPanel.css";

const AVAILABILITY_OPTIONS = [
  { value: "awaiting", label: "Awaiting reply" },
  { value: "yes", label: "Yes, place available" },
  { value: "some_year_groups", label: "Some year groups only" },
  { value: "waitlist", label: "Waitlist" },
  { value: "no", label: "No, full" },
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
const TOUR_STATUS_LABEL = { offered: "Booked", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled" };

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

// Full "Monday, 9 September 2026" style date, with a relative marker for
// tour dates specifically -- founder feedback (Sept 2026): used on the
// Tour schedule list under the table (not in the table's tour columns).
function formatTourDate(dateStr, timeStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  let out = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (timeStr) {
    const [h, m] = timeStr.split(":");
    const hour = Number(h);
    const suffix = hour >= 12 ? "pm" : "am";
    const hour12 = ((hour + 11) % 12) + 1;
    out += `, ${hour12}${m && m !== "00" ? ":" + m : ""}${suffix}`;
  }
  const days = daysBetween(new Date().toISOString().slice(0, 10), dateStr);
  if (days === 0) out += " (today)";
  else if (days === 1) out += " (tomorrow)";
  else if (days === -1) out += " (yesterday)";
  else if (days > 1) out += ` (in ${days} days)`;
  else if (days < -1) out += ` (${Math.abs(days)} days ago)`;
  return out;
}

function relativeToNow(iso, futureLabel) {
  if (!iso) return "";
  const days = daysBetween(new Date().toISOString(), iso);
  if (days === 0) return "today";
  if (days > 0) return `${futureLabel || "in"} ${days} day${days === 1 ? "" : "s"}`;
  const ago = Math.abs(days);
  return `${ago} day${ago === 1 ? "" : "s"} ago`;
}

// Internal notes for one shortlisted school -- somewhere to paste what a
// school's admissions team emailed back about availability. Separate from
// the Feedback box (which is about how the tour went). Saves by itself (see
// Autosave.jsx). Stored in shortlist_notes (staff-only, addendum 63), not on
// the shortlist row, because families can read that row.
function ShortlistNotes({ shortlistId, initial, onSaved }) {
  return (
    <div className="svt-notes">
      <AutosaveField
        label="Notes"
        multiline
        rows={8}
        placeholder="Internal notes, e.g. paste the school's email about availability. The family can't see this."
        value={initial}
        onSave={async (v) => {
          await saveShortlistNote(shortlistId, v || "");
          onSaved?.(shortlistId, v || "");
        }}
      />
    </div>
  );
}

function admissionsProcessText(school) {
  return (
    [
      school.requires_cat4 && "CAT4",
      school.requires_map && "MAP",
      school.requires_interview && "Interview",
      school.requires_taster_day && "Taster day",
      school.application_fee != null && `Application fee: ${school.fee_currency || "AED"} ${school.application_fee}`,
      school.deposit_amount != null && `Deposit: ${school.fee_currency || "AED"} ${school.deposit_amount}`,
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
export default function SchoolShortlistPanel({
  familyId,
  familyChildren,
  applicationsByChild,
  onFamilyRefresh,
  onGoToApplications,
  onProgressChange,
  focusSchoolId,
}) {
  const [rows, setRows] = useState([]);
  const [childStatus, setChildStatus] = useState([]);
  const [otherFeedback, setOtherFeedback] = useState({});
  const [notesById, setNotesById] = useState({});
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
  // Founder feedback (Sept 2026, Heather via WhatsApp): "I want to remove
  // a school from a shortlist... I cant get past this screen" -- that
  // screen was the browser's own native window.confirm() popup, which can
  // silently stop responding in some setups (repeated dialogs get an
  // auto-suppress option some browsers tick on their own). Replaced with
  // an ordinary in-page confirm step, same as the Decline flow already
  // uses elsewhere on this panel, so there's no separate browser dialog to
  // get stuck on at all.
  const [removingId, setRemovingId] = useState(null);
  const [placements, setPlacements] = useState([]);
  const [contactsBySchool, setContactsBySchool] = useState({});

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
      const [cs, other, notes, placementRows, contacts] = await Promise.all([
        listChildAvailabilityForShortlistIds(shortlistIds),
        listOtherFeedbackForSchools(schoolIds, familyId),
        // Notes failing to load (e.g. addendum 63 not run yet) shouldn't
        // take the whole shortlist down with it.
        listShortlistNotes(shortlistIds).catch(() => ({})),
        listPlacements(familyId).catch(() => []),
        listSchoolContacts(schoolIds).catch(() => null),
      ]);
      setChildStatus(cs);
      setOtherFeedback(other);
      setNotesById(notes);
      setPlacements(placementRows || []);
      const bySchool = {};
      (contacts || []).filter((c) => !c.archived_at).forEach((c) => (bySchool[c.school_id] = bySchool[c.school_id] || []).push(c));
      setContactsBySchool(bySchool);
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

  // Coming back from an application ("← School visit") opens that school's row.
  useEffect(() => {
    if (!focusSchoolId || !rows.length) return;
    const row = rows.find((r) => String(r.school_id) === String(focusSchoolId));
    if (row) setExpandedId(row.id);
  }, [focusSchoolId, rows.length]);

  const allApplications = useMemo(() => Object.values(applicationsByChild || {}).flat(), [applicationsByChild]);

  // Founders (25 Sept 2026): once children are placed, the other schools
  // close. A row is per family, so it only closes when every child is placed
  // (see lib/placement.js); until then just that child's column says so.
  const placed = useMemo(
    () => placedByChild({ children, applicationsByChild: applicationsByChild || {}, placements, schools: allSchools }),
    [children, applicationsByChild, placements, allSchools]
  );
  // Closed = every child placed elsewhere, or declined / withdrawn here.
  const closedReason = (row) => rowClosedReason(placed, children, row.school_id, row.school?.name, allApplications);
  const isRowClosed = (row) => !!closedReason(row);
  const placedKids = Object.entries(placed);

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
      onGoToApplications?.(row.school_id);
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
    // Both tour slots count -- a school with a primary AND a secondary tour
    // is two tours booked.
    const toursBooked = rows.reduce((n, r) => n + (r.tour_date ? 1 : 0) + (r.tour2_date ? 1 : 0), 0);
    const toured = rows.filter((r) => r.tour_status === "completed" || r.tour2_status === "completed").length;
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

  // One entry per booked tour slot, so a school with both a primary and a
  // secondary tour shows both in the Tour schedule underneath.
  const tours = rows.filter((r) => !isRowClosed(r)).flatMap((r) =>
    [
      r.tour_date && {
        id: r.id + "-primary",
        kind: "Primary tour",
        school: r.school,
        date: r.tour_date,
        start: r.tour_start_time,
        status: r.tour_status,
      },
      r.tour2_date && {
        id: r.id + "-secondary",
        kind: "Secondary tour",
        school: r.school,
        date: r.tour2_date,
        start: r.tour2_start_time,
        status: r.tour2_status,
      },
    ].filter(Boolean)
  );

  async function handleAdd(e) {
    e.preventDefault();
    if (!addingSchoolId) return;
    setBusy(true);
    setError("");
    try {
      await addToShortlist({ familyId, schoolId: addingSchoolId });
      setAddingSchoolId("");
      await load();
      onProgressChange?.();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // Row-level availability_status (the old "Overall" field) is still set
  // and used for the replied/days-since-brief stats -- it's just no longer
  // hand-edited from here, per-child names are what staff actually look at
  // on a family's own page. It's still editable from the school's own
  // record (SchoolDetailPage.jsx's per-family availability dropdown).
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

  // Founder feedback (Sept 2026): "if I remove a school from a shortlist -
  // where does it go? It seems to disappear" -- it disappears because this
  // is a real, permanent delete with no undo, and there was no confirmation
  // step to warn anyone before it ran. This is meant for "added by
  // mistake", not for a family dropping a school they've actually
  // considered -- that case should use Decline instead, which keeps the
  // school visible (greyed out, sorted last) rather than erasing it.
  //
  // The confirmation step itself used to be a native window.confirm() --
  // see the removingId state above for why that got replaced with an
  // in-page step instead.
  async function handleRemove(row) {
    setRemovingId(null);
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

  // `section` says which of the always-visible columns triggered this --
  // "primary" or "secondary" opens just that tour's edit form, null (typing
  // straight into the Feedback column) opens neither. Founder feedback
  // (Sept 2026): "i clicked edit on the primary tour column, and secondary
  // tour also opened up" -- both used to share one `draft` object with no
  // way to tell which column asked for it, so every column checked the
  // same truthy `draft` and all three edit UIs appeared at once. The two
  // tour date/status/time fields still live in one shared draft (Save
  // still writes both together, same as before), only which form is drawn
  // is now scoped to the column that was actually clicked.
  function startTourEdit(row, section) {
    setTourDraftById((d) => ({
      ...d,
      [row.id]: {
        editSection: section || null,
        tour_date: row.tour_date || "",
        tour_start_time: row.tour_start_time || "",
        tour_end_time: row.tour_end_time || "",
        tour_status: row.tour_status || "offered",
        // Addendum 59 -- why a tour was cancelled, entered alongside the
        // Cancelled status itself rather than buried in the separate
        // Feedback box.
        tour_cancelled_reason: row.tour_cancelled_reason || "",
        // Addendum 58 -- an independent second slot ("Secondary tour"),
        // for a school that does an initial visit and a separate
        // follow-up/assessment visit. Left blank unless a second tour is
        // actually booked -- most schools only ever use the first slot.
        tour2_date: row.tour2_date || "",
        tour2_start_time: row.tour2_start_time || "",
        tour2_end_time: row.tour2_end_time || "",
        tour2_status: row.tour2_status || "offered",
        tour2_cancelled_reason: row.tour2_cancelled_reason || "",
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
        tour_cancelled_reason: draft.tour_date && draft.tour_status === "cancelled" ? draft.tour_cancelled_reason || null : null,
        tour2_date: draft.tour2_date || null,
        tour2_start_time: draft.tour2_start_time || null,
        tour2_end_time: draft.tour2_end_time || null,
        tour2_status: draft.tour2_date ? draft.tour2_status : null,
        tour2_cancelled_reason: draft.tour2_date && draft.tour2_status === "cancelled" ? draft.tour2_cancelled_reason || null : null,
        feedback_text: draft.feedback_text || null,
        feedback_by: draft.feedback_text ? "staff" : null,
      };
      const updated = await updateShortlistTour(row.id, patch);
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
      onProgressChange?.();
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
      if (rowClosedReason(placed, children, row.school_id, row.school?.name, allApplications)) return 5;
      if (placedHere(placed, children, row.school_id, row.school?.name).length) return -1;
      if (row.family_decision === "declined") return 3;
      if (row.priority === "primary") return 0;
      if (row.priority === "secondary") return 1;
      return 2;
    };
    return [...rows].sort((a, b) => rank(a) - rank(b));
  }, [rows, placed, children, allApplications]);

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

      {placedKids.length > 0 && (
        <div className="svt-placed-banner">
          <span aria-hidden="true">🎓</span>
          <span>
            {placedKids.map(([childId, p], i) => {
              const idx = children.findIndex((c) => c.id === childId);
              return (
                <span key={childId}>
                  {i > 0 && " · "}
                  <strong>{idx === -1 ? "Child" : displayNameForChild(children[idx], idx)}</strong> placed at {p.schoolName}
                  {p.startDate ? ` (starts ${shortDate(p.startDate)})` : ""}
                </span>
              );
            })}
            <span className="svt-placed-banner-sub">
              {placedKids.length >= children.length
                ? "Every child is placed, so the other schools are closed and kept at the bottom for reference."
                : "Schools stay open until every child is placed. Placed children show as placed in their column."}
            </span>
          </span>
        </div>
      )}

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
            <span>Primary tour</span>
            <span>Secondary tour</span>
            <span>Feedback</span>
            <span>Proceed?</span>
            <span />
          </div>

          {sortedRows.map((row) => {
            const expanded = expandedId === row.id;
            const rowChildStatuses = childStatus.filter((cs) => cs.shortlist_id === row.id);
            const applicationsForSchool = allApplications.filter((a) => a.school_id === row.school_id);
            const draft = tourDraftById[row.id];
            const feedbackRows = otherFeedback[row.school_id] || [];
            const process = admissionsProcessText(row.school || {});
            const declined = row.family_decision === "declined";
            const closed = isRowClosed(row);
            const kidsPlacedHere = placedHere(placed, children, row.school_id, row.school?.name);
            if (closed) {
              return (
                <ClosedRow
                  key={row.id}
                  reason={closedReason(row)}
                  apps={allApplications}
                  row={row}
                  children={children}
                  placed={placed}
                  expanded={expanded}
                  onToggle={() => setExpandedId(expanded ? null : row.id)}
                  contacts={contactsBySchool[row.school_id]}
                  note={notesById[row.id] || ""}
                />
              );
            }
            // Founder feedback (Sept 2026): "seperate columsn for primary
            // tour and secondary tour... and then last column can just be
            // proceed to application or not proceed" -- Proceed used to be
            // gated on the primary tour alone; now either slot completing
            // is enough to surface the decision, since some schools only
            // ever run their "real" tour as the secondary/assessment visit.
            // 21 Sept 2026 (Heather): a visit is NOT a required step before
            // applying, so Proceed / Decline below no longer waits for a
            // tour to be completed -- the gate this used to feed is gone.

            return (
              <div
                key={row.id}
                className={"svt-row-wrap" + (declined ? " is-declined" : "") + (kidsPlacedHere.length ? " is-placed" : "")}
              >
                <div
                  className="svt-row"
                  style={{ gridTemplateColumns: svtColumns(children.length) }}
                  onClick={() => setExpandedId(expanded ? null : row.id)}
                >
                  <div className="svt-cell svt-cell-school">
                    <div className="svt-school-name">{row.school?.name || "Unknown school"}</div>
                    {row.school?.area && <div className="svt-school-area">{row.school.area}</div>}
                    {kidsPlacedHere.length > 0 && (
                      <div className="svt-placed-tag">
                        🎓 Placed:{" "}
                        {kidsPlacedHere.map((c) => displayNameForChild(c, children.indexOf(c))).join(", ")}
                      </div>
                    )}
                    {/* Addendum 75: what the family said on their own "Your schools" page. */}
                    {row.family_interest && (
                      <div
                        className={"svt-family-view is-" + row.family_interest}
                        title={row.family_interest_note || "Set by the family"}
                      >
                        Family: {{ keen: "Keen", maybe: "Maybe", not_for_us: "Not for us" }[row.family_interest]}
                        {row.family_interest_note ? " · “" + row.family_interest_note + "”" : ""}
                      </div>
                    )}
                    <div className="svt-priority-toggle" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={"svt-priority-btn" + (row.priority === "primary" ? " is-primary" : "")}
                        onClick={() => handleSetPriority(row, row.priority === "primary" ? "" : "primary")}
                        disabled={busy}
                        title="Primary choice"
                      >
                        ★ Primary
                      </button>
                      <button
                        type="button"
                        className={"svt-priority-btn" + (row.priority === "secondary" ? " is-secondary" : "")}
                        onClick={() => handleSetPriority(row, row.priority === "secondary" ? "" : "secondary")}
                        disabled={busy}
                        title="Backup option"
                      >
                        Backup
                      </button>
                    </div>
                  </div>
                  {children.map((c) => {
                    const cs = rowChildStatuses.find((r) => r.child_id === c.id);
                    const value = cs?.availability_status || "awaiting";
                    const why = childClosedReason(placed, c.id, row.school_id, row.school?.name, allApplications);
                    if (placed[c.id] || why) {
                      const here = placed[c.id] && !why;
                      return (
                        <div className="svt-cell" key={c.id}>
                          <span
                            className={"svt-child-placed" + (here ? " is-here" : " is-elsewhere")}
                            title={why === "placed" ? `Placed at ${placed[c.id].schoolName}` : undefined}
                          >
                            {here ? "Placed ✓" : why === "placed" ? "Placed elsewhere" : why === "declined" ? "Declined" : "Withdrawn"}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div className="svt-cell" key={c.id}>
                        {/* Founder feedback (Sept 2026): "instead of having
                            [to open] the box and then select options there"
                            -- this used to be a read-only chip; changing it
                            meant expanding the row and finding the same
                            field again in the Availability section below.
                            Same select, same handler, just reachable
                            directly from the column the reference mockup
                            already puts it in. */}
                        <select
                          className={"svt-chip-select " + chipClass(value)}
                          value={value}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleChildStatusChange(row, c.id, e.target.value)}
                          disabled={busy}
                        >
                          {AVAILABILITY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {CHIP_LABEL[o.value] || o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}

                  {/* Primary tour column. Founder feedback (Sept 2026):
                      "seperate columsn for primary tour and secondary
                      tour" -- both used to be edited together inside the
                      expanded "On the day" panel; now each has its own
                      always-visible column, editable in place without
                      opening the row at all. Editing either slot opens the
                      same shared draft (tourDraftById), so Save writes
                      both tours (and feedback) together, same as before. */}
                  <div className="svt-cell svt-cell-tour" onClick={(e) => e.stopPropagation()}>
                    {draft && draft.editSection === "primary" ? (
                      <div className="svt-col-tour-edit">
                        <label className="svt-col-field">
                          <span>Date</span>
                          <input
                            type="date"
                            className="panel-input"
                            value={draft.tour_date}
                            onChange={(e) => setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], tour_date: e.target.value } }))}
                          />
                        </label>
                        <label className="svt-col-field">
                          <span>Status</span>
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
                        {draft.tour_status === "cancelled" && (
                          // Founder feedback (Sept 2026, Heather via
                          // WhatsApp): "I also need to cancel the Brighton
                          // tour and record why on their profile" --
                          // cancelling used to have nowhere to put a
                          // reason; this only appears once Cancelled is
                          // picked, and is saved right alongside it.
                          <label className="svt-col-field">
                            <span>Reason for cancelling</span>
                            <input
                              type="text"
                              className="panel-input"
                              placeholder="Why was it cancelled?"
                              value={draft.tour_cancelled_reason}
                              onChange={(e) =>
                                setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], tour_cancelled_reason: e.target.value } }))
                              }
                            />
                          </label>
                        )}
                        <div className="svt-col-field-row">
                          <label className="svt-col-field">
                            <span>Start</span>
                            <input
                              type="time"
                              className="panel-input"
                              value={draft.tour_start_time}
                              onChange={(e) => setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], tour_start_time: e.target.value } }))}
                            />
                          </label>
                          <label className="svt-col-field">
                            <span>End</span>
                            <input
                              type="time"
                              className="panel-input"
                              value={draft.tour_end_time}
                              onChange={(e) => setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], tour_end_time: e.target.value } }))}
                            />
                          </label>
                        </div>
                        <div className="svt-col-actions">
                          <button type="button" className="panel-btn panel-btn-primary svt-col-btn" onClick={() => saveTour(row)} disabled={busy}>
                            Save
                          </button>
                          <button type="button" className="panel-btn panel-btn-quiet svt-col-btn" onClick={() => cancelTourEdit(row.id)} disabled={busy}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {row.tour_date ? (
                          <span className="svt-tour-chip">
                            <span className="svt-dot is-ok" />
                            {formatDateTime(row.tour_date, row.tour_start_time)}
                          </span>
                        ) : (
                          <span className="svt-muted">Not booked</span>
                        )}
                        {row.tour_status && (
                          <span className={"svt-tour-status-badge is-" + row.tour_status}>{TOUR_STATUS_LABEL[row.tour_status]}</span>
                        )}
                        {row.tour_status === "cancelled" && row.tour_cancelled_reason && (
                          <span className="svt-cancel-reason">"{row.tour_cancelled_reason}"</span>
                        )}
                        <button type="button" className="panel-btn panel-btn-quiet svt-col-edit-btn" onClick={() => startTourEdit(row, "primary")}>
                          {row.tour_date ? "Edit" : "Book"}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Secondary tour column -- same shared draft as the
                      primary tour column above, just editing the tour2_*
                      fields. */}
                  <div className="svt-cell svt-cell-tour" onClick={(e) => e.stopPropagation()}>
                    {draft && draft.editSection === "secondary" ? (
                      <div className="svt-col-tour-edit">
                        <label className="svt-col-field">
                          <span>Date</span>
                          <input
                            type="date"
                            className="panel-input"
                            value={draft.tour2_date}
                            onChange={(e) => setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], tour2_date: e.target.value } }))}
                          />
                        </label>
                        <label className="svt-col-field">
                          <span>Status</span>
                          <select
                            className="panel-select"
                            value={draft.tour2_status}
                            onChange={(e) => setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], tour2_status: e.target.value } }))}
                          >
                            {TOUR_STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {TOUR_STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        </label>
                        {draft.tour2_status === "cancelled" && (
                          <label className="svt-col-field">
                            <span>Reason for cancelling</span>
                            <input
                              type="text"
                              className="panel-input"
                              placeholder="Why was it cancelled?"
                              value={draft.tour2_cancelled_reason}
                              onChange={(e) =>
                                setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], tour2_cancelled_reason: e.target.value } }))
                              }
                            />
                          </label>
                        )}
                        <div className="svt-col-field-row">
                          <label className="svt-col-field">
                            <span>Start</span>
                            <input
                              type="time"
                              className="panel-input"
                              value={draft.tour2_start_time}
                              onChange={(e) => setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], tour2_start_time: e.target.value } }))}
                            />
                          </label>
                          <label className="svt-col-field">
                            <span>End</span>
                            <input
                              type="time"
                              className="panel-input"
                              value={draft.tour2_end_time}
                              onChange={(e) => setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], tour2_end_time: e.target.value } }))}
                            />
                          </label>
                        </div>
                        <div className="svt-col-actions">
                          <button type="button" className="panel-btn panel-btn-primary svt-col-btn" onClick={() => saveTour(row)} disabled={busy}>
                            Save
                          </button>
                          <button type="button" className="panel-btn panel-btn-quiet svt-col-btn" onClick={() => cancelTourEdit(row.id)} disabled={busy}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {row.tour2_date ? (
                          <span className="svt-tour-chip">
                            <span className="svt-dot is-ok" />
                            {formatDateTime(row.tour2_date, row.tour2_start_time)}
                          </span>
                        ) : (
                          <span className="svt-muted">Not booked</span>
                        )}
                        {row.tour2_status && (
                          <span className={"svt-tour-status-badge is-" + row.tour2_status}>{TOUR_STATUS_LABEL[row.tour2_status]}</span>
                        )}
                        {row.tour2_status === "cancelled" && row.tour2_cancelled_reason && (
                          <span className="svt-cancel-reason">"{row.tour2_cancelled_reason}"</span>
                        )}
                        <button type="button" className="panel-btn panel-btn-quiet svt-col-edit-btn" onClick={() => startTourEdit(row, "secondary")}>
                          {row.tour2_date ? "Edit" : "Add"}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Feedback column -- typing here creates the same
                      shared draft as the tour columns (unchanged behaviour
                      from the old "Feedback & notes" box), it just lives
                      in the table now instead of the expanded panel. */}
                  <div className="svt-cell svt-cell-feedback" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      className="svt-col-feedback-input"
                      rows={2}
                      placeholder="How did it go?"
                      value={draft ? draft.feedback_text : row.feedback_text || ""}
                      onChange={(e) => {
                        if (draft) {
                          setTourDraftById((d) => ({ ...d, [row.id]: { ...d[row.id], feedback_text: e.target.value } }));
                        } else {
                          startTourEdit(row, null);
                          setTourDraftById((d) => ({
                            ...d,
                            [row.id]: { ...d[row.id], tour_date: row.tour_date || "", feedback_text: e.target.value },
                          }));
                        }
                      }}
                    />
                    <div className="svt-col-actions">
                      {draft && (
                        <button type="button" className="panel-btn panel-btn-primary svt-col-btn" onClick={() => saveTour(row)} disabled={busy}>
                          Save
                        </button>
                      )}
                      {savedNoteId === row.id && <span className="svt-saved-note">Saved</span>}
                    </div>
                  </div>

                  {/* Proceed column -- founder feedback (Sept 2026):
                      "we can just do with a green tick or cross option" --
                      replaced the two text buttons with a tick/cross pair;
                      same handleReadyToApply/handleDeclineFamily/
                      handleUndoDecision logic underneath, gated on either
                      tour now being completed rather than just the
                      primary one. */}
                  <div className="svt-cell svt-cell-proceed" onClick={(e) => e.stopPropagation()}>
                    {declined ? (
                      <div className="svt-proceed-declined">
                        <span className="svt-decision-icon is-no" title="Not proceeding">
                          ✕
                        </span>
                        <span className="svt-family-declined-text">
                          {row.family_decision_note ? `"${row.family_decision_note}"` : "Not proceeding"}
                        </span>
                        <button type="button" className="panel-btn panel-btn-quiet svt-col-btn" onClick={() => handleUndoDecision(row)} disabled={busy}>
                          Undo
                        </button>
                      </div>
                    ) : row.family_decision === "proceeding" ? (
                      <div className="svt-proceed-actions">
                        <span className="svt-decision-icon is-yes" title="Proceeding">
                          ✓
                        </span>
                        <button
                          type="button"
                          className="panel-btn panel-btn-quiet svt-col-edit-btn"
                          onClick={() => handleReadyToApply(row)}
                          disabled={busy}
                        >
                          View application →
                        </button>
                      </div>
                    ) : decliningId === row.id ? (
                      <div className="svt-decline-form">
                        <input
                          type="text"
                          className="panel-input svt-decline-input"
                          placeholder="Reason (optional)"
                          value={declineNote}
                          onChange={(e) => setDeclineNote(e.target.value)}
                        />
                        <div className="svt-col-actions">
                          <button type="button" className="panel-btn panel-btn-quiet svt-col-btn" onClick={() => handleDeclineFamily(row)} disabled={busy}>
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="panel-btn panel-btn-quiet svt-col-btn"
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
                      <div className="svt-decision-toggle">
                        {/* Founder feedback (Sept 2026, Heather via
                            WhatsApp): "I cant see how to proceed from
                            visit to application" -- the tick/cross were
                            icon-only, with just a hover title for context,
                            so the actual click target wasn't obvious at a
                            glance. Same buttons, now labelled. */}
                        <button
                          type="button"
                          className="svt-decision-btn is-yes"
                          onClick={() => handleReadyToApply(row)}
                          disabled={busy}
                          title="Proceed to application"
                        >
                          <span className="svt-decision-icon-inline">✓</span>
                          <span className="svt-decision-btn-label">Proceed</span>
                        </button>
                        <button
                          type="button"
                          className="svt-decision-btn is-no"
                          onClick={() => {
                            setDecliningId(row.id);
                            setDeclineNote("");
                          }}
                          disabled={busy}
                          title="Not proceeding"
                        >
                          <span className="svt-decision-icon-inline">✕</span>
                          <span className="svt-decision-btn-label">Decline</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="svt-cell svt-cell-caret">
                    {/* Founder feedback (Sept 2026): a note left in
                        Admissions used to be invisible until the row was
                        opened -- this small dot shows on the collapsed bar
                        whenever there's a note inside, so consultants know
                        to check without opening every row. */}
                    {(notesById[row.id] || "").trim() && (
                      <span className="svt-note-flag" title="Has a note">📝</span>
                    )}
                    <span className={"svt-caret" + (expanded ? " is-open" : "")}>▾</span>
                  </div>
                </div>

                {expanded && (
                  <div className="svt-detail">
                    <UpdateFamilyButton
                      familyId={familyId}
                      schoolId={row.school_id}
                      suggested={
                        row.tour_status === "completed" || row.tour2_status === "completed" ? "toured" : "shortlisted"
                      }
                    />
                    <TourDetailsEditor
                      row={row}
                      onUpdated={(updated) => setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...updated, school: r.school } : r)))}
                    />
                    {/* Founder feedback (Sept 2026): "when they click on
                        the dropdown, it should only show the details
                        under admissions" -- the tour form, feedback box
                        and proceed/decline controls that used to live in
                        a second "On the day" column here have all moved
                        up into the always-visible table columns above, so
                        this is Admissions and only Admissions now. */}
                    <div className="svt-detail-single">
                      <div className="svt-detail-main">
                      <h3 className="svt-detail-heading">Admissions</h3>
                      <dl className="svt-kv">
                        <SchoolContactsInline school={row.school} contacts={contactsBySchool[row.school_id]} />
                        {row.school?.address && (
                          <>
                            <dt>Address</dt>
                            <dd>{row.school.address}</dd>
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

                      {/* Founder feedback (Sept 2026, Heather via
                          WhatsApp): "even tho she says she wants it
                          removed from shortlist, it shouldnt entirely go
                          from that list once added, it could grey out and
                          fall at the bottom of the list. she should be
                          able to add reason as to why the family wanted
                          it removed." -- "Remove from shortlist" used to
                          mean a real, permanent delete every time it was
                          reached for, even for an ordinary "this school
                          doesn't work for the family" case (like a school
                          that can't take all the children). This is now
                          the same soft Decline used by the Proceed
                          column -- greyed out, sorted last, with a reason
                          -- and doesn't require a tour to have happened
                          first, since a school can turn out unsuitable at
                          any stage. A genuine mistaken add can still be
                          deleted outright, tucked under its own explicit
                          second step so it's not the default reach. */}
                      {!declined &&
                        (decliningId === row.id ? (
                          <div className="svt-remove-confirm" onClick={(e) => e.stopPropagation()}>
                            <p className="svt-remove-confirm-text">
                              Mark {row.school?.name || "this school"} as not being pursued. It stays on the list,
                              greyed out at the bottom, so there's still a record.
                            </p>
                            <input
                              type="text"
                              className="panel-input svt-decline-input"
                              placeholder="Reason (e.g. couldn't accommodate all children)"
                              value={declineNote}
                              onChange={(e) => setDeclineNote(e.target.value)}
                            />
                            <div className="svt-col-actions">
                              <button
                                type="button"
                                className="panel-btn panel-btn-primary svt-col-btn"
                                onClick={() => handleDeclineFamily(row)}
                                disabled={busy}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                className="panel-btn panel-btn-quiet svt-col-btn"
                                onClick={() => {
                                  setDecliningId(null);
                                  setDeclineNote("");
                                }}
                                disabled={busy}
                              >
                                Cancel
                              </button>
                            </div>

                            {removingId === row.id ? (
                              <div className="svt-remove-confirm svt-remove-confirm-nested">
                                <p className="svt-remove-confirm-text">
                                  This permanently deletes it from the shortlist instead -- no record, no undo. Only for
                                  a school that was added by mistake.
                                </p>
                                <div className="svt-col-actions">
                                  <button
                                    type="button"
                                    className="panel-btn panel-btn-quiet svt-col-btn"
                                    onClick={() => handleRemove(row)}
                                    disabled={busy}
                                  >
                                    Yes, delete permanently
                                  </button>
                                  <button
                                    type="button"
                                    className="panel-btn panel-btn-quiet svt-col-btn"
                                    onClick={() => setRemovingId(null)}
                                    disabled={busy}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="panel-btn panel-btn-quiet svt-remove-mistake-link"
                                onClick={() => setRemovingId(row.id)}
                                disabled={busy}
                              >
                                Added by mistake? Delete permanently instead
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="panel-btn panel-btn-quiet svt-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDecliningId(row.id);
                              setDeclineNote("");
                            }}
                            disabled={busy}
                          >
                            Not pursuing this school
                          </button>
                        ))}
                      </div>
                      <ShortlistNotes
                        shortlistId={row.id}
                        initial={notesById[row.id] || ""}
                        onSaved={(id, body) => setNotesById((m) => ({ ...m, [id]: body }))}
                      />
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
                {s.area ? `, ${s.area}` : ""}
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
              .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")))
              .map((t) => (
                <li key={t.id} className="svt-schedule-row">
                  <span className="svt-schedule-when">{formatTourDate(t.date, t.start)}</span>
                  <span className="svt-schedule-school">{t.school?.name}</span>
                  <span className="svt-tour-chip-inline">{t.kind}</span>
                  {t.status && <span className="svt-tour-chip-inline">{TOUR_STATUS_LABEL[t.status]}</span>}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function svtColumns(childCount) {
  // School | one column per child | Primary tour | Secondary tour |
  // Feedback | Proceed? | caret -- widened from the old Tour/"Where
  // it is up to" pair per founder feedback (Sept 2026) asking for the
  // tour slots, feedback and proceed decision to each get their own
  // always-visible column instead of being buried in the expanded row.
  return `minmax(150px,2fr) repeat(${childCount || 0}, minmax(80px,1fr)) minmax(150px,1.3fr) minmax(150px,1.3fr) minmax(160px,1.4fr) minmax(150px,1.3fr) 24px`;
}

// Every current contact at the school, each with their job title
// (addendum 80). Falls back to the single contact on the school row if the
// contacts list isn't set up yet.
function SchoolContactsInline({ school, contacts }) {
  const list =
    contacts && contacts.length
      ? contacts
      : school?.admissions_contact_name || school?.admissions_contact_email || school?.admissions_contact_phone
      ? [
          {
            id: "legacy",
            full_name: school.admissions_contact_name,
            email: school.admissions_contact_email,
            phone: school.admissions_contact_phone,
          },
        ]
      : [];
  if (!list.length) return null;
  return (
    <>
      <dt>{list.length === 1 ? "Contact" : "Contacts"}</dt>
      <dd>
        <ul className="svt-contacts">
          {list.map((c) => (
            <li key={c.id}>
              <span className="svt-contact-name">
                {c.full_name || (c.id === "legacy" ? "Admissions" : "No name")}
                {c.job_title && <span className="svt-contact-title"> · {c.job_title}</span>}
                {c.is_main && contacts?.length > 1 && <span className="svt-contact-main">Main</span>}
              </span>
              <span className="svt-contact-lines">
                {c.email && (
                  <a href={`mailto:${c.email}`} title="Opens in Titan">
                    {c.email}
                  </a>
                )}
                {c.phone && <span>{c.phone}</span>}
              </span>
            </li>
          ))}
        </ul>
      </dd>
    </>
  );
}

// A school that's closed because every child is placed somewhere else:
// dark grey, at the bottom, view-only (founders, 25 Sept 2026). Opens to
// show what was recorded, nothing can be changed from here.
function ClosedRow({ row, children, placed, apps, reason, expanded, onToggle, contacts, note }) {
  const tourLine = (date, time, status) =>
    date ? `${formatDateTime(date, time)}${status ? ` · ${TOUR_STATUS_LABEL[status]}` : ""}` : "Not booked";
  return (
    <div className="svt-row-wrap is-closed">
      <div className="svt-row" style={{ gridTemplateColumns: svtColumns(children.length) }} onClick={onToggle}>
        <div className="svt-cell svt-cell-school">
          <div className="svt-school-name">{row.school?.name || "Unknown school"}</div>
          <div className="svt-closed-tag">Closed · {CLOSED_TEXT[reason] || "closed"}</div>
        </div>
        {children.map((c) => {
          const why = childClosedReason(placed, c.id, row.school_id, row.school?.name, apps);
          return (
            <div className="svt-cell" key={c.id}>
              <span className="svt-child-placed is-elsewhere" title={why === "placed" ? `Placed at ${placed[c.id]?.schoolName}` : undefined}>
                {why === "placed" ? "Placed elsewhere" : why === "declined" ? "Declined" : "Withdrawn"}
              </span>
            </div>
          );
        })}
        <div className="svt-cell svt-closed-text">{tourLine(row.tour_date, row.tour_start_time, row.tour_status)}</div>
        <div className="svt-cell svt-closed-text">{tourLine(row.tour2_date, row.tour2_start_time, row.tour2_status)}</div>
        <div className="svt-cell svt-closed-text">{row.feedback_text || "No feedback"}</div>
        <div className="svt-cell svt-closed-text">
          {row.family_decision === "proceeding" ? "Applied" : row.family_decision === "declined" ? "Not proceeding" : "—"}
        </div>
        <div className="svt-cell svt-cell-caret">
          <span className={"svt-caret" + (expanded ? " is-open" : "")}>▾</span>
        </div>
      </div>
      {expanded && (
        <fieldset className="svt-detail svt-closed-detail" disabled>
          <p className="svt-closed-note">
            View only. This school is closed because {CLOSED_TEXT[reason] || "no child is going ahead here"}. If that
            changes on the Applications tab, it opens again by itself.
          </p>
          <TourDetailsEditor row={row} onUpdated={() => {}} readOnly />
          <div className="svt-detail-single">
            <div className="svt-detail-main">
              <h3 className="svt-detail-heading">Admissions</h3>
              <dl className="svt-kv">
                <SchoolContactsInline school={row.school} contacts={contacts} />
              </dl>
              <Link className="panel-btn" to={`/staff/schools/${row.school_id}`}>
                Full school record
              </Link>
            </div>
            {note.trim() && (
              <div className="svt-notes">
                <h3 className="svt-detail-heading">Notes</h3>
                <p className="svt-closed-notes-text">{note}</p>
              </div>
            )}
          </div>
        </fieldset>
      )}
    </div>
  );
}
