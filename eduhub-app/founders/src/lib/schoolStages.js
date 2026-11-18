import { YEAR_GROUPS } from "../data/formOptions";

// The usual shapes of school, as the youngest and oldest year group they take (addendum 164).
// Used by the school record and by the fill-in table on the Schools page.
export const STAGE_PRESETS = [
  ["Primary", YEAR_GROUPS[0], "Year 6 / Grade 5"],
  ["Secondary", "Year 7 / Grade 6", "Year 13 / Grade 12"],
  ["All-through", YEAR_GROUPS[0], "Year 13 / Grade 12"],
];

// "Primary" | "Secondary" | "All-through" | "custom" | "" (nothing recorded)
export function stageOf(school) {
  const lo = school?.lowest_year_group;
  const hi = school?.highest_year_group;
  if (!lo && !hi) return "";
  const hit = STAGE_PRESETS.find(([, from, to]) => from === lo && to === hi);
  return hit ? hit[0] : "custom";
}
