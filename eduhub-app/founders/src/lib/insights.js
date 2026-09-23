import { supabase } from "./supabaseClient";
import { familyDisplayName } from "./staffData";
import { PIPELINE_STAGES, CLIENT_STAGES } from "./workflow";

// Dashboard analytics (September 2026). One load of every table the charts
// need (staff can read all of it), then pure functions that turn rows into
// chart-ready numbers. Every query fails soft to [] so one missing table
// (an addendum not run yet) never blanks the whole page.

async function all(table, columns = "*") {
  const { data, error } = await supabase.from(table).select(columns);
  return error ? [] : data || [];
}

export async function loadInsightsData() {
  const [families, parents, children, currentSchools, applications, schools, shortlist, placements, payments, history, staff] =
    await Promise.all([
      all("families"),
      all("parents", "id, family_id, relationship, full_name, user_id, nationality"),
      all("children"),
      all("current_schools"),
      all("applications"),
      all("schools", "id, name, area"),
      all("school_shortlist"),
      all("family_placements"),
      all("payments"),
      all("family_stage_history"),
      all("staff"),
    ]);
  return { families, parents, children, currentSchools, applications, schools, shortlist, placements, payments, history, staff };
}

// ---------------------------------------------------------------- helpers
const DAY = 86400000;
const groupBy = (rows, key) =>
  rows.reduce((m, r) => {
    (m[r[key]] = m[r[key]] || []).push(r);
    return m;
  }, {});

function titleCase(s) {
  return s.replace(/\w\S*/g, (w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()));
}

const COUNTRY_ALIASES = {
  uk: "United Kingdom", "u.k.": "United Kingdom", "u.k": "United Kingdom", "united kingdom": "United Kingdom",
  england: "United Kingdom", scotland: "United Kingdom", wales: "United Kingdom", "great britain": "United Kingdom", britain: "United Kingdom",
  london: "United Kingdom",
  usa: "United States", us: "United States", "u.s.": "United States", "u.s.a.": "United States", america: "United States", "united states": "United States",
  uae: "United Arab Emirates", "u.a.e.": "United Arab Emirates", dubai: "United Arab Emirates", "abu dhabi": "United Arab Emirates",
  ksa: "Saudi Arabia", "saudi": "Saudi Arabia",
};

// "London, UK" / "uk" / "England" all count as United Kingdom.
export function normaliseCountry(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const parts = s.split(/[,/]/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  for (const p of [...parts].reverse()) if (COUNTRY_ALIASES[p]) return COUNTRY_ALIASES[p];
  return titleCase(parts[parts.length - 1] || s);
}

// Count values, merge case/spacing variants, sort, fold the tail into Other.
function tally(values, { top = 8, keepOrder = null } = {}) {
  const counts = new Map();
  const display = new Map();
  values.forEach((v) => {
    if (v === null || v === undefined || String(v).trim() === "") return;
    const label = String(v).trim().replace(/\s+/g, " ");
    const key = label.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!display.has(key)) display.set(key, label);
  });
  let list = [...counts.entries()].map(([k, n]) => ({ label: display.get(k), value: n }));
  if (keepOrder) {
    const idx = (l) => {
      const i = keepOrder.findIndex((o) => o.toLowerCase() === l.toLowerCase());
      return i === -1 ? 999 : i;
    };
    return list.sort((a, b) => idx(a.label) - idx(b.label));
  }
  list.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (list.length > top) {
    const rest = list.slice(top - 1).reduce((t, x) => t + x.value, 0);
    list = [...list.slice(0, top - 1), { label: "Other", value: rest, isOther: true }];
  }
  return list;
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

const YEAR_ORDER = (label) => {
  const l = label.toLowerCase();
  if (/fs1|nursery|pre-?k/.test(l)) return -2;
  if (/fs2|reception|kg/.test(l)) return -1;
  const m = l.match(/year\s*(\d+)/) || l.match(/grade\s*(\d+)/);
  return m ? Number(m[1]) : 99;
};

// ---------------------------------------------------------------- compute
export function computeInsights(raw, { range = "all", hideTest = true } = {}) {
  const now = Date.now();
  const since = range === "90d" ? now - 90 * DAY : range === "12m" ? now - 365 * DAY : 0;
  const parentsByFamily = groupBy(raw.parents, "family_id");

  const families = raw.families
    .map((f) => ({ ...f, name: familyDisplayName(f, parentsByFamily[f.id] || []) }))
    .filter((f) => !hideTest || !/\btest/i.test(f.name))
    .filter((f) => !since || new Date(f.created_at).getTime() >= since);
  const famIds = new Set(families.map((f) => f.id));

  const children = raw.children.filter((c) => famIds.has(c.family_id));
  const childIds = new Set(children.map((c) => c.id));
  const childFamily = Object.fromEntries(children.map((c) => [c.id, c.family_id]));
  const currentSchools = raw.currentSchools.filter((s) => childIds.has(s.child_id));
  const apps = raw.applications.filter((a) => childIds.has(a.child_id));
  const shortlist = raw.shortlist.filter((s) => famIds.has(s.family_id));
  const placements = raw.placements.filter((p) => famIds.has(p.family_id));
  const payments = raw.payments.filter((p) => famIds.has(p.family_id));
  const schoolName = Object.fromEntries(raw.schools.map((s) => [s.id, s.name]));

  // -- Placed: any of the signals the app records.
  const placedIds = new Set([
    ...families.filter((f) => f.pipeline_stage === "placed" || f.client_stage === "placed").map((f) => f.id),
    ...placements.map((p) => p.family_id),
    ...apps.filter((a) => a.status === "offer_accepted").map((a) => childFamily[a.child_id]),
  ]);

  // -- Family size.
  const kidsPerFamily = families.map((f) => children.filter((c) => c.family_id === f.id).length);
  const familySize = [1, 2, 3, 4].map((n) => ({
    label: n === 4 ? "4+" : String(n),
    value: kidsPerFamily.filter((k) => (n === 4 ? k >= 4 : k === n)).length,
  }));
  const withKids = kidsPerFamily.filter((k) => k > 0);
  const avgKids = withKids.length ? withKids.reduce((a, b) => a + b, 0) / withKids.length : 0;

  // -- Outcomes.
  const offers = apps.filter((a) => a.status === "offer" || a.status === "offer_accepted").length;
  const declined = apps.filter((a) => a.status === "rejected").length;
  const offerRate = pct(offers, offers + declined);

  // -- New families per month (last 12 calendar months, unaffected by the range filter's cut-off).
  const allFamiliesForTrend = raw.families
    .map((f) => ({ ...f, name: familyDisplayName(f, parentsByFamily[f.id] || []) }))
    .filter((f) => !hideTest || !/\btest/i.test(f.name));
  const months = [];
  const d0 = new Date();
  d0.setDate(1);
  d0.setHours(0, 0, 0, 0);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-GB", { month: "short" }), year: d.getFullYear(), value: 0 });
  }
  allFamiliesForTrend.forEach((f) => {
    const d = new Date(f.created_at);
    const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (m) m.value += 1;
  });
  const movingAvg = months.map((_, i) => {
    const w = months.slice(Math.max(0, i - 2), i + 1);
    return w.reduce((t, x) => t + x.value, 0) / w.length;
  });

  // -- Funnel: how many families have reached each pipeline stage.
  const stageIdx = (k) => PIPELINE_STAGES.findIndex((s) => s.key === k);
  const funnel = PIPELINE_STAGES.map((s, i) => ({
    label: s.label,
    value: families.filter((f) => (placedIds.has(f.id) ? PIPELINE_STAGES.length - 1 : Math.max(0, stageIdx(f.pipeline_stage))) >= i).length,
  }));

  // -- Where from / how found / what they're leaving.
  const referral = tally(families.map((f) => f.referral_source), { top: 9 });
  const referralMissing = families.filter((f) => !f.referral_source).length;
  const origins = tally(families.map((f) => normaliseCountry(f.origin)), { top: 8 });
  const originMissing = families.filter((f) => !normaliseCountry(f.origin)).length;
  const fromSchools = tally(currentSchools.map((s) => s.school_name), { top: 8 });
  const curriculum = tally(currentSchools.map((s) => s.curriculum), { top: 6 });
  const reasons = tally(currentSchools.map((s) => s.reason_for_leaving), { top: 6 });
  const yearGroups = tally(children.map((c) => c.year_group_applying_for), { top: 99 }).sort(
    (a, b) => YEAR_ORDER(a.label) - YEAR_ORDER(b.label)
  );
  const feeRange = tally(families.map((f) => f.comfortable_fee_range), {
    keepOrder: [
      "Up to AED 30,000", "AED 30,000 to 50,000", "AED 50,000 to 70,000", "AED 70,000 to 90,000",
      "AED 90,000 to 120,000", "Above AED 120,000", "Whatever the right school costs", "I would like guidance on what is realistic",
    ],
  });
  const clientStages = CLIENT_STAGES.map((s) => ({ label: s.label, value: families.filter((f) => f.client_stage === s.key).length }));

  // -- Arrival seasonality: which month families land in Dubai.
  const arrivals = Array.from({ length: 12 }, (_, m) => ({
    label: new Date(2026, m, 1).toLocaleDateString("en-GB", { month: "short" }),
    value: families.filter((f) => f.dubai_available_from && new Date(f.dubai_available_from).getMonth() === m).length,
  }));

  // -- School scorecard: demand vs success, per destination school.
  const bySchool = {};
  const s0 = (id) => (bySchool[id] = bySchool[id] || { id, name: schoolName[id] || "School", shortlisted: 0, toured: 0, keen: 0, applied: 0, offers: 0, declined: 0, pending: 0, withdrawn: 0 });
  shortlist.forEach((r) => {
    const s = s0(r.school_id);
    s.shortlisted += 1;
    if (r.tour_status === "completed" || r.tour2_status === "completed") s.toured += 1;
    if (r.family_interest === "keen") s.keen += 1;
  });
  apps.forEach((a) => {
    const s = s0(a.school_id);
    if (a.status === "withdrawn") return void (s.withdrawn += 1);
    s.applied += 1;
    if (a.status === "offer" || a.status === "offer_accepted") s.offers += 1;
    else if (a.status === "rejected") s.declined += 1;
    else s.pending += 1;
  });
  const scorecard = Object.values(bySchool)
    .map((s) => ({ ...s, offerRate: s.offers + s.declined ? pct(s.offers, s.offers + s.declined) : null }))
    .sort((a, b) => b.applied - a.applied || b.shortlisted - a.shortlisted);
  const outcomesBySchool = scorecard.filter((s) => s.applied > 0).slice(0, 8);

  // -- Tour -> application conversion across the whole shortlist.
  const toured = shortlist.filter((r) => r.tour_status === "completed" || r.tour2_status === "completed");
  const touredThenApplied = toured.filter((r) =>
    apps.some((a) => a.school_id === r.school_id && childFamily[a.child_id] === r.family_id && a.status !== "withdrawn")
  ).length;

  // -- Caseload per consultant.
  const staffName = Object.fromEntries(raw.staff.map((s) => [s.user_id, s.full_name || s.email]));
  const caseload = tally(families.map((f) => (f.owner_staff_id ? staffName[f.owner_staff_id] || "Former staff" : "Unassigned")), { top: 10 });

  // -- Median days spent in each client stage (from the stage history log).
  const durations = {};
  Object.values(groupBy(raw.history.filter((h) => famIds.has(h.family_id)), "family_id")).forEach((rows) => {
    rows.sort((a, b) => new Date(a.moved_at) - new Date(b.moved_at));
    rows.forEach((h, i) => {
      const next = rows[i + 1];
      if (!next) return;
      (durations[h.to_stage] = durations[h.to_stage] || []).push((new Date(next.moved_at) - new Date(h.moved_at)) / DAY);
    });
  });
  const stageDays = CLIENT_STAGES.filter((s) => s.key !== "placed")
    .map((s) => ({ label: s.label, value: durations[s.key] ? Math.round(median(durations[s.key])) : null, n: durations[s.key]?.length || 0 }))
    .filter((s) => s.value !== null);

  // -- Days from joining to placement.
  const daysToPlace = placements
    .map((p) => {
      const f = families.find((x) => x.id === p.family_id);
      return f ? (new Date(p.created_at) - new Date(f.created_at)) / DAY : null;
    })
    .filter((x) => x !== null && x >= 0);

  // -- Money (AED only; other currencies noted separately).
  const aed = payments.filter((p) => (p.currency || "AED") === "AED");
  const sum = (rows) => rows.reduce((t, p) => t + (Number(p.amount) || 0), 0);
  const collected = sum(aed.filter((p) => p.status === "paid"));
  const outstanding = sum(aed.filter((p) => p.status === "unpaid" || p.status === "submitted"));

  const kpis = {
    families: families.length,
    children: children.length,
    placed: placedIds.size,
    placedRate: pct(placedIds.size, families.length),
    avgKids,
    offerRate,
    offers,
    decided: offers + declined,
    applications: apps.filter((a) => a.status !== "withdrawn").length,
    tourConversion: pct(touredThenApplied, toured.length),
    toured: toured.length,
    medianDaysToPlace: daysToPlace.length ? Math.round(median(daysToPlace)) : null,
    collected,
    outstanding,
  };

  // -- Plain-English findings, generated from the numbers above.
  const findings = [];
  const share = (list, n) => pct(list[0]?.value || 0, n);
  if (referral[0] && !referral[0].isOther)
    findings.push(`${share(referral, families.length - referralMissing)}% of families who told us found us through “${referral[0].label}”.`);
  if (origins[0] && !origins[0].isOther) findings.push(`${origins[0].label} is the top place families are moving from (${origins[0].value} families).`);
  if (avgKids) findings.push(`Families bring ${avgKids.toFixed(1)} children on average — plan for ${Math.round(avgKids * families.length)} school places across the caseload.`);
  const best = scorecard.filter((s) => s.offers + s.declined >= 2).sort((a, b) => b.offerRate - a.offerRate)[0];
  if (best) findings.push(`${best.name} has the best offer rate so far (${best.offerRate}% of ${best.offers + best.declined} decisions).`);
  const peak = arrivals.reduce((a, b) => (b.value > a.value ? b : a), arrivals[0]);
  if (peak?.value) findings.push(`${peak.label} is the busiest arrival month — ${peak.value} families land in Dubai then.`);
  const drop = funnel.slice(1).map((s, i) => ({ from: funnel[i], to: s, rate: pct(s.value, funnel[i].value) })).filter((x) => x.from.value >= 3);
  const worst = drop.sort((a, b) => a.rate - b.rate)[0];
  if (worst && worst.rate < 75) findings.push(`Biggest drop-off: only ${worst.rate}% of families move from “${worst.from.label}” to “${worst.to.label}”.`);
  if (toured.length) findings.push(`${kpis.tourConversion}% of completed tours turn into an application.`);

  return {
    kpis, findings, familySize, months, movingAvg, funnel, referral, referralMissing, origins, originMissing,
    fromSchools, curriculum, reasons, yearGroups, feeRange, clientStages, arrivals, scorecard, outcomesBySchool,
    caseload, stageDays, withdrawn: apps.filter((a) => a.status === "withdrawn").length,
  };
}
