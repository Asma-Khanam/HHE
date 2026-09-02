import { CHILD_DOCUMENT_TYPES, PARENT_DOCUMENT_TYPES } from "../data/documentTypes";

// Single source of truth for "is this application actually finished" — used
// to gate the Submit button, to render the "What's left" checklist and the
// red inline field highlights, and to compute the Dashboard's readiness
// numbers. Everything reads from the same list so they can never disagree
// with each other about what's still missing.
//
// CHANGED 2026-09-02 (founder feedback): documents no longer block Submit.
// A family waiting on a visa, an Emirates ID, or a leaving certificate the
// school hasn't issued yet can submit today and upload the rest as it
// arrives. Missing documents are still tracked — they just come back from
// getOutstandingDocuments() and appear under "Outstanding documents" rather
// than stopping the application from going in.

export const PARENT_REQUIRED_FIELDS = [
  { key: "full_name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "nationality", label: "Nationality" },
  { key: "religion", label: "Religion" },
];

// The second parent (whichever one isn't the account holder) is optional —
// a single-parent/single-guardian family can leave everything about them
// blank — except their name, which is worth having on file even as a bare
// minimum if they're listed at all.
const NON_HOLDER_REQUIRED_FIELDS = PARENT_REQUIRED_FIELDS.filter((f) => f.key === "full_name");

export const CHILD_REQUIRED_FIELDS = [
  { key: "full_name", label: "Full name" },
  { key: "date_of_birth", label: "Date of birth" },
  { key: "nationality", label: "Nationality" },
  { key: "religion", label: "Religion" },
];

// Current-school fields that are real, already-saved columns — kept
// separate from CHILD_REQUIRED_FIELDS since they live on the current_schools
// table, not children.
export const SCHOOL_REQUIRED_FIELDS = [{ key: "school_name", label: "Current school name" }];

function isFilled(value) {
  return String(value || "").trim().length > 0;
}

export function displayNameForChild(child, index) {
  const name = (child?.preferred_name || child?.first_name || child?.full_name || "").trim();
  return name || `Child ${index + 1}`;
}

// Parent 0 is always Mother, parent 1 is always Father — this is what lets
// the card-list view show two separate cards ("mother" / "father") instead
// of one shared "parent" step.
function parentStepKey(index) {
  return index === 0 ? "mother" : "father";
}

// Which document slots actually apply to one child right now. A leaving
// certificate they've already told us doesn't exist yet, or SEN paperwork
// for a child with no SEN, isn't "outstanding" — it simply doesn't apply,
// and listing it would just be noise on the Dashboard.
function expectedChildDocTypes(child) {
  return CHILD_DOCUMENT_TYPES.filter((d) => {
    if (!d.expected) return false;
    if (d.key === "leaving_certificate") return child?.has_transfer_certificate === "Yes";
    if (d.key === "sen_supporting_documents") return child?.has_sen === "Yes";
    return true;
  });
}

// Parent document slots only count once that parent actually exists on the
// application — an unnamed second parent shouldn't generate outstanding
// document rows for a person who may not be part of this application at all.
function expectedParentDocTypes(parent, isHolder) {
  if (!isHolder && !isFilled(parent?.full_name)) return [];
  return PARENT_DOCUMENT_TYPES.filter((d) => d.expected);
}

// Everything that BLOCKS submission — required fields only, no documents.
// `parents` is always a 2-entry array — [Mother, Father] — one or both may
// be entirely blank if the account holder hasn't filled that side in yet.
// `accountHolderRole` ("Mother" | "Father") says which of the two is the
// person actually filling out and submitting this application; only their
// side is fully required, per the 2026-08-27 decision to keep the other
// parent optional-but-named.
export function getMissingItems({ parents, accountHolderRole, homeAddress, children, currentSchools }) {
  const missing = [];

  (parents || []).forEach((p, i) => {
    const isHolder = p?.relationship === accountHolderRole;
    const requiredFields = isHolder ? PARENT_REQUIRED_FIELDS : NON_HOLDER_REQUIRED_FIELDS;
    const roleLabel = p?.relationship || (i === 0 ? "Mother" : "Father");
    const stepKey = parentStepKey(i);

    requiredFields.forEach((field) => {
      if (!isFilled(p?.[field.key])) {
        missing.push({
          stepKey,
          label: `${roleLabel} — ${field.label}`,
          kind: "field",
          owner: "parent",
          parentIndex: i,
          field: field.key,
          fieldKey: `parent-${i}-${field.key}`,
        });
      }
    });
  });

  if (!isFilled(homeAddress)) {
    missing.push({
      stepKey: "home_address",
      label: "Home address",
      kind: "field",
      owner: "family",
      field: "home_address",
      fieldKey: "family-home_address",
    });
  }

  (children || []).forEach((child, i) => {
    const childLabel = displayNameForChild(child, i);
    const stepKey = `child-${i}`;
    CHILD_REQUIRED_FIELDS.forEach((field) => {
      if (!isFilled(child?.[field.key])) {
        missing.push({
          stepKey,
          label: `${childLabel} — ${field.label}`,
          kind: "field",
          owner: "child",
          childIndex: i,
          field: field.key,
          fieldKey: `child-${i}-${field.key}`,
        });
      }
    });

    const school = (currentSchools || [])[i];
    SCHOOL_REQUIRED_FIELDS.forEach((field) => {
      if (!isFilled(school?.[field.key])) {
        missing.push({
          stepKey,
          label: `${childLabel} — ${field.label}`,
          kind: "field",
          owner: "school",
          schoolIndex: i,
          field: field.key,
          fieldKey: `school-${i}-${field.key}`,
        });
      }
    });
  });

  return missing;
}

// Every document HHE still needs that hasn't been uploaded yet. Same shape
// as a missing item (so the same click-through-to-the-upload-row machinery
// works), but deliberately NOT part of getMissingItems — nothing in here
// stops a family from submitting.
export function getOutstandingDocuments({ parents, accountHolderRole, children, documentsByOwner }) {
  const docs = documentsByOwner || {};
  const outstanding = [];

  (parents || []).forEach((p, i) => {
    const isHolder = p?.relationship === accountHolderRole;
    const roleLabel = p?.relationship || (i === 0 ? "Mother" : "Father");
    const stepKey = parentStepKey(i);
    const parentDocs = p?.id ? docs[`parent:${p.id}`] || [] : [];

    expectedParentDocTypes(p, isHolder).forEach((docType) => {
      if (parentDocs.some((d) => d.document_type === docType.key)) return;
      outstanding.push({
        stepKey,
        label: `${roleLabel} — ${docType.label}`,
        docLabel: docType.label,
        kind: "document",
        owner: "parent",
        parentIndex: i,
        docKey: docType.key,
        personName: p?.full_name || roleLabel,
        personTag: roleLabel,
        fieldKey: `parent-doc-${i}-${docType.key}`,
      });
    });
  });

  (children || []).forEach((child, i) => {
    const childLabel = displayNameForChild(child, i);
    const stepKey = `child-${i}`;
    const childDocs = child?.id ? docs[`child:${child.id}`] || [] : [];

    expectedChildDocTypes(child).forEach((docType) => {
      if (childDocs.some((d) => d.document_type === docType.key)) return;
      outstanding.push({
        stepKey,
        label: `${childLabel} — ${docType.label}`,
        docLabel: docType.label,
        kind: "document",
        owner: "child",
        childIndex: i,
        docKey: docType.key,
        personName: childLabel,
        personTag: (children || []).length > 1 ? `Child ${i + 1}` : "Child",
        fieldKey: `child-doc-${i}-${docType.key}`,
      });
    });
  });

  return outstanding;
}

// Convenience for the step pills — which steps have at least one missing item.
export function getIncompleteStepKeys(missingItems) {
  return new Set(missingItems.map((item) => item.stepKey));
}

// Total number of tracked items (required fields + expected documents)
// across the WHOLE application, whether filled or not — the denominator for
// the single "readiness" percentage. Documents are counted here even though
// they don't block Submit: a family with every field done but no documents
// uploaded genuinely isn't finished, and a bar reading 100% in that state is
// exactly the "dashboard out of sync with itself" problem from round 5.
export function getTotalTrackedCount({ parents, accountHolderRole, children }) {
  let total = 1; // home address
  (parents || []).forEach((p) => {
    const isHolder = p?.relationship === accountHolderRole;
    total += isHolder ? PARENT_REQUIRED_FIELDS.length : NON_HOLDER_REQUIRED_FIELDS.length;
    total += expectedParentDocTypes(p, isHolder).length;
  });
  (children || []).forEach((child) => {
    total += CHILD_REQUIRED_FIELDS.length;
    total += SCHOOL_REQUIRED_FIELDS.length;
    total += expectedChildDocTypes(child).length;
  });
  return total;
}

// A single 0–100 readiness number — items done vs. items tracked, fields and
// documents counted together.
export function getReadinessPct({ parents, accountHolderRole, homeAddress, children, currentSchools, documentsByOwner }) {
  const total = getTotalTrackedCount({ parents, accountHolderRole, children });
  if (!total) return 100;
  const missingFields = getMissingItems({ parents, accountHolderRole, homeAddress, children, currentSchools }).length;
  const missingDocs = getOutstandingDocuments({ parents, accountHolderRole, children, documentsByOwner }).length;
  const done = total - missingFields - missingDocs;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

// Per-card breakdown used by the card-list view's progress bars — one entry
// per "mother" / "father" / "child-{i}" key, each { total, missingCount, pct }.
// Built from the same two functions above (with a placeholder home address so
// that item never gets attributed to any single card) so a card's progress
// bar can never disagree with the Dashboard.
export function getStepBreakdown({ parents, accountHolderRole, children, currentSchools, documentsByOwner }) {
  const tracked = [
    ...getMissingItems({
      parents,
      accountHolderRole,
      homeAddress: "placeholder", // non-empty so home address never counts against a card
      children,
      currentSchools,
    }),
    ...getOutstandingDocuments({ parents, accountHolderRole, children, documentsByOwner }),
  ];

  const missingByStep = {};
  tracked.forEach((item) => {
    missingByStep[item.stepKey] = (missingByStep[item.stepKey] || 0) + 1;
  });

  const breakdown = {};

  (parents || []).forEach((p, i) => {
    const stepKey = parentStepKey(i);
    const isHolder = p?.relationship === accountHolderRole;
    const total =
      (isHolder ? PARENT_REQUIRED_FIELDS.length : NON_HOLDER_REQUIRED_FIELDS.length) +
      expectedParentDocTypes(p, isHolder).length;
    const missingCount = missingByStep[stepKey] || 0;
    const pct = total ? Math.round(((total - missingCount) / total) * 100) : 100;
    breakdown[stepKey] = { total, missingCount, pct };
  });

  (children || []).forEach((child, i) => {
    const stepKey = `child-${i}`;
    const total =
      CHILD_REQUIRED_FIELDS.length + SCHOOL_REQUIRED_FIELDS.length + expectedChildDocTypes(child).length;
    const missingCount = missingByStep[stepKey] || 0;
    const pct = total ? Math.round(((total - missingCount) / total) * 100) : 100;
    breakdown[stepKey] = { total, missingCount, pct };
  });

  return breakdown;
}
