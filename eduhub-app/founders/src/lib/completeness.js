// Copied verbatim from the client app (frontend/src/lib/completeness.js) —
// this is what the family's own "What's left" checklist and Submit-gating
// are built on, so reusing it exactly here is what guarantees this app's
// "what's still missing" list can never disagree with what the family sees
// on their own side. Kept as a second copy rather than a shared package so
// the two apps stay fully independent — if this file changes on the client
// side, mirror the change here too.
import { CHILD_DOCUMENT_TYPES, PARENT_DOCUMENT_TYPES } from "../data/documentTypes";

export const PARENT_REQUIRED_FIELDS = [
  { key: "full_name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "nationality", label: "Nationality" },
  { key: "religion", label: "Religion" },
];

const NON_HOLDER_REQUIRED_FIELDS = PARENT_REQUIRED_FIELDS.filter((f) => f.key === "full_name");

export const CHILD_REQUIRED_FIELDS = [
  { key: "full_name", label: "Full name" },
  { key: "date_of_birth", label: "Date of birth" },
  { key: "nationality", label: "Nationality" },
  { key: "religion", label: "Religion" },
];

export const SCHOOL_REQUIRED_FIELDS = [{ key: "school_name", label: "Current school name" }];

function isFilled(value) {
  return String(value || "").trim().length > 0;
}

export function displayNameForChild(child, index) {
  const name = (child?.preferred_name || child?.first_name || child?.full_name || "").trim();
  return name || `Child ${index + 1}`;
}

function parentStepKey(index) {
  return index === 0 ? "mother" : "father";
}

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

export function getIncompleteStepKeys(missingItems) {
  return new Set(missingItems.map((item) => item.stepKey));
}

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

export function getReadinessPct({ parents, accountHolderRole, homeAddress, children, currentSchools, documentsByOwner }) {
  const total = getTotalRequiredCount({ parents, accountHolderRole, children });
  if (!total) return 100;
  const missing = getMissingItems({ parents, accountHolderRole, homeAddress, children, currentSchools, documentsByOwner }).length;
  return Math.round(((total - missing) / total) * 100);
}
