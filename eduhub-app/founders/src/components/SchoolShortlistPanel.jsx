import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import UpdateFamilyButton from "./UpdateFamilyButton";
import TourDetailsEditor from "./TourDetailsEditor";
import FamilyBlockedTimes from "./FamilyBlockedTimes";
import EmailComposer from "./EmailComposer";
import { tourScheduleEmail, enquiryEmail, tourConfirmEmail, tourChangeEmail } from "../lib/visitEmails";
import AutosaveField from "./Autosave";
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
  listPlacements,
  listSearchRounds,
  listSchoolContacts,
  setShortlistKeepOpen,
  listReplySuggestions,
  resolveReplySuggestion,
  saveShortlistNote,
  shareTourSchedule,
} from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import { placedByChild, placedHere, shortDate, childClosedReason, rowClosedReason, CLOSED_TEXT } from "../lib/placement";
import { slotsFromShortlist, conflictFor, clock12 } from "../lib/tourConflicts";
import {
  AVAILABILITY_OPTIONS,
  CHIP_LABEL,
  chipClass,
  dotClass,
  TOUR_STATUS_OPTIONS,
  TOUR_STATUS_LABEL,
  formatDate,
  shortTour,
  relativeDay,
  daysBetween,
  admissionsProcessText,
  ShortlistNotes,
  SchoolContactsInline,
  KidTag,
  SaveBadge,
  WhoTag,
} from "./SchoolVisitsParts";
import "./panels.css";
import "./SchoolShortlistPanel.css";
import "./SchoolVisits.css";

const CLOSED_WORDS = { ...CLOSED_TEXT, full: "the school has no places" };

const PREFIXES = [
  { p: "tour_", label: "Primary tour" },
  { p: "tour2_", label: "Secondary tour" },
];

// The School visits tab, rebuilt on the new layout (29 Oct 2026): an
// Overview plus one tab per child, a table with the availability, both
// tours, feedback and the next step, and every row opening inline with
// Tour / After the tour / School and notes. Everything the old tab did is
// still here; the two interim cards (parent's unavailable times and the
// tour slot review) now live inside it.
export default function SchoolShortlistPanel({
  familyId,
  familyChildren,
  applicationsByChild,
  onFamilyRefresh,
  onGoToApplications,
  onProgressChange,
  focusSchoolId,
  visit,
}) {
  const [rows, setRows] = useState([]);
  const [childStatus, setChildStatus] = useState([]);
  const [otherFeedback, setOtherFeedback] = useState({});
  const [notesById, setNotesById] = useState({});
  const [allSchools, setAllSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [tab, setTab] = useState("overview");
  const [itab, setItab] = useState("tour");
  // One inline question at a time: { rowId, type: proceed | decline | withdraw | delete }.
  const [ask, setAsk] = useState(null);
  const [askNote, setAskNote] = useState("");
  const [tourSave, setTourSave] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [addingSchoolId, setAddingSchoolId] = useState("");
  const [placements, setPlacements] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [contactsBySchool, setContactsBySchool] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [schoolDraft, setSchoolDraft] = useState(null);
  const [enquiryPrompt, setEnquiryPrompt] = useState(null);

  const children = familyChildren || [];
  const blocked = visit?.blocked || [];

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
      const [cs, other, notes, placementRows, contacts, roundRows, sugg] = await Promise.all([
        listChildAvailabilityForShortlistIds(shortlistIds),
        listOtherFeedbackForSchools(schoolIds, familyId),
        // Notes failing to load (e.g. addendum 63 not run yet) shouldn't
        // take the whole shortlist down with it.
        listShortlistNotes(shortlistIds).catch(() => ({})),
        listPlacements(familyId).catch(() => []),
        listSchoolContacts(schoolIds).catch(() => null),
        listSearchRounds(familyId),
        listReplySuggestions(familyId).catch(() => []),
      ]);
      setSuggestions(sugg || []);
      setChildStatus(cs);
      setOtherFeedback(other);
      setNotesById(notes);
      setPlacements(placementRows || []);
      setRounds(roundRows || []);
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
    if (row) {
      setExpandedId(row.id);
      if (children[0]) setTab(children[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSchoolId, rows.length]);

  const allApplications = useMemo(() => Object.values(applicationsByChild || {}).flat(), [applicationsByChild]);

  // Founders (25 Sept 2026): once children are placed, the other schools
  // close. A row is per family, so it only closes when every child is placed
  // (see lib/placement.js); until then just that child's column says so.
  const placed = useMemo(
    () => placedByChild({ children, applicationsByChild: applicationsByChild || {}, placements, schools: allSchools, rounds }),
    [children, applicationsByChild, placements, allSchools, rounds]
  );
  // A reply that says "no places" for every child greys the school out (nothing more to do there).
  const noPlacesAt = (row) =>
    children.length > 0 &&
    children.every((c) => childStatus.find((x) => x.shortlist_id === row.id && x.child_id === c.id)?.availability_status === "no");
  const closedReason = (row) =>
    rowClosedReason(placed, children, row.school_id, row.school?.name, allApplications, row.keep_open) ||
    (noPlacesAt(row) && !row.keep_open ? "full" : null);
  const isRowClosed = (row) => !!closedReason(row);
  const placedKids = Object.entries(placed);

  const childIndex = (childId) => children.findIndex((c) => c.id === childId);
  const childName = (c) => displayNameForChild(c, childIndex(c.id));

  // The one-click handoff from a tour to an application: creates a draft
  // application for whichever children don't have one at this school yet,
  // then jumps to the Applications tab.
  async function handleReadyToApply(row) {
    setBusy(true);
    setError("");
    try {
      const applicationsForSchool = allApplications.filter((a) => a.school_id === row.school_id);
      const childrenNeedingApplication = children.filter((c) => !applicationsForSchool.some((a) => a.child_id === c.id));
      if (childrenNeedingApplication.length > 0) {
        await Promise.all(
          childrenNeedingApplication.map((c) => createApplication({ childId: c.id, schoolId: row.school_id, status: "draft" }))
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
      setAsk(null);
      onGoToApplications?.(row.school_id);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // The family decided NOT to go ahead with this school (or we withdrew it).
  // Recorded on the shortlist row, so the school greys out and drops to the
  // bottom with the reason, and nothing is erased.
  async function handleDeclineFamily(row, note) {
    setBusy(true);
    setError("");
    try {
      const updated = await updateShortlistTour(row.id, {
        family_decision: "declined",
        family_decision_note: (note || "").trim() || null,
        family_decision_at: new Date().toISOString(),
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
      setAsk(null);
      setAskNote("");
      setExpandedId(null);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // In case it was declined by mistake, or the family changes their mind.
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

  // Only one "primary" per family at a time -- setting a new one clears the
  // school that held it before, in the same round trip.
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

  async function setRowKeepOpen(row, keepOpen) {
    setRows((list) => list.map((r) => (r.id === row.id ? { ...r, keep_open: keepOpen } : r)));
    try {
      await setShortlistKeepOpen(row.id, keepOpen);
    } catch (err) {
      setError(friendlyError(err));
      setRows((list) => list.map((r) => (r.id === row.id ? { ...r, keep_open: row.keep_open } : r)));
    }
  }

  async function reopen(row) {
    if (row.family_decision === "declined") await handleUndoDecision(row);
    if (["placed", "full"].includes(closedReason(row))) await setRowKeepOpen(row, true);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!addingSchoolId) return;
    setBusy(true);
    setError("");
    try {
      // Adding a school once a child is already placed elsewhere is the
      // explicit "second school through us" signal -- keep it open instead
      // of it being grey on arrival.
      const anyChildPlaced = children.some((c) => placed[c.id]);
      const added = await addToShortlist({ familyId, schoolId: addingSchoolId, keepOpen: anyChildPlaced });
      if (visit && added?.id) setEnquiryPrompt(added.id);
      setAddingSchoolId("");
      setShowAdd(false);
      await load();
      onProgressChange?.();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // Row-level availability_status (the old "Overall" field) still drives the
  // replied / days-since-brief stats; per-child names are what staff look at.
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

  // A real, permanent delete, for "added by mistake". A family dropping a
  // school they considered should use Decline / Withdraw instead, which keeps
  // the school visible, greyed out, with a reason.
  async function handleRemove(row) {
    setAsk(null);
    setBusy(true);
    setError("");
    try {
      await removeFromShortlist(row.id);
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      setExpandedId(null);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // Every typed or picked tour / feedback field saves by itself. The screen
  // updates straight away; if the save fails the old value comes back.
  async function patchRow(row, patch, { progress = false } = {}) {
    setTourSave((s) => ({ ...s, [row.id]: "saving" }));
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    try {
      const updated = await updateShortlistTour(row.id, patch);
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
      setTourSave((s) => ({ ...s, [row.id]: "saved" }));
      setTimeout(() => setTourSave((s) => (s[row.id] === "saved" ? { ...s, [row.id]: "idle" } : s)), 2500);
      if (progress) onProgressChange?.();
      return true;
    } catch (err) {
      const back = Object.fromEntries(Object.keys(patch).map((k) => [k, row[k]]));
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...back } : r)));
      setTourSave((s) => ({ ...s, [row.id]: "error" }));
      setError(friendlyError(err));
      return false;
    }
  }

  // prefix is "tour_" (primary) or "tour2_" (secondary).
  function changeTour(row, prefix, field, value) {
    const patch = {};
    if (field === "date") {
      patch[prefix + "date"] = value || null;
      if (!value) {
        patch[prefix + "status"] = null;
        patch[prefix + "cancelled_reason"] = null;
      } else if (!row[prefix + "status"]) {
        patch[prefix + "status"] = "offered";
      }
    } else if (field === "status") {
      patch[prefix + "status"] = value;
      if (value !== "cancelled") patch[prefix + "cancelled_reason"] = null;
    } else {
      patch[prefix + field] = value || null;
    }
    patchRow(row, patch, { progress: field === "date" || field === "status" });
  }

  async function acceptTour(row, prefix) {
    const ok = await patchRow(row, { [prefix + "status"]: "confirmed", [prefix + "confirmed_at"]: new Date().toISOString() }, { progress: true });
    if (ok && visit) openSchoolDraft("confirm", row, prefix);
  }

  // Email automation: the system drafts the school email, the consultant reviews and sends.
  function schoolContactFor(row) {
    const list = contactsBySchool[row.school_id] || [];
    const main = list.find((c) => c.is_main && c.email) || list.find((c) => c.email);
    return {
      email: main?.email || row.school?.admissions_contact_email || "",
      name: main?.full_name || row.school?.admissions_contact_name || "",
    };
  }

  function openSchoolDraft(kind, row, prefix) {
    if (!visit) return;
    const { email, name } = schoolContactFor(row);
    const base = { contactName: name, schoolName: row.school?.name || "the school", familyName: visit.familyName, consultant: visit.composerCtx?.staffName };
    const kids = kidsFor(row).map(childName);
    const slot = prefix ? { date: row[prefix + "date"], start: row[prefix + "start_time"], end: row[prefix + "end_time"] } : null;
    const from = visit.family?.dubai_available_from || "";
    const to = visit.family?.dubai_available_until || "";
    let draft;
    if (kind === "confirm") draft = tourConfirmEmail({ ...base, kids, tour: slot });
    else if (kind === "change") draft = tourChangeEmail({ ...base, kids, offered: slot, from, to, blocked, why: slotConflict[row.id + prefix] });
    else {
      draft = enquiryEmail({
        option: from && to ? "option_1" : "option_2",
        familyName: visit.familyName,
        children: children.map((c, i) => ({ name: displayNameForChild(c, i), year: c.year_group_applying_for || "", record: c })),
        from,
        to,
        blocked,
        contactName: name,
        schoolName: base.schoolName,
        consultant: base.consultant,
        plannedMoveDate: visit.family?.planned_move_date || "",
      });
    }
    setExpandedId(row.id);
    if (children[0] && activeTab === "overview") setTab(children[0].id);
    setSchoolDraft({
      rowId: row.id,
      kind,
      option: from && to ? "option_1" : "option_2",
      initial: { mode: "draft", to: email ? [email] : [], subject: draft.subject, text: draft.text },
    });
  }

  async function schoolDraftSent() {
    const d = schoolDraft;
    setSchoolDraft(null);
    if (d?.kind !== "enquiry") return;
    try {
      const updated = await updateShortlistTour(d.rowId, { enquiry_sent_at: new Date().toISOString(), enquiry_type: d.option, enquiry_skipped_at: null });
      setRows((rs) => rs.map((r) => (r.id === d.rowId ? { ...r, ...updated, school: r.school } : r)));
    } catch (err) {
      setError(friendlyError(err, "The email was sent, but it couldn't be marked as sent. Do not send it again."));
    }
  }

  function renderSchoolDraft(row) {
    if (!schoolDraft || schoolDraft.rowId !== row.id) return null;
    const title = { confirm: "Confirmation to the school", change: "Ask the school for another time", enquiry: "Availability enquiry to the school" }[schoolDraft.kind];
    return (
      <div className="tw-compose" key="school-draft">
        <div className="tw-compose-head"><b>{title}</b><span className="sv-sub">Review it, then press Send. Nothing is sent by itself.</span></div>
        <EmailComposer
          key={"draft-" + schoolDraft.kind + row.id}
          familyId={familyId}
          familyName={visit.familyName}
          childLines={visit.composerCtx.childLines}
          documents={[]}
          staffName={visit.composerCtx.staffName}
          familyAddress={visit.composerCtx.familyAddress}
          childRows={children}
          dubaiFrom={visit.family?.dubai_available_from}
          dubaiUntil={visit.family?.dubai_available_until}
          initial={schoolDraft.initial}
          onSent={schoolDraftSent}
          onClose={() => setSchoolDraft(null)}
        />
      </div>
    );
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

  // The family's primary choice floats to the top, everything else keeps its
  // order, earliest visit first; schools with no tour yet go last in their group.
  const sortedRows = useMemo(() => {
    const rank = (row) => {
      if (placedHere(placed, children, row.school_id, row.school?.name).length) return -1;
      if (row.priority === "primary") return 0;
      if (row.priority === "secondary") return 1;
      return 2;
    };
    const when = (r) => [r.tour_date, r.tour2_date].filter(Boolean).sort()[0] || "9999-12-31";
    return [...rows].sort((a, b) => rank(a) - rank(b) || when(a).localeCompare(when(b)));
  }, [rows, placed, children]);

  // Closed = every child placed elsewhere / declined / withdrawn, or the
  // family declined it here. Greyed out at the bottom, never erased.
  const liveRows = sortedRows.filter((r) => !isRowClosed(r) && r.family_decision !== "declined");
  const closedRows = sortedRows.filter((r) => isRowClosed(r) || r.family_decision === "declined");

  // Every offered / confirmed slot on a live school, checked against the
  // parent's unavailable times and the family's other tours.
  const allSlots = slotsFromShortlist(liveRows);
  const slotConflict = {};
  allSlots.forEach((s) => {
    const why = conflictFor(s, blocked, allSlots);
    if (why) slotConflict[s.key] = why;
  });
  const conflictRows = new Set(allSlots.filter((s) => slotConflict[s.key]).map((s) => s.rowId));
  const confirmedSlots = allSlots.filter((s) => s.status === "confirmed").length;

  const availOf = (row, childId) => childStatus.find((cs) => cs.shortlist_id === row.id && cs.child_id === childId)?.availability_status || "awaiting";

  // The children who would go on a tour at this school.
  const kidsFor = (row) =>
    children.filter(
      (c) => availOf(row, c.id) !== "no" && !childClosedReason(placed, c.id, row.school_id, row.school?.name, allApplications, row.keep_open)
    );

  function nextStep(row, childId) {
    if (suggestions.some((x) => x.shortlist_id === row.id)) return ["Check the school's reply", "a", "us"];
    if (row.family_decision === "proceeding") return ["In Applications", ""];
    const live = PREFIXES.filter(({ p }) => row[p + "date"] && !["cancelled", "completed"].includes(row[p + "status"]));
    if (live.some(({ p }) => (row[p + "status"] || "offered") === "offered")) {
      return [conflictRows.has(row.id) ? "Check the clash" : "Accept the time or ask for another", "a", "us"];
    }
    if (live.some(({ p }) => row[p + "status"] === "confirmed")) return ["Tour booked", "g"];
    if (PREFIXES.some(({ p }) => row[p + "status"] === "completed")) return ["Get feedback, then decide", "a", "us"];
    const v = childId ? availOf(row, childId) : "awaiting";
    if (v === "awaiting") return row.enquiry_sent_at ? ["Reply to our enquiry", "", "school"] : ["Email the school", "a", "us"];
    if (v === "waitlist") return ["On their waitlist", "", "school"];
    return ["–", ""];
  }

  const longDay = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const slotText = (t) => `${longDay(t.date)}${t.start ? ", " + clock12(t.start) : ""}${t.end ? " to " + clock12(t.end) : ""}`;

  // Confirming a suggestion fills in the real fields. Availability goes on the
  // children, offered tour times go into any empty tour slot (as "offered", so
  // the clash check and Accept still apply), and assessment dates are added to
  // the school's private note until the application's own assessment card exists.
  async function acceptSuggestion(sug) {
    const row = rows.find((r) => r.id === sug.shortlist_id);
    if (!row) return;
    setBusy(true);
    setError("");
    try {
      for (const a of sug.availability || []) {
        const updated = await upsertChildAvailability(row.id, a.child_id, a.status);
        setChildStatus((cs) => [...cs.filter((c) => !(c.shortlist_id === row.id && c.child_id === a.child_id)), updated]);
      }
      const patch = {};
      const taken = { tour_: !!row.tour_date, tour2_: !!row.tour2_date };
      for (const t of sug.tour_slots || []) {
        const same = PREFIXES.some(({ p }) => row[p + "date"] === t.date && (row[p + "start_time"] || "").slice(0, 5) === (t.start || ""));
        if (same) continue;
        const p = !taken.tour_ ? "tour_" : !taken.tour2_ ? "tour2_" : null;
        if (!p) break;
        taken[p] = true;
        patch[p + "date"] = t.date;
        patch[p + "start_time"] = t.start || null;
        patch[p + "end_time"] = t.end || null;
        patch[p + "status"] = "offered";
      }
      if (Object.keys(patch).length) await patchRow(row, patch, { progress: true });
      if ((sug.assessment_dates || []).length) {
        const lines = sug.assessment_dates.map(
          (a) => `Assessment${a.child_name ? " (" + a.child_name + ")" : ""}: ${longDay(a.date)}${a.time ? ", " + clock12(a.time) : ""}${a.how && a.how !== "unknown" ? ", " + a.how : ""} (from the school's email)`
        );
        const body = [notesById[row.id] || "", ...lines].filter(Boolean).join("\n");
        await saveShortlistNote(row.id, body);
        setNotesById((m) => ({ ...m, [row.id]: body }));
      }
      await resolveReplySuggestion(sug.id, "accepted");
      setSuggestions((l) => l.filter((x) => x.id !== sug.id));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function dismissSuggestion(sug) {
    setBusy(true);
    try {
      await resolveReplySuggestion(sug.id, "dismissed");
      setSuggestions((l) => l.filter((x) => x.id !== sug.id));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function renderSuggestion(row) {
    const list = suggestions.filter((x) => x.shortlist_id === row.id);
    return list.map((sug) => (
      <div className="sv-new" key={sug.id}>
        <div className="sv-new-head">
          <b>New information from the school</b>
          <span className="sv-sub">Read from their email. Nothing changes until you confirm.</span>
        </div>
        {sug.summary && <p style={{ margin: "6px 0" }}>{sug.summary}</p>}
        <ul className="sv-new-list">
          {(sug.availability || []).map((a) => (
            <li key={a.child_id}>
              {a.child_name}: {(AVAILABILITY_OPTIONS.find((o) => o.value === a.status) || {}).label || a.status}
            </li>
          ))}
          {(sug.tour_slots || []).map((t, i) => (
            <li key={"t" + i}>Tour offered: {slotText(t)}</li>
          ))}
          {(sug.assessment_dates || []).map((a, i) => (
            <li key={"a" + i}>
              Assessment{a.child_name ? ` (${a.child_name})` : ""}: {longDay(a.date)}
              {a.time ? `, ${clock12(a.time)}` : ""}
              {a.how && a.how !== "unknown" ? `, ${a.how}` : ""}
            </li>
          ))}
        </ul>
        <div className="sv-pills">
          <button type="button" className="sv-btn is-primary is-sm" onClick={() => acceptSuggestion(sug)} disabled={busy}>
            Confirm and fill in
          </button>
          <button type="button" className="sv-btn is-sm" onClick={() => dismissSuggestion(sug)} disabled={busy}>
            Not right, dismiss
          </button>
        </div>
      </div>
    ));
  }

  function toggleRow(row) {
    setExpandedId((id) => (id === row.id ? null : row.id));
    setAsk(null);
    setAskNote("");
  }

  function openFromOverview(row, childId) {
    const target = childId || children[0]?.id;
    if (target) setTab(target);
    setExpandedId(row.id);
    setItab("tour");
    setAsk(null);
  }

  const shortlistedIds = new Set(rows.map((r) => r.school_id));
  const addableSchools = allSchools.filter((s) => !shortlistedIds.has(s.id));
  const activeTab = tab !== "overview" && children.some((c) => c.id === tab) ? tab : "overview";
  const activeChild = children.find((c) => c.id === activeTab) || null;

  /* ---------- pieces of the table ---------- */

  function tourCell(row, prefix) {
    const date = row[prefix + "date"];
    if (!date) return <span className="sv-st is-mute">–</span>;
    const status = row[prefix + "status"] || "offered";
    const clash = slotConflict[row.id + prefix];
    return (
      <span className="sv-tour">
        <span className="sv-st">
          <i className={"sv-d " + (status === "confirmed" || status === "completed" ? "is-g" : status === "cancelled" ? "" : "is-a")} />
          {shortTour(date, row[prefix + "start_time"])}
        </span>
        <small className={clash ? "is-warn" : ""}>{clash ? "Clashes with a busy time" : TOUR_STATUS_LABEL[status]}</small>
      </span>
    );
  }

  function feedbackCell(row) {
    if (row.feedback_rating) return <span className="sv-st">{`★ ${row.feedback_rating} of 5`}</span>;
    if (row.feedback_text) return <span className="sv-st"><span className="sv-clip">{row.feedback_text}</span></span>;
    return <span className="sv-st is-mute">–</span>;
  }

  function availabilityCell(row, child) {
    const value = availOf(row, child.id);
    const why = childClosedReason(placed, child.id, row.school_id, row.school?.name, allApplications, row.keep_open);
    if (placed[child.id] || why) {
      const here = placed[child.id] && !why;
      return (
        <span className="sv-st" title={why === "placed" ? `Placed at ${placed[child.id].schoolName}` : undefined}>
          <i className={"sv-d" + (here ? " is-g" : "")} />
          {here ? "Placed ✓" : why === "placed" ? "Placed elsewhere" : why === "declined" ? "Declined" : why === "dropped" ? "Not carried over" : "Withdrawn"}
        </span>
      );
    }
    return (
      <select
        className={"sv-select " + chipClass(value)}
        value={value}
        aria-label={`${childName(child)} availability at ${row.school?.name || "this school"}`}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => handleChildStatusChange(row, child.id, e.target.value)}
        disabled={busy}
      >
        {AVAILABILITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {CHIP_LABEL[o.value] || o.label}
          </option>
        ))}
      </select>
    );
  }

  function onRowKey(e, fn) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  }

  /* ---------- the open row ---------- */

  function renderDetail(row) {
    const school = row.school || {};
    const process = admissionsProcessText(school);
    const feedbackRows = otherFeedback[row.school_id] || [];
    const offered = PREFIXES.filter(({ p }) => row[p + "date"] && (row[p + "status"] || "offered") === "offered");
    const clash = conflictRows.has(row.id);
    const proceeding = row.family_decision === "proceeding";
    const asking = ask && ask.rowId === row.id ? ask.type : null;
    const tourLine = (() => {
      const next = PREFIXES.find(({ p }) => row[p + "date"] && !["cancelled", "completed"].includes(row[p + "status"]));
      if (!next) return PREFIXES.some(({ p }) => row[p + "status"] === "completed") ? "The family has toured. Time to decide." : "No tour booked yet.";
      const when = <b>{shortTour(row[next.p + "date"], row[next.p + "start_time"])}</b>;
      if ((row[next.p + "status"] || "offered") === "offered")
        return <>The school offered {when}. {clash ? <span className="sv-warn">This clashes with a time the parents are not free, or another tour.</span> : "It fits the family's diary."}</>;
      return <>{next.label} confirmed for {when}.</>;
    })();
    const names = kidsFor(row).map(childName);

    return (
      <div className="sv-open" onClick={(e) => e.stopPropagation()}>
        <div className="sv-open-head">
          <div className="sv-open-msg">{tourLine}</div>
          <div className="sv-pills">
            <SaveBadge state={tourSave[row.id]} />
            <div className="sv-seg" role="group" aria-label="Primary or backup choice">
              <button
                type="button"
                className={row.priority === "primary" ? "is-on" : ""}
                onClick={() => handleSetPriority(row, row.priority === "primary" ? "" : "primary")}
                disabled={busy}
                title="The family's top choice"
              >
                Primary
              </button>
              <button
                type="button"
                className={row.priority === "secondary" ? "is-on" : ""}
                onClick={() => handleSetPriority(row, row.priority === "secondary" ? "" : "secondary")}
                disabled={busy}
                title="A backup option"
              >
                Backup
              </button>
            </div>
            {offered.map(({ p, label }) => (
              <button key={p} type="button" className="sv-btn is-primary is-sm" onClick={() => acceptTour(row, p)}>
                {offered.length > 1 ? `Accept ${label.toLowerCase()}` : clash ? "Accept anyway" : "Accept this time"}
              </button>
            ))}
            {visit && offered.map(({ p, label }) => (
              <button key={"chg" + p} type="button" className="sv-btn is-sm" onClick={() => openSchoolDraft("change", row, p)}>
                {offered.length > 1 ? `Request a change (${label.toLowerCase()})` : "Request a change"}
              </button>
            ))}
          </div>
        </div>

        {renderSuggestion(row)}
        {renderSchoolDraft(row)}
        <div className="sv-itabs">
          {[
            ["tour", "Tour"],
            ["after", "After the tour"],
            ["school", "School and notes"],
          ].map(([k, l]) => (
            <button key={k} type="button" className={itab === k ? "is-on" : ""} onClick={() => setItab(k)}>
              {l}
            </button>
          ))}
        </div>

        {itab === "tour" && (
          <div className="sv-cols2">
            <div>
              {PREFIXES.map(({ p, label }) => {
                const hasDate = !!row[p + "date"];
                const status = row[p + "status"] || "offered";
                return (
                  <div className="sv-blk" key={p}>
                    <h3>
                      <span>{label}</span>
                    </h3>
                    <div className="sv-g2">
                      <label className="sv-fld">
                        Date
                        <input type="date" value={row[p + "date"] || ""} onChange={(e) => changeTour(row, p, "date", e.target.value)} />
                      </label>
                      <label className="sv-fld">
                        Status
                        <select value={status} disabled={!hasDate} onChange={(e) => changeTour(row, p, "status", e.target.value)}>
                          {TOUR_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {TOUR_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="sv-fld">
                        Start
                        <input
                          type="time"
                          value={row[p + "start_time"] || ""}
                          disabled={!hasDate}
                          onChange={(e) => changeTour(row, p, "start_time", e.target.value)}
                        />
                      </label>
                      <label className="sv-fld">
                        End
                        <input
                          type="time"
                          value={row[p + "end_time"] || ""}
                          disabled={!hasDate}
                          onChange={(e) => changeTour(row, p, "end_time", e.target.value)}
                        />
                      </label>
                    </div>
                    {hasDate && status === "cancelled" && (
                      <div style={{ marginTop: 10 }}>
                        <AutosaveField
                          label="Why was it cancelled?"
                          placeholder="Why was it cancelled?"
                          value={row[p + "cancelled_reason"] || ""}
                          onSave={(v) => patchRow(row, { [p + "cancelled_reason"]: v })}
                        />
                      </div>
                    )}
                    {slotConflict[row.id + p] && <p className="sv-warn" style={{ margin: "10px 0 0", fontSize: 14 }}>{slotConflict[row.id + p]}</p>}
                  </div>
                );
              })}
            </div>
            <TourDetailsEditor
              row={row}
              onUpdated={(updated) => setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...updated, school: r.school } : r)))}
            />
          </div>
        )}

        {itab === "after" && (
          <div className="sv-cols2">
            <div className="sv-blk">
              <h3>
                <span>Feedback</span>
                <em>{PREFIXES.some(({ p }) => row[p + "status"] === "completed") ? "Toured" : "Not toured yet"}</em>
              </h3>
              {row.feedback_rating ? (
                <p style={{ margin: "0 0 10px" }}>
                  <span className="sv-stars" aria-label={`${row.feedback_rating} out of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={row.feedback_rating >= n ? "is-on" : ""}>
                        ★
                      </span>
                    ))}
                  </span>{" "}
                  <span className="sv-sub">rated by the family</span>
                </p>
              ) : null}
              <AutosaveField
                label="How the tour went"
                multiline
                rows={5}
                placeholder="How did it go?"
                value={row.feedback_text || ""}
                onSave={(v) => patchRow(row, { feedback_text: v, feedback_by: v ? "staff" : null })}
              />
            </div>
            <div>
              <div className="sv-blk">
                <h3>
                  <span>Decision</span>
                </h3>
                <p style={{ margin: 0 }}>
                  {proceeding
                    ? "Proceeding to an application."
                    : "No decision yet. Use Proceed to application or Decline below when the family has decided."}
                </p>
              </div>
              {feedbackRows.length > 0 && (
                <div className="sv-blk">
                  <h3>
                    <span>Other families on this school</span>
                  </h3>
                  {feedbackRows.slice(0, 3).map((f) => (
                    <blockquote key={f.id} className="sv-quote">
                      <p>{f.feedback_text}</p>
                      <cite>
                        {f.familyName}
                        {f.feedback_at ? `, ${formatDate(f.feedback_at)}` : ""}
                      </cite>
                    </blockquote>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {itab === "school" && (
          <div className="sv-cols2">
            <div className="sv-blk">
              <h3>
                <span>Admissions</span>
              </h3>
              <dl className="sv-kv">
                <SchoolContactsInline school={school} contacts={contactsBySchool[row.school_id]} />
                {school.address && (
                  <>
                    <dt>Address</dt>
                    <dd>{school.address}</dd>
                  </>
                )}
                {process && (
                  <>
                    <dt>Admissions process</dt>
                    <dd>{process}</dd>
                  </>
                )}
              </dl>
              <div className="sv-links">
                {school.website_url && (
                  <a className="sv-btn is-sm" href={school.website_url} target="_blank" rel="noreferrer">
                    Website
                  </a>
                )}
                {school.tour_booking_url && (
                  <a className="sv-btn is-sm" href={school.tour_booking_url} target="_blank" rel="noreferrer">
                    Book a tour
                  </a>
                )}
                {school.application_url && (
                  <a className="sv-btn is-sm" href={school.application_url} target="_blank" rel="noreferrer">
                    Apply
                  </a>
                )}
                <Link className="sv-btn is-sm" to={`/staff/schools/${row.school_id}`}>
                  Full school record
                </Link>
              </div>
            </div>
            <div className="sv-blk">
              <h3>
                <span>Notes, private to the team</span>
              </h3>
              <ShortlistNotes
                shortlistId={row.id}
                initial={notesById[row.id] || ""}
                onSaved={(id, body) => setNotesById((m) => ({ ...m, [id]: body }))}
              />
            </div>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <UpdateFamilyButton
            familyId={familyId}
            schoolId={row.school_id}
            suggested={PREFIXES.some(({ p }) => row[p + "status"] === "completed") ? "toured" : "shortlisted"}
          />
        </div>
        <div className="sv-actions">
          <div className="sv-pills">
            {proceeding ? (
              <button type="button" className="sv-btn is-primary is-sm" onClick={() => handleReadyToApply(row)} disabled={busy}>
                View application →
              </button>
            ) : (
              <>
                <button type="button" className="sv-btn is-primary is-sm" onClick={() => setAsk({ rowId: row.id, type: "proceed" })} disabled={busy}>
                  Proceed to application
                </button>
                <button
                  type="button"
                  className="sv-btn is-sm"
                  onClick={() => {
                    setAskNote("");
                    setAsk({ rowId: row.id, type: "decline" });
                  }}
                  disabled={busy}
                >
                  Decline, with a reason
                </button>
              </>
            )}
          </div>
          <div className="sv-pills" style={{ gap: 4 }}>
            <button
              type="button"
              className="sv-btn is-sm is-quiet"
              onClick={() => {
                setAskNote("");
                setAsk({ rowId: row.id, type: "withdraw" });
              }}
              disabled={busy}
            >
              Withdraw
            </button>
            <button type="button" className="sv-btn is-sm is-quiet" onClick={() => setAsk({ rowId: row.id, type: "delete" })} disabled={busy}>
              Delete
            </button>
            <button type="button" className="sv-btn is-sm is-quiet" onClick={() => toggleRow(row)}>
              Close
            </button>
          </div>
        </div>

        {asking && (
          <div className="sv-confirm">
            {asking === "proceed" && (
              <>
                <span>
                  Hand {school.name || "this school"} to Applications{names.length ? ` for ${names.join(" and ")}` : ""}?
                </span>
                <button type="button" className="sv-btn is-primary is-sm" onClick={() => handleReadyToApply(row)} disabled={busy}>
                  Yes, proceed
                </button>
              </>
            )}
            {asking === "decline" && (
              <>
                <span>Why is the family not going ahead?</span>
                <input type="text" placeholder="Reason (e.g. too far)" value={askNote} onChange={(e) => setAskNote(e.target.value)} />
                <button type="button" className="sv-btn is-primary is-sm" onClick={() => handleDeclineFamily(row, askNote)} disabled={busy}>
                  Decline school
                </button>
              </>
            )}
            {asking === "withdraw" && (
              <>
                <span>Withdraw this school? It stays on the list, greyed out at the bottom.</span>
                <input type="text" placeholder="Reason (optional)" value={askNote} onChange={(e) => setAskNote(e.target.value)} />
                <button
                  type="button"
                  className="sv-btn is-primary is-sm"
                  onClick={() => handleDeclineFamily(row, askNote.trim() ? `Withdrawn: ${askNote.trim()}` : "Withdrawn")}
                  disabled={busy}
                >
                  Yes, withdraw
                </button>
              </>
            )}
            {asking === "delete" && (
              <>
                <span>
                  Delete {school.name || "this school"} for good, with its tour dates, feedback and notes? It cannot be undone. If the family simply decided against it, use Withdraw instead.
                </span>
                <button type="button" className="sv-btn is-primary is-sm" onClick={() => handleRemove(row)} disabled={busy}>
                  {busy ? "Deleting…" : "Yes, delete"}
                </button>
              </>
            )}
            <button type="button" className="sv-btn is-sm is-quiet" onClick={() => setAsk(null)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  // Closed schools are view-only: what was recorded, nothing to change.
  function renderClosedDetail(row, reason) {
    const note = notesById[row.id] || "";
    return (
      <div className="sv-open" onClick={(e) => e.stopPropagation()}>
        <p className="sv-hint" style={{ margin: "0 0 14px" }}>
          View only.{" "}
          {reason ? `This school is closed because ${CLOSED_WORDS[reason] || "no child is going ahead here"}. If that changes on the Applications tab, it opens again by itself.` : "Reopen it to make changes."}
        </p>
        <fieldset className="svt-detail svt-closed-detail" disabled style={{ border: 0, padding: 0, margin: 0 }}>
          <TourDetailsEditor row={row} onUpdated={() => {}} readOnly />
          <div className="sv-blk" style={{ marginTop: 16 }}>
            <h3>
              <span>Admissions</span>
            </h3>
            <dl className="sv-kv">
              <SchoolContactsInline school={row.school} contacts={contactsBySchool[row.school_id]} />
            </dl>
            {note.trim() && <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{note}</p>}
          </div>
        </fieldset>
        <div className="sv-links" style={{ marginTop: 14 }}>
          <Link className="sv-btn is-sm" to={`/staff/schools/${row.school_id}`}>
            Full school record
          </Link>
        </div>
      </div>
    );
  }

  function closedText(row) {
    const reason = closedReason(row);
    if (reason) return `Closed · ${CLOSED_WORDS[reason] || "closed"}`;
    return row.family_decision_note ? `Closed · ${row.family_decision_note}` : "Closed · family declined";
  }

  function renderClosedBand(cols, withChild) {
    if (closedRows.length === 0) return null;
    return (
      <>
        <div className="sv-tb is-band" style={{ "--sv-cols": cols }}>
          <span className="sv-band-label">Closed · {closedRows.length}</span>
          {Array.from({ length: cols.split(" ").length - 2 }).map((_, i) => (
            <span key={i} />
          ))}
          <span className="sv-sub" style={{ textAlign: "right" }}>
            Greyed out, kept for the record
          </span>
        </div>
        {closedRows.map((row) => {
          const reason = closedReason(row);
          const canReopen = row.family_decision === "declined" || reason === "placed" || reason === "full";
          const open = expandedId === row.id;
          return (
            <div key={row.id}>
              <div
                className={"sv-tb is-closed" + (open ? " is-sel" : "")}
                style={{ "--sv-cols": cols, cursor: "pointer" }}
                tabIndex={0}
                role="button"
                aria-expanded={open}
                onClick={() => toggleRow(row)}
                onKeyDown={(e) => onRowKey(e, () => toggleRow(row))}
              >
                <div>
                  <div className="sv-nm">{row.school?.name || "Unknown school"}</div>
                  <div className="sv-sb">{closedText(row)}</div>
                </div>
                {withChild ? (
                  <>
                    <span className="sv-st">Closed</span>
                    <span className="sv-st">{row.tour_date ? shortTour(row.tour_date, row.tour_start_time) : "–"}</span>
                    <span className="sv-st">{row.tour2_date ? shortTour(row.tour2_date, row.tour2_start_time) : "–"}</span>
                    <span className="sv-st"><span className="sv-clip">{row.feedback_text || "–"}</span></span>
                  </>
                ) : (
                  <>
                    {children.map((c) => (
                      <span key={c.id} className="sv-st">Closed</span>
                    ))}
                  </>
                )}
                <span className="sv-st" onClick={(e) => e.stopPropagation()}>
                  {canReopen ? (
                    <button type="button" className="sv-btn is-link" onClick={() => reopen(row)} disabled={busy}>
                      Reopen
                    </button>
                  ) : (
                    <span className="sv-sub">Reopens from Applications</span>
                  )}
                  {row.family_decision === "declined" && (
                    <button
                      type="button"
                      className="sv-btn is-link"
                      style={{ color: "var(--sv-mute)", marginLeft: 12 }}
                      onClick={() => {
                        setExpandedId(row.id);
                        setAsk({ rowId: row.id, type: "delete" });
                      }}
                    >
                      Delete
                    </button>
                  )}
                </span>
              </div>
              {open && renderClosedDetail(row, reason)}
              {open && ask && ask.rowId === row.id && ask.type === "delete" && (
                <div className="sv-confirm" style={{ margin: "0 24px 14px" }} onClick={(e) => e.stopPropagation()}>
                  <span>Delete {row.school?.name || "this school"} for good? It cannot be undone.</span>
                  <button type="button" className="sv-btn is-primary is-sm" onClick={() => handleRemove(row)} disabled={busy}>
                    Yes, delete
                  </button>
                  <button type="button" className="sv-btn is-sm is-quiet" onClick={() => setAsk(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  }

  /* ---------- Overview ---------- */

  const overviewCols = ["minmax(0,2fr)", ...children.map(() => "minmax(0,1fr)"), "minmax(0,1.3fr)"].join(" ");
  const childCols = "minmax(0,2fr) minmax(0,1.1fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.2fr)";

  // Every tour that still stands, earliest first (cancelled ones drop out).
  const [sendingSchedule, setSendingSchedule] = useState(null);
  const [scheduleSent, setScheduleSent] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Confirmed tours the parent's app does not show yet (addendum 145; undefined = not run yet).
  const unsharedTours = liveRows.reduce(
    (n, r) =>
      n +
      PREFIXES.filter(({ p }) => r[p + "date"] && r[p + "status"] === "confirmed" && r[p + "shared_at"] === null).length,
    0
  );

  // Put the confirmed tours on the family's app (and notify them).
  async function shareToApp() {
    setSharing(true);
    setError("");
    try {
      await shareTourSchedule(familyId);
      const now = new Date().toISOString();
      setRows((rs) =>
        rs.map((r) => {
          const next = { ...r };
          PREFIXES.forEach(({ p }) => {
            if (r[p + "date"] && r[p + "status"] === "confirmed" && r[p + "shared_at"] === null) next[p + "shared_at"] = now;
          });
          return next;
        })
      );
      setScheduleSent(true);
    } catch (err) {
      setError(friendlyError(err, "Couldn't post the schedule to the parent's app."));
    } finally {
      setSharing(false);
    }
  }
  const liveSlotItems = allSlots.filter((s) => s.status !== "completed");
  const scheduleReady = liveSlotItems.length > 0 && liveSlotItems.every((s) => s.status === "confirmed") && conflictRows.size === 0;

  function openSendSchedule() {
    if (!visit) return;
    const parents = visit.parents || [];
    const p = parents.find((x) => x.email) || parents[0];
    const draft = tourScheduleEmail({
      parentName: p?.full_name,
      consultant: visit.composerCtx?.staffName,
      tours: scheduleItems
        .filter((t) => t.status !== "completed")
        .map((t) => ({
          date: t.date,
          start: t.start,
          end: t.end,
          school: t.row.school?.name,
          kids: kidsFor(t.row).map(childName),
          details: [t.row.tour_gate, t.row.tour_building, t.row.tour_ask_for && "Ask for " + t.row.tour_ask_for],
        })),
    });
    setSendingSchedule({ mode: "draft", to: parents.map((x) => x.email).filter(Boolean), subject: draft.subject, text: draft.text });
  }

  const scheduleItems = liveRows
    .flatMap((row) =>
      PREFIXES.filter(({ p }) => row[p + "date"] && row[p + "status"] !== "cancelled").map(({ p, label }) => ({
        key: row.id + p,
        row,
        label,
        date: row[p + "date"],
        start: row[p + "start_time"],
        end: row[p + "end_time"],
        status: row[p + "status"] || "offered",
        shared: row[p + "shared_at"],
        clash: slotConflict[row.id + p],
      }))
    )
    .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));

  function renderOverview() {
    const nextTour = (row) => {
      const s = scheduleItems.find((x) => x.row.id === row.id && x.status !== "completed");
      if (!s) return <span className="sv-st is-mute">–</span>;
      return (
        <span className="sv-tour">
          <span className="sv-st">{shortTour(s.date, s.start)}</span>
          {s.clash && <small className="is-warn">Clashes</small>}
        </span>
      );
    };
    return (
      <>
        {rows.length > 0 && (
          <div className="sv-card sv-stats">
            <div><b>{stats.shortlisted}</b><span>Shortlisted</span></div>
            <div><b>{stats.replied}</b><span>Replied</span></div>
            <div><b>{stats.toursBooked}</b><span>Tours booked</span></div>
            <div><b>{stats.toured}</b><span>Toured</span></div>
            <div><b>{stats.applied}</b><span>Applied</span></div>
            {stats.daysSinceBrief !== null && <div><b>{stats.daysSinceBrief}</b><span>Days since brief</span></div>}
          </div>
        )}
        <div className="sv-side">
          <div className="sv-card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "18px 24px 4px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <h2 className="sv-card-title">All schools</h2>
              {children.length > 0 && <span className="sv-sub" style={{ fontSize: 14 }}>Open a child's tab to work on their schools</span>}
            </div>
            {rows.length === 0 ? (
              <p className="sv-hint" style={{ margin: "10px 24px 20px" }}>No schools shortlisted for this family yet.</p>
            ) : (
              <div className="sv-scroll">
                <div className="sv-tbl is-narrow">
                  <div className="sv-tb is-head" style={{ "--sv-cols": overviewCols }}>
                    <span>School</span>
                    {children.map((c) => (
                      <span key={c.id}>{childName(c)}</span>
                    ))}
                    <span>Next tour</span>
                  </div>
                  {liveRows.map((row) => (
                    <div
                      key={row.id}
                      className="sv-tb"
                      style={{ "--sv-cols": overviewCols }}
                      tabIndex={0}
                      role="button"
                      onClick={() => openFromOverview(row)}
                      onKeyDown={(e) => onRowKey(e, () => openFromOverview(row))}
                    >
                      <div>
                        <div className="sv-nm">{row.school?.name || "Unknown school"}</div>
                        {placedHere(placed, children, row.school_id, row.school?.name).length > 0 && (
                          <div className="sv-sb">🎓 Placed here</div>
                        )}
                      </div>
                      {children.map((c) => {
                        const why = childClosedReason(placed, c.id, row.school_id, row.school?.name, allApplications, row.keep_open);
                        const v = availOf(row, c.id);
                        return (
                          <span
                            key={c.id}
                            className="sv-st sv-st-go"
                            role="button"
                            tabIndex={0}
                            title={`Open ${childName(c)}`}
                            onClick={(e) => { e.stopPropagation(); openFromOverview(row, c.id); }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                openFromOverview(row, c.id);
                              }
                            }}
                          >
                            <i className={"sv-d " + (placed[c.id] && !why ? "is-g" : dotClass(v))} />
                            {placed[c.id] && !why ? "Placed ✓" : why ? "Closed" : v === "awaiting" && !row.enquiry_sent_at ? "Not emailed yet" : CHIP_LABEL[v]}
                          </span>
                        );
                      })}
                      {nextTour(row)}
                    </div>
                  ))}
                  {renderClosedBand(overviewCols, false)}
                </div>
              </div>
            )}
          </div>

          <div className="sv-stack">
            {visit && (
              <FamilyBlockedTimes
                familyId={familyId}
                family={visit.family}
                familyName={visit.familyName}
                familyChildren={children}
                parents={visit.parents}
                composerCtx={visit.composerCtx}
                from={visit.family?.dubai_available_from}
                to={visit.family?.dubai_available_until}
                blocked={blocked}
                onChange={visit.onBlockedChange}
                onFamilyChanged={visit.onFamilyChanged}
              />
            )}
            <div className="sv-card sv-card-pad">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <h2 className="sv-card-title">Tour schedule</h2>
                {allSlots.length > 0 && <span className="sv-sub">{confirmedSlots} of {allSlots.length} confirmed</span>}
              </div>
              {conflictRows.size > 0 && (
                <p className="sv-warn" style={{ margin: "8px 0 0", fontSize: 14 }}>
                  {Object.keys(slotConflict).length === 1 ? "1 tour needs a look" : `${Object.keys(slotConflict).length} tours need a look`}: it clashes with a time the parent can't do, or with another tour.
                </p>
              )}
              {scheduleItems.length === 0 ? (
                <p className="sv-hint" style={{ margin: "12px 0 0" }}>No tours booked yet.</p>
              ) : (
                <div style={{ marginTop: 8 }}>
                  {scheduleItems.map((t) => {
                    const d = new Date(t.date + "T00:00:00");
                    return (
                      <div className="sv-tl" key={t.key} style={t.status === "completed" ? { opacity: 0.6 } : undefined}>
                        <div className="sv-tl-dt">
                          <b>{d.getDate()}</b>
                          {d.toLocaleDateString(undefined, { weekday: "short", month: "short" })}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="sv-nm" style={{ fontSize: 15 }}>{t.row.school?.name}</div>
                          <div style={{ margin: "3px 0" }}>
                            {kidsFor(t.row).map((c) => (
                              <KidTag key={c.id} name={childName(c)} index={childIndex(c.id)} />
                            ))}
                          </div>
                          <div className="sv-sub">
                            {t.start ? clock12(t.start) : "Time to be set"}
                            {t.end ? ` – ${clock12(t.end)}` : ""} · {t.label.toLowerCase()} ·{" "}
                            {t.clash ? (
                              <span className="sv-warn">{t.clash}</span>
                            ) : t.status === "confirmed" ? (
                              <span className="sv-ok">
                                confirmed{t.shared ? " · on the parent's app" : t.shared === null ? " · not sent to the parent yet" : ""}
                              </span>
                            ) : t.status === "completed" ? (
                              "toured"
                            ) : (
                              "waiting to confirm"
                            )}{" "}
                            · {relativeDay(t.date)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {visit && scheduleItems.length > 0 && (
                <>
                  <button
                    type="button"
                    className={"sv-btn " + (scheduleReady ? "is-primary" : "is-off")}
                    style={{ width: "100%", marginTop: 8 }}
                    onClick={() => scheduleReady && openSendSchedule()}
                    disabled={!scheduleReady || !!sendingSchedule}
                  >
                    {scheduleSent ? "Schedule sent ✓ (send again)" : "Send schedule to parent"}
                  </button>
                  {scheduleReady && (
                    <div style={{ textAlign: "center", marginTop: 6 }}>
                      <button type="button" className="sv-btn is-link is-sm" onClick={shareToApp} disabled={sharing || unsharedTours === 0}>
                        {sharing ? "Posting…" : unsharedTours === 0 ? "On the parent's app ✓" : "Post to the parent's app only (no email)"}
                      </button>
                    </div>
                  )}
                  <div className="sv-sub" style={{ marginTop: 8, textAlign: "center" }}>
                    {scheduleReady ? "Every tour is confirmed" : "Available once every tour is confirmed and nothing clashes"}
                  </div>
                </>
              )}
              {sendingSchedule && (
                <div className="tw-compose">
                  <EmailComposer
                    key="send-schedule"
                    familyId={familyId}
                    familyName={visit.familyName}
                    childLines={visit.composerCtx.childLines}
                    documents={[]}
                    staffName={visit.composerCtx.staffName}
                    familyAddress={visit.composerCtx.familyAddress}
                    childRows={children}
                    dubaiFrom={visit.family?.dubai_available_from}
                    dubaiUntil={visit.family?.dubai_available_until}
                    initial={sendingSchedule}
                    onSent={() => {
                      setSendingSchedule(null);
                      shareToApp();
                    }}
                    onClose={() => setSendingSchedule(null)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ---------- One child's tab ---------- */

  function renderChild(child) {
    const empty = rows.length === 0;
    return (
      <div className="sv-card" style={{ overflow: "hidden" }}>
        {empty ? (
          <p className="sv-hint" style={{ margin: 20 }}>No schools shortlisted for this family yet.</p>
        ) : (
          <div className="sv-scroll">
            <div className="sv-tbl">
              <div className="sv-tb is-head" style={{ "--sv-cols": childCols }}>
                <span>School</span>
                <span>Availability</span>
                <span>Primary tour</span>
                <span>Secondary tour</span>
                <span>Feedback</span>
                <span>Next step</span>
              </div>
              {liveRows.map((row) => {
                const open = expandedId === row.id;
                const [nextLabel, nextTone, nextWho] = nextStep(row, child.id);
                const kidsPlacedHere = placedHere(placed, children, row.school_id, row.school?.name);
                return (
                  <div key={row.id}>
                    <div
                      className={"sv-tb" + (open ? " is-sel" : "")}
                      style={{ "--sv-cols": childCols }}
                      tabIndex={0}
                      role="button"
                      aria-expanded={open}
                      onClick={() => toggleRow(row)}
                      onKeyDown={(e) => onRowKey(e, () => toggleRow(row))}
                    >
                      <div>
                        <div className={"sv-nm" + (open ? " is-sel" : "")}>
                          {row.school?.name || "Unknown school"}
                          {(notesById[row.id] || "").trim() && <span title="Has a note"> 📝</span>}
                        </div>
                        <div className="sv-sb">
                          {row.priority === "primary" ? "★ Primary choice" : row.priority === "secondary" ? "Backup choice" : row.school?.area || ""}
                          {kidsPlacedHere.length > 0 && ` · 🎓 Placed: ${kidsPlacedHere.map(childName).join(", ")}`}
                        </div>
                      </div>
                      <div>{availabilityCell(row, child)}</div>
                      {tourCell(row, "tour_")}
                      {tourCell(row, "tour2_")}
                      {feedbackCell(row)}
                      <span className="sv-st sv-next">
                        <WhoTag who={nextWho} />
                        <span>
                          {nextTone && <i className={"sv-d is-" + nextTone} />}
                          {nextLabel}
                        </span>
                      </span>
                    </div>
                    {open && renderDetail(row)}
                  </div>
                );
              })}
              {renderClosedBand(childCols, true)}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="sv">
      {placedKids.length > 0 && (
        <div className="sv-placed">
          <span aria-hidden="true">🎓</span>
          <span>
            {placedKids.map(([childId, p], i) => {
              const idx = childIndex(childId);
              return (
                <span key={childId}>
                  {i > 0 && " · "}
                  <strong>{idx === -1 ? "Child" : displayNameForChild(children[idx], idx)}</strong> placed at {p.schoolName}
                  {p.startDate ? ` (starts ${shortDate(p.startDate)})` : ""}
                </span>
              );
            })}
            <span className="sv-placed-sub">
              {placedKids.length >= children.length
                ? "Every child is placed, so the other schools are closed and kept at the bottom for reference."
                : "Schools stay open until every child is placed. Placed children show as placed in their column."}
            </span>
          </span>
        </div>
      )}

      {error && <p className="sv-error">{error}</p>}
      {enquiryPrompt && rows.find((r) => r.id === enquiryPrompt) && (
        <div className="sv-new" style={{ marginTop: 12 }}>
          <div className="sv-new-head">
            <b>{rows.find((r) => r.id === enquiryPrompt).school?.name} is on the shortlist</b>
            <span className="sv-sub">The availability email is ready to review. Nothing is sent until you press Send.</span>
          </div>
          <div className="sv-pills" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="sv-btn is-primary is-sm"
              onClick={() => {
                openSchoolDraft("enquiry", rows.find((r) => r.id === enquiryPrompt));
                setEnquiryPrompt(null);
              }}
            >
              Review the email
            </button>
            <button type="button" className="sv-btn is-sm" onClick={() => setEnquiryPrompt(null)}>
              Later
            </button>
          </div>
        </div>
      )}

      <div className="sv-vrow">
        <div className="sv-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={activeTab === "overview"} className={activeTab === "overview" ? "is-on" : ""} onClick={() => { setTab("overview"); setAsk(null); }}>
            Overview
          </button>
          {children.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={activeTab === c.id}
              className={activeTab === c.id ? "is-on" : ""}
              onClick={() => { setTab(c.id); setAsk(null); }}
            >
              {childName(c)}
              <span className="sv-n">{liveRows.length}</span>
            </button>
          ))}
        </div>
        <button type="button" className="sv-btn is-primary" style={{ marginBottom: 8 }} onClick={() => setShowAdd(true)}>
          + Shortlist a school
        </button>
      </div>

      {loading ? <p className="sv-hint">Loading…</p> : activeChild ? renderChild(activeChild) : renderOverview()}

      {showAdd && (
        <div className="sv-modal-back" onClick={() => !busy && setShowAdd(false)}>
          <form className="sv-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} onSubmit={handleAdd}>
            <h3>Shortlist a school</h3>
            {addableSchools.length === 0 ? (
              <p className="sv-hint" style={{ margin: 0 }}>Every school in the list is already on this family's shortlist.</p>
            ) : (
              <label className="sv-fld">
                School
                <select value={addingSchoolId} onChange={(e) => setAddingSchoolId(e.target.value)} disabled={busy} autoFocus>
                  <option value="">Choose a school…</option>
                  {addableSchools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.area ? `, ${s.area}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="sv-modal-actions">
              <button type="button" className="sv-btn is-sm is-quiet" onClick={() => setShowAdd(false)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="sv-btn is-primary is-sm" disabled={busy || !addingSchoolId}>
                Add to shortlist
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
