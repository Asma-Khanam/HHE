import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getFamilyDetail, getCurrentStaff, shortId, friendlyError, touchFamilyActivity } from "../lib/staffData";
import { getMissingItems, getOutstandingDocuments, getReadinessPct, displayNameForChild } from "../lib/completeness";
import { stageLabel } from "../lib/workflow";
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
import AuditHistoryPanel from "../components/AuditHistoryPanel";
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
function childCardFlags(child) {
  return [senDisclosureBadgeLabel(child), needsTransferCertificateHelpBadge(child)].filter(Boolean);
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
      <h2>Addresses</h2>
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
        Budget and relocation planning
        {flagged && <span className="family-detail-card-flag">Wants cost guidance — follow up</span>}
      </h2>
      <div className="rec-grid">
        <RecordField label="Set a budget for the move? (BUD-01)" value={family.budget_status} />
        <RecordField label="Comfortable fee range, per child (AH-10)" value={family.comfortable_fee_range} />
        <RecordField label="Annual housing budget (BUD-03)" value={family.housing_budget} />
        <RecordField label="Parent work location (AH-11)" value={family.parent_work_location} />
        <RecordField label="Where they're thinking of living (BUD-04)" value={family.preferred_living_area} wide />
        <RecordField label="Wants cost guidance? (BUD-05)" value={family.cost_guidance_response} />
      </div>
      <div className="rec-field rec-field-wide">
        <span className="rec-field-label">Top school priorities, ranked (AH-09)</span>
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
    </section>
  );
}

// A collapsible per-person block, used two ways: standalone (defaultOpen —
// a founder landing on the page reads the record straight away) and nested
// inside the Household card (defaultOpen={false} — collapsed by default so
// the household list stays a short, scannable summary, and a founder opens
// only the person they actually need to read into).
function PersonCard({ name, role, docCount, photo, isChild = false, children, defaultOpen = true, nested = false, flags }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={"person-card" + (nested ? " person-card-nested" : "") + (open ? "" : " is-collapsed")}>
      <button type="button" className="person-card-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <PersonAvatar doc={photo} name={name} fallback={role} isChild={isChild} className="person-card-avatar" />
        <span className="person-card-head-text">
          <span className="person-card-name">
            {name}
            {/* SEN-10/DU-05: "must be clearly visible on the family record
                in the admin area" — right on the card header, not buried in
                the field grid below. A child can carry more than one. */}
            {(flags || []).map((f) => (
              <span key={f} className="family-detail-card-flag">
                {f}
              </span>
            ))}
          </span>
          <span className="person-card-role">
            {role}
            {docCount > 0 ? ` · ${docCount} document${docCount === 1 ? "" : "s"} on file` : " · no documents yet"}
          </span>
        </span>
        <span className="person-card-chevron">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="person-card-body">{children}</div>}
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
  const [auditVersion, setAuditVersion] = useState(0);

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
  // this page's own state afterwards, and bump auditVersion so
  // AuditHistoryPanel below picks up the new log entry without a full
  // refetch of the family.
  function handleParentSaved(updated) {
    setDetail((d) => ({ ...d, parents: d.parents.map((p) => (p.id === updated.id ? updated : p)) }));
    setAuditVersion((v) => v + 1);
    touchFamilyActivity(familyId);
  }
  function handleChildSaved(updated) {
    setDetail((d) => ({ ...d, children: d.children.map((c) => (c.id === updated.id ? updated : c)) }));
    setAuditVersion((v) => v + 1);
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
    setAuditVersion((v) => v + 1);
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
  const readiness = getReadinessPct(completenessArgs);

  // Only parents who actually exist as a row get a record card — a family
  // that only ever filled in one side shouldn't get a ghost "Father" card
  // full of dashes. Ordered Mother first, then Father, same as the form.
  const namedParents = ["Mother", "Father"]
    .map((role) => (parents || []).find((p) => p.relationship === role))
    .filter(Boolean);

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
            <span className={"families-badge stage-" + (family.pipeline_stage || "enquiry")}>
              {stageLabel(family.pipeline_stage)}
            </span>
            <span className={"families-badge" + (family.intake_status === "submitted" ? " is-submitted" : "")}>
              {family.intake_status === "submitted" ? "Form submitted" : "Form in draft"}
            </span>
            <span>{readiness}% complete</span>
            <span>
              {children.length} {children.length === 1 ? "child" : "children"}
            </span>
            <span>owner {ownerName}</span>
            <span>on file since {formatDate(family.created_at)}</span>
            {wantsCostGuidanceFollowup(family) && (
              <span className="family-detail-card-flag">Wants cost guidance — follow up</span>
            )}
          </div>
        </div>
      </div>

      <div className="family-detail-stack">
        <CaseSettingsPanel
          family={family}
          staff={staff}
          onFamilyChange={handleFamilyFieldChange}
        />
        <ApplicationEmailPanel
          family={family}
          familyDisplayNameValue={displayName}
          onFamilyChange={handleFamilyFieldChange}
        />
      </div>

      <div className="family-detail-grid">
        <div className="family-detail-col">
          <SchoolShortlistPanel familyId={family.id} familyChildren={children} />

          <ApplicationsPanel
            familyChildren={children}
            applicationsByChild={applicationsByChild}
            schoolCatalog={schoolCatalog}
          />

          <CaseNotesPanel
            familyId={family.id}
            notes={caseNotes}
            staff={staff}
            familyChildren={children}
            schoolCatalog={schoolCatalog}
          />

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

          <section className="family-detail-card">
            <h2>Household</h2>
            <div className="household-list">
              {parents
                .filter((p) => p.full_name)
                .map((p) => (
                  <PersonCard
                    key={p.id}
                    nested
                    defaultOpen={false}
                    name={p.full_name}
                    role={
                      p.relationship +
                      (p.relationship === accountHolderRole ? " · Account holder" : "") +
                      (p.phone ? ` · ${p.phone}` : "") +
                      (p.email ? ` · ${p.email}` : "")
                    }
                    docCount={countDocs(documentsByOwner, "parent", p.id)}
                    photo={findProfilePhoto(documentsByOwner[`parent:${p.id}`])}
                  >
                    <RecordFieldsEditor
                      fields={PARENT_FIELDS}
                      source={p}
                      table="parents"
                      recordId={p.id}
                      familyId={family.id}
                      currentStaffName={currentStaffName}
                      onSaved={handleParentSaved}
                    />
                  </PersonCard>
                ))}
              {children.map((c, i) => (
                <PersonCard
                  key={c.id}
                  nested
                  defaultOpen={false}
                  isChild
                  name={displayNameForChild(c, i)}
                  role={
                    (c.date_of_birth ? `DOB ${formatDate(c.date_of_birth)}` : "DOB not on file") +
                    (c.year_group_applying_for ? ` · applying for ${c.year_group_applying_for}` : "")
                  }
                  docCount={countDocs(documentsByOwner, "child", c.id)}
                  photo={findProfilePhoto(documentsByOwner[`child:${c.id}`])}
                  flags={childCardFlags(c)}
                >
                  <h3 className="rec-subhead">General info</h3>
                  <RecordFieldsEditor
                    fields={CHILD_GENERAL_FIELDS}
                    source={c}
                    table="children"
                    recordId={c.id}
                    familyId={family.id}
                    currentStaffName={currentStaffName}
                    onSaved={handleChildSaved}
                  />

                  <h3 className="rec-subhead">Additional info</h3>
                  <RecordFieldsEditor
                    fields={CHILD_ADDITIONAL_FIELDS}
                    source={c}
                    table="children"
                    recordId={c.id}
                    familyId={family.id}
                    currentStaffName={currentStaffName}
                    onSaved={handleChildSaved}
                  />

                  <h3 className="rec-subhead">SEN and inclusion</h3>
                  <RecordFieldsEditor
                    fields={CHILD_SEN_FIELDS}
                    source={c}
                    table="children"
                    recordId={c.id}
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
                    const siblingId = currentSchools[i]?.same_as_sibling_child_id;
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
                    source={currentSchools[i] || {}}
                    table="current_schools"
                    recordId={currentSchools[i]?.id}
                    insertExtra={{ child_id: c.id }}
                    familyId={family.id}
                    currentStaffName={currentStaffName}
                    onSaved={handleSchoolSaved}
                  />
                </PersonCard>
              ))}
              {parents.every((p) => !p.full_name) && children.length === 0 && (
                <p className="household-empty-hint">Nothing filled in yet.</p>
              )}
            </div>
          </section>

          <AuditHistoryPanel familyId={family.id} version={auditVersion} />

          <section className="family-detail-card">
            <h2>
              What&apos;s needed
              {missing.length > 0 && <span className="family-detail-card-count">{missing.length}</span>}
            </h2>
            {missing.length === 0 ? (
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
            )}
          </section>
        </div>
      </div>

      <div className="family-detail-stack">
        <DocumentVaultPanel
          parents={parents}
          familyChildren={children}
          documentsByOwner={documentsByOwner}
          accountHolderRole={accountHolderRole}
          userId={family.account_user_id}
          onChanged={refreshFamilyAndTouch}
        />
        <PaymentsPanel
          familyId={family.id}
          payments={payments}
          membershipType={family.membership_type}
          childCount={children.length}
        />
      </div>
    </div>
  );
}
