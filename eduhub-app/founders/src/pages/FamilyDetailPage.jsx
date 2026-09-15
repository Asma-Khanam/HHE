import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getFamilyDetail, getCurrentStaff, shortId, friendlyError, touchFamilyActivity } from "../lib/staffData";
import { getMissingItems, getOutstandingDocuments, displayNameForChild } from "../lib/completeness";
import CaseSettingsPanel from "../components/CaseSettingsPanel";
import ApplicationEmailPanel from "../components/ApplicationEmailPanel";
import PersonAvatar, { findProfilePhoto } from "../components/PersonAvatar";
import ApplicationsPanel from "../components/ApplicationsPanel";
import SchoolShortlistPanel from "../components/SchoolShortlistPanel";
import TasksPanel from "../components/TasksPanel";
import CaseNotesPanel from "../components/CaseNotesPanel";
import DocumentVaultPanel from "../components/DocumentVaultPanel";
import PaymentsPanel from "../components/PaymentsPanel";
import RecordFieldsEditor from "../components/RecordFieldsEditor";
import OverviewPanel from "../components/OverviewPanel";
import EmailsPanel from "../components/EmailsPanel";
import { AddressIcon, BudgetIcon, HouseholdIcon } from "../components/icons";
import "./FamilyDetailPage.css";

// ---------------------------------------------------------------------------
// The full field list, in the same order and with the same wording the family
// sees on their own form (frontend/src/components/ApplicationForm.jsx). Kept
// as plain data rather than hand-written markup so a field added to the form
// later is a one-line addition here, and so nothing silently goes missing
// from the staff view just because nobody remembered to add a <div> for it.
//
// `wide: true` = a free-text/textarea field on the family's side, so it gets
// a full-width row here instead of sharing a line with another field.
// ---------------------------------------------------------------------------

const PARENT_FIELDS = [
  { key: "full_name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "nationality", label: "Nationality" },
  { key: "first_language", label: "First language" },
  { key: "second_language", label: "Second language" },
  { key: "employer_name", label: "Employer name" },
  { key: "occupation_designation", label: "Occupation / designation" },
  { key: "eid", label: "EID" },
  { key: "address", label: "Their address", wide: true },
];

const CHILD_GENERAL_FIELDS = [
  { key: "first_name", label: "First name (as in passport)" },
  { key: "middle_name", label: "Middle name (as in passport)" },
  { key: "last_name", label: "Last name (as in passport)" },
  { key: "preferred_name", label: "Preferred name" },
  { key: "gender", label: "Gender" },
  { key: "date_of_birth", label: "Date of birth", type: "date" },
  { key: "nationality", label: "Nationality" },
  // CH-03 (September 2026 change request) — new field, no history before it.
  { key: "religion", label: "Religion" },
  // CH-04/CH-05: both became "select all that apply" on new array columns
  // (academic_years_of_entry / terms) rather than the old single-value
  // academic_year_of_entry / term — see schema addendum 25. `type:
  // "array_join"` reads the new column and renders it as a plain
  // comma-separated list, same idea as the "date"/"reference_status"
  // formatters just below.
  { key: "academic_years_of_entry", label: "Academic year(s) of entry", type: "array_join" },
  { key: "year_group_applying_for", label: "Year group applying for" },
  { key: "terms", label: "Term(s)", type: "array_join" },
  { key: "first_language", label: "First language" },
  { key: "second_language", label: "Second language" },
  { key: "english_first_home_language", label: "English is first / home language?" },
  { key: "english_proficiency", label: "English proficiency" },
  { key: "eid", label: "EID" },
  { key: "address", label: "Where this child lives", wide: true },
  { key: "notes", label: "Notes", wide: true },
];

const CHILD_ADDITIONAL_FIELDS = [
  { key: "sports_hobbies_interests", label: "Sports, hobbies and interests", wide: true },
  { key: "sports_achievements", label: "Sports achievements", wide: true },
  { key: "gifted_talented", label: "On the Gifted or Talented Register?" },
  { key: "medical_inclusion_needs", label: "Allergies or health conditions", wide: true },
  { key: "has_transfer_certificate", label: "Has transfer / leaving certificate?" },
];

// SEN-01 (September 2026 change request) — "SEN and inclusion" became its
// own clearly headed section on the family's form rather than sitting
// inside additional information, so it gets its own subheading here too,
// replacing the old has_sen/sen_description pair above. `sen_diagnoses` is
// an array (multi-select on the form), same array_join formatter as
// academic_years_of_entry/terms above. The "Other" text and the concerns
// note only ever apply to their own answer, same showIf pattern as before.
const CHILD_SEN_FIELDS = [
  { key: "sen_status", label: "SEN and inclusion — status" },
  {
    key: "sen_concerns_description",
    label: "SEN and inclusion — concerns",
    wide: true,
    showIf: (c) => c?.sen_status === "No formal diagnosis, but we have concerns",
  },
  {
    key: "sen_diagnoses",
    label: "SEN and inclusion — diagnoses",
    type: "array_join",
    wide: true,
    showIf: (c) => c?.sen_status === "Yes, formally identified or diagnosed",
  },
  {
    key: "sen_diagnosis_other",
    label: "SEN and inclusion — other diagnosis",
    wide: true,
    showIf: (c) => c?.sen_status === "Yes, formally identified or diagnosed" && (c?.sen_diagnoses || []).includes("Other, please tell us"),
  },
  // SEN-02 — asked of every child regardless of the SEN-01 answer, so no
  // showIf here.
  { key: "sen_documents_held", label: "SEN and inclusion — documents held", type: "array_join", wide: true },
  // SEN-04 through SEN-11 (September 2026 change request).
  { key: "sen_intervention_status", label: "SEN and inclusion — intervention or support sessions" },
  {
    key: "sen_intervention_types",
    label: "SEN and inclusion — session types",
    type: "array_join",
    wide: true,
    showIf: (c) => typeof c?.sen_intervention_status === "string" && c.sen_intervention_status.startsWith("Yes"),
  },
  {
    key: "sen_intervention_other",
    label: "SEN and inclusion — other session type",
    wide: true,
    showIf: (c) => (c?.sen_intervention_types || []).includes("Other"),
  },
  {
    key: "sen_intervention_frequency",
    label: "SEN and inclusion — session frequency",
    showIf: (c) => (c?.sen_intervention_types || []).length > 0,
  },
  { key: "sen_lsa_status", label: "SEN and inclusion — Learning Support Assistant / shadow teacher" },
  { key: "sen_descriptive_words", label: "SEN and inclusion — words used to describe child", type: "array_join", wide: true },
  { key: "sen_outside_professionals", label: "SEN and inclusion — outside professionals", type: "array_join", wide: true },
  {
    key: "sen_outside_professionals_other",
    label: "SEN and inclusion — other outside professional",
    wide: true,
    showIf: (c) => (c?.sen_outside_professionals || []).includes("Other"),
  },
  { key: "sen_additional_notes", label: "SEN and inclusion — anything else the family wants us to know", wide: true },
];

// SEN-10: "This answer must be clearly visible on the family record in the
// admin area. It governs what our team is allowed to share with a school."
// Deliberately its own constant, not folded into CHILD_SEN_FIELDS above —
// it's rendered as a badge on the child's card header (see PersonCard's
// `role` line below), not just another row in the field grid, so a
// consultant can't miss it before ever opening a school conversation.
const SEN_DISCLOSURE_LABELS = {
  "Yes, disclose everything upfront. I want a school that says yes with full knowledge": "Disclose everything upfront",
  "Yes, but let us discuss what and how first": "Disclose — discuss what/how first",
  "I would prefer to disclose after an offer is made": "Disclose after offer only",
  "I would rather not disclose. I would like to talk this through with you": "Prefers not to disclose — talk it through",
};

function senDisclosureBadgeLabel(child) {
  const v = (child?.sen_disclosure_preference || "").trim();
  return SEN_DISCLOSURE_LABELS[v] || null;
}

// DU-05 (September 2026 change request): "If 'No, please explain it' or
// 'Roughly' is chosen, flag it on the family record so our team knows to
// talk it through. This is where most relocating families come unstuck."
// Same card-header-badge treatment as SEN-10's disclosure preference above.
function needsTransferCertificateHelpBadge(child) {
  const v = child?.transfer_certificate_understanding;
  return v === "Roughly" || v === "No, please explain it" ? "Transfer Certificate — needs explaining" : null;
}

// A child's card can carry more than one badge at once (SEN-10's disclosure
// preference, DU-05's Transfer Certificate flag) — collects whichever apply.
// `warn: true` marks a flag as something that needs following up (amber),
// vs. a plain preference that's just informational (neutral) — so the two
// don't read as equally urgent at a glance.
function childCardFlags(child) {
  const flags = [];
  const disclosure = senDisclosureBadgeLabel(child);
  if (disclosure) flags.push({ label: disclosure, warn: false });
  const transferHelp = needsTransferCertificateHelpBadge(child);
  if (transferHelp) flags.push({ label: transferHelp, warn: true });
  return flags;
}

const SCHOOL_FIELDS = [
  { key: "school_name", label: "Current school" },
  { key: "year_group_of_leaving", label: "Year group of leaving" },
  // CS-01 (September 2026 change request): "Date last attended" removed —
  // it was never actually filled in from the family's side, so this just
  // stops showing a permanently-blank row.
  { key: "curriculum", label: "Curriculum" },
  { key: "contact_name", label: "Contact name at school" },
  { key: "contact_email", label: "Contact email at school" },
  { key: "contact_phone", label: "Contact phone at school" },
  { key: "reference_status", label: "Confidential reference", type: "reference_status" },
  { key: "reason_for_leaving", label: "Reason for leaving", wide: true },
  { key: "reason_for_leaving_details", label: "Reason for leaving — more detail", wide: true },
  // CS-04/CS-05/CS-06 (September 2026 change request).
  { key: "education_gaps_status", label: "Gaps in education?" },
  {
    key: "education_gaps_details",
    label: "Gaps in education — detail",
    wide: true,
    showIf: (s) => s?.education_gaps_status === "Yes",
  },
  { key: "repeated_year_status", label: "Repeated a year, or asked to?" },
  {
    key: "repeated_year_details",
    label: "Repeated a year — detail",
    wide: true,
    showIf: (s) => !!s?.repeated_year_status && s.repeated_year_status !== "No",
  },
  { key: "school_refusal_status", label: "Refused a place, or asked to leave?" },
  {
    key: "school_refusal_details",
    label: "Refused a place / asked to leave — detail",
    wide: true,
    showIf: (s) => s?.school_refusal_status === "Yes, refused a place" || s?.school_refusal_status === "Yes, asked to leave",
  },
];

const REFERENCE_STATUS_LABELS = {
  not_requested: "Not requested",
  requested: "Requested",
  received: "Received",
};

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function initial(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

function isFilled(value) {
  return String(value ?? "").trim().length > 0;
}

// BUD-05 (September 2026 change request): "Any answer other than 'No thank
// you' should flag on the family record so our team follows it up." An
// empty answer (not asked yet) isn't a follow-up — only an actual "Yes
// please" or "Maybe later" is.
function wantsCostGuidanceFollowup(family) {
  const v = (family?.cost_guidance_response || "").trim();
  return v !== "" && v !== "No thank you";
}

// One label + value row. An unanswered field deliberately still renders (as a
// muted em dash) rather than being hidden — the whole point of this page is
// that the team can see what a family HASN'T given them yet, not just what
// they have.
function RecordField({ label, value, wide }) {
  const filled = isFilled(value);
  return (
    <div className={"rec-field" + (wide ? " rec-field-wide" : "")}>
      <span className="rec-field-label">{label}</span>
      <span className={"rec-field-value" + (filled ? "" : " is-empty")}>{filled ? value : "—"}</span>
    </div>
  );
}

// Addresses, 2026-09-02 onwards. There is no single family address any more:
// each parent and child has their own, because separated parents don't share
// one and a child may live with only one of them. families.home_address still
// exists and still mirrors the account holder's, so it stays the headline
// here — but the case a consultant actually needs to spot is the household
// that ISN'T all at one address, so anyone living elsewhere is called out by
// name rather than left to be noticed further down the record.
function AddressSummary({ family, parents, familyChildren, accountHolderRole }) {
  const main = (family.home_address || "").trim();

  const elsewhere = [
    ...parents.map((p) => ({
      name: p.full_name || p.relationship,
      role: p.relationship,
      address: (p.address || "").trim(),
      isHolder: p.relationship === accountHolderRole,
    })),
    ...familyChildren.map((c, i) => ({
      name: displayNameForChild(c, i),
      role: "Child",
      address: (c.address || "").trim(),
      isHolder: false,
    })),
  ].filter((person) => !person.isHolder && person.address && person.address !== main);

  return (
    <section className="family-detail-card">
      <h2>
        <AddressIcon />
        Addresses
      </h2>
      <div className="rec-grid">
        <RecordField label="Household address" value={main} wide />
      </div>
      {elsewhere.length > 0 ? (
        <div className="address-split">
          <p className="address-split-head">
            {elsewhere.length} {elsewhere.length === 1 ? "person lives" : "people live"} at a different address
          </p>
          <ul>
            {elsewhere.map((person) => (
              <li key={`${person.role}-${person.name}`}>
                <strong>
                  {person.name} <span className="address-split-role">· {person.role}</span>
                </strong>
                <span>{person.address}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="family-detail-hint">Everyone on this application is at the same address.</p>
      )}
    </section>
  );
}

// Section 3, "Budget and relocation planning" (September 2026 change
// request) — AH-09/AH-10/AH-11 and BUD-01 through BUD-05 all live directly
// on the families row, same as home_address, so this card reads them the
// same way AddressSummary above reads home_address. BUD-05's flag is the
// one thing here that needs to be seen without opening this card — anything
// other than "No thank you" gets a visible amber badge right in the heading.
function BudgetSummary({ family }) {
  const priorities = Array.isArray(family.school_priorities) ? family.school_priorities : [];
  const flagged = wantsCostGuidanceFollowup(family);

  return (
    <section className="family-detail-card">
      <h2>
        <BudgetIcon />
        Budget and relocation planning
        {flagged && <span className="family-detail-card-flag is-warn">Wants cost guidance — follow up</span>}
      </h2>
      <div className="rec-grid">
        <RecordField label="Set a budget for the move?" value={family.budget_status} />
        <RecordField label="Comfortable fee range, per child" value={family.comfortable_fee_range} />
        <RecordField label="Annual housing budget" value={family.housing_budget} />
        <RecordField label="Parent work location" value={family.parent_work_location} />
        <RecordField label="Where they're thinking of living" value={family.preferred_living_area} wide />
        <RecordField label="Wants cost guidance?" value={family.cost_guidance_response} />
        {/* This was previously its own div sitting after (not inside) the
            rec-grid, so "rec-field-wide"'s column-span had no grid to span
            across and it rendered narrower than the card. Moved inside the
            grid so it actually spans full width like the other wide fields. */}
        <div className="rec-field rec-field-wide">
          <span className="rec-field-label">Top school priorities, ranked</span>
          {priorities.length ? (
            <ol className="budget-priorities-list">
              {priorities.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          ) : (
            <span className="rec-field-value is-empty">—</span>
          )}
        </div>
      </div>
    </section>
  );
}

// A person's profile block. Collapsible by default (defaultOpen — a founder
// landing on the page reads the record straight away); `flat` (September
// 2026 change request) drops the collapse/expand entirely for the
// Household section below, where a tab bar picks which one person is shown
// and it's always fully open.
function PersonCard({ name, role, docCount, photo, isChild = false, children, defaultOpen = true, flags, flat = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = flat ? true : open;
  const headText = (
    <span className="person-card-head-text">
      <span className="person-card-name">
        {name}
        {/* SEN-10/DU-05: "must be clearly visible on the family record
            in the admin area" — right on the card header, not buried in
            the field grid below. A child can carry more than one. */}
        {(flags || []).map((f) => (
          <span key={f.label} className={"family-detail-card-flag" + (f.warn ? " is-warn" : "")}>
            {f.label}
          </span>
        ))}
      </span>
      <span className="person-card-role">
        {role}
        {docCount > 0 ? ` · ${docCount} document${docCount === 1 ? "" : "s"} on file` : " · no documents yet"}
      </span>
    </span>
  );
  return (
    <section className={"person-card" + (flat ? " person-card-flat" : "") + (isOpen ? "" : " is-collapsed")}>
      {/* flat: used for the Household section (September 2026 change
          request) — one member selected via a tab bar above, shown fully
          open with no collapse/expand of its own, so the header is a plain
          div rather than a toggle button. */}
      {flat ? (
        <div className="person-card-head person-card-head-static">
          <PersonAvatar doc={photo} name={name} fallback={role} isChild={isChild} className="person-card-avatar" />
          {headText}
        </div>
      ) : (
        <button type="button" className="person-card-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <PersonAvatar doc={photo} name={name} fallback={role} isChild={isChild} className="person-card-avatar" />
          {headText}
          <span className="person-card-chevron">{open ? "▾" : "▸"}</span>
        </button>
      )}
      {isOpen && <div className="person-card-body">{children}</div>}
    </section>
  );
}

function countDocs(documentsByOwner, ownerType, id) {
  if (!id) return 0;
  return (documentsByOwner[`${ownerType}:${id}`] || []).filter((d) => d.document_type !== "profile_photo").length;
}

export default function FamilyDetailPage() {
  const { familyId } = useParams();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [currentStaffName, setCurrentStaffName] = useState("");
  const [activeTab, setActiveTab] = useState("details");
  const [activeHouseholdKey, setActiveHouseholdKey] = useState(null);
  const [whatsNeededOpen, setWhatsNeededOpen] = useState(false);

  // Shared by the initial load and by DocumentVaultPanel (addendum 35) —
  // a document upload/replace/remove is simplest to just refetch after,
  // rather than hand-patching every possible shape that change could take
  // (a brand-new row, an old one gone, a multi-file slot growing by one).
  function refreshFamily() {
    return getFamilyDetail(familyId)
      .then(setDetail)
      .catch((err) => setError(friendlyError(err, "Couldn't load this family.")));
  }

  // Passed to DocumentVaultPanel as onChanged and CaseSettingsPanel /
  // ApplicationEmailPanel as onFamilyChange — every one of those is staff
  // editing this family, so it counts the same as a RecordFieldsEditor save.
  function refreshFamilyAndTouch() {
    touchFamilyActivity(familyId);
    return refreshFamily();
  }
  function handleFamilyFieldChange(updated) {
    setDetail((d) => ({ ...d, family: { ...d.family, ...updated } }));
    touchFamilyActivity(familyId);
  }

  useEffect(() => {
    setDetail(null);
    setError("");
    refreshFamily();
    // Addendum 37 — opening a family's record is itself the "she opens a
    // caseload" half of "that should go up [the Caseload list]."
    touchFamilyActivity(familyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  useEffect(() => {
    getCurrentStaff()
      .then((staff) => setCurrentStaffName(staff?.full_name || staff?.email || ""))
      .catch(() => {});
  }, []);

  // Addendum 33 (September 2026 change request) — RecordFieldsEditor saves
  // straight to Supabase itself; these just fold the saved row back into
  // this page's own state afterwards.
  function handleParentSaved(updated) {
    setDetail((d) => ({ ...d, parents: d.parents.map((p) => (p.id === updated.id ? updated : p)) }));
    touchFamilyActivity(familyId);
  }
  function handleChildSaved(updated) {
    setDetail((d) => ({ ...d, children: d.children.map((c) => (c.id === updated.id ? updated : c)) }));
    touchFamilyActivity(familyId);
  }
  function handleSchoolSaved(updated) {
    setDetail((d) => {
      const idx = d.children.findIndex((c) => c.id === updated.child_id);
      if (idx === -1) return d;
      const currentSchools = [...d.currentSchools];
      currentSchools[idx] = updated;
      return { ...d, currentSchools };
    });
    touchFamilyActivity(familyId);
  }

  if (error) {
    return (
      <div className="family-detail-page">
        <Link to="/staff/families" className="hh-link-btn">
          ‹ Back to caseload
        </Link>
        <div className="hh-form-banner hh-form-banner-error" style={{ marginTop: 16 }}>
          {error}
        </div>
      </div>
    );
  }

  if (!detail) return <div className="family-detail-page">Loading…</div>;

  const {
    family,
    parents,
    parentsOrdered,
    accountHolderRole,
    children,
    currentSchools,
    documentsByOwner,
    applicationsByChild,
    tasks,
    caseNotes,
    payments,
    staff,
    schoolCatalog,
    ownerName,
    displayName,
  } = detail;

  // No homeAddress here on purpose. The single family-wide address was
  // retired on 2026-09-02 — every parent and child has their own now, and
  // families.home_address is just kept in step with the account holder's.
  // Passing it would have this panel chase a field the family can no longer
  // see, which is exactly what it was doing until this was synced.
  const completenessArgs = {
    parents: parentsOrdered,
    accountHolderRole,
    children,
    currentSchools,
    documentsByOwner,
    // AH-09/AH-10/BUD-01 (September 2026 change request) — family-level
    // answers, synced here from frontend/src/lib/completeness.js so this
    // page's readiness % and missing-item count agree with what the family
    // themselves sees, rather than treating these as permanently missing.
    schoolPriorities: family.school_priorities,
    comfortableFeeRange: family.comfortable_fee_range,
    budgetStatus: family.budget_status,
  };
  // Documents stopped blocking the family's Submit button on 2026-09-02, so
  // getMissingItems() is required fields only now. Staff still need the full
  // picture of what's outstanding, so the two lists are joined back together
  // here — fields first (those are what hold up the application), then the
  // documents we're still waiting on.
  const missingFields = getMissingItems(completenessArgs);
  const outstandingDocs = getOutstandingDocuments(completenessArgs);
  const missing = [...missingFields, ...outstandingDocs];

  // Only parents who actually exist as a row get a record card — a family
  // that only ever filled in one side shouldn't get a ghost "Father" card
  // full of dashes. Ordered Mother first, then Father, same as the form.
  const namedParents = ["Mother", "Father"]
    .map((role) => (parents || []).find((p) => p.relationship === role))
    .filter(Boolean);

  // Household section (September 2026 change request) — one member picked
  // via a tab bar, matching the page's own tabs above, rather than showing
  // everyone in a list or a grid at once.
  const householdMembers = [
    ...(parents || [])
      .filter((p) => p.full_name)
      .map((p) => ({ key: `parent-${p.id}`, type: "parent", name: p.full_name, data: p })),
    ...children.map((c, i) => ({
      key: `child-${c.id}`,
      type: "child",
      name: displayNameForChild(c, i),
      data: c,
      currentSchool: currentSchools[i] || null,
    })),
  ];
  const activeHouseholdMember =
    householdMembers.find((m) => m.key === activeHouseholdKey) || householdMembers[0] || null;

  return (
    <div className="family-detail-page">
      <Link to="/staff/families" className="hh-link-btn">
        ‹ Back to caseload
      </Link>

      <div className="family-detail-header">
        <div className="family-detail-avatar">{initial(displayName)}</div>
        <div className="family-detail-header-text">
          <h1>{displayName}</h1>
          <div className="family-detail-meta">
            <code>{shortId(family.id)}</code>
            <span>
              {children.length} {children.length === 1 ? "child" : "children"}
            </span>
            <span>owner {ownerName}</span>
            <span>on file since {formatDate(family.created_at)}</span>
            {wantsCostGuidanceFollowup(family) && (
              <span className="family-detail-card-flag is-warn">Wants cost guidance — follow up</span>
            )}
          </div>
        </div>
      </div>

      <CaseSettingsPanel
        family={family}
        staff={staff}
        onFamilyChange={handleFamilyFieldChange}
      />

      <div className="family-detail-tabs" role="tablist">
        {[
          ["overview", "Overview"],
          ["details", "Family details"],
          ["documents", "Documents"],
          ["visits", "School visits"],
          ["applications", "Applications"],
          ["emails", "Emails"],
          ["invoices", "Invoices"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={"family-detail-tab" + (activeTab === key ? " is-active" : "")}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <OverviewPanel family={family} displayName={displayName} namedParents={namedParents} familyChildren={children} />
      )}

      {activeTab === "details" && (
        <div className="family-detail-tab-stack">
      <div className="family-detail-grid">
        <div className="family-detail-col">
          <AddressSummary
            family={family}
            parents={namedParents}
            familyChildren={children}
            accountHolderRole={accountHolderRole}
          />

          <BudgetSummary family={family} />
        </div>

        <div className="family-detail-col">
          <TasksPanel familyId={family.id} tasks={tasks} staff={staff} />

          <section className={"family-detail-card" + (whatsNeededOpen ? "" : " is-collapsed-card")}>
            <button
              type="button"
              className="family-detail-card-toggle"
              onClick={() => setWhatsNeededOpen((v) => !v)}
              aria-expanded={whatsNeededOpen}
            >
              <h2>
                What&apos;s needed
                {missing.length > 0 && <span className="family-detail-card-count">{missing.length}</span>}
              </h2>
              <span className="person-card-chevron">{whatsNeededOpen ? "▾" : "▸"}</span>
            </button>
            {whatsNeededOpen &&
              (missing.length === 0 ? (
                <p className="family-detail-hint">Everything required is on file.</p>
              ) : (
                <>
                  <ul className="missing-list">
                    {missing.map((item, i) => (
                      <li key={i} className="missing-row">
                        <span className={"missing-dot" + (item.kind === "document" ? " is-document" : "")} />
                        {item.label}
                      </li>
                    ))}
                  </ul>
                  <p className="family-detail-hint">
                    {missingFields.length
                      ? `${missingFields.length} required field${missingFields.length === 1 ? "" : "s"} still hold${
                          missingFields.length === 1 ? "s" : ""
                        } up submitting. `
                      : "Nothing is holding up submitting. "}
                    {outstandingDocs.length
                      ? `${outstandingDocs.length} document${
                          outstandingDocs.length === 1 ? "" : "s"
                        } still to come — those never block the family from submitting.`
                      : "All documents are in."}
                  </p>
                </>
              ))}
          </section>
        </div>
      </div>

        <section className="family-detail-card">
          <h2>
            <HouseholdIcon />
            Household
          </h2>
          {/* September 2026 change request: this used to list every member
              at once (a masonry grid before that, a flat collapsible list
              before that) — the founders wanted it to work like the page's
              own tabs above instead: pick a person, see their whole profile
              open at full width, nothing else in the way. */}
          {householdMembers.length === 0 ? (
            <p className="household-empty-hint">Nothing filled in yet.</p>
          ) : (
            <>
              <div className="family-detail-tabs household-tabs" role="tablist">
                {householdMembers.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    role="tab"
                    aria-selected={activeHouseholdMember.key === m.key}
                    className={"family-detail-tab" + (activeHouseholdMember.key === m.key ? " is-active" : "")}
                    onClick={() => setActiveHouseholdKey(m.key)}
                  >
                    {m.name}
                  </button>
                ))}
              </div>

              {activeHouseholdMember.type === "parent" && (
                <PersonCard
                  key={activeHouseholdMember.key}
                  flat
                  name={activeHouseholdMember.data.full_name}
                  role={
                    activeHouseholdMember.data.relationship +
                    (activeHouseholdMember.data.relationship === accountHolderRole ? " · Account holder" : "") +
                    (activeHouseholdMember.data.phone ? ` · ${activeHouseholdMember.data.phone}` : "") +
                    (activeHouseholdMember.data.email ? ` · ${activeHouseholdMember.data.email}` : "")
                  }
                  docCount={countDocs(documentsByOwner, "parent", activeHouseholdMember.data.id)}
                  photo={findProfilePhoto(documentsByOwner[`parent:${activeHouseholdMember.data.id}`])}
                >
                  <RecordFieldsEditor
                    title="Parent details"
                    fields={PARENT_FIELDS}
                    source={activeHouseholdMember.data}
                    table="parents"
                    recordId={activeHouseholdMember.data.id}
                    familyId={family.id}
                    currentStaffName={currentStaffName}
                    onSaved={handleParentSaved}
                  />
                </PersonCard>
              )}

              {activeHouseholdMember.type === "child" && (
                <PersonCard
                  key={activeHouseholdMember.key}
                  flat
                  isChild
                  name={activeHouseholdMember.name}
                  role={
                    (activeHouseholdMember.data.date_of_birth
                      ? `DOB ${formatDate(activeHouseholdMember.data.date_of_birth)}`
                      : "DOB not on file") +
                    (activeHouseholdMember.data.year_group_applying_for
                      ? ` · applying for ${activeHouseholdMember.data.year_group_applying_for}`
                      : "")
                  }
                  docCount={countDocs(documentsByOwner, "child", activeHouseholdMember.data.id)}
                  photo={findProfilePhoto(documentsByOwner[`child:${activeHouseholdMember.data.id}`])}
                  flags={childCardFlags(activeHouseholdMember.data)}
                >
                  {/* Household address, read-only here — it's the family's
                      own field (families.home_address), edited from the
                      Household address card in Family details, not
                      per-child. Shown on every child's card too so staff
                      don't have to leave the child's profile to see it. */}
                  <div className="rec-grid">
                    <RecordField label="Family address" value={family.home_address} wide />
                  </div>

                  <RecordFieldsEditor
                    title="General info"
                    fields={CHILD_GENERAL_FIELDS}
                    source={activeHouseholdMember.data}
                    table="children"
                    recordId={activeHouseholdMember.data.id}
                    familyId={family.id}
                    currentStaffName={currentStaffName}
                    onSaved={handleChildSaved}
                  />

                  <RecordFieldsEditor
                    title="Additional info"
                    fields={CHILD_ADDITIONAL_FIELDS}
                    source={activeHouseholdMember.data}
                    table="children"
                    recordId={activeHouseholdMember.data.id}
                    familyId={family.id}
                    currentStaffName={currentStaffName}
                    onSaved={handleChildSaved}
                  />

                  <RecordFieldsEditor
                    title="SEN and inclusion"
                    fields={CHILD_SEN_FIELDS}
                    source={activeHouseholdMember.data}
                    table="children"
                    recordId={activeHouseholdMember.data.id}
                    familyId={family.id}
                    currentStaffName={currentStaffName}
                    onSaved={handleChildSaved}
                  />

                  <h3 className="rec-subhead">Current school</h3>
                  {/* NAV-02 (September 2026 change request): the family's form
                      copies a sibling's school once rather than linking to it
                      live, so this reads whichever sibling was chosen at copy
                      time and shows their CURRENT name — same as the family's
                      own view — while the copied fields below stay frozen at
                      whatever they were when copied. */}
                  {(() => {
                    const siblingId = activeHouseholdMember.currentSchool?.same_as_sibling_child_id;
                    if (!siblingId) return null;
                    const siblingIdx = children.findIndex((sib) => sib.id === siblingId);
                    if (siblingIdx === -1) return null;
                    return (
                      <p className="family-detail-hint">
                        Same school as {displayNameForChild(children[siblingIdx], siblingIdx)} (copied once, not linked —
                        editing one doesn't change the other).
                      </p>
                    );
                  })()}
                  <RecordFieldsEditor
                    fields={SCHOOL_FIELDS}
                    source={activeHouseholdMember.currentSchool || {}}
                    table="current_schools"
                    recordId={activeHouseholdMember.currentSchool?.id}
                    insertExtra={{ child_id: activeHouseholdMember.data.id }}
                    familyId={family.id}
                    currentStaffName={currentStaffName}
                    onSaved={handleSchoolSaved}
                  />
                </PersonCard>
              )}
            </>
          )}
        </section>
        </div>
      )}

      {activeTab === "visits" && (
        <div className="family-detail-stack">
          <SchoolShortlistPanel familyId={family.id} familyChildren={children} applicationsByChild={applicationsByChild} />

          <CaseNotesPanel
            familyId={family.id}
            notes={caseNotes}
            staff={staff}
            familyChildren={children}
            schoolCatalog={schoolCatalog}
          />
        </div>
      )}

      {activeTab === "applications" && (
        <div className="family-detail-stack">
          <ApplicationsPanel
            familyChildren={children}
            applicationsByChild={applicationsByChild}
            schoolCatalog={schoolCatalog}
          />

          <ApplicationEmailPanel
            family={family}
            familyDisplayNameValue={displayName}
            onFamilyChange={handleFamilyFieldChange}
            parents={namedParents}
            onParentChange={handleParentSaved}
          />
        </div>
      )}

      {activeTab === "emails" && <EmailsPanel familyId={family.id} notes={caseNotes} />}

      {activeTab === "documents" && (
        <div className="family-detail-stack">
          <DocumentVaultPanel
            parents={parents}
            familyChildren={children}
            documentsByOwner={documentsByOwner}
            accountHolderRole={accountHolderRole}
            userId={family.account_user_id}
            onChanged={refreshFamilyAndTouch}
          />
        </div>
      )}

      {activeTab === "invoices" && (
        <div className="family-detail-stack">
          <PaymentsPanel
            familyId={family.id}
            payments={payments}
            membershipType={family.membership_type}
            childCount={children.length}
          />
        </div>
      )}
    </div>
  );
}
