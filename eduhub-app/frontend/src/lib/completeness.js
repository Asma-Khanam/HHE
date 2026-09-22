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

// `address` is required for the account holder specifically. It replaced the
// single family-wide home address on 2026-09-02 — separated parents don't
// share one, so the address moved onto each person, and the one address we
// genuinely can't do without is the address of whoever is applying.
export const PARENT_REQUIRED_FIELDS = [
  { key: "full_name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "nationality", label: "Nationality" },
  { key: "address", label: "Address" },
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
  // SEN-04/SEN-07 (September 2026 change request) — the section's two
  // required questions, same required-field machinery as the three fields
  // above rather than a separate mechanism just for these.
  { key: "sen_intervention_status", label: "Taken out of class for intervention or support?" },
  { key: "sen_lsa_status", label: "Learning Support Assistant or shadow teacher" },
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
// SEN-01 (September 2026 change request) replaced the old has_sen Yes/No
// question with a 5-option status question — supporting documents are only
// worth asking for once a child actually has a diagnosis or an assessment
// underway, not for "no formal diagnosis, but we have concerns" or the
// other softer answers. Keep this in sync with senNeedsSupportingDocs() in
// ApplicationForm.jsx — same condition, same reasoning.
function childSenNeedsSupportingDocs(child) {
  return (
    child?.sen_status === "Yes, formally identified or diagnosed" ||
    child?.sen_status === "Yes, assessment is currently in progress"
  );
}

function expectedChildDocTypes(child) {
  return CHILD_DOCUMENT_TYPES.filter((d) => {
    if (!d.expected) return false;
    if (d.key === "leaving_certificate") return child?.has_transfer_certificate === "Yes";
    if (d.key === "sen_supporting_documents") return childSenNeedsSupportingDocs(child);
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
export function getMissingItems({
  parents,
  accountHolderRole,
  children,
  currentSchools,
  schoolPriorities,
  comfortableFeeRange,
  budgetStatus,
}) {
  const missing = [];
  // AH-09/AH-10 live on the account holder's own card (Family preferences
  // tab), so a missing one opens THAT card -- previously "family", which
  // isn't a card, so clicking it from the Dashboard just dropped the family
  // on the Application tab's list with nothing highlighted.
  const holderStepKey = accountHolderRole === "Father" ? "father" : "mother";

  // AH-09: family-level, not tied to any one person's card — exactly 5
  // required, per the document ("the parent selects and orders exactly
  // five"). No stepKey owns this one, same as the old family home-address
  // check, so a missing one sends the family to the overview rather than to
  // a specific person's card (see handleSubmitApplication in
  // ApplicationForm.jsx).
  if ((schoolPriorities || []).length !== 5) {
    missing.push({
      stepKey: holderStepKey,
      label: "Rank your top 5 school priorities",
      kind: "field",
      owner: "family",
      field: "school_priorities",
      fieldKey: "family-school_priorities",
    });
  }

  // AH-10: same family-level shape as AH-09 — one required single-select,
  // owned by nobody's card in particular.
  if (!isFilled(comfortableFeeRange)) {
    missing.push({
      stepKey: holderStepKey,
      label: "Comfortable annual fee range",
      kind: "field",
      owner: "family",
      field: "comfortable_fee_range",
      fieldKey: "family-comfortable_fee_range",
    });
  }

  // BUD-01: the first question of the new "Budget and relocation planning"
  // section (Section 3) — unlike AH-09/AH-10 this one gets its own card and
  // step, so its stepKey points there directly instead of falling back to
  // the overview.
  if (!isFilled(budgetStatus)) {
    missing.push({
      stepKey: "budget",
      label: "Have you set a budget for the move?",
      kind: "field",
      owner: "family",
      field: "budget_status",
      fieldKey: "family-budget_status",
    });
  }

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
          fieldKey: `parent-${i}-${field.key === "full_name" ? "first_name" : field.key}`,
        });
      }
    });
  });

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
          fieldKey: `child-${i}-${field.key === "full_name" ? "first_name" : field.key}`,
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
  let total = 3; // AH-09's ranking question + AH-10's fee-range question + BUD-01's budget-status question
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
export function getReadinessPct({
  parents,
  accountHolderRole,
  children,
  currentSchools,
  documentsByOwner,
  schoolPriorities,
  comfortableFeeRange,
  budgetStatus,
}) {
  const total = getTotalTrackedCount({ parents, accountHolderRole, children });
  if (!total) return 100;
  const missingFields = getMissingItems({
    parents,
    accountHolderRole,
    children,
    currentSchools,
    schoolPriorities,
    comfortableFeeRange,
    budgetStatus,
  }).length;
  const missingDocs = getOutstandingDocuments({ parents, accountHolderRole, children, documentsByOwner }).length;
  const done = total - missingFields - missingDocs;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

// Per-card breakdown used by the card-list view's progress bars — one entry
// per "mother" / "father" / "child-{i}" key, each { total, missingCount, pct }.
// Built from the same two functions above, so a card's progress bar can never
// disagree with the Dashboard.
export function getStepBreakdown({ parents, accountHolderRole, children, currentSchools, documentsByOwner, budgetStatus }) {
  const tracked = [
    // Family-level questions (priorities, fee range, budget) are left out:
    // this list is built without the family's answers to them, so they'd
    // always read as missing. The budget card is scored on its own below.
    ...getMissingItems({ parents, accountHolderRole, children, currentSchools }).filter((item) => item.owner !== "family"),
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

  // BUD-01 gets its own card now, same as a parent or a child — computed
  // directly rather than through the shared `tracked` list above, since that
  // list is built without schoolPriorities/comfortableFeeRange/budgetStatus
  // and would otherwise always read as "missing" regardless of the real
  // value.
  const budgetMissing = isFilled(budgetStatus) ? 0 : 1;
  breakdown.budget = { total: 1, missingCount: budgetMissing, pct: budgetMissing ? 0 : 100 };

  return breakdown;
}
