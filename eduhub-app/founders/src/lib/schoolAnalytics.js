import { supabase } from "./supabaseClient";
import { familyDisplayName } from "./staffData";

// Schools analytics (founders, 25 Sept 2026): live numbers on how each
// school performs for our families. One load of every table the page
// needs, then pure functions. Every query fails soft to [] so a missing
// table (an addendum not run yet) never blanks the page.

const DAY = 86400000;

async function all(table, columns = "*") {
  const { data, error } = await supabase.from(table).select(columns);
  return error ? [] : data || [];
}

export async function loadSchoolAnalytics() {
  const [families, parents, children, applications, schools, shortlist, placements, events] = await Promise.all([
    all("families"),
    all("parents", "id, family_id, relationship, full_name"),
    all("children", "id, family_id, full_name, first_name, preferred_name, year_group_applying_for"),
    all("applications"),
    all("schools", "id, name, area, curriculum"),
    all("school_shortlist"),
    all("family_placements"),
    all("application_events", "application_id, event_type, new_status, occurred_at"),
  ]);
  return { families, parents, children, applications, schools, shortlist, placements, events };
}

const median = (nums) => {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const groupBy = (rows, key) =>
  rows.reduce((m, r) => {
    (m[r[key]] = m[r[key]] || []).push(r);
    return m;
  }, {});
const OFFER = ["offer", "offer_accepted"];
const WAITING = ["submitted", "assessment_booked", "under_review", "waitlisted"];

function tally(values, top = 8) {
  const counts = new Map();
  values.forEach((v) => {
    const label = String(v || "").trim();
    if (!label) return;
    const key = label.toLowerCase();
    const cur = counts.get(key) || { label, value: 0 };
    cur.value += 1;
    counts.set(key, cur);
  });
  let list = [...counts.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (list.length > top) {
    const rest = list.slice(top - 1).reduce((t, x) => t + x.value, 0);
    list = [...list.slice(0, top - 1), { label: "Other", value: rest, isOther: true }];
  }
  return list;
}

function childName(c) {
  return (c?.preferred_name || c?.first_name || (c?.full_name || "").split(" ")[0] || "Child").trim();
}

export function computeSchoolAnalytics(raw, { range = "all", hideTest = true } = {}) {
  const now = Date.now();
  const since = range === "90d" ? now - 90 * DAY : range === "12m" ? now - 365 * DAY : 0;
  const parentsByFamily = groupBy(raw.parents, "family_id");
  const families = raw.families
    .map((f) => ({ ...f, name: familyDisplayName(f, parentsByFamily[f.id] || []) }))
    .filter((f) => !hideTest || !/\btest/i.test(f.name))
    .filter((f) => !since || new Date(f.created_at).getTime() >= since);
  const famById = Object.fromEntries(families.map((f) => [f.id, f]));
  const children = raw.children.filter((c) => famById[c.family_id]);
  const childById = Object.fromEntries(children.map((c) => [c.id, c]));
  const apps = raw.applications.filter((a) => childById[a.child_id]);
  const shortlist = raw.shortlist.filter((r) => famById[r.family_id]);
  const placements = raw.placements.filter((p) => famById[p.family_id]);
  const schoolById = Object.fromEntries(raw.schools.map((s) => [s.id, s]));
  const schoolByName = Object.fromEntries(raw.schools.map((s) => [s.name.trim().toLowerCase(), s]));
  const eventsByApp = groupBy(raw.events, "application_id");

  // Where each child was placed: an accepted offer, else a saved start date.
  const placedSchoolByChild = {};
  apps.filter((a) => a.status === "offer_accepted").forEach((a) => (placedSchoolByChild[a.child_id] = a.school_id));
  placements.forEach((p) => {
    if (p.child_id && !placedSchoolByChild[p.child_id]) {
      const s = schoolByName[(p.school_name || "").trim().toLowerCase()];
      placedSchoolByChild[p.child_id] = s ? s.id : `name:${p.school_name}`;
    }
  });
  const placedChildIds = Object.keys(placedSchoolByChild);
  const closedApp = (a) =>
    placedSchoolByChild[a.child_id] && String(placedSchoolByChild[a.child_id]) !== String(a.school_id);

  // Days from submitted to the school's answer (offer or declined).
  const decisionDays = (a) => {
    if (!a.submitted_at) return null;
    const ev = (eventsByApp[a.id] || [])
      .filter((e) => e.event_type === "status_change" && ["offer", "offer_accepted", "rejected"].includes(e.new_status))
      .sort((x, y) => new Date(x.occurred_at) - new Date(y.occurred_at))[0];
    if (!ev) return null;
    const d = (new Date(ev.occurred_at) - new Date(a.submitted_at)) / DAY;
    return d >= 0 ? d : null;
  };

  // --- per-school scorecard (family-school pairs for the funnel)
  const by = {};
  const s0 = (id) =>
    (by[id] = by[id] || {
      id,
      name: schoolById[id]?.name || "School",
      area: schoolById[id]?.area || "",
      curriculum: schoolById[id]?.curriculum || "",
      shortlisted: 0,
      toured: 0,
      keen: 0,
      notForUs: 0,
      applied: 0,
      assessed: 0,
      offers: 0,
      declined: 0,
      pending: 0,
      closed: 0,
      placed: 0,
      decisionDays: [],
    });
  shortlist.forEach((r) => {
    const s = s0(r.school_id);
    s.shortlisted += 1;
    if (r.tour_status === "completed" || r.tour2_status === "completed") s.toured += 1;
    if (r.family_interest === "keen") s.keen += 1;
    if (r.family_interest === "not_for_us" || r.family_decision === "declined") s.notForUs += 1;
  });
  apps.forEach((a) => {
    if (a.status === "draft" || a.status === "withdrawn") return;
    const s = s0(a.school_id);
    s.applied += 1;
    if (["assessment_booked", "under_review", "waitlisted", ...OFFER, "rejected"].includes(a.status) || a.assessment_date)
      s.assessed += 1;
    if (a.status === "offer_accepted") s.placed += 1;
    if (OFFER.includes(a.status)) s.offers += 1;
    else if (a.status === "rejected") s.declined += 1;
    else if (closedApp(a)) s.closed += 1;
    else s.pending += 1;
    const d = decisionDays(a);
    if (d !== null) s.decisionDays.push(d);
  });
  const scorecard = Object.values(by)
    .map((s) => ({
      ...s,
      offerRate: s.offers + s.declined ? pct(s.offers, s.offers + s.declined) : null,
      medianDecision: s.decisionDays.length ? Math.round(median(s.decisionDays)) : null,
      tourToApply: s.toured ? pct(Math.min(s.applied, s.toured), s.toured) : null,
    }))
    .sort((a, b) => b.placed - a.placed || b.applied - a.applied || b.shortlisted - a.shortlisted);

  // --- funnel over family + school pairs, so every step counts the same thing
  const pairKey = (familyId, schoolId) => `${familyId}|${schoolId}`;
  const pairs = new Map();
  const pair = (familyId, schoolId) => {
    const k = pairKey(familyId, schoolId);
    if (!pairs.has(k)) pairs.set(k, { shortlisted: false, toured: false, applied: false, offer: false, placed: false });
    return pairs.get(k);
  };
  shortlist.forEach((r) => {
    const p = pair(r.family_id, r.school_id);
    p.shortlisted = true;
    if (r.tour_status === "completed" || r.tour2_status === "completed") p.toured = true;
  });
  apps.forEach((a) => {
    if (a.status === "draft" || a.status === "withdrawn") return;
    const p = pair(childById[a.child_id].family_id, a.school_id);
    p.shortlisted = true;
    p.applied = true;
    if (OFFER.includes(a.status)) p.offer = true;
    if (a.status === "offer_accepted") p.placed = true;
  });
  const pv = [...pairs.values()];
  const funnel = [
    { label: "Shortlisted", value: pv.filter((p) => p.shortlisted).length },
    { label: "Toured", value: pv.filter((p) => p.toured || p.applied).length },
    { label: "Applied", value: pv.filter((p) => p.applied).length },
    { label: "Offer", value: pv.filter((p) => p.offer).length },
    { label: "Placed", value: pv.filter((p) => p.placed).length },
  ];

  // --- charts
  const placedBySchool = tally(
    Object.values(placedSchoolByChild).map((id) =>
      String(id).startsWith("name:") ? String(id).slice(5) : schoolById[id]?.name || "School"
    ),
    10
  );
  const placedByArea = tally(
    Object.values(placedSchoolByChild).map((id) => schoolById[id]?.area || null),
    8
  );
  const placedByCurriculum = tally(
    Object.values(placedSchoolByChild).map((id) => schoolById[id]?.curriculum || null),
    6
  );
  const offerRates = scorecard
    .filter((s) => s.offers + s.declined >= 2)
    .map((s) => ({ label: s.name, value: s.offerRate }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const outcomes = scorecard.filter((s) => s.applied > 0).slice(0, 10);
  const declineReasons = tally(apps.filter((a) => a.status === "rejected").map((a) => a.rejected_reason || "No reason given"), 8);
  const speed = scorecard
    .filter((s) => s.medianDecision !== null)
    .map((s) => ({ label: s.name, value: s.medianDecision }))
    .sort((a, b) => a.value - b.value)
    .slice(0, 10);
  const popular = scorecard
    .filter((s) => s.shortlisted > 0)
    .map((s) => ({ label: s.name, value: s.shortlisted }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Tours by month: the last 6 months and the next 3.
  const months = [];
  const d0 = new Date();
  d0.setDate(1);
  for (let i = -6; i <= 3; i++) {
    const d = new Date(d0.getFullYear(), d0.getMonth() + i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("en-GB", { month: "short" }),
      fullLabel: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      value: 0,
    });
  }
  shortlist.forEach((r) =>
    [
      [r.tour_date, r.tour_status],
      [r.tour2_date, r.tour2_status],
    ].forEach(([date, status]) => {
      if (!date || status === "cancelled") return;
      const d = new Date(date + "T00:00:00");
      const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (m) m.value += 1;
    })
  );

  // --- chase list: applications waiting on a school, longest first
  const chase = apps
    .filter((a) => WAITING.includes(a.status) && !closedApp(a))
    .map((a) => {
      const c = childById[a.child_id];
      const since = a.submitted_at || a.updated_at || a.created_at;
      return {
        id: a.id,
        familyId: c.family_id,
        family: famById[c.family_id]?.name || "Family",
        child: childName(c),
        school: schoolById[a.school_id]?.name || "School",
        schoolId: a.school_id,
        status: a.status,
        days: since ? Math.max(0, Math.floor((now - new Date(since).getTime()) / DAY)) : null,
        assessment: a.assessment_date || null,
      };
    })
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1));

  // --- upcoming: tours and assessments in the next 14 days
  const todayKey = new Date().toISOString().slice(0, 10);
  const in14 = new Date(now + 14 * DAY).toISOString().slice(0, 10);
  const upcomingTours = shortlist.reduce(
    (n, r) =>
      n +
      [r.tour_date, r.tour2_date].filter(
        (d, i) => d && d >= todayKey && d <= in14 && [r.tour_status, r.tour2_status][i] !== "cancelled"
      ).length,
    0
  );
  const upcomingAssessments = apps.filter(
    (a) => a.assessment_date && a.assessment_date >= todayKey && a.assessment_date <= in14 && !closedApp(a)
  ).length;

  const offers = apps.filter((a) => OFFER.includes(a.status)).length;
  const declined = apps.filter((a) => a.status === "rejected").length;
  const applied = apps.filter((a) => a.status !== "draft" && a.status !== "withdrawn").length;
  const allDecision = scorecard.flatMap((s) => s.decisionDays);

  const kpis = {
    placed: placedChildIds.length,
    children: children.length,
    applied,
    offers,
    offerRate: offers + declined ? pct(offers, offers + declined) : null,
    decided: offers + declined,
    tourConversion: funnel[1].value ? pct(funnel[2].value, funnel[1].value) : null,
    medianDecision: allDecision.length ? Math.round(median(allDecision)) : null,
    waiting: chase.length,
    upcomingTours,
    upcomingAssessments,
    schoolsUsed: scorecard.filter((s) => s.shortlisted || s.applied).length,
  };

  const findings = [];
  const topPlaced = placedBySchool[0];
  if (topPlaced && !topPlaced.isOther && topPlaced.value > (placedBySchool[1]?.value || 0))
    findings.push(`${topPlaced.label} is where we've placed the most children (${topPlaced.value}).`);
  const bestRate = scorecard.filter((s) => s.offers + s.declined >= 2).sort((a, b) => b.offerRate - a.offerRate)[0];
  if (bestRate) findings.push(`${bestRate.name} says yes most often: ${bestRate.offerRate}% of ${bestRate.offers + bestRate.declined} decisions.`);
  const slowest = [...speed].sort((a, b) => b.value - a.value)[0];
  if (slowest && speed.length > 1) findings.push(`${slowest.label} is the slowest to answer, a median of ${slowest.value} days after applying.`);
  const cold = scorecard.filter((s) => s.shortlisted >= 3 && s.applied === 0)[0];
  if (cold) findings.push(`${cold.name} is shortlisted by ${cold.shortlisted} families but nobody has applied yet.`);
  const disliked = scorecard.filter((s) => s.shortlisted >= 3).sort((a, b) => b.notForUs / b.shortlisted - a.notForUs / a.shortlisted)[0];
  if (disliked && disliked.notForUs / disliked.shortlisted >= 0.5)
    findings.push(`${pct(disliked.notForUs, disliked.shortlisted)}% of families who look at ${disliked.name} decide it's not for them.`);
  const stale = chase.filter((c) => c.days !== null && c.days >= 14).length;
  if (stale) findings.push(`${stale} application${stale === 1 ? " has" : "s have"} been waiting on the school for 2 weeks or more. See "Waiting on a school" below.`);

  return {
    kpis,
    findings,
    funnel,
    scorecard,
    placedBySchool,
    placedByArea,
    placedByCurriculum,
    offerRates,
    outcomes,
    declineReasons,
    speed,
    popular,
    months,
    chase,
  };
}
