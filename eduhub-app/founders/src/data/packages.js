// The five service tiers from the 2026 brochure (Heather_Harries_Relocation_
// Brochure_2026.docx). Keep this in sync with the brochure if pricing ever
// changes — it's the one place the fee amounts live, so a price change is a
// one-line edit here rather than hunting through components.
//
// baseFee/perAdditionalChild are null for "New Starts" (free) — nothing is
// auto-generated as a payment for it. Prices updated 7 Oct 2026 from the
// newer brochure (Miss Lyndsay): Guided Search 13,500 (+3,000 per extra
// child), Family Partnership extra child 3,500, Signature 45,000 with up to
// three children included (+9,000 for each further child).
//
// All prices are exclusive of VAT (the brochure marks each paid tier
// "+ VAT") and exclude school application fees, which are paid directly to
// the school, not to HHE.
// "included" = the school tours and applications each package comes with
// (2026 brochure). The family's dashboard shows how many have been used.
// A family whose deal differs gets an override (family_package_allowance,
// addendum 91). Signature's tours/applications are "up to" figures.
export const PACKAGES = [
  {
    key: "new_starts",
    included: { tours: 0, applications: 0 },
    label: "New Starts",
    baseFee: null,
    perAdditionalChild: null,
    note: "Complimentary consultation — no charge",
  },
  {
    key: "on_the_ground",
    included: { tours: 2, applications: 1 },
    label: "On the Ground",
    baseFee: 6500,
    perAdditionalChild: 2000,
    note: "+ VAT. Priced for one child.",
  },
  {
    key: "guided_search",
    included: { tours: 3, applications: 3 },
    label: "The Guided Search",
    baseFee: 13500,
    perAdditionalChild: 3000,
    note: "+ VAT. Priced for one child.",
  },
  {
    key: "family_partnership",
    included: { tours: 3, applications: 4 },
    label: "Family Partnership",
    baseFee: 20000,
    perAdditionalChild: 3500,
    note: "+ VAT. Priced for one child.",
  },
  {
    key: "signature_partnership",
    included: { tours: 5, applications: 6 },
    label: "The Signature Partnership",
    baseFee: 45000,
    perAdditionalChild: 9000,
    includedChildren: 3,
    note: "+ VAT. Up to three children included; additional children AED 9,000 each.",
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
  const extraChildren = Math.max(0, (childCount || 1) - (pkg.includedChildren || 1));
  if (extraChildren > 0 && pkg.perAdditionalChild) {
    fees.push({
      label: `${pkg.label} — additional child fee (×${extraChildren})`,
      amount: pkg.perAdditionalChild * extraChildren,
    });
  }
  return fees;
}
