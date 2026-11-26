// KHDA's own data on every Dubai private school (Dubai Private Schools Open Data, November 2025,
// fees for 2024-25), bundled as src/data/khdaSchools.json and loaded only when it's needed.
// Addendum 167 copied it into our school records once (rating always, everything else only where
// ours was empty) and saved KHDA's name for each school in schools.khda_name. The KHDA tab on a
// school shows KHDA's full record from this file. KHDA's terms ask for KHDA to be credited.
//
// Fields in the file: n name, a area, c curriculum (our words), ck curriculum (KHDA's words),
// g grades, lo/hi our year groups, r rating, p phone, w website, e email, pr principal,
// est year established, st students 2024-25, f [fees from, to], fg fees per year group,
// h rating history [[year, rating]].

export const KHDA_URL = "https://web.khda.gov.ae/en/Resources/KHDA-data-statistics";

const STOP = new Set(["llc", "l", "c", "fze", "fz", "private", "school", "the", "dubai", "branch", "pvt", "ltd", "co", "est", "dmcc", "of"]);
export function khdaKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(" ");
}

// Our school name (lower case) -> KHDA's name, for schools whose names differ too much to
// match on their own. Checked by hand against KHDA's area for each one. Addendum 167 has the
// same list, so keep the two in step.
const ALIASES = {
  "dubai british school - emirates hills": "Dubai British School",
  "jumeirah english speaking school - arabian ranches": "Jumeirah English Speaking School (Br)",
  "jebel ali school": "Jebel Ali School (Br of Taaleem Management (L L C))",
  "the winchester school - jabal ali": "The Winchester School - DUBAI BRANCH",
  "gems wellington academy - dubai silicon oasis": "GEMS Wellington Academy -Fze",
  "emirates international school jumeirah": "Emirates International School L.L.C.",
  "dubai international academy - emirates hills": "Dubai International Academy L.L.C",
  "dubai international academy - al barsha": "Dubai International Academy Albarsha",
  "north london collegiate school dubai": "North London Collegiate School Middle East L.L.C - FZ",
  "uptown international school": "Uptown International School (Br. of Taaleem Management LLC)",
  "american school of dubai": "American School Dubai",
  "raffles international school - umm suqeim south": "Raffles International School L.L.C (Umm Suqeim South Br)",
};

let cache = null;
export async function loadKhda() {
  if (cache) return cache;
  const mod = await import("../data/khdaSchools.json");
  const data = mod.default || mod;
  const byName = new Map(data.schools.map((s) => [s.n, s]));
  const byKey = new Map();
  for (const s of data.schools) byKey.set(s.k, [...(byKey.get(s.k) || []), s]);
  cache = { ...data, byName, byKey };
  return cache;
}

// KHDA's record for one of our schools, or null. The name saved by addendum 167 first, then a
// hand-checked name, then the cleaned-up name (only when exactly one KHDA school has it).
export function matchKhda(school, khda) {
  if (!school?.name || !khda) return null;
  if (school.khda_name && khda.byName.has(school.khda_name)) return khda.byName.get(school.khda_name);
  if (school.emirate && school.emirate !== "Dubai") return null;
  const alias = ALIASES[school.name.trim().toLowerCase()];
  if (alias) return khda.byName.get(alias) || null;
  const hits = khda.byKey.get(khdaKey(school.name));
  return hits && hits.length === 1 ? hits[0] : null;
}
