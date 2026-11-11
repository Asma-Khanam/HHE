import { supabase } from "./supabaseClient";
import { AREA_LIST } from "../data/dubaiAreas";

// Estimates for the shortlist: peak-hour travel time between where the family
// is thinking of living and a school, and what the first year really costs.
// Both are estimates and are labelled that way wherever they are shown.

const ROAD_FACTOR = 1.4; // roads are longer than the straight line
const PEAK_KMH = 38; // school-run traffic

// Longest alias first so "Jumeirah Village Circle" beats "Jumeirah".
const SEARCH = AREA_LIST.flatMap((a) => a.keys.map((k) => ({ k, area: a }))).sort((x, y) => y.k.length - x.k.length);

export function findArea(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return null;
  const hit = SEARCH.find(({ k }) => (k.length <= 4 ? new RegExp(`\\b${k}\\b`).test(t) : t.includes(k)));
  return hit ? hit.area : null;
}

export function schoolPoint(school) {
  if (school?.latitude != null && school?.longitude != null) {
    return { lat: Number(school.latitude), lng: Number(school.longitude), exact: true };
  }
  const a = findArea(`${school?.area || ""} ${school?.address || ""}`);
  return a ? { lat: a.lat, lng: a.lng, exact: false } : null;
}

function km(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// -> { minutes, km, from } or null when either end isn't known.
export function commuteEstimate(livingText, school) {
  const home = findArea(livingText);
  const to = schoolPoint(school);
  if (!home || !to) return null;
  const road = km(home, to) * ROAD_FACTOR;
  const minutes = Math.max(5, Math.round(((road / PEAK_KMH) * 60 + 3) / 5) * 5);
  return { minutes, km: Math.round(road), from: home.name };
}

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const aed = (n) => Math.round(n).toLocaleString("en-GB");

// First-year cost from what the record knows. `missing` lists what to add.
export function firstYearCost(school) {
  const from = num(school?.tuition_from);
  const to = num(school?.tuition_to) ?? from;
  const parts = [
    ["Tuition", from, to],
    ["Application fee", num(school?.application_fee), num(school?.application_fee)],
    ["Deposit", num(school?.deposit_amount), num(school?.deposit_amount)],
    ["Transport", num(school?.transport_per_year), num(school?.transport_per_year)],
  ];
  const known = parts.filter((p) => p[1] !== null);
  const missing = parts.filter((p) => p[1] === null).map((p) => p[0].toLowerCase());
  if (!known.length) return null;
  const lo = known.reduce((s, p) => s + p[1], 0);
  const hi = known.reduce((s, p) => s + p[2], 0);
  const cur = school?.fee_currency || "AED";
  return {
    label: lo === hi ? `${cur} ${aed(lo)}` : `${cur} ${aed(lo)}–${aed(hi)}`,
    parts: known.map((p) => `${p[0]} ${p[1] === p[2] ? aed(p[1]) : `${aed(p[1])}–${aed(p[2])}`}`),
    missing,
  };
}

export async function getFamilyLivingArea(familyId) {
  const { data } = await supabase.from("families").select("preferred_living_area").eq("id", familyId).maybeSingle();
  return data?.preferred_living_area || "";
}
