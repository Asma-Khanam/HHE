import { commuteEstimate, findArea } from "./travelCost";
import { YEAR_GROUPS } from "../data/formOptions";
import { yearGroupsFor, shortYear } from "./yearGroups";
import { factState, khdaVerified, KHDA_LABEL } from "./schoolFacts";

// Suggested schools for a family, worked out from what is already on their
// record: fee range, where they plan to live, each child's SEN answers, their
// current school's curriculum and their ranked priorities. Nothing is saved
// here and no AI is involved: every point comes from a rule that is written
// out below, and every suggestion lists the reasons and what is still missing.
//
// Hard filters take a school out. Points rank what is left (out of 100, but
// only the signals the record actually has count, so the score is shown with
// "based on" and "missing" chips rather than as a verdict).
//
// Verified sources only (meeting 19/11/2026, addenda 165 and 166): a school fact earns points
// and shows as a reason only when it has been checked against the school's own website or a
// KHDA report, and hasn't changed since. A fact that is recorded but not checked is listed as
// "not checked yet" and earns nothing. Hard filters (year groups, fees over budget, no SEN
// support, other emirate) still use what is recorded: they only remove schools, they never
// recommend one.

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

export const curriculumKey = (text) => {
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
// KHDA overall rating (Dubai only), counted only with a link to the published report.
const KHDA_POINTS = { outstanding: 15, very_good: 12, good: 8, acceptable: 4, weak: 0, very_weak: 0 };

// Emirate the family is looking in: any emirate named in "where they plan to live",
// otherwise Dubai (the Relocate service is for Dubai). A school with no emirate recorded
// is kept, so a missing record never hides a school.
const EMIRATE_NAMES = ["Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain", "Dubai"];
export function targetEmirate(area) {
  const t = String(area || "").toLowerCase();
  return EMIRATE_NAMES.find((e) => t.includes(e.toLowerCase())) || "Dubai";
}

// One child's suggestions. Each signal has a weight. The score is the points a school earns
// out of the weights that apply to THIS family (fee range known, area known, curriculum known,
// SEN, priorities), so a school with missing records scores lower, never higher: a school
// with only its curriculum known can't reach 100%.
export function suggestForChild({ family, child, currentSchool, schools = [], skipIds = new Set(), cutoff, sources }) {
  const fee = parseFeeRange(family?.comfortable_fee_range);
  const area = family?.preferred_living_area || "";
  const emirate = targetEmirate(area);
  const top = (Array.isArray(family?.school_priorities) ? family.school_priorities : []).slice(0, 3);
  const hasSen = childHasSen(child);
  const wanted = new Set(curriculumKey(currentSchool?.curriculum));
  // The year group this child is joining. A school that doesn't take it is left out; a school with
  // no year groups recorded is kept and shows what's missing (addendum 164).
  const applying = yearGroupsFor(child, family, cutoff).applying;
  const yearIdx = YEAR_GROUPS.indexOf(applying);

  // Weights that apply to this child at all.
  const W = {
    fee: fee ? 30 : 0,
    travel: findArea(area) ? 25 : 0,
    curriculum: wanted.size ? 20 : 0,
    inclusion: hasSen ? 10 : 0,
    khda: emirate === "Dubai" ? 15 : 0,
  };
  const prioParts = top.filter((p) => /SEN and learning support|Value for money|Proximity to home/i.test(p));
  W.priorities = prioParts.length * 5;
  const possible = Object.values(W).reduce((a, b) => a + b, 0);

  const missingFamily = [
    !fee ? "comfortable fee range" : null,
    !area ? "where they plan to live" : null,
    !wanted.size ? "current school's curriculum" : null,
  ].filter(Boolean);

  const out = [];
  for (const school of schools) {
    if (skipIds.has(school.id)) continue;
    if (school.emirate && school.emirate !== emirate) continue;
    if (hasSen && school.inclusion_level === "none") continue;

    // Year groups (hard filter). Not scored: it either fits or the school is out.
    const lo = YEAR_GROUPS.indexOf(school.lowest_year_group);
    const hi = YEAR_GROUPS.indexOf(school.highest_year_group);
    const hasRange = yearIdx >= 0 && lo >= 0 && hi >= 0;
    if (hasRange && (yearIdx < lo || yearIdx > hi)) continue;

    const reasons = [];
    const cautions = [];
    const basedOn = [];
    const missing = [];
    const unchecked = [];
    let points = 0;
    const src = sources?.get(school.id);
    const checked = (key) => factState(school, src, key) === "verified";
    if (hasRange) {
      if (checked("year_groups")) reasons.push(`Takes ${shortYear(applying)}`);
      else unchecked.push("year groups");
    } else if (yearIdx >= 0) missing.push("year groups taken");

    // Fees (30)
    const from = num(school.tuition_from);
    const to = num(school.tuition_to) ?? from;
    if (W.fee) {
      if (from === null) missing.push("school fees");
      else if (from > fee.hi) continue; // cheapest year group is already over their ceiling
      else if (!checked("fees")) unchecked.push("fees");
      else {
        basedOn.push("fees");
        const label = `AED ${aed(from)}${to !== from ? `–${aed(to)}` : ""}`;
        if (to <= fee.hi && to >= fee.lo * 0.6) {
          points += 30;
          reasons.push(`Fees (${label}) sit inside their range`);
        } else if (to <= fee.hi) {
          points += 24;
          reasons.push(`Fees (${label}) are below their range`);
        } else {
          points += 16;
          cautions.push(`Upper year groups (AED ${aed(to)}) go above their range`);
        }
      }
    }

    // Travel (25)
    const trip = W.travel ? commuteEstimate(area, school) : null;
    if (W.travel) {
      if (!trip) missing.push("school area");
      else if (!checked("location")) unchecked.push("area");
      else {
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
      }
    }

    // Curriculum (20)
    if (W.curriculum) {
      const have = curriculumKey(school.curriculum);
      if (!have.length) missing.push("school curriculum");
      else if (!checked("curriculum")) unchecked.push("curriculum");
      else {
        basedOn.push("curriculum");
        if (have.some((k) => wanted.has(k))) {
          points += 20;
          reasons.push(`${school.curriculum} matches their current curriculum`);
        } else {
          points += 4;
          cautions.push(`${school.curriculum} is a different curriculum from their current school`);
        }
      }
    }

    // Inclusion (10), only when this child has SEN
    if (W.inclusion) {
      if (!school.inclusion_level) missing.push("school inclusion level");
      else if (!checked("inclusion")) unchecked.push("inclusion");
      else {
        basedOn.push("inclusion");
        points += INCLUSION_POINTS[school.inclusion_level] ?? 0;
        if (["extensive", "moderate"].includes(school.inclusion_level)) {
          reasons.push(`${school.inclusion_level[0].toUpperCase()}${school.inclusion_level.slice(1)} inclusion support`);
        } else {
          cautions.push("Only limited inclusion support");
        }
      }
    }

    // KHDA rating (15), Dubai families only, and only with the report link
    if (W.khda) {
      if (!school.khda_rating) missing.push("KHDA rating");
      else if (!khdaVerified(school)) unchecked.push("KHDA rating (no report link)");
      else {
        basedOn.push("KHDA");
        points += KHDA_POINTS[school.khda_rating] ?? 0;
        const text = `KHDA ${KHDA_LABEL[school.khda_rating]}${school.khda_inspection_year ? `, ${school.khda_inspection_year}` : ""}`;
        if (["outstanding", "very_good", "good"].includes(school.khda_rating)) reasons.push(text);
        else cautions.push(`Rated ${text}`);
      }
    }

    // Priorities (5 each for the top three that can be checked), from checked facts only
    let pPoints = 0;
    for (const pr of prioParts) {
      if (/SEN and learning support/i.test(pr) && checked("inclusion") && ["moderate", "extensive"].includes(school.inclusion_level)) pPoints += 5;
      else if (/Value for money/i.test(pr) && checked("fees") && fee && to <= fee.lo + (fee.hi - fee.lo) * 0.6) pPoints += 5;
      else if (/Proximity to home/i.test(pr) && checked("location") && trip && trip.minutes <= 25) pPoints += 5;
    }
    if (W.priorities) {
      points += pPoints;
      if (pPoints === W.priorities) reasons.push("Fits what they ranked highest");
    }

    // How much of this school's own record is filled in. Used only to order schools when the
    // family has nothing to rank on, so the five shown are the ones with the most to go on.
    const completeness = [from !== null, !!(school.area || school.latitude), !!school.curriculum, !!school.inclusion_level, khdaVerified(school)].filter(Boolean).length;

    out.push({
      school,
      score: possible ? Math.round((points / possible) * 100) : null,
      completeness,
      signals: basedOn.length,
      reasons,
      cautions,
      basedOn,
      missing,
      unchecked,
    });
  }

  out.sort(
    (a, b) =>
      (b.score ?? -1) - (a.score ?? -1) || b.signals - a.signals || b.completeness - a.completeness || a.school.name.localeCompare(b.school.name)
  );
  return { items: out, missingFamily, ranked: possible > 0 };
}

// Schools that work for every child, with the average of their scores. A school that is
// ruled out for any one child (SEN, fees, emirate) can't be a "together" school.
export function suggestTogether(perChild) {
  if (perChild.length < 2) return [];
  const maps = perChild.map((r) => new Map(r.items.map((i) => [i.school.id, i])));
  const first = perChild[0].items;
  const out = [];
  for (const item of first) {
    const all = maps.map((m) => m.get(item.school.id));
    if (all.some((x) => !x)) continue;
    const scores = all.map((x) => x.score).filter((s) => s !== null);
    out.push({
      school: item.school,
      score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      signals: Math.min(...all.map((x) => x.signals)),
      completeness: Math.min(...all.map((x) => x.completeness)),
      reasons: [...new Set(all.flatMap((x) => x.reasons))],
      cautions: [...new Set(all.flatMap((x) => x.cautions))],
      basedOn: [...new Set(all.flatMap((x) => x.basedOn))],
      missing: [...new Set(all.flatMap((x) => x.missing))],
      unchecked: [...new Set(all.flatMap((x) => x.unchecked))],
    });
  }
  out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.signals - a.signals || b.completeness - a.completeness || a.school.name.localeCompare(b.school.name));
  return out;
}
