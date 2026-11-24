import { updateSchool, setFactSource } from "./staffData";
import { FACT_BY_KEY, factState, isLink } from "./schoolFacts";
import { curriculumKey } from "./schoolSuggestions";

// KHDA's own data on every Dubai private school (Dubai Private Schools Open Data, November 2025,
// fees for 2024-25), bundled as src/data/khdaSchools.json and loaded only when it's needed.
// "Fill from KHDA" uses it to fill in each Dubai school with one click: the KHDA rating always,
// and the rest only where our record is empty, so nothing a consultant typed is overwritten.
// Every fact filled or confirmed this way gets KHDA as its source (addendum 166).
// KHDA's terms ask for KHDA to be credited, which the source labels do.

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
// match on their own. Checked by hand against KHDA's area for each one.
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

// KHDA's record for one of our schools, or null. Only a clear, single match counts.
export function matchKhda(school, khda) {
  if (!school?.name || !khda) return null;
  if (school.emirate && school.emirate !== "Dubai") return null;
  const alias = ALIASES[school.name.trim().toLowerCase()];
  if (alias) return khda.byName.get(alias) || null;
  const hits = khda.byKey.get(khdaKey(school.name));
  return hits && hits.length === 1 ? hits[0] : null;
}

const sameCurriculum = (a, b) => {
  const x = curriculumKey(a).sort().join(",");
  return !!x && x === curriculumKey(b).sort().join(",");
};

// What KHDA would fill in on one school. Returns the patch, the facts KHDA confirms (to record
// as the source) and the details where our record already says something different (kept).
export function khdaPlan(school, k) {
  const patch = {};
  const confirms = [];
  const kept = [];
  if (k.r && school.khda_rating !== k.r) patch.khda_rating = k.r;
  if (k.r && !isLink(school.khda_report_url)) patch.khda_report_url = KHDA_URL;
  if (!school.emirate) patch.emirate = "Dubai";

  if (!school.area && k.a) {
    patch.area = k.a;
    confirms.push("location");
  }
  if (k.c) {
    if (!school.curriculum) {
      patch.curriculum = k.c;
      confirms.push("curriculum");
    } else if (sameCurriculum(school.curriculum, k.c)) confirms.push("curriculum");
    else kept.push("curriculum");
  }
  if (k.lo && k.hi) {
    if (!school.lowest_year_group && !school.highest_year_group) {
      patch.lowest_year_group = k.lo;
      patch.highest_year_group = k.hi;
      confirms.push("year_groups");
    } else if (school.lowest_year_group === k.lo && school.highest_year_group === k.hi) confirms.push("year_groups");
    else kept.push("year groups");
  }
  if (k.f) {
    const from = school.tuition_from == null || school.tuition_from === "" ? null : Number(school.tuition_from);
    const to = school.tuition_to == null || school.tuition_to === "" ? from : Number(school.tuition_to);
    if (from === null) {
      patch.tuition_from = k.f[0];
      patch.tuition_to = k.f[1];
      confirms.push("fees");
    } else if (from === k.f[0] && to === k.f[1]) confirms.push("fees");
    else kept.push("fees");
  }
  if (!school.general_phone && k.p) patch.general_phone = k.p;
  if (!school.website_url && k.w) patch.website_url = k.w;
  return { patch, confirms, kept };
}

// Fill every Dubai school from KHDA. sourcesFor(id) -> that school's { fact: row }.
// onProgress(done, total) for the button. Returns a summary for the result card.
export async function fillFromKhda(schools, sourcesFor, onProgress) {
  const khda = await loadKhda();
  const result = { filled: [], unchanged: 0, notFound: [], skipped: 0, failed: [] };
  const list = schools.filter((s) => !s.archived_at);
  let done = 0;
  for (const school of list) {
    done += 1;
    onProgress?.(done, list.length);
    if (school.emirate && school.emirate !== "Dubai") {
      result.skipped += 1;
      continue;
    }
    const k = matchKhda(school, khda);
    if (!k) {
      result.notFound.push(school.name);
      continue;
    }
    const { patch, confirms, kept } = khdaPlan(school, k);
    const after = { ...school, ...patch };
    const src = sourcesFor(school.id) || {};
    // Don't replace a source someone already checked on the school website.
    const newSources = confirms.filter((f) => factState(after, src, f) !== "verified");
    if (!Object.keys(patch).length && !newSources.length) {
      result.unchanged += 1;
      continue;
    }
    try {
      if (Object.keys(patch).length) await updateSchool(school.id, patch);
      for (const fact of newSources) {
        await setFactSource({ schoolId: school.id, fact, source: "khda", sourceUrl: KHDA_URL, checkedValue: FACT_BY_KEY[fact].snap(after) });
      }
      result.filled.push({ name: school.name, khdaName: k.n, fields: Object.keys(patch), kept });
    } catch (err) {
      result.failed.push({ name: school.name, message: err?.message || "Couldn't save" });
    }
  }
  return result;
}
