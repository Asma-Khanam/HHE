import { commuteEstimate } from "./travelCost";
import { yearGroupsFor } from "./yearGroups";

// Suggested schools for a family, worked out from what is already on their
// record: fee range, where they plan to live, each child's SEN answers, their
// current school's curriculum and their ranked priorities. Nothing is saved
// here and no AI is involved: every point comes from a rule that is written
// out below, and every suggestion lists the reasons and what is still missing.
//
// Hard filters take a school out. Points rank what is left (out of 100, but
// only the signals the record actually has count, so the score is shown with
// "based on" and "missing" chips rather than as a verdict).

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const aed = (n) => Math.round(n).toLocaleString("en-GB");

// "AED 30,000 to 50,000" -> { lo: 30000, hi: 50000 }. null when it names no amount.
export function parseFeeRange(text) {
  const t = String(text || "");
  const nums = (t.match(/\d[\d,]*/g) || []).map((n) => Number(n.replace(/,/g, "")));
  if (!nums.length) return null;
  if (/^up to/i.test(t)) return { lo: 0, hi: nums[0] };
  if (/^above/i.test(t)) return { lo: nums[0], hi: Infinity };
  if (nums.length >= 2) return { lo: nums[0], hi: nums[1] };
  return null;
}

const curriculumKey = (text) => {
  const t = String(text || "").toLowerCase();
  const keys = [];
  if (/british|national curriculum|\buk\b/.test(t)) keys.push("british");
  if (/\bib\b|baccalaureate/.test(t)) keys.push("ib");
  if (/american/.test(t)) keys.push("american");
  if (/cbse|icse|indian/.test(t)) keys.push("indian");
  if (/french/.test(t)) keys.push("french");
  if (/uae national|moe/.test(t)) keys.push("uae");
  return keys;
};

const SEN_NONE = "No, none at all";
export const childHasSen = (child) => {
  const s = String(child?.sen_status || "").trim();
  if (!s) return child?.has_sen === "Yes" || child?.has_sen === true;
  return s !== SEN_NONE;
};

const INCLUSION_POINTS = { extensive: 10, moderate: 7, limited: 2, none: 0 };

export function suggestSchools({ family, children = [], currentSchools = [], schools = [], skipIds = new Set(), cutoff }) {
  const fee = parseFeeRange(family?.comfortable_fee_range);
  const area = family?.preferred_living_area || "";
  const priorities = Array.isArray(family?.school_priorities) ? family.school_priorities : [];
  const senKids = children.filter(childHasSen);

  const wanted = new Set();
  for (const cs of currentSchools) for (const k of curriculumKey(cs?.curriculum)) wanted.add(k);

  const yearLabels = children
    .map((c) => yearGroupsFor(c, family, cutoff).applying)
    .filter(Boolean);

  const out = [];
  for (const school of schools) {
    if (skipIds.has(school.id)) continue;
    if (school.emirate === "Outside UAE") continue;

    const reasons = [];
    const cautions = [];
    const basedOn = [];
    const missing = [];
    let points = 0;
    let possible = 0;

    // --- Hard filter: SEN support ------------------------------------------
    if (senKids.length && school.inclusion_level === "none") continue;

    // --- Fees (30) ----------------------------------------------------------
    const from = num(school.tuition_from);
    const to = num(school.tuition_to) ?? from;
    if (fee && from !== null) {
      possible += 30;
      basedOn.push("fees");
      if (from > fee.hi) continue; // even the cheapest year group is over their ceiling
      if (to <= fee.hi && to >= fee.lo * 0.6) {
        points += 30;
        reasons.push(`Fees (AED ${aed(from)}${to !== from ? `–${aed(to)}` : ""}) sit inside their range`);
      } else if (to <= fee.hi) {
        points += 24;
        reasons.push(`Fees (AED ${aed(from)}${to !== from ? `–${aed(to)}` : ""}) are below their range`);
      } else {
        points += 16;
        cautions.push(`Upper year groups (AED ${aed(to)}) go above their range`);
      }
    } else {
      if (!fee) missing.push("family fee range");
      else missing.push("school fees");
    }

    // --- Travel (25) --------------------------------------------------------
    const trip = commuteEstimate(area, school);
    if (trip) {
      possible += 25;
      basedOn.push("travel");
      if (trip.minutes <= 20) {
        points += 25;
        reasons.push(`About ${trip.minutes} min from ${trip.from}`);
      } else if (trip.minutes <= 30) {
        points += 18;
        reasons.push(`About ${trip.minutes} min from ${trip.from}`);
      } else if (trip.minutes <= 45) {
        points += 8;
        cautions.push(`${trip.minutes} min from ${trip.from} at school-run speed`);
      } else {
        cautions.push(`Long school run: about ${trip.minutes} min from ${trip.from}`);
      }
    } else {
      missing.push(area ? "school area" : "where they plan to live");
    }

    // --- Curriculum (20) ----------------------------------------------------
    const have = curriculumKey(school.curriculum);
    if (wanted.size && have.length) {
      possible += 20;
      basedOn.push("curriculum");
      const hit = have.find((k) => wanted.has(k));
      if (hit) {
        points += 20;
        reasons.push(`${school.curriculum} matches their child's current curriculum`);
      } else {
        points += 4;
        cautions.push(`${school.curriculum} is a different curriculum from their current school`);
      }
    } else {
      missing.push(wanted.size ? "school curriculum" : "child's current curriculum");
    }

    // --- Inclusion (10), only when a child has SEN ---------------------------
    if (senKids.length) {
      if (school.inclusion_level) {
        possible += 10;
        basedOn.push("inclusion");
        points += INCLUSION_POINTS[school.inclusion_level] ?? 0;
        if (school.inclusion_level === "extensive" || school.inclusion_level === "moderate") {
          reasons.push(`${school.inclusion_level[0].toUpperCase()}${school.inclusion_level.slice(1)} inclusion support`);
        } else {
          cautions.push("Only limited inclusion support");
        }
      } else {
        missing.push("school inclusion level");
      }
    }

    // --- Priorities (15) ----------------------------------------------------
    const top = priorities.slice(0, 3);
    if (top.length) {
      let p = 0;
      let counted = 0;
      for (const pr of top) {
        if (/SEN and learning support/i.test(pr) && school.inclusion_level) {
          counted += 5;
          if (["moderate", "extensive"].includes(school.inclusion_level)) p += 5;
        } else if (/Value for money/i.test(pr) && from !== null && fee) {
          counted += 5;
          if (to <= fee.lo + (fee.hi - fee.lo) * 0.6) p += 5;
        } else if (/Proximity to home/i.test(pr) && trip) {
          counted += 5;
          if (trip.minutes <= 25) p += 5;
        }
      }
      if (counted) {
        possible += counted;
        points += p;
        basedOn.push("their top priorities");
        if (p === counted) reasons.push("Fits what they ranked highest");
      }
    }

    if (!possible) {
      // Nothing to score on: show it low down with everything missing.
      out.push({ school, score: null, reasons, cautions, basedOn, missing });
      continue;
    }
    out.push({ school, score: Math.round((points / possible) * 100), reasons, cautions, basedOn, missing });
  }

  out.sort((a, b) => {
    if (a.score === null && b.score === null) return a.school.name.localeCompare(b.school.name);
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score || a.school.name.localeCompare(b.school.name);
  });

  return {
    suggestions: out,
    yearLabels,
    familyMissing: [
      !fee ? "comfortable fee range" : null,
      !area ? "where they plan to live" : null,
      !wanted.size ? "current school's curriculum" : null,
    ].filter(Boolean),
  };
}
