import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import FormSection from "./FormSection";
import FormField from "./FormField";
import FormSelect from "./FormSelect";
import YesNoSelect from "./YesNoSelect";
import PhoneField from "./PhoneField";
import DateField from "./DateField";
import AddressBlock, { resolveAddress } from "./AddressBlock";
import PageHeader from "./PageHeader";
import DocumentChecklist from "./DocumentChecklist";
import { saveApplication, submitApplication, deleteChild } from "../lib/applicationData";
import { deleteDocument } from "../lib/documents";
import { getMissingItems, getStepBreakdown } from "../lib/completeness";
import {
  NATIONALITIES,
  RELIGIONS,
  LANGUAGES,
  ACADEMIC_YEARS,
  YEAR_GROUPS,
  TERMS,
  CURRICULA,
  ENGLISH_PROFICIENCY_LEVELS,
  REASONS_FOR_LEAVING,
} from "../data/formOptions";
import { CHILD_DOCUMENT_TYPES, PARENT_DOCUMENT_TYPES } from "../data/documentTypes";
import "../styles/form.css";
import "./ApplicationForm.css";

// NOTE: every field below is a real, saved column as of the round-4 schema
// addendum (eduhub_schema_addendum_1.sql) — run that file once in the
// Supabase SQL Editor and everything here (including the fields that used
// to be "preview only": gender, preferred name, year group, curriculum,
// the various Yes/No questions, notes, sports achievements, and the
// current-school contact name/phone) saves for real via
// applicationData.js's whitelist. If a reload stops keeping one of these
// values, the addendum SQL hasn't been run against Supabase yet.

const emptyChild = {
  full_name: "",
  date_of_birth: "",
  nationality: "",
  religion: "",
  first_language: "",
  second_language: "",
  medical_inclusion_needs: "",
  sports_hobbies_interests: "",
  sports_achievements: "",
  eid: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  preferred_name: "",
  gender: "",
  academic_year_of_entry: "",
  year_group_applying_for: "",
  term: "",
  english_first_home_language: "",
  english_proficiency: "",
  has_sen: "",
  sen_description: "",
  gifted_talented: "",
  has_transfer_certificate: "",
  notes: "",
  // Separated or split households mean a child doesn't always live at the
  // account holder's address (founder feedback, 2026-09-02). `address_same_as`
  // records the CHOICE ("household" / "mother" / "father", or "" for an
  // address of their own) and `address` always holds the resolved text, so
  // anything reading the database straight — the founders' portal included —
  // sees a real address without having to follow the reference.
  address: "",
  address_same_as: "",
};

const emptySchool = {
  school_name: "",
  school_address: "",
  contact_email: "",
  contact_name: "",
  contact_phone: "",
  year_group_of_leaving: "",
  date_attended_last: "",
  curriculum: "",
  reason_for_leaving: "",
};

const emptyParent = {
  full_name: "",
  email: "",
  phone: "",
  nationality: "",
  religion: "",
  first_language: "",
  second_language: "",
  employer_name: "",
  occupation_designation: "",
  eid: "",
  address: "",
  address_same_as: "",
};

const MAX_CHILDREN = 6;

// One-time backfill for a child saved before the name was split into parts
// — so an existing full_name doesn't just look blank in the new First/Last
// fields. First word becomes first name, everything else becomes last name;
// this is a starting guess the family can correct, not a real parse.
// A brand-new nullable column (like tonight's notes / sports_achievements /
// current_schools.contact_name / contact_phone) comes back as SQL NULL for
// any row saved before that column existed — merging that straight into
// emptyChild/emptySchool would hand a controlled <textarea>/<input> a null
// value instead of emptyChild's "" default. Stripping nulls first means the
// empty-string defaults win until the family saves once, same as any other
// still-unanswered field.
function dropNulls(obj) {
  const out = {};
  Object.keys(obj || {}).forEach((k) => {
    if (obj[k] !== null) out[k] = obj[k];
  });
  return out;
}

function backfillNameParts(child) {
  if (child.first_name || child.last_name || !child.full_name) return child;
  const parts = child.full_name.trim().split(/\s+/);
  if (!parts.length || !parts[0]) return child;
  return {
    ...child,
    first_name: parts[0],
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}

// The best name to show for a child wherever a compact label is needed —
// preferred name first since that's what the family actually calls them day
// to day, then first name, then whatever was in the single legacy full_name
// field, blank (not a placeholder) once none of those exist yet, so a card
// simply doesn't show a name line rather than showing a fake one.
function displayNameForChild(child) {
  return (child?.preferred_name || child?.first_name || child?.full_name || "").trim();
}

// Card-list step keys: "mother", "father", then "child-0", "child-1"... —
// home address isn't behind a card (see the card-list section below), so it
// never appears in this array.
function buildSteps(children) {
  const list = [
    { key: "mother", role: "Mother" },
    { key: "father", role: "Father" },
  ];
  children.forEach((_, i) => list.push({ key: `child-${i}`, childIndex: i }));
  return list;
}

function stepIndexForKey(steps, key) {
  const i = steps.findIndex((s) => s.key === key);
  return i === -1 ? 0 : i;
}

// Turns one item from getMissingItems() into the same string used as the
// `data-field-key` on that exact field/document row in the DOM below, so a
// failed Submit can scroll straight to it instead of just naming it in text.
function fieldKeyForMissingItem(item) {
  if (!item) return null;
  if (item.kind === "field") {
    if (item.owner === "parent") return `parent-${item.parentIndex}-${item.field}`;
    if (item.owner === "child") return `child-${item.childIndex}-${item.field}`;
    if (item.owner === "family") return `family-${item.field}`;
    if (item.owner === "school") return `school-${item.schoolIndex}-${item.field}`;
  }
  if (item.kind === "document") {
    if (item.owner === "parent") return `parent-doc-${item.parentIndex}-${item.docKey}`;
    if (item.owner === "child") return `child-doc-${item.childIndex}-${item.docKey}`;
  }
  return null;
}

// Always returns a fixed 2-entry [Mother, Father] array. Matches existing
// rows by their `relationship` column first; falls back to array order for
// legacy data saved before that column existed, so nobody's information
// gets dropped just because they filled the form in before this change.
function buildInitialParents(existingParents) {
  const byRole = { Mother: null, Father: null };
  (existingParents || []).forEach((p) => {
    if (p.relationship === "Mother" || p.relationship === "Father") byRole[p.relationship] = p;
  });
  const unassigned = (existingParents || []).filter((p) => p.relationship !== "Mother" && p.relationship !== "Father");
  if (!byRole.Mother && unassigned.length) byRole.Mother = unassigned.shift();
  if (!byRole.Father && unassigned.length) byRole.Father = unassigned.shift();

  return [
    { ...emptyParent, ...byRole.Mother, relationship: "Mother" },
    { ...emptyParent, ...byRole.Father, relationship: "Father" },
  ];
}

// Whichever existing parent row is tied to the signed-in user is the account
// holder; brand-new applications default to Mother until the toggle is used.
function buildInitialAccountHolderRole(existingParents, userId) {
  const holder = (existingParents || []).find((p) => p.user_id === userId);
  return holder?.relationship === "Father" ? "Father" : "Mother";
}

// Which of a parent's fields the "Same as Mother" sync copies across —
// general background info that's genuinely often shared, not anything
// contact/document-specific (email, phone, employer, EID stay independent).
const SAME_AS_MOTHER_FIELDS = ["nationality", "religion", "first_language", "second_language"];

// The database has always allowed any number of children per family
// (children.family_id, no uniqueness constraint) — this form matches that:
// two fixed parent roles (Mother, Father), then a "how many children"
// choice that adds a card per child. The Application tab opens on a card
// list (one card per person, a live progress bar + Edit button) — clicking
// Edit opens that person's full section, same fields and documents as
// before, just reached through a card instead of a step pill.
export default function ApplicationForm({ familyId, userId, initialData, onSaved, initialStepKey, initialFieldKey }) {
  const navigate = useNavigate();
  const startingChildren = initialData.children?.length ? initialData.children : [{}];

  const [children, setChildren] = useState(
    startingChildren.map((c) => backfillNameParts({ ...emptyChild, ...dropNulls(c) }))
  );
  const [currentSchools, setCurrentSchools] = useState(
    startingChildren.map((c) => ({ ...emptySchool, ...dropNulls(initialData.schoolsByChild?.[c.id] || {}) }))
  );
  const [homeAddress, setHomeAddress] = useState(initialData.family?.home_address || "");
  const [parents, setParents] = useState(() => buildInitialParents(initialData.parents));
  const [accountHolderRole, setAccountHolderRole] = useState(() =>
    buildInitialAccountHolderRole(initialData.parents, userId)
  );
  // Father's "Same as Mother" toggle — see SAME_AS_MOTHER_FIELDS above and
  // the sync effect below. Auto-detects "on" for data that already matches
  // (e.g. right after this ships) so it doesn't look off by default for
  // families who happen to already share these answers.
  const [sameAsMotherGeneral, setSameAsMotherGeneral] = useState(() => {
    const initial = buildInitialParents(initialData.parents);
    return SAME_AS_MOTHER_FIELDS.every((f) => initial[0][f] && initial[0][f] === initial[1][f]);
  });

  // Documents live outside the save-everything-at-once flow (each upload
  // hits storage immediately), but they're keyed the same way the fetch in
  // applicationData.js returns them — "type:id" — so the two stay in sync.
  const [documentsByOwner, setDocumentsByOwner] = useState(initialData.documentsByOwner || {});

  function docsFor(ownerType, ownerId) {
    return documentsByOwner[`${ownerType}:${ownerId}`] || [];
  }

  function setDocsFor(ownerType, ownerId, docs) {
    setDocumentsByOwner((prev) => ({ ...prev, [`${ownerType}:${ownerId}`]: docs }));
  }

  const steps = useMemo(() => buildSteps(children), [children.length]);

  // The Application tab's default view is the card list; a specific card's
  // edit view only opens when something points there directly — arriving
  // from Overview's "What's left" with a real card's step key, or an
  // in-session Edit click. "home_address" (and anything else with no card)
  // keeps the list showing, since that field is already visible there.
  const initialCardStep = initialStepKey && steps.some((s) => s.key === initialStepKey) ? initialStepKey : null;
  const [showingList, setShowingList] = useState(!initialCardStep);
  const [stepIndex, setStepIndex] = useState(() => (initialCardStep ? stepIndexForKey(steps, initialCardStep) : 0));

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // What just succeeded, so the banner can say the right thing — a draft
  // save and a real submission aren't the same event and shouldn't read
  // like one, especially since only Submit actually locks anything in.
  const [lastAction, setLastAction] = useState(null); // "draft" | "submit" | null
  // Red inline field highlighting only appears once someone has actually
  // tried to submit — never while they're still mid-draft, since most
  // fields are expected to be empty at that point.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  // "keeps going blank" fix, part 1: a debounced autosave so nothing typed
  // ever depends on remembering to click "Save draft" — see the effect
  // below. This is a quiet indicator only; the loud green banner stays
  // reserved for an explicit Save draft / Submit click.
  const [autosaveStatus, setAutosaveStatus] = useState("idle"); // idle | saving | saved | error
  // Which field/document to scroll to after a failed Submit — see the
  // effect below, and fieldKeyForMissingItem() above for how it's derived.
  // Also seeded from Overview's "Still outstanding" list (initialFieldKey)
  // so clicking a specific missing document there doesn't just open that
  // person's card, it scrolls straight to that exact upload row.
  const [scrollTarget, setScrollTarget] = useState(
    initialCardStep && initialFieldKey ? initialFieldKey : null
  );
  // The child a "−" click would actually delete (has saved data) — set by
  // requestChildCountChange, cleared by confirmRemoveChild/cancelRemoveChild.
  // Non-null shows the inline "remove this child?" banner instead of
  // silently dropping their card.
  const [pendingRemoveChild, setPendingRemoveChild] = useState(null); // { index, name } | null
  const [removingChild, setRemovingChild] = useState(false);
  const [removeError, setRemoveError] = useState("");

  // Keeps Father's synced fields matching Mother's live, for as long as the
  // toggle is on. Reading it back off just stops the sync — it does NOT
  // clear what Father's fields currently hold, since those are still
  // perfectly good values, just no longer tied to Mother's.
  useEffect(() => {
    if (!sameAsMotherGeneral) return;
    setParents((prev) => {
      const mother = prev[0];
      const father = prev[1];
      const nextFather = { ...father };
      let changed = false;
      SAME_AS_MOTHER_FIELDS.forEach((f) => {
        if (nextFather[f] !== mother[f]) {
          nextFather[f] = mother[f];
          changed = true;
        }
      });
      if (!changed) return prev;
      const next = [...prev];
      next[1] = nextFather;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameAsMotherGeneral, parents[0].nationality, parents[0].religion, parents[0].first_language, parents[0].second_language]);

  // Anyone who picked "same as ..." for their address has that address kept
  // in step with its source here, exactly like the Father's "Same as Mother"
  // toggle above. The stored text is always the real, resolved address —
  // never a pointer the founders' portal would have to follow — so editing
  // the household address updates everyone who shares it, in one place.
  const motherAddress = parents[0]?.address || "";
  const fatherAddress = parents[1]?.address || "";
  useEffect(() => {
    const sources = { household: homeAddress, mother: motherAddress, father: fatherAddress };
    setParents((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        if (!p.address_same_as) return p;
        const resolved = resolveAddress(p.address_same_as, sources);
        if (p.address === resolved) return p;
        changed = true;
        return { ...p, address: resolved };
      });
      return changed ? next : prev;
    });
    setChildren((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (!c.address_same_as) return c;
        const resolved = resolveAddress(c.address_same_as, sources);
        if (c.address === resolved) return c;
        changed = true;
        return { ...c, address: resolved };
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeAddress, motherAddress, fatherAddress]);

  // Single source of truth for what's still missing, shared with Overview's
  // "What's left" card via lib/completeness.js — Submit is blocked exactly
  // when this is non-empty, and nothing else decides that independently.
  // Required FIELDS only — documents stopped blocking Submit on 2026-09-02
  // (founder feedback: a family still waiting on a visa or an Emirates ID
  // shouldn't be locked out of applying). Anything still to upload is tracked
  // by getOutstandingDocuments() and surfaced on the Dashboard instead.
  const missingItems = useMemo(
    () => getMissingItems({ parents, accountHolderRole, homeAddress, children, currentSchools }),
    [parents, accountHolderRole, homeAddress, children, currentSchools]
  );
  // Per-card progress (%, missing count) for the card list — same
  // underlying numbers as missingItems, just grouped and totaled per
  // person so each card can show its own bar instead of a plain flag.
  const stepBreakdown = useMemo(
    () => getStepBreakdown({ parents, accountHolderRole, children, currentSchools, documentsByOwner }),
    [parents, accountHolderRole, children, currentSchools, documentsByOwner]
  );

  // Lookups so each field/document can ask "am I one of the missing ones?"
  // in O(1) without re-deriving anything — same missingItems list that
  // drives the cards and the Overview checklist.
  const missingFieldKeys = useMemo(() => {
    const set = new Set();
    missingItems.forEach((item) => {
      if (item.kind !== "field") return;
      if (item.owner === "parent") set.add(`parent:${item.parentIndex}:${item.field}`);
      else if (item.owner === "child") set.add(`child:${item.childIndex}:${item.field}`);
      else if (item.owner === "family") set.add(`family:${item.field}`);
      else if (item.owner === "school") set.add(`school:${item.schoolIndex}:${item.field}`);
    });
    return set;
  }, [missingItems]);

  function isFieldMissing(key) {
    return attemptedSubmit && missingFieldKeys.has(key);
  }

  function openCard(index) {
    setStepIndex(index);
    setShowingList(false);
  }

  function backToList() {
    setShowingList(true);
  }

  function updateParentAt(i, field, value) {
    setParents((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  }

  // First/Middle/Last stay the fields the family actually types into, but
  // full_name (the real, required, "as in passport" column) is kept in sync
  // automatically underneath — nothing else in the app (Overview, the
  // family tree, saving) needs to know the name is now entered in parts.
  function updateChildAt(i, field, value) {
    setChildren((prev) =>
      prev.map((c, idx) => {
        if (idx !== i) return c;
        const next = { ...c, [field]: value };
        if (field === "first_name" || field === "middle_name" || field === "last_name") {
          next.full_name = [next.first_name, next.middle_name, next.last_name].filter(Boolean).join(" ").trim();
        }
        return next;
      })
    );
  }

  function updateSchoolAt(i, field, value) {
    setCurrentSchools((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }

  function handleChildCountChange(nextCount) {
    const clamped = Math.max(0, Math.min(MAX_CHILDREN, nextCount));
    setChildren((prev) => {
      const next = [...prev];
      while (next.length < clamped) next.push({ ...emptyChild });
      return next.slice(0, clamped);
    });
    setCurrentSchools((prev) => {
      const next = [...prev];
      while (next.length < clamped) next.push({ ...emptySchool });
      return next.slice(0, clamped);
    });
  }

  // The stepper only ever moves by one at a time, so a decrease only ever
  // drops the LAST child (matches the slice(0, clamped) above). If that
  // child was never actually saved (no id — never uploaded anything, never
  // survived a save), there's nothing to lose, so it's removed immediately
  // like any other local edit. If it WAS saved, this is real, irreversible
  // deletion — the family confirms first (see confirmRemoveChild below)
  // instead of it happening on a single stray click.
  function requestChildCountChange(nextCount) {
    const clamped = Math.max(0, Math.min(MAX_CHILDREN, nextCount));
    if (clamped >= children.length) {
      handleChildCountChange(clamped);
      return;
    }
    const target = children[children.length - 1];
    if (!target?.id) {
      handleChildCountChange(clamped);
      return;
    }
    setPendingRemoveChild({
      index: children.length - 1,
      name: displayNameForChild(target) || `Child ${children.length}`,
    });
    setRemoveError("");
  }

  // Actually deletes the pending child's saved data — their documents first
  // (documents has no FK to cascade on, since it's polymorphic across
  // parents and children — see lib/documents.js), then the children row
  // itself (current_schools cascades automatically via its own FK). Only
  // reached after the family has explicitly confirmed via the inline
  // banner in CardListView.
  async function confirmRemoveChild() {
    if (!pendingRemoveChild) return;
    const { index } = pendingRemoveChild;
    const child = children[index];
    setRemovingChild(true);
    setRemoveError("");
    try {
      if (child?.id) {
        const docs = documentsByOwner[`child:${child.id}`] || [];
        for (const doc of docs) {
          await deleteDocument(doc);
        }
        await deleteChild(child.id);
      }
      setChildren((prev) => prev.filter((_, i) => i !== index));
      setCurrentSchools((prev) => prev.filter((_, i) => i !== index));
      setDocumentsByOwner((prev) => {
        if (!child?.id) return prev;
        const next = { ...prev };
        delete next[`child:${child.id}`];
        return next;
      });
      setPendingRemoveChild(null);
    } catch (err) {
      setRemoveError(err.message || "Couldn't remove this child — try again.");
    } finally {
      setRemovingChild(false);
    }
  }

  function cancelRemoveChild() {
    setPendingRemoveChild(null);
    setRemoveError("");
  }

  // Guards every call to persist() below — manual Save draft, Submit, AND
  // the autosave effect all funnel through this so two saves can never run
  // at once. That matters here specifically: a family's children/parents
  // were once accidentally duplicated (2026-08-27) because a save partially
  // failed and a second save re-inserted rows that already existed. Autosave
  // firing mid-save is the same shape of race, just from a different
  // trigger, so it gets the same lock.
  const saveLockRef = useRef(false);
  // The exact snapshot of editable state that was last successfully sent to
  // the server — the autosave effect below only schedules a save when the
  // current state has actually drifted from this, so a save that changes
  // nothing (e.g. the id-refresh right after a prior save) doesn't schedule
  // another one and loop forever.
  const lastSavedSnapshotRef = useRef(null);
  const autosaveTimerRef = useRef(null);

  function snapshotOfEditableState() {
    return JSON.stringify({ parents, children, currentSchools, homeAddress, accountHolderRole });
  }

  // Shared by Save draft, Submit, and autosave — persists whatever's
  // currently in state, no validation. Returns the saved rows so each caller
  // can decide what happens next (draft/autosave stay put; submit also flips
  // intake_status) — or null if another save was already in flight, in which
  // case the caller should just leave it for that save (or the next change)
  // to cover.
  async function persist() {
    if (saveLockRef.current) return null;
    saveLockRef.current = true;
    const preSaveSnapshot = snapshotOfEditableState();
    try {
      const saved = await saveApplication({
        familyId,
        userId,
        children,
        currentSchools,
        parents,
        accountHolderRole,
        homeAddress,
        sameAsMotherGeneral,
      });
      // Critical: write the database-assigned ids back into state, MERGED
      // onto the existing local objects rather than replacing them — saved
      // rows only carry real database columns (see applicationData.js), so
      // a plain replace would silently wipe out the preview-only fields
      // (gender, preferred name, year group, etc) the family just typed.
      // Merging keeps both: the real id (so a second save updates instead
      // of duplicating) and the not-yet-saved fields (so they don't vanish
      // out from under whoever's filling the form in).
      setChildren((prev) => saved.children.map((sc, idx) => ({ ...prev[idx], ...sc })));
      setCurrentSchools((prev) => saved.currentSchools.map((ss, idx) => ({ ...prev[idx], ...ss })));
      if (saved.parents) setParents((prev) => saved.parents.map((sp, idx) => ({ ...prev[idx], ...sp })));
      lastSavedSnapshotRef.current = preSaveSnapshot;
      return saved;
    } finally {
      saveLockRef.current = false;
    }
  }

  // The fix for "I filled something in and it went blank again" — rather
  // than only saving on an explicit click, every change to the editable
  // fields (once the user has actually made one — the initial data load
  // itself is never treated as a change) is quietly persisted a couple of
  // seconds after they stop typing. Switching tabs, a flaky connection, or
  // even just closing the laptop can no longer lose more than a couple of
  // seconds of typing, on top of whatever "Save draft" already covered.
  useEffect(() => {
    if (lastSavedSnapshotRef.current === null) {
      // First run, right after mount — this IS the data that was just
      // loaded, not a change the user made, so it's the baseline, not
      // something to save.
      lastSavedSnapshotRef.current = snapshotOfEditableState();
      return;
    }
    if (snapshotOfEditableState() === lastSavedSnapshotRef.current) return;

    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      setAutosaveStatus("saving");
      try {
        const saved = await persist();
        setAutosaveStatus(saved ? "saved" : "idle");
      } catch (err) {
        // Quiet failure by design — the user hasn't asked for anything here,
        // so no red banner; the footer note below is enough, and "Save
        // draft" still works as an explicit fallback. Still logged (not
        // swallowed entirely) so a real recurring cause shows up in the
        // browser console instead of just "couldn't autosave" with no way
        // to tell why.
        console.error("Autosave failed:", err);
        setAutosaveStatus("error");
      }
    }, 1500);

    return () => clearTimeout(autosaveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parents, children, currentSchools, homeAddress, accountHolderRole]);

  // "Like how my code auto-saves, but I can also hit Cmd+S" — the autosave
  // above is the automatic half; this is the deliberate half. Cmd+S on a Mac,
  // Ctrl+S on Windows, saves the draft right now instead of waiting out the
  // debounce, and preventDefault stops the browser opening its own "save this
  // web page" dialog over the top of the form.
  useEffect(() => {
    function onKeyDown(e) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      handleSaveDraft();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parents, children, currentSchools, homeAddress, accountHolderRole]);

  // After a failed Submit, jump to the first missing item's card (or stay
  // on the list, for the home address field) AND scroll straight to that
  // exact field/document once it's actually on screen — "point at what
  // needs to get filled" instead of leaving it to a banner.
  useEffect(() => {
    if (!scrollTarget) return;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-field-key="${scrollTarget}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = el?.matches("input,select,textarea") ? el : el?.querySelector("input,select,textarea");
      focusable?.focus({ preventScroll: true });
      setScrollTarget(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollTarget, stepIndex, showingList]);

  // Saves exactly what's filled in so far, required fields or not — this is
  // the fix for the form previously refusing to save anything at all until
  // every * field was complete, which meant a family who didn't finish in
  // one sitting had nothing to come back to.
  // A raw database error ("invalid input syntax for type date...") is
  // meaningless to a family filling in the form — log the real message for
  // debugging, but show something a person can actually act on. Anything
  // that's clearly our own validation text (no SQL-shaped phrasing) still
  // passes through as-is, since those are already written to be readable.
  function friendlyError(err, fallback) {
    const msg = err?.message || "";
    console.error(err);
    const looksLikeRawDbError = /invalid input syntax|violates|constraint|column .* does not exist|duplicate key/i.test(msg);
    return looksLikeRawDbError || !msg ? fallback : msg;
  }

  async function handleSaveDraft() {
    setError("");
    setSaving(true);
    try {
      const saved = await persist();
      if (!saved) {
        setError("Still saving in the background — give it a second and try again.");
        return;
      }
      setLastAction("draft");
      onSaved?.();
    } catch (err) {
      setError(friendlyError(err, "Something went wrong saving your draft — please try again."));
    } finally {
      setSaving(false);
    }
  }

  // The real "finish line" — only this validates, and only this marks the
  // application as actually submitted.
  async function handleSubmitApplication(e) {
    e.preventDefault();
    setError("");

    if (missingItems.length) {
      setAttemptedSubmit(true);
      const first = missingItems[0];
      const cardIndex = steps.findIndex((s) => s.key === first.stepKey);
      if (cardIndex === -1) {
        // No card owns this item (home address) — the list view already
        // shows it directly.
        setShowingList(true);
      } else {
        openCard(cardIndex);
      }
      setScrollTarget(fieldKeyForMissingItem(first));
      setError(
        `${missingItems.length} required field${missingItems.length > 1 ? "s are" : " is"} still missing before you can submit — they're highlighted below, or listed under "What's left" on the Dashboard. Documents don't block submitting; upload those whenever you get them.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const saved = await persist();
      if (!saved) {
        setError("Still saving in the background — give it a second and try again.");
        return;
      }
      await submitApplication(familyId);
      setLastAction("submit");
      onSaved?.();
      // Once everything's saved and submitted, the Dashboard is more useful
      // than staying on the form — it shows the result of what was just
      // filled in, rather than the same form again.
      navigate("/app/dashboard");
    } catch (err) {
      setError(friendlyError(err, "Something went wrong submitting your application — please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  const activeStep = steps[stepIndex] || steps[0];

  return (
    <form className="application-form" onSubmit={handleSubmitApplication} noValidate>
      <PageHeader
        title="Application"
        subtitle={
          showingList
            ? "Work through the blocks in order. Everything saves as a draft — you can come back and edit any block later."
            : undefined
        }
      />

      <div className="application-form-body">
        {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
        {!error && lastAction === "draft" && (
          <div className="hh-form-banner hh-form-banner-success">
            Draft saved. Come back any time — nothing here is required to save.
          </div>
        )}
        {!error && lastAction === "submit" && (
          <div className="hh-form-banner hh-form-banner-success">Submitted. You can still come back and edit.</div>
        )}

        {showingList ? (
          <CardListView
            parents={parents}
            accountHolderRole={accountHolderRole}
            setAccountHolderRole={setAccountHolderRole}
            homeAddress={homeAddress}
            setHomeAddress={setHomeAddress}
            attemptedSubmit={attemptedSubmit}
            missingFieldKeys={missingFieldKeys}
            children={children}
            onChildCountChange={requestChildCountChange}
            pendingRemoveChild={pendingRemoveChild}
            removingChild={removingChild}
            removeError={removeError}
            onConfirmRemoveChild={confirmRemoveChild}
            onCancelRemoveChild={cancelRemoveChild}
            stepBreakdown={stepBreakdown}
            onEditCard={openCard}
          />
        ) : (
          <>
            <button type="button" className="hh-link-btn back-to-list-btn" onClick={backToList}>
              ‹ Back to application
            </button>

            {activeStep.key === "mother" && (
              <ParentSection
                parent={parents[0]}
                index={0}
                role="Mother"
                isHolder={accountHolderRole === "Mother"}
                onChange={(field, value) => updateParentAt(0, field, value)}
                isFieldMissing={(field) => isFieldMissing(`parent:0:${field}`)}
                addressOptions={["household"]}
                userId={userId}
                documents={docsFor("parent", parents[0].id)}
                onDocumentsChange={(docs) => setDocsFor("parent", parents[0].id, docs)}
              />
            )}

            {activeStep.key === "father" && (
              <ParentSection
                parent={parents[1]}
                index={1}
                role="Father"
                isHolder={accountHolderRole === "Father"}
                onChange={(field, value) => updateParentAt(1, field, value)}
                isFieldMissing={(field) => isFieldMissing(`parent:1:${field}`)}
                addressOptions={["household", "mother"]}
                userId={userId}
                documents={docsFor("parent", parents[1].id)}
                onDocumentsChange={(docs) => setDocsFor("parent", parents[1].id, docs)}
                sameAsAbove={sameAsMotherGeneral}
                onToggleSameAsAbove={setSameAsMotherGeneral}
              />
            )}

            {activeStep.key.startsWith("child-") &&
              (() => {
                const i = activeStep.childIndex;
                const child = children[i];
                const school = currentSchools[i];
                const displayName = displayNameForChild(child) || `Child ${i + 1}`;
                const childMissing = (field) => isFieldMissing(`child:${i}:${field}`);
                const schoolMissing = (field) => isFieldMissing(`school:${i}:${field}`);

                const showsTransferCert = child.has_transfer_certificate !== "No";
                // achievement_certificate and sen_supporting_documents render inline
                // (next to Sports achievements / the SEN question) instead of in the
                // main Documents checklist below — see the two DocumentChecklist
                // instances further down in this component.
                const INLINE_DOC_KEYS = ["achievement_certificate", "sen_supporting_documents"];
                const childDocTypes = CHILD_DOCUMENT_TYPES.filter(
                  (d) => (d.key !== "leaving_certificate" || showsTransferCert) && !INLINE_DOC_KEYS.includes(d.key)
                );
                const achievementDocTypes = CHILD_DOCUMENT_TYPES.filter((d) => d.key === "achievement_certificate");
                const senDocTypes = CHILD_DOCUMENT_TYPES.filter((d) => d.key === "sen_supporting_documents");

                return (
                  <>
                    <FormSection title={`${displayName}'s general info`} description="As it appears on their passport.">
                      <FormField
                        label="First name (as in passport)"
                        required
                        fieldKey={`child-${i}-first_name`}
                        value={child.first_name}
                        onChange={(v) => updateChildAt(i, "first_name", v)}
                      />
                      <FormField
                        label="Middle name (as in passport)"
                        fieldKey={`child-${i}-middle_name`}
                        value={child.middle_name}
                        onChange={(v) => updateChildAt(i, "middle_name", v)}
                      />
                      <FormField
                        label="Last name (as in passport)"
                        required
                        fieldKey={`child-${i}-last_name`}
                        value={child.last_name}
                        onChange={(v) => updateChildAt(i, "last_name", v)}
                      />
                      <FormField
                        label="Preferred name"
                        hint="What they're actually called day to day, if different."
                        fieldKey={`child-${i}-preferred_name`}
                        value={child.preferred_name}
                        onChange={(v) => updateChildAt(i, "preferred_name", v)}
                      />
                      <FormSelect
                        label="Gender"
                        required
                        fieldKey={`child-${i}-gender`}
                        value={child.gender}
                        onChange={(v) => updateChildAt(i, "gender", v)}
                        options={["Male", "Female"]}
                        placeholder="Select an option"
                      />
                      <DateField
                        label="Date of birth"
                        required
                        error={childMissing("date_of_birth")}
                        fieldKey={`child-${i}-date_of_birth`}
                        value={child.date_of_birth}
                        onChange={(v) => updateChildAt(i, "date_of_birth", v)}
                      />
                      <FormSelect
                        label="Nationality"
                        required
                        error={childMissing("nationality")}
                        fieldKey={`child-${i}-nationality`}
                        value={child.nationality}
                        onChange={(v) => updateChildAt(i, "nationality", v)}
                        options={NATIONALITIES}
                        placeholder="Select nationality"
                      />
                      <FormSelect
                        label="Religion"
                        required
                        error={childMissing("religion")}
                        fieldKey={`child-${i}-religion`}
                        value={child.religion}
                        onChange={(v) => updateChildAt(i, "religion", v)}
                        options={RELIGIONS}
                        placeholder="Select religion"
                      />
                      <FormSelect
                        label="Academic year of entry"
                        required
                        fieldKey={`child-${i}-academic_year_of_entry`}
                        value={child.academic_year_of_entry}
                        onChange={(v) => updateChildAt(i, "academic_year_of_entry", v)}
                        options={ACADEMIC_YEARS}
                        placeholder="Select an option"
                      />
                      <FormSelect
                        label="Year group applying for"
                        required
                        fieldKey={`child-${i}-year_group_applying_for`}
                        value={child.year_group_applying_for}
                        onChange={(v) => updateChildAt(i, "year_group_applying_for", v)}
                        options={YEAR_GROUPS}
                        placeholder="Select an option"
                      />
                      <FormSelect
                        label="Term"
                        required
                        fieldKey={`child-${i}-term`}
                        value={child.term}
                        onChange={(v) => updateChildAt(i, "term", v)}
                        options={TERMS}
                        placeholder="Select an option"
                      />
                      <AddressBlock
                        label="Where does this child live?"
                        hint="Only different from the main household address if they live somewhere else — with one parent after a separation, with family, or at a boarding school."
                        fieldKey={`child-${i}-address`}
                        sameAs={child.address_same_as}
                        address={child.address}
                        options={["household", "mother", "father"]}
                        onChangeSameAs={(v) => updateChildAt(i, "address_same_as", v)}
                        onChangeAddress={(v) => updateChildAt(i, "address", v)}
                      />
                      <div className="hh-field hh-field-full">
                        <label>Notes</label>
                        <textarea
                          rows={2}
                          placeholder="Anything else worth noting about this child."
                          value={child.notes}
                          onChange={(e) => updateChildAt(i, "notes", e.target.value)}
                        />
                      </div>
                    </FormSection>

                    <FormSection
                      title="Additional info"
                      description="Language, wellbeing, and anything the school should know ahead of time."
                    >
                      <FormSelect
                        label="First language"
                        value={child.first_language}
                        onChange={(v) => updateChildAt(i, "first_language", v)}
                        options={LANGUAGES}
                        placeholder="Select language"
                      />
                      <FormSelect
                        label="Second language"
                        value={child.second_language}
                        onChange={(v) => updateChildAt(i, "second_language", v)}
                        options={LANGUAGES}
                        placeholder="Select language"
                      />
                      <YesNoSelect
                        label="Is English the child's first and home-spoken language?"
                        required
                        fieldKey={`child-${i}-english_first_home_language`}
                        value={child.english_first_home_language}
                        onChange={(v) => updateChildAt(i, "english_first_home_language", v)}
                      />
                      <FormSelect
                        label="What is your child's proficiency in English?"
                        required
                        fieldKey={`child-${i}-english_proficiency`}
                        value={child.english_proficiency}
                        onChange={(v) => updateChildAt(i, "english_proficiency", v)}
                        options={ENGLISH_PROFICIENCY_LEVELS}
                        placeholder="Select an option"
                      />
                      <FormField label="EID" hint="Once obtained." value={child.eid} onChange={(v) => updateChildAt(i, "eid", v)} />
                      <div />
                      <div className="hh-field hh-field-full">
                        <label>Sports, hobbies and interests</label>
                        <textarea
                          rows={2}
                          value={child.sports_hobbies_interests}
                          onChange={(e) => updateChildAt(i, "sports_hobbies_interests", e.target.value)}
                        />
                      </div>
                      <div className="hh-field hh-field-full">
                        <label>Sports achievements</label>
                        <textarea
                          rows={2}
                          placeholder="Trophies, selections, competitions — anything worth mentioning."
                          value={child.sports_achievements}
                          onChange={(e) => updateChildAt(i, "sports_achievements", e.target.value)}
                        />
                      </div>
                      <div className="hh-field-full">
                        <DocumentChecklist
                          title="Supporting documents for sports achievements"
                          userId={userId}
                          ownerType="child"
                          ownerId={child.id}
                          docTypes={achievementDocTypes}
                          documents={docsFor("child", child.id)}
                          onDocumentsChange={(docs) => setDocsFor("child", child.id, docs)}
                          fieldKeyPrefix={`child-doc-${i}`}
                          personLabel={displayName}
                        />
                      </div>

                      <YesNoSelect
                        label="Does your child have any Special Education Needs?"
                        required
                        fieldKey={`child-${i}-has_sen`}
                        value={child.has_sen}
                        onChange={(v) => updateChildAt(i, "has_sen", v)}
                      />
                      {child.has_sen === "Yes" && (
                        <>
                          <div className="hh-field hh-field-full" data-field-key={`child-${i}-sen_description`}>
                            <label>If your child has any Special Education Needs, please describe *</label>
                            <textarea
                              rows={2}
                              value={child.sen_description}
                              onChange={(e) => updateChildAt(i, "sen_description", e.target.value)}
                            />
                          </div>
                          <div className="hh-field-full">
                            <DocumentChecklist
                              title="Supporting documents for Special Education Needs"
                              userId={userId}
                              ownerType="child"
                              ownerId={child.id}
                              docTypes={senDocTypes}
                              documents={docsFor("child", child.id)}
                              onDocumentsChange={(docs) => setDocsFor("child", child.id, docs)}
                              fieldKeyPrefix={`child-doc-${i}`}
                              personLabel={displayName}
                            />
                          </div>
                        </>
                      )}
                      <YesNoSelect
                        label="Is your child on the Gifted or Talented Register?"
                        required
                        fieldKey={`child-${i}-gifted_talented`}
                        value={child.gifted_talented}
                        onChange={(v) => updateChildAt(i, "gifted_talented", v)}
                      />

                      <div className="hh-field hh-field-full">
                        <label>Does your child have any allergies or health conditions? *</label>
                        <textarea
                          rows={2}
                          placeholder='Please type "No" if there are no allergies or health conditions.'
                          value={child.medical_inclusion_needs}
                          onChange={(e) => updateChildAt(i, "medical_inclusion_needs", e.target.value)}
                        />
                      </div>
                    </FormSection>

                    <FormSection title="Current school" description="Their school right now, not the one they're applying to.">
                      <FormField
                        label="Current school"
                        required
                        error={schoolMissing("school_name")}
                        fieldKey={`school-${i}-school_name`}
                        value={school.school_name}
                        onChange={(v) => updateSchoolAt(i, "school_name", v)}
                      />
                      <FormSelect
                        label="Current school year group of leaving"
                        required
                        fieldKey={`school-${i}-year_group_of_leaving`}
                        value={school.year_group_of_leaving}
                        onChange={(v) => updateSchoolAt(i, "year_group_of_leaving", v)}
                        options={YEAR_GROUPS}
                        placeholder="Select an option"
                      />
                      <DateField
                        label="Current school — date attended last"
                        required
                        fieldKey={`school-${i}-date_attended_last`}
                        value={school.date_attended_last}
                        onChange={(v) => updateSchoolAt(i, "date_attended_last", v)}
                        minYear={new Date().getFullYear() - 15}
                        maxYear={new Date().getFullYear() + 1}
                      />
                      <FormSelect
                        label="Current school curriculum"
                        required
                        fieldKey={`school-${i}-curriculum`}
                        value={school.curriculum}
                        onChange={(v) => updateSchoolAt(i, "curriculum", v)}
                        options={CURRICULA}
                        placeholder="Select an option"
                      />
                      <FormSelect
                        label="Reason for leaving current school"
                        required
                        fieldKey={`school-${i}-reason_for_leaving`}
                        value={school.reason_for_leaving}
                        onChange={(v) => updateSchoolAt(i, "reason_for_leaving", v)}
                        options={REASONS_FOR_LEAVING}
                        placeholder="Select an option"
                      />
                      <FormField
                        label="Contact email at current school"
                        type="email"
                        hint="Used for the confidential reference request."
                        value={school.contact_email}
                        onChange={(v) => updateSchoolAt(i, "contact_email", v)}
                      />
                      <FormField
                        label="Contact name at current school"
                        hint="Who to address the reference request to, if known."
                        value={school.contact_name}
                        onChange={(v) => updateSchoolAt(i, "contact_name", v)}
                      />
                      <PhoneField
                        label="Contact phone at current school"
                        value={school.contact_phone}
                        onChange={(v) => updateSchoolAt(i, "contact_phone", v)}
                      />
                      <div className="hh-field hh-field-full">
                        <label>School address</label>
                        <textarea
                          rows={2}
                          value={school.school_address}
                          onChange={(e) => updateSchoolAt(i, "school_address", e.target.value)}
                        />
                      </div>
                    </FormSection>

                    <FormSection
                      title="Documents"
                      description="Upload as soon as the application is saved once — each file uploads immediately, so nothing here is lost by navigating away."
                    >
                      <YesNoSelect
                        label="Do you have a transfer / leaving certificate from their current school?"
                        hint="If not yet, that's fine — the upload below only shows once you say yes."
                        fieldKey={`child-${i}-has_transfer_certificate`}
                        value={child.has_transfer_certificate}
                        onChange={(v) => updateChildAt(i, "has_transfer_certificate", v)}
                      />
                      <div />
                      <div className="hh-field-full">
                        <DocumentChecklist
                          userId={userId}
                          ownerType="child"
                          ownerId={child.id}
                          docTypes={childDocTypes}
                          documents={docsFor("child", child.id)}
                          onDocumentsChange={(docs) => setDocsFor("child", child.id, docs)}
                          fieldKeyPrefix={`child-doc-${i}`}
                          personLabel={displayName}
                        />
                      </div>
                    </FormSection>
                  </>
                );
              })()}
          </>
        )}
      </div>

      <div className="application-form-footer">
        <span className="application-form-footer-hint">
          {missingItems.length
            ? `${missingItems.length} required field${missingItems.length > 1 ? "s" : ""} left`
            : "Everything required is filled in"}
          {autosaveStatus === "saving" && " · Saving…"}
          {autosaveStatus === "saved" && " · All changes saved"}
          {autosaveStatus === "error" && " · Couldn't autosave — click Save draft"}
        </span>
        <div className="application-form-footer-actions">
          <button className="hh-btn-secondary" type="button" onClick={handleSaveDraft} disabled={saving || submitting}>
            {saving ? "Saving draft..." : "Save draft"}
          </button>
          <button className="hh-btn-primary" type="submit" disabled={saving || submitting}>
            {submitting ? "Submitting..." : "Submit application"}
          </button>
        </div>
      </div>
    </form>
  );
}

// The default Application-tab view: a "Who's creating this account?" toggle,
// the required home address, a Mother card and a Father card, a "how many
// children" stepper, then one card per child — each card shows a live
// progress bar and opens that person's full section (fields + their
// documents, all on the same page — nothing about documents lives
// separately) when "Edit" is clicked.
function CardListView({
  parents,
  accountHolderRole,
  setAccountHolderRole,
  homeAddress,
  setHomeAddress,
  attemptedSubmit,
  missingFieldKeys,
  children,
  onChildCountChange,
  pendingRemoveChild,
  removingChild,
  removeError,
  onConfirmRemoveChild,
  onCancelRemoveChild,
  stepBreakdown,
  onEditCard,
}) {
  const homeAddressMissing = attemptedSubmit && missingFieldKeys.has("family:home_address");

  return (
    <div className="card-list-view">
      <FormSection title="Parents" description="Tell us who's who, and who's actually filling this in.">
        <div className="hh-field-full account-holder-picker">
          <label>Who is creating this account? *</label>
          <div className="account-holder-toggle">
            <button
              type="button"
              className={"account-holder-btn" + (accountHolderRole === "Mother" ? " is-active" : "")}
              onClick={() => setAccountHolderRole("Mother")}
            >
              Mother
            </button>
            <button
              type="button"
              className={"account-holder-btn" + (accountHolderRole === "Father" ? " is-active" : "")}
              onClick={() => setAccountHolderRole("Father")}
            >
              Father
            </button>
          </div>
        </div>
      </FormSection>

      <div className="card-list-group">
        <h3 className="card-list-heading">Step 1 — Parents</h3>
        <StepCard
          index={1}
          title="Mother"
          subtitle={parents[0].full_name}
          pct={stepBreakdown.mother?.pct ?? 0}
          onEdit={() => onEditCard(0)}
        />
        <StepCard
          index={2}
          title="Father"
          subtitle={parents[1].full_name}
          pct={stepBreakdown.father?.pct ?? 0}
          emptyHint={stepBreakdown.father?.pct === 0 ? 'Use "Same as Mother" to copy shared details.' : null}
          onEdit={() => onEditCard(1)}
        />
      </div>

      <FormSection
        title="Home & family"
        description="The main household address. Anyone who lives somewhere else — a separated parent, a child staying with one of them — gets their own address on their own card."
      >
        <div
          className={"hh-field hh-field-full" + (homeAddressMissing ? " hh-field-error" : "")}
          data-field-key="family-home_address"
        >
          <label>Main household address *</label>
          <textarea rows={2} required value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} />
          {homeAddressMissing && <span className="hh-error-text">This field is required.</span>}
        </div>
      </FormSection>

      <div className="card-list-group">
        <h3 className="card-list-heading">Step 2 — How many children are you enrolling?</h3>
        <div className="child-count-block">
          <p className="hh-hint-text">A block is created below for each child.</p>
          <div className="child-count-stepper">
            <button
              type="button"
              onClick={() => onChildCountChange(children.length - 1)}
              disabled={children.length <= 0 || removingChild}
              aria-label="Fewer children"
            >
              −
            </button>
            <span>{children.length}</span>
            <button
              type="button"
              onClick={() => onChildCountChange(children.length + 1)}
              disabled={children.length >= MAX_CHILDREN}
              aria-label="More children"
            >
              +
            </button>
          </div>
        </div>
        {pendingRemoveChild && (
          <div className="child-remove-confirm">
            <p>
              Remove {pendingRemoveChild.name}'s application? Their saved info, current school details, and any uploaded
              documents will be permanently deleted.
            </p>
            {removeError && <span className="hh-error-text">{removeError}</span>}
            <div className="child-remove-confirm-actions">
              <button type="button" className="child-remove-cancel-btn" onClick={onCancelRemoveChild} disabled={removingChild}>
                Cancel
              </button>
              <button type="button" className="child-remove-btn" onClick={onConfirmRemoveChild} disabled={removingChild}>
                {removingChild ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card-list-group">
        <h3 className="card-list-heading">Step 3 — Children</h3>
        {children.map((child, i) => {
          const name = displayNameForChild(child);
          const breakdown = stepBreakdown[`child-${i}`];
          return (
            <StepCard
              key={i}
              index={3 + i}
              title={children.length > 1 ? `Child ${i + 1}` : "Child"}
              subtitle={name}
              trailingText={child.year_group_applying_for || undefined}
              pct={breakdown?.pct ?? 0}
              onEdit={() => onEditCard(2 + i)}
            />
          );
        })}
      </div>
    </div>
  );
}

// One row in the card list — a numbered badge, the person's role/label +
// name, a slim progress bar, and an Edit button that opens their full
// section. `trailingText`, when given, replaces the "N% complete" caption
// (used for a child's year group); `emptyHint` overrides it entirely for a
// card that's still essentially blank (Father, before anything's filled).
function StepCard({ index, title, subtitle, pct, trailingText, emptyHint, onEdit }) {
  const caption = emptyHint || trailingText || `${pct}% complete`;
  return (
    <div className="step-card">
      <div className="step-card-index">{index}</div>
      <div className="step-card-main">
        <div className="step-card-title">
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <div className="step-card-progress">
          <div className="step-card-bar">
            <div className="step-card-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
          </div>
          <span className="step-card-caption">{caption}</span>
        </div>
      </div>
      <button type="button" className="step-card-edit" onClick={onEdit}>
        Add ›
      </button>
    </div>
  );
}

// One parent's fields + their document checklist — both Mother and Father
// get the same passport/EID upload slots, since either one may need to
// submit ID documents for the application regardless of who the account
// holder is. The non-holder parent gets the exact same field layout so
// switching the toggle never re-shuffles the form, but only `full_name`
// carries a required asterisk for them — everything else, uploads
// included, is a bonus if the account holder chooses to fill it in.
//
// Father only: a "Same as Mother" toggle for the general-background fields
// (nationality, religion, both languages) — ticking it copies Mother's
// current answers across and keeps them synced live; those four fields lock
// while it's on, since editing them independently while "synced" would just
// be confusing about which value is the real one.
function ParentSection({
  parent,
  index,
  role,
  isHolder,
  onChange,
  isFieldMissing,
  userId,
  documents,
  onDocumentsChange,
  missingDocKeys,
  sameAsAbove = false,
  onToggleSameAsAbove,
  addressOptions = ["household"],
}) {
  const isFather = role === "Father";
  const synced = isFather && sameAsAbove;

  return (
    <FormSection
      title={isHolder ? `${role} — Account holder` : role}
      description={
        isHolder
          ? "This is you, the person filling in and submitting this application."
          : "Their details, as much as you have — only their full name is required."
      }
    >
      <FormField
        label="Full name"
        required
        error={isFieldMissing("full_name")}
        fieldKey={`parent-${index}-full_name`}
        value={parent.full_name}
        onChange={(v) => onChange("full_name", v)}
      />
      <FormField
        label="Email"
        type="email"
        required={isHolder}
        error={isFieldMissing("email")}
        fieldKey={`parent-${index}-email`}
        value={parent.email}
        onChange={(v) => onChange("email", v)}
      />
      <PhoneField
        label="Phone"
        required={isHolder}
        error={isFieldMissing("phone")}
        fieldKey={`parent-${index}-phone`}
        value={parent.phone}
        onChange={(v) => onChange("phone", v)}
      />

      {isFather && (
        <div className="hh-field-full same-as-toggle">
          <label className="hh-checkbox-label">
            <input
              type="checkbox"
              checked={sameAsAbove}
              onChange={(e) => onToggleSameAsAbove(e.target.checked)}
            />
            Same nationality, religion &amp; languages as Mother
          </label>
        </div>
      )}

      <FormSelect
        label="Nationality"
        required={isHolder}
        error={isFieldMissing("nationality")}
        fieldKey={`parent-${index}-nationality`}
        value={parent.nationality}
        onChange={(v) => onChange("nationality", v)}
        options={NATIONALITIES}
        placeholder="Select nationality"
        disabled={synced}
      />
      <FormSelect
        label="Religion"
        required={isHolder}
        error={isFieldMissing("religion")}
        fieldKey={`parent-${index}-religion`}
        value={parent.religion}
        onChange={(v) => onChange("religion", v)}
        options={RELIGIONS}
        placeholder="Select religion"
        disabled={synced}
      />
      <FormSelect
        label="First language"
        value={parent.first_language}
        onChange={(v) => onChange("first_language", v)}
        options={LANGUAGES}
        placeholder="Select language"
        disabled={synced}
      />
      <FormSelect
        label="Second language"
        value={parent.second_language}
        onChange={(v) => onChange("second_language", v)}
        options={LANGUAGES}
        placeholder="Select language"
        disabled={synced}
      />
      <FormField label="Employer name" value={parent.employer_name} onChange={(v) => onChange("employer_name", v)} />
      <FormField
        label="Occupation / designation"
        value={parent.occupation_designation}
        onChange={(v) => onChange("occupation_designation", v)}
      />
      <FormField label="EID" hint="Once obtained." value={parent.eid} onChange={(v) => onChange("eid", v)} />
      <div />

      <AddressBlock
        label={`${role}'s address`}
        hint="Only worth filling in separately if they don't live at the main household address."
        fieldKey={`parent-${index}-address`}
        sameAs={parent.address_same_as}
        address={parent.address}
        options={addressOptions}
        onChangeSameAs={(v) => onChange("address_same_as", v)}
        onChangeAddress={(v) => onChange("address", v)}
      />

      <div className="hh-field-full">
        <DocumentChecklist
          title={`${role} documents`}
          userId={userId}
          ownerType="parent"
          ownerId={parent.id}
          docTypes={PARENT_DOCUMENT_TYPES}
          documents={documents}
          onDocumentsChange={onDocumentsChange}
          missingDocKeys={missingDocKeys}
          fieldKeyPrefix={`parent-doc-${index}`}
          personLabel={parent.full_name || role}
        />
      </div>
    </FormSection>
  );
}
