import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getFamilyDetail, shortId, friendlyError } from "../lib/staffData";
import { getMissingItems, getOutstandingDocuments, getReadinessPct, displayNameForChild } from "../lib/completeness";
import { stageLabel } from "../lib/workflow";
import CaseSettingsPanel from "../components/CaseSettingsPanel";
import ApplicationsPanel from "../components/ApplicationsPanel";
import TasksPanel from "../components/TasksPanel";
import DocumentVaultPanel from "../components/DocumentVaultPanel";
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
  { key: "religion", label: "Religion" },
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
  { key: "religion", label: "Religion" },
  { key: "academic_year_of_entry", label: "Academic year of entry" },
  { key: "year_group_applying_for", label: "Year group applying for" },
  { key: "term", label: "Term" },
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
  { key: "has_sen", label: "Has Special Education Needs?" },
  { key: "gifted_talented", label: "On the Gifted or Talented Register?" },
  // Only shown when the answer above was Yes — same as the family's own form,
  // where this textarea only appears for a "Yes".
  { key: "sen_description", label: "Special Education Needs — description", wide: true, showIf: (c) => c?.has_sen === "Yes" },
  { key: "medical_inclusion_needs", label: "Allergies or health conditions", wide: true },
  { key: "has_transfer_certificate", label: "Has transfer / leaving certificate?" },
];

const SCHOOL_FIELDS = [
  { key: "school_name", label: "Current school" },
  { key: "year_group_of_leaving", label: "Year group of leaving" },
  { key: "date_attended_last", label: "Date attended last", type: "date" },
  { key: "curriculum", label: "Curriculum" },
  { key: "contact_name", label: "Contact name at school" },
  { key: "contact_email", label: "Contact email at school" },
  { key: "contact_phone", label: "Contact phone at school" },
  { key: "reference_status", label: "Confidential reference", type: "reference_status" },
  { key: "reason_for_leaving", label: "Reason for leaving", wide: true },
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

function RecordFields({ fields, source }) {
  return (
    <div className="rec-grid">
      {fields.map((field) => {
        if (field.showIf && !field.showIf(source)) return null;
        let value = source?.[field.key];
        if (field.type === "date") value = formatDate(value);
        if (field.type === "reference_status") value = REFERENCE_STATUS_LABELS[value] || value;
        return <RecordField key={field.key} label={field.label} value={value} wide={field.wide} />;
      })}
    </div>
  );
}

// A collapsible per-person block. Open by default — a founder opening this
// page wants to read the record, not click six times to reveal it — but
// collapsible so a family with several children isn't an endless scroll.
function PersonCard({ name, role, docCount, children }) {
  const [open, setOpen] = useState(true);
  return (
    <section className={"person-card" + (open ? "" : " is-collapsed")}>
      <button type="button" className="person-card-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="person-card-avatar">{initial(name)}</span>
        <span className="person-card-head-text">
          <span className="person-card-name">{name}</span>
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
  return (documentsByOwner[`${ownerType}:${id}`] || []).length;
}

export default function FamilyDetailPage() {
  const { familyId } = useParams();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setDetail(null);
    setError("");
    getFamilyDetail(familyId)
      .then(setDetail)
      .catch((err) => setError(friendlyError(err, "Couldn't load this family.")));
  }, [familyId]);

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
    staff,
    schoolCatalog,
    ownerName,
    displayName,
  } = detail;

  const completenessArgs = {
    parents: parentsOrdered,
    accountHolderRole,
    homeAddress: family.home_address,
    children,
    currentSchools,
    documentsByOwner,
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
          </div>
        </div>
      </div>

      <div className="family-detail-stack">
        <CaseSettingsPanel family={family} staff={staff} />
      </div>

      <div className="family-detail-grid">
        <div className="family-detail-col">
          <ApplicationsPanel
            familyChildren={children}
            applicationsByChild={applicationsByChild}
            schoolCatalog={schoolCatalog}
          />

          <h2 className="family-detail-section-title">Application record</h2>

          <section className="family-detail-card">
            <h2>Home &amp; family</h2>
            <div className="rec-grid">
              <RecordField label="Main household address" value={family.home_address} wide />
            </div>
          </section>

          {namedParents.map((parent) => (
            <PersonCard
              key={parent.id}
              name={parent.full_name || parent.relationship}
              role={
                parent.relationship + (parent.relationship === accountHolderRole ? " · Account holder" : " · Second parent")
              }
              docCount={countDocs(documentsByOwner, "parent", parent.id)}
            >
              <RecordFields fields={PARENT_FIELDS} source={parent} />
            </PersonCard>
          ))}

          {children.map((child, i) => (
            <PersonCard
              key={child.id}
              name={displayNameForChild(child, i)}
              role={`Child${children.length > 1 ? ` ${i + 1}` : ""}${
                child.year_group_applying_for ? ` · applying for ${child.year_group_applying_for}` : ""
              }`}
              docCount={countDocs(documentsByOwner, "child", child.id)}
            >
              <h3 className="rec-subhead">General info</h3>
              <RecordFields fields={CHILD_GENERAL_FIELDS} source={child} />

              <h3 className="rec-subhead">Additional info</h3>
              <RecordFields fields={CHILD_ADDITIONAL_FIELDS} source={child} />

              <h3 className="rec-subhead">Current school</h3>
              <RecordFields fields={SCHOOL_FIELDS} source={currentSchools[i] || {}} />
            </PersonCard>
          ))}

          {namedParents.length === 0 && children.length === 0 && (
            <section className="family-detail-card">
              <p className="family-detail-hint">This family has signed up but hasn&apos;t filled in any of the form yet.</p>
            </section>
          )}
        </div>

        <div className="family-detail-col">
          <TasksPanel familyId={family.id} tasks={tasks} staff={staff} />

          <section className="family-detail-card">
            <h2>Household</h2>
            <ul className="household-list">
              {parents
                .filter((p) => p.full_name)
                .map((p) => (
                  <li key={p.id} className="household-row">
                    <div className="household-row-avatar">{initial(p.full_name)}</div>
                    <div className="household-row-text">
                      <div className="household-row-name">
                        {p.full_name}
                        {p.relationship === accountHolderRole && <span className="household-tag"> · Account holder</span>}
                      </div>
                      <div className="household-row-detail">
                        {p.relationship}
                        {p.phone ? ` · ${p.phone}` : ""}
                        {p.email ? ` · ${p.email}` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              {children.map((c, i) => (
                <li key={c.id} className="household-row">
                  <div className="household-row-avatar household-row-avatar-child">{initial(displayNameForChild(c, i))}</div>
                  <div className="household-row-text">
                    <div className="household-row-name">{displayNameForChild(c, i)}</div>
                    <div className="household-row-detail">
                      {c.date_of_birth ? `DOB ${formatDate(c.date_of_birth)}` : "DOB not on file"}
                      {c.year_group_applying_for ? ` · applying for ${c.year_group_applying_for}` : ""}
                    </div>
                  </div>
                </li>
              ))}
              {parents.every((p) => !p.full_name) && children.length === 0 && (
                <li className="household-empty-hint">Nothing filled in yet.</li>
              )}
            </ul>
          </section>

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
        <DocumentVaultPanel parents={parents} familyChildren={children} documentsByOwner={documentsByOwner} />
      </div>
    </div>
  );
}
