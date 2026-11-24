import { YEAR_GROUPS } from "../data/formOptions";
import { stageOf } from "./schoolStages";

// The school facts that Suggested schools relies on, and where each one came from.
// Agreed 19/11/2026: suggestions may only use independent, verified sources, namely the
// school's own website and KHDA inspection reports (addendum 166). A fact counts as verified
// when it has a source link AND it hasn't been changed since someone checked it.

export const SOURCE_LABEL = { school_website: "School website", khda: "KHDA" };

const lc = (v) => String(v ?? "").trim().toLowerCase();
const n = (v) => (v === null || v === undefined || v === "" ? "" : String(Number(v)));
const list = (a) => (Array.isArray(a) ? a.map(lc).filter(Boolean).sort().join(",") : "");
export const isLink = (v) => /^https?:\/\/\S+\.\S+/i.test(String(v || "").trim());

// key, label, what's recorded (shown on the tab), whether anything is recorded, the
// snapshot that's compared with what was checked, and the page to suggest as the source.
export const FACTS = [
  {
    key: "fees",
    label: "Fees",
    has: (s) => s.tuition_from != null && s.tuition_from !== "",
    show: (s) =>
      `${s.fee_currency || "AED"} ${Number(s.tuition_from).toLocaleString("en-GB")}${
        s.tuition_to != null && Number(s.tuition_to) !== Number(s.tuition_from) ? ` to ${Number(s.tuition_to).toLocaleString("en-GB")}` : ""
      }`,
    snap: (s) => `${n(s.tuition_from)}-${n(s.tuition_to)}`,
    page: (s) => s.fees_url || s.website_url,
  },
  {
    key: "location",
    label: "Area and emirate",
    has: (s) => !!s.area,
    show: (s) => [s.area, s.emirate].filter(Boolean).join(", "),
    snap: (s) => `${lc(s.area)}|${lc(s.emirate)}`,
    page: (s) => s.website_url,
  },
  {
    key: "curriculum",
    label: "Curriculum",
    has: (s) => !!s.curriculum,
    show: (s) => s.curriculum,
    snap: (s) => lc(s.curriculum),
    page: (s) => s.website_url,
  },
  {
    key: "year_groups",
    label: "Year groups",
    has: (s) => !!(s.lowest_year_group && s.highest_year_group),
    show: (s) => `${s.lowest_year_group} to ${s.highest_year_group}`,
    snap: (s) => `${s.lowest_year_group || ""}|${s.highest_year_group || ""}`,
    page: (s) => s.website_url,
  },
  {
    key: "inclusion",
    label: "Inclusion support",
    has: (s) => !!s.inclusion_level,
    show: (s) =>
      [INCLUSION_LABEL[s.inclusion_level] || s.inclusion_level, (s.inclusion_needs_supported || []).join(", ")].filter(Boolean).join(": "),
    snap: (s) => `${lc(s.inclusion_level)}|${list(s.inclusion_needs_supported)}`,
    page: (s) => s.website_url,
  },
  {
    key: "subjects",
    label: "Subjects and exam boards",
    has: (s) => [s.exam_boards, s.gcse_subjects, s.a_level_subjects].some((a) => Array.isArray(a) && a.length > 0),
    show: (s) => (s.exam_boards || []).join(", ") || "Subjects recorded",
    snap: (s) => `${list(s.exam_boards)}|${list(s.gcse_subjects)}|${list(s.a_level_subjects)}`,
    page: (s) => s.website_url,
  },
];
export const FACT_BY_KEY = Object.fromEntries(FACTS.map((f) => [f.key, f]));

export const INCLUSION_LABEL = { none: "No formal support", limited: "Limited", moderate: "Moderate", extensive: "Extensive" };

// sources: rows from school_fact_sources for ONE school -> { fact: row }
export const sourcesBySchool = (rows) => {
  const m = new Map();
  for (const r of rows || []) {
    if (!m.has(r.school_id)) m.set(r.school_id, {});
    m.get(r.school_id)[r.fact] = r;
  }
  return m;
};

// "empty" (nothing recorded) | "none" (recorded, no source) | "changed" (edited since checked) | "verified"
export function factState(school, src, key) {
  const f = FACT_BY_KEY[key];
  if (!f.has(school)) return "empty";
  const row = src?.[key];
  if (!row) return "none";
  return row.checked_value === f.snap(school) ? "verified" : "changed";
}

// ---- KHDA (Dubai inspections, addendum 165) ----
export const KHDA_RATINGS = [
  ["outstanding", "Outstanding"],
  ["very_good", "Very good"],
  ["good", "Good"],
  ["acceptable", "Acceptable"],
  ["weak", "Weak"],
  ["very_weak", "Very weak"],
];
export const KHDA_LABEL = Object.fromEntries(KHDA_RATINGS);
export const isDubai = (s) => s?.emirate === "Dubai";
// A rating only counts when there's a link to the published report.
export const khdaVerified = (s) => !!s?.khda_rating && isLink(s?.khda_report_url);
export const khdaText = (s) =>
  s?.khda_rating ? `KHDA ${KHDA_LABEL[s.khda_rating] || s.khda_rating}${s.khda_inspection_year ? `, ${s.khda_inspection_year}` : ""}` : "";

// ---- Still to fill in ----
// Everything missing from a school record, each pointing at the exact field.
//   tab  : "record" | "facts"
//   edit : open the School record edit form first
//   id   : the element to scroll to and highlight
export function schoolGaps(school, src) {
  const s = school || {};
  const forSuggestions = [];
  const other = [];
  const add = (to, label, tab, id, edit = false) => to.push({ label, tab, id, edit });

  if (!s.emirate) add(forSuggestions, "Emirate", "record", "sch-emirate");
  if (!s.area) add(forSuggestions, "Area", "record", "sch-area", true);
  if (!s.curriculum) add(forSuggestions, "Curriculum", "record", "sch-curriculum", true);
  if (s.tuition_from == null || s.tuition_from === "") add(forSuggestions, "Fees per year", "record", "sch-tuition-from", true);
  if (!s.lowest_year_group || !s.highest_year_group) add(forSuggestions, "Year groups", "facts", "sf-years");
  if (!s.inclusion_level) add(forSuggestions, "Inclusion support", "facts", "sf-inclusion");
  if (isDubai(s) && !s.khda_rating) add(forSuggestions, "KHDA rating", "facts", "sf-khda");
  else if (isDubai(s) && !isLink(s.khda_report_url)) add(forSuggestions, "KHDA report link", "facts", "sf-khda-link");
  const unsourced = FACTS.filter((f) => ["none", "changed"].includes(factState(s, src, f.key)));
  if (unsourced.length) add(forSuggestions, `Sources (${unsourced.length})`, "facts", `sf-src-${unsourced[0].key}`);

  if (!s.general_phone) add(other, "School phone", "record", "sch-phone", true);
  if (!s.website_url) add(other, "Website", "record", "sch-website", true);
  if (!s.fees_url) add(other, "Fees page link", "record", "sch-fees-url", true);
  if (!s.tour_booking_url) add(other, "Tour booking link", "record", "sch-tour-booking", true);
  if (!s.application_url && !s.openapply_login_url) add(other, "Application link", "record", "sch-application-url", true);
  if (!s.address) add(other, "Address", "record", "sch-address", true);
  if (s.application_fee == null || s.application_fee === "") add(other, "Application fee", "record", "sch-fee", true);
  if (s.deposit_amount == null || s.deposit_amount === "") add(other, "Deposit", "record", "sch-deposit", true);
  if (s.transport_per_year == null || s.transport_per_year === "") add(other, "Transport per year", "record", "sch-transport", true);
  if (!s.typical_tour_schedule) add(other, "Usual tour schedule", "record", "sch-tour-schedule", true);
  if (!s.documents_required) add(other, "Documents required", "record", "sch-documents", true);
  // Exam boards only matter for schools that teach older year groups.
  const takesSecondary = !s.highest_year_group || YEAR_GROUPS.indexOf(s.highest_year_group) >= YEAR_GROUPS.indexOf("Year 10 / Grade 9");
  if (stageOf(s) !== "Primary" && takesSecondary && !(s.exam_boards || []).length) add(other, "Exam boards", "facts", "sf-boards");

  return { forSuggestions, other };
}
