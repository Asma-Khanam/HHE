// The five service tiers from the 2026 brochure (Heather_Harries_Relocation_
// Brochure_2026.docx). Keep this in sync with the brochure if pricing ever
// changes — it's the one place the fee amounts live, so a price change is a
// one-line edit here rather than hunting through components.
//
// baseFee/perAdditionalChild are null for tiers with no fixed price ("New
// Starts" is free, "The Signature Partnership" is by bespoke quotation) —
// nothing should be auto-generated as a payment for those.
//
// All prices are exclusive of VAT (the brochure marks each paid tier
// "+ VAT") and exclude school application fees, which are paid directly to
// the school, not to HHE.
export const PACKAGES = [
  {
    key: "new_starts",
    label: "New Starts",
    baseFee: null,
    perAdditionalChild: null,
    note: "Complimentary consultation — no charge",
  },
  {
    key: "on_the_ground",
    label: "On the Ground",
    baseFee: 6500,
    perAdditionalChild: 2000,
    note: "+ VAT. Priced for one child.",
  },
  {
    key: "guided_search",
    label: "The Guided Search",
    baseFee: 11000,
    perAdditionalChild: 2000,
    note: "+ VAT. Priced for one child.",
  },
  {
    key: "family_partnership",
    label: "Family Partnership",
    baseFee: 20000,
    perAdditionalChild: 3000,
    note: "+ VAT. Priced for one child.",
  },
  {
    key: "signature_partnership",
    label: "The Signature Partnership",
    baseFee: null,
    perAdditionalChild: null,
    note: "By application — bespoke written quotation",
  },
];

export function packageByKey(key) {
  return PACKAGES.find((p) => p.key === key) || null;
}

export function packageLabel(key) {
  return packageByKey(key)?.label || key || "";
}

// What createPackagePayments (staffData.js) would actually create for this
// family, right now — used both to run the creation and to check ahead of
// time whether it's already been done (so the button can hide itself).
export function computePackageFees(packageKey, childCount) {
  const pkg = packageByKey(packageKey);
  if (!pkg || pkg.baseFee === null) return [];

  const fees = [{ label: `${pkg.label} — package fee`, amount: pkg.baseFee }];
  const extraChildren = Math.max(0, (childCount || 1) - 1);
  if (extraChildren > 0 && pkg.perAdditionalChild) {
    fees.push({
      label: `${pkg.label} — additional child fee (×${extraChildren})`,
      amount: pkg.perAdditionalChild * extraChildren,
    });
  }
  return fees;
}
