// Year groups worked out for the Caseload (meeting 30/10/2026): current year group from the
// date of birth, and the year group a child applies for from date of birth and arrival date.
// A child's year group is how old they are on the cut-off date (31 August unless Settings says
// otherwise) of the academic year they are in or joining, the same rule the family form uses.
// Nothing here is saved. If there is no date of birth the typed value is shown instead.
import { YEAR_GROUPS } from "../data/formOptions";

// cutoff = { month (1 to 12), day } from Settings.
const parts = (cutoff) => ({ m0: (cutoff?.month ?? 8) - 1, d: cutoff?.day ?? 31 });

// The year an academic year starts in, for a date. July and August arrivals are joining the
// next September, so they count towards the next academic year.
function academicStartYear(date, cutoff) {
  const { m0, d } = parts(cutoff);
  const y = date.getFullYear();
  const summerStart = new Date(y, m0, d);
  summerStart.setDate(summerStart.getDate() - 62);
  return date > summerStart ? y : y - 1;
}

function groupAt(dobIso, startYear, cutoff) {
  if (!dobIso) return "";
  const birth = new Date(dobIso);
  if (Number.isNaN(birth.getTime())) return "";
  const { m0, d } = parts(cutoff);
  const cut = new Date(startYear, m0, d);
  if (birth > cut) return "";
  let age = cut.getFullYear() - birth.getFullYear();
  const md = cut.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && cut.getDate() < birth.getDate())) age -= 1;
  const i = age - 3; // FS1 is age 3 at the cut-off, then Reception, Year 1 and so on
  return i >= 0 && i < YEAR_GROUPS.length ? YEAR_GROUPS[i] : "";
}

// arrivalIso: the family's arrival in Dubai (may be empty). Returns { current, applying }.
export function childYearGroups(child, arrivalIso, cutoff) {
  const now = new Date();
  const current = groupAt(child.date_of_birth, academicStartYear(now, cutoff), cutoff) || child.current_year_group || "";
  let applying = "";
  if (arrivalIso && child.date_of_birth) {
    const arrival = new Date(arrivalIso);
    const entry = arrival > now ? arrival : now; // already here: the year running now
    applying = groupAt(child.date_of_birth, academicStartYear(entry, cutoff), cutoff);
  }
  return { current, applying: applying || child.year_group_applying_for || "" };
}

// The one definition of "arrival" and of a child's year groups, used by the Caseload, the
// family Overview and the Dashboard so they always agree.
export const arrivalDateOf = (family) => family?.planned_move_date || family?.dubai_available_from || null;
export const yearGroupsFor = (child, family, cutoff) => childYearGroups(child, arrivalDateOf(family), cutoff);

// "Year 2 / Grade 1" -> "Year 2" for tight columns.
export const shortYear = (label) => (label ? String(label).split(" /")[0] : "");
