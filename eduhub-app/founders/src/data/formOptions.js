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

// ---------------------------------------------------------------------------
// Option lists copied verbatim from frontend/src/components/ApplicationForm.jsx
// and data/formOptions.js so staff edit these answers with the SAME dropdowns
// and tick boxes the family sees. Keep in sync by hand.
// ---------------------------------------------------------------------------
export const SEN_STATUS_OPTIONS = [
  "No, none at all",
  "No formal diagnosis, but we have concerns",
  "Yes, formally identified or diagnosed",
  "Yes, assessment is currently in progress",
  "We were told something when they were younger but it was never followed up",
];
export const SEN_DIAGNOSIS_OPTIONS = [
  "Dyslexia",
  "Dyscalculia",
  "Dysgraphia",
  "Dyspraxia or Developmental Coordination Disorder",
  "ADHD or ADD",
  "Autism Spectrum Condition",
  "Speech, language and communication needs",
  "Global developmental delay",
  "Sensory processing difficulties",
  "Hearing impairment",
  "Visual impairment",
  "Physical or medical need affecting access to learning",
  "Social, emotional and mental health needs",
  "Other, please tell us",
];
export const SEN_DOCUMENT_OPTIONS = [
  "Educational psychologist report",
  "Speech and language therapy report",
  "Occupational therapy report",
  "Paediatrician or developmental assessment",
  "Individual Education Plan or Individual Learning Plan",
  "Advanced Learning Plan, for gifted and talented",
  "UK EHCP or the equivalent from another country",
  "UAE People of Determination card",
  "Behaviour support plan",
  "School issued support or monitoring plan",
  "None of the above",
];
export const EDUCATION_GAPS_OPTIONS = ["No", "Yes", "Prefer to discuss"];
export const REPEATED_YEAR_OPTIONS = [
  "No",
  "Yes, they repeated a year",
  "Yes, it was suggested but we did not go ahead",
  "It is being discussed now",
];
export const SCHOOL_REFUSAL_OPTIONS = ["No", "Yes, refused a place", "Yes, asked to leave", "Prefer to discuss this with you"];
export const SEN_INTERVENTION_STATUS_OPTIONS = [
  "No, never",
  "Yes, currently",
  "Yes, in the past",
  "Yes, but only for a short trial period",
  "I am not sure",
];
export const SEN_INTERVENTION_TYPE_OPTIONS = [
  "Reading or phonics intervention",
  "Writing or handwriting support",
  "Maths intervention",
  "Speech and language therapy",
  "Occupational therapy",
  "Social skills or friendship group",
  "Emotional regulation or wellbeing sessions",
  "EAL, English as an Additional Language, support",
  "Counselling or school psychologist",
  "Behaviour support",
  "Extension or gifted and talented programme",
  "Other",
];
export const SEN_INTERVENTION_FREQUENCY_OPTIONS = [
  "Daily",
  "Two to three times a week",
  "Weekly",
  "Fortnightly or less",
  "It varies",
  "No longer receiving them",
];
export const SEN_LSA_OPTIONS = [
  "Yes, full time one to one",
  "Yes, part time or shared",
  "Yes, but only for specific lessons or activities",
  "No, but it has been recommended",
  "No, but we think one may be needed",
  "No, and none has ever been suggested",
  "We had one previously and it was withdrawn",
  "I am not sure what this means",
];
export const SEN_DESCRIPTIVE_WORD_OPTIONS = [
  "Emotional regulation difficulties",
  "Delayed or developmental delay",
  "Coordination difficulties or clumsy",
  "Behind, or not where they should be",
  "Immature for their age",
  "Easily distracted or difficult to focus",
  "Fidgety, restless or always on the go",
  "Sensitive or easily overwhelmed",
  "Sensory seeking or sensory avoidant",
  "Struggles to sit still",
  "Slow processing, or needs extra time",
  "Struggles with transitions or change",
  "Quiet, withdrawn or flies under the radar",
  "Rigid or inflexible thinking",
  "Difficulty making or keeping friends",
  "Speech unclear or hard to understand",
  "Late to talk or late to walk",
  "Anxious",
  "Bright but underachieving",
  "Gifted or very able",
  "None of these",
];
export const SEN_OUTSIDE_PROFESSIONAL_OPTIONS = [
  "Speech and language therapist",
  "Occupational therapist",
  "Educational psychologist",
  "Paediatrician or developmental paediatrician",
  "Behavioural therapist or ABA",
  "Counsellor or child psychologist",
  "Private tutor",
  "Physiotherapist",
  "None",
  "Other",
];
export const SEN_DISCLOSURE_OPTIONS = [
  "Yes, disclose everything upfront. I want a school that says yes with full knowledge",
  "Yes, but let us discuss what and how first",
  "I would prefer to disclose after an offer is made",
  "I would rather not disclose. I would like to talk this through with you",
];
export const SCHOOL_PRIORITY_OPTIONS = [
  "Academic results",
  "Pastoral care and wellbeing",
  "SEN and learning support provision",
  "Class sizes",
  "Quality and stability of teaching staff",
  "Sport and PE facilities",
  "Arts, music and drama",
  "STEM and technology",
  "Extracurricular breadth",
  "Campus and facilities",
  "Diversity of the student body",
  "Discipline and structure",
  "University and careers guidance",
  "KHDA or equivalent rating",
  "Reputation and prestige",
  "Proximity to home",
  "Value for money",
  "Community feel",
];
export const FEE_RANGE_OPTIONS = [
  "Up to AED 30,000",
  "AED 30,000 to 50,000",
  "AED 50,000 to 70,000",
  "AED 70,000 to 90,000",
  "AED 90,000 to 120,000",
  "Above AED 120,000",
  "Whatever the right school costs",
  "I would like guidance on what is realistic",
];
export const BUDGET_STATUS_OPTIONS = [
  "Yes, we know our school fee and housing budget",
  "We have a rough idea",
  "No, and we would like guidance on what is realistic",
  "Our employer is covering most of it, so we are not sure of the numbers",
];
export const HOUSING_BUDGET_OPTIONS = [
  "Up to AED 100,000",
  "AED 100,000 to 150,000",
  "AED 150,000 to 200,000",
  "AED 200,000 to 300,000",
  "AED 300,000 to 500,000",
  "Above AED 500,000",
  "Our housing is provided or paid for by an employer",
  "We are not sure yet",
];
export const COST_GUIDANCE_OPTIONS = ["Yes please", "No thank you", "Maybe later"];
export const YES_NO_OPTIONS = ["Yes", "No"];
export const YEAR_GROUPS = [
  "FS1 / Pre-KG / Nursery", "FS2 / Reception", "Year 1", "Year 2 / Grade 1", "Year 3 / Grade 2",
  "Year 4 / Grade 3", "Year 5 / Grade 4", "Year 6 / Grade 5", "Year 7 / Grade 6",
  "Year 8 / Grade 7", "Year 9 / Grade 8", "Year 10 / Grade 9", "Year 11 / Grade 10",
  "Year 12 / Grade 11", "Year 13 / Grade 12",
]
export const TERMS = [
  "Term 1 (September start)",
  "Term 2 (January start)",
  "Term 3 (April start)",
]
export const TERMS_WITH_FLEXIBLE = [...TERMS, "We are flexible"];
export const CURRICULA = [
  "British (National Curriculum)",
  "American",
  "IB (International Baccalaureate)",
  "Indian (CBSE)",
  "Indian (ICSE)",
  "French",
  "UAE National",
]
export const REASONS_FOR_LEAVING = [
  "Relocating to a new country",
  "Looking for a different curriculum",
  "The school is no longer the right fit for our child",
  "Pastoral, wellbeing or inclusion",
]
export const TRANSFER_CERTIFICATE_UNDERSTANDING = ["Yes, fully", "Roughly", "No, please explain it", "Not applicable"];
// Generated from today's date, same as the family's form.
export const ACADEMIC_YEARS = (() => {
  const startYear = new Date().getFullYear();
  const years = [];
  for (let y = startYear; y <= startYear + 5; y++) years.push(`${y}/${y + 1}`);
  return years;
})();
