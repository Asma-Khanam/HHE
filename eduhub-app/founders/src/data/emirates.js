// The seven emirates plus "Outside UAE" (UK boarding schools and the like).
// A school's emirate is set by hand on its record or in the Add school form;
// the Schools tabs and the UAE map read it from there.
export const EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];
export const OUTSIDE_UAE = "Outside UAE";
export const EMIRATE_CHOICES = [...EMIRATES, OUTSIDE_UAE];
