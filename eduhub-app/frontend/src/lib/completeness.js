import { CHILD_DOCUMENT_TYPES, PARENT_DOCUMENT_TYPES } from "../data/documentTypes";

// Single source of truth for "is this application actually finished" — used
// to gate the Submit button, to render the "What's left" checklist and the
// red inline field highlights, and to compute Overview's readiness numbers.
// All four read from the exact same list so they can never disagree with
// each other about what's still missing.

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

// `parents` is always a 2-entry array — [Mother, Father] — one or both may
// be entirely blank if the account holder hasn't filled that side in yet.
// `accountHolderRole` ("Mother" | "Father") says which of the two is the
// person who's actually filling out and submitting this application; only
// their side is fully required, per the 2026-08-27 decision to keep the
// other parent optional-but-named.
export function getMissingItems({ parents, accountHolderRole, homeAddress, children, currentSchools, documentsByOwner }) {
  const missing = [];
  const docs = documentsByOwner || {};

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

    if (isHolder) {
      const parentDocs = p?.id ? docs[`parent:${p.id}`] || [] : [];
      PARENT_DOCUMENT_TYPES.filter((d) => d.required).forEach((docType) => {
        if (!parentDocs.some((d) => d.document_type === docType.key)) {
          missing.push({
            stepKey,
            label: `${roleLabel} — ${docType.label}`,
            kind: "document",
            owner: "parent",
            parentIndex: i,
            docKey: docType.key,
            fieldKey: `parent-doc-${i}-${docType.key}`,
          });
        }
      });
    }
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

    const childDocs = child?.id ? docs[`child:${child.id}`] || [] : [];
    CHILD_DOCUMENT_TYPES.filter((d) => d.required).forEach((docType) => {
      if (!childDocs.some((d) => d.document_type === docType.key)) {
        missing.push({
          stepKey,
          label: `${childLabel} — ${docType.label}`,
          kind: "document",
          owner: "child",
          childIndex: i,
          docKey: docType.key,
          fieldKey: `child-doc-${i}-${docType.key}`,
        });
      }
    });
  });

  return missing;
}

// Convenience for the step pills — which steps have at least one missing item.
export function getIncompleteStepKeys(missingItems) {
  return new Set(missingItems.map((item) => item.stepKey));
}

// Total count of required items (fields + documents) across the WHOLE
// application, regardless of whether they're filled — used as the
// denominator for a single, honest "readiness" percentage. Counting this
// the same way getMissingItems counts what's left is what keeps the
// dashboard's number from ever contradicting the checklist under it.
export function getTotalRequiredCount({ parents, accountHolderRole, children }) {
  let total = 1; // home address
  (parents || []).forEach((p) => {
    const isHolder = p?.relationship === accountHolderRole;
    total += isHolder ? PARENT_REQUIRED_FIELDS.length : NON_HOLDER_REQUIRED_FIELDS.length;
    if (isHolder) total += PARENT_DOCUMENT_TYPES.filter((d) => d.required).length;
  });
  total += (children || []).length * CHILD_REQUIRED_FIELDS.length;
  total += (children || []).length * SCHOOL_REQUIRED_FIELDS.length;
  total += (children || []).length * CHILD_DOCUMENT_TYPES.filter((d) => d.required).length;
  return total;
}

// A single 0–100 readiness number — required items done vs. required items
// total, fields and documents counted together. This is deliberately the
// ONLY number Overview calls "readiness"; the old version averaged several
// separately-computed percentages that didn't all count documents, which is
// exactly what made the dashboard look "out of sync" with itself (100%
// readiness while 10 required documents were still missing).
export function getReadinessPct({ parents, accountHolderRole, homeAddress, children, currentSchools, documentsByOwner }) {
  const total = getTotalRequiredCount({ parents, accountHolderRole, children });
  if (!total) return 100;
  const missing = getMissingItems({ parents, accountHolderRole, homeAddress, children, currentSchools, documentsByOwner }).length;
  return Math.round(((total - missing) / total) * 100);
}

// Per-card breakdown used by the card-list view's progress bars — one entry
// per "mother" / "father" / "child-{i}" key, each { total, missingCount, pct }.
// Reuses getMissingItems under the hood (with a placeholder home address so
// that item never gets attributed to any single card) so a card's progress
// bar can never disagree with the "What's left" checklist or the overall
// readiness number.
export function getStepBreakdown({ parents, accountHolderRole, children, currentSchools, documentsByOwner }) {
  const missing = getMissingItems({
    parents,
    accountHolderRole,
    homeAddress: "placeholder", // non-empty so home address never counts against a card
    children,
    currentSchools,
    documentsByOwner,
  });

  const missingByStep = {};
  missing.forEach((item) => {
    missingByStep[item.stepKey] = (missingByStep[item.stepKey] || 0) + 1;
  });

  const breakdown = {};

  (parents || []).forEach((p, i) => {
    const stepKey = parentStepKey(i);
    const isHolder = p?.relationship === accountHolderRole;
    let total = isHolder ? PARENT_REQUIRED_FIELDS.length : NON_HOLDER_REQUIRED_FIELDS.length;
    if (isHolder) total += PARENT_DOCUMENT_TYPES.filter((d) => d.required).length;
    const missingCount = missingByStep[stepKey] || 0;
    const pct = total ? Math.round(((total - missingCount) / total) * 100) : 100;
    breakdown[stepKey] = { total, missingCount, pct };
  });

  (children || []).forEach((child, i) => {
    const stepKey = `child-${i}`;
    const total =
      CHILD_REQUIRED_FIELDS.length +
      SCHOOL_REQUIRED_FIELDS.length +
      CHILD_DOCUMENT_TYPES.filter((d) => d.required).length;
    const missingCount = missingByStep[stepKey] || 0;
    const pct = total ? Math.round(((total - missingCount) / total) * 100) : 100;
    breakdown[stepKey] = { total, missingCount, pct };
  });

  return breakdown;
}
