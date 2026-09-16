// Closed option lists matching the family's own application form (see
// frontend/src/data/formOptions.js and the local RELIGIONS/ENGLISH_
// PROFICIENCY_LEVELS lists in frontend/src/components/ApplicationForm.jsx).
// Duplicated here rather than imported across apps, same as this app's own
// data/documentTypes.js copy -- keep these in sync by hand if the family's
// list ever changes.
//
// September 2026 change request: staff editing a parent/child record here
// were typing nationality/language/religion/gender freely, while the
// family's own form locks them to one of these lists -- easy to end up with
// "UK" on one record and "British" on another. RecordFieldsEditor now uses
// these same lists for those fields.

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

export const LANGUAGES = [
  "Amharic", "Arabic", "Bengali", "Cantonese", "Dutch", "English", "Farsi / Persian",
  "French", "German", "Hausa", "Hindi", "Igbo", "Indonesian / Malay", "Italian",
  "Japanese", "Korean", "Malayalam", "Mandarin Chinese", "Nepali", "Pashto",
  "Polish", "Portuguese", "Punjabi", "Romanian", "Russian", "Sinhala", "Somali",
  "Spanish", "Swahili", "Tagalog / Filipino", "Tamil", "Thai", "Turkish",
  "Ukrainian", "Urdu", "Vietnamese", "Yoruba",
];

export const RELIGIONS = [
  "Christianity",
  "Islam",
  "Hinduism",
  "Buddhism",
  "Sikhism",
  "Judaism",
  "No religion",
  "Prefer not to say",
];

export const ENGLISH_PROFICIENCY_LEVELS = [
  "Native / fluent",
  "Advanced",
  "Intermediate",
  "Beginner",
  "None yet",
];

// Strict on the family's own form (StrictSelect, no "Other" option) -- kept
// strict here too rather than adding a free-text escape hatch that the
// family's side doesn't have.
export const GENDERS = ["Male", "Female"];
