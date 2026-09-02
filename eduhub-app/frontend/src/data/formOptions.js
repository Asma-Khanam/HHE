// Static option lists for the application form's dropdowns. Every dropdown
// built from these still lets someone type a custom value (the FormSelect
// component adds an "Other" option automatically) — so nobody is ever
// blocked by a name that isn't on the list, this just makes the common case
// a single click instead of free typing.

export const NATIONALITIES = [
  "Afghan", "Algerian", "American", "Argentine", "Australian", "Austrian",
  "Bahraini", "Bangladeshi", "Belgian", "Bosnian", "Brazilian", "British",
  "Bulgarian", "Cameroonian", "Canadian", "Chinese", "Colombian", "Croatian",
  "Cypriot", "Czech", "Danish", "Dutch", "Egyptian", "Emirati", "Eritrean",
  "Ethiopian", "Filipino", "Finnish", "French", "Georgian", "German",
  "Ghanaian", "Greek", "Hungarian", "Indian", "Indonesian", "Iranian",
  "Iraqi", "Irish", "Italian", "Ivorian", "Jamaican", "Japanese", "Jordanian",
  "Kazakh", "Kenyan", "Kuwaiti", "Lebanese", "Libyan", "Malaysian",
  "Maldivian", "Malian", "Mauritian", "Mexican", "Moroccan", "Nepalese",
  "New Zealander", "Nigerian", "Norwegian", "Omani", "Pakistani",
  "Palestinian", "Peruvian", "Polish", "Portuguese", "Qatari", "Romanian",
  "Russian", "Saudi Arabian", "Senegalese", "Serbian", "Singaporean",
  "Somali", "South African", "South Korean", "Spanish", "Sri Lankan",
  "Sudanese", "Swedish", "Swiss", "Syrian", "Taiwanese", "Tanzanian", "Thai",
  "Tunisian", "Turkish", "Ugandan", "Ukrainian", "Uzbek", "Vietnamese",
  "Yemeni", "Zimbabwean",
];

// Picking "Other" (added automatically by FormSelect) reveals a text box,
// and whatever's typed there is what gets saved — so this list never has to
// be exhaustive.
export const RELIGIONS = [
  "Islam",
  "Christianity",
  "Hinduism",
  "Buddhism",
  "Sikhism",
  "Judaism",
];

export const LANGUAGES = [
  "Amharic", "Arabic", "Bengali", "Cantonese", "Dutch", "English", "Farsi / Persian",
  "French", "German", "Hausa", "Hindi", "Igbo", "Indonesian / Malay", "Italian",
  "Japanese", "Korean", "Malayalam", "Mandarin Chinese", "Nepali", "Pashto",
  "Polish", "Portuguese", "Punjabi", "Romanian", "Russian", "Sinhala", "Somali",
  "Spanish", "Swahili", "Tagalog / Filipino", "Tamil", "Thai", "Turkish",
  "Ukrainian", "Urdu", "Vietnamese", "Yoruba",
];

// The handful of countries these families actually dial from, pinned to the
// top of the phone dropdown as their own group (founder feedback,
// 2026-09-02) — the UAE they're moving to, plus the UK, US and the other
// common origin countries — so nobody has to scroll a 90-item list to find
// the number they use every day.
//
// Each of these is deliberately LEFT OUT of COUNTRY_CALLING_CODES below, so
// no dial code appears twice in the same <select> (a duplicated value makes
// the browser highlight the wrong row when an existing number is loaded back
// in for editing).
export const COMMON_CALLING_CODES = [
  { name: "United Arab Emirates", dial: "+971" },
  { name: "United Kingdom", dial: "+44" },
  { name: "United States", dial: "+1" },
  { name: "India", dial: "+91" },
  { name: "Saudi Arabia", dial: "+966" },
  { name: "Australia", dial: "+61" },
  { name: "South Africa", dial: "+27" },
  { name: "Ireland", dial: "+353" },
];

// Every other country, alphabetical by name.
export const COUNTRY_CALLING_CODES = [
  { name: "Afghanistan", dial: "+93" },
  { name: "Algeria", dial: "+213" },
  { name: "Argentina", dial: "+54" },
  { name: "Austria", dial: "+43" },
  { name: "Bahrain", dial: "+973" },
  { name: "Bangladesh", dial: "+880" },
  { name: "Belgium", dial: "+32" },
  { name: "Bosnia and Herzegovina", dial: "+387" },
  { name: "Brazil", dial: "+55" },
  { name: "Bulgaria", dial: "+359" },
  { name: "Cameroon", dial: "+237" },
  { name: "Canada", dial: "+1" },
  { name: "China", dial: "+86" },
  { name: "Colombia", dial: "+57" },
  { name: "Croatia", dial: "+385" },
  { name: "Cyprus", dial: "+357" },
  { name: "Czech Republic", dial: "+420" },
  { name: "Denmark", dial: "+45" },
  { name: "Egypt", dial: "+20" },
  { name: "Eritrea", dial: "+291" },
  { name: "Ethiopia", dial: "+251" },
  { name: "Finland", dial: "+358" },
  { name: "France", dial: "+33" },
  { name: "Georgia", dial: "+995" },
  { name: "Germany", dial: "+49" },
  { name: "Ghana", dial: "+233" },
  { name: "Greece", dial: "+30" },
  { name: "Hungary", dial: "+36" },
  { name: "Indonesia", dial: "+62" },
  { name: "Iran", dial: "+98" },
  { name: "Iraq", dial: "+964" },
  { name: "Italy", dial: "+39" },
  { name: "Ivory Coast", dial: "+225" },
  { name: "Jamaica", dial: "+1876" },
  { name: "Japan", dial: "+81" },
  { name: "Jordan", dial: "+962" },
  { name: "Kazakhstan", dial: "+7" },
  { name: "Kenya", dial: "+254" },
  { name: "Kuwait", dial: "+965" },
  { name: "Lebanon", dial: "+961" },
  { name: "Libya", dial: "+218" },
  { name: "Malaysia", dial: "+60" },
  { name: "Maldives", dial: "+960" },
  { name: "Mali", dial: "+223" },
  { name: "Mauritius", dial: "+230" },
  { name: "Mexico", dial: "+52" },
  { name: "Morocco", dial: "+212" },
  { name: "Nepal", dial: "+977" },
  { name: "Netherlands", dial: "+31" },
  { name: "New Zealand", dial: "+64" },
  { name: "Nigeria", dial: "+234" },
  { name: "Norway", dial: "+47" },
  { name: "Oman", dial: "+968" },
  { name: "Pakistan", dial: "+92" },
  { name: "Palestine", dial: "+970" },
  { name: "Peru", dial: "+51" },
  { name: "Philippines", dial: "+63" },
  { name: "Poland", dial: "+48" },
  { name: "Portugal", dial: "+351" },
  { name: "Qatar", dial: "+974" },
  { name: "Romania", dial: "+40" },
  { name: "Russia", dial: "+7" },
  { name: "Senegal", dial: "+221" },
  { name: "Serbia", dial: "+381" },
  { name: "Singapore", dial: "+65" },
  { name: "Somalia", dial: "+252" },
  { name: "South Korea", dial: "+82" },
  { name: "Spain", dial: "+34" },
  { name: "Sri Lanka", dial: "+94" },
  { name: "Sudan", dial: "+249" },
  { name: "Sweden", dial: "+46" },
  { name: "Switzerland", dial: "+41" },
  { name: "Syria", dial: "+963" },
  { name: "Taiwan", dial: "+886" },
  { name: "Tanzania", dial: "+255" },
  { name: "Thailand", dial: "+66" },
  { name: "Tunisia", dial: "+216" },
  { name: "Turkey", dial: "+90" },
  { name: "Uganda", dial: "+256" },
  { name: "Ukraine", dial: "+380" },
  { name: "Uzbekistan", dial: "+998" },
  { name: "Vietnam", dial: "+84" },
  { name: "Yemen", dial: "+967" },
  { name: "Zimbabwe", dial: "+263" },
];

// A plain Yes/No, no free-text "Other" — used by YesNoSelect for questions
// that only ever have two real answers (transfer certificate, SEN, etc).
export const YES_NO_OPTIONS = ["Yes", "No"];

// Generated from today's date so this never goes stale — covers the
// upcoming enrollment window without hardcoding a year that ages out.
export const ACADEMIC_YEARS = (() => {
  const startYear = new Date().getFullYear();
  const years = [];
  for (let y = startYear; y <= startYear + 5; y++) years.push(`${y}/${y + 1}`);
  return years;
})();

// British Year vs. American Grade: Year 1 is its own thing (the American
// equivalent is Kindergarten, not Grade 1), and from Year 2 onwards the
// Grade always runs one behind the Year — Year 2 = Grade 1, Year 3 = Grade 2,
// and so on up to Year 13 = Grade 12. Corrected 2026-09-02 on founder
// feedback; the old list paired every Year with the same-numbered Grade.
export const YEAR_GROUPS = [
  "FS1", "FS2", "Year 1", "Year 2 / Grade 1", "Year 3 / Grade 2",
  "Year 4 / Grade 3", "Year 5 / Grade 4", "Year 6 / Grade 5", "Year 7 / Grade 6",
  "Year 8 / Grade 7", "Year 9 / Grade 8", "Year 10 / Grade 9", "Year 11 / Grade 10",
  "Year 12 / Grade 11", "Year 13 / Grade 12",
];

export const TERMS = [
  "Term 1 (September start)",
  "Term 2 (January start)",
  "Term 3 (April start)",
];

export const CURRICULA = [
  "British (National Curriculum)",
  "American",
  "IB (International Baccalaureate)",
  "Indian (CBSE)",
  "Indian (ICSE)",
  "French",
  "UAE National",
];

export const ENGLISH_PROFICIENCY_LEVELS = [
  "Native / fluent",
  "Advanced",
  "Intermediate",
  "Beginner",
  "None yet",
];

export const REASONS_FOR_LEAVING = [
  "Relocating to a new area or country",
  "Seeking a different curriculum",
  "Current school doesn't offer the year group needed",
  "Family's preference for a change",
  "Other",
];

// A phone number only ever stores its dial code, never which country it came
// from — and several countries share one. Canada and the United States are
// both +1; Russia and Kazakhstan are both +7. Listing those separately means
// a <select> can't tell them apart: pick "Canada", save, come back, and the
// dropdown reads "United States", because the browser matches the first
// option with that value. It looks like the app forgot what you chose.
//
// So the dropdown lists each dial code ONCE, with the sharing countries named
// together ("+1 United States / Canada"). Nothing is hidden, nothing can come
// back wrong, and the option genuinely reflects what's stored.
function mergeByDial(entries) {
  const order = [];
  const names = {};
  entries.forEach(({ name, dial }) => {
    if (!names[dial]) {
      names[dial] = [];
      order.push(dial);
    }
    names[dial].push(name);
  });
  return order.map((dial) => ({ dial, label: names[dial].join(" / ") }));
}

// The pinned group, and then everything else — with any country that shares a
// dial code with a pinned one folded into that pinned entry rather than
// repeated further down.
export const COMMON_CALLING_OPTIONS = mergeByDial([
  ...COMMON_CALLING_CODES,
  ...COUNTRY_CALLING_CODES.filter((c) => COMMON_CALLING_CODES.some((p) => p.dial === c.dial)),
]);

export const OTHER_CALLING_OPTIONS = mergeByDial(
  COUNTRY_CALLING_CODES.filter((c) => !COMMON_CALLING_CODES.some((p) => p.dial === c.dial))
);

// Both groups flattened — used wherever a dial code needs to be looked up or
// matched rather than rendered as a grouped dropdown.
export const ALL_CALLING_CODES = [...COMMON_CALLING_CODES, ...COUNTRY_CALLING_CODES];
