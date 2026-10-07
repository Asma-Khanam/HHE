// The five packages (2026 brochure) -- only what the family dashboard needs:
// the name and how many school tours and applications each one includes.
// Keep in step with founders/src/data/packages.js. "Signature" figures are
// "up to". A family whose deal differs gets an override (addendum 91).
export const PACKAGES = [
  { key: "new_starts", label: "New Starts", included: { tours: 0, applications: 0 } },
  { key: "on_the_ground", label: "On the Ground", included: { tours: 2, applications: 1 } },
  { key: "guided_search", label: "The Guided Search", included: { tours: 3, applications: 3 } },
  { key: "family_partnership", label: "Family Partnership", included: { tours: 3, applications: 4 } },
  { key: "signature_partnership", label: "The Signature Partnership", included: { tours: 5, applications: 6 } },
];

export function packageByKey(key) {
  return PACKAGES.find((p) => p.key === key) || null;
}

export function packageLabel(key) {
  return packageByKey(key)?.label || key || "";
}
