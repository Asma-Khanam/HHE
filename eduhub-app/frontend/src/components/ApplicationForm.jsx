import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import FormSection from "./FormSection";
import FormField from "./FormField";
import FormSelect from "./FormSelect";
import YesNoSelect from "./YesNoSelect";
import StrictSelect from "./StrictSelect";
import RankingSelect from "./RankingSelect";
import MultiSelect from "./MultiSelect";
import PhoneField from "./PhoneField";
import DateField from "./DateField";
import AddressBlock, { resolveAddress } from "./AddressBlock";
import AvatarUpload from "./AvatarUpload";
import PageHeader from "./PageHeader";
import MoveDetailsCard from "./MoveDetailsCard";
import DocumentChecklist from "./DocumentChecklist";
import { saveApplication, submitApplication, deleteChild } from "../lib/applicationData";
import { deleteDocument } from "../lib/documents";
import { getMissingItems, getStepBreakdown } from "../lib/completeness";
import { fetchYearGroupCutoff } from "../lib/settings";
import { fetchCustomCurricula, addCustomCurriculum } from "../lib/curriculumOptions";
import {
  NATIONALITIES,
  LANGUAGES,
  ACADEMIC_YEARS,
  YEAR_GROUPS,
  TERMS,
  CURRICULA,
  ENGLISH_PROFICIENCY_LEVELS,
  REASONS_FOR_LEAVING,
  REASONS_FOR_LEAVING_WITH_DETAILS,
} from "../data/formOptions";
import { CHILD_DOCUMENT_TYPES, PARENT_DOCUMENT_TYPES } from "../data/documentTypes";
import "../styles/form.css";
import "./ApplicationForm.css";

// NOTE: every field below is a real, saved column as of the round-4 schema
// addendum (eduhub_schema_addendum_1.sql) — run that file once in the
// Supabase SQL Editor and everything here (including the fields that used
// to be "preview only": gender, preferred name, year group, curriculum,
// the various Yes/No questions, notes, sports achievements, and the
// current-school contact name/phone) saves for real via
// applicationData.js's whitelist. If a reload stops keeping one of these
// values, the addendum SQL hasn't been run against Supabase yet.

const emptyChild = {
  full_name: "",
  date_of_birth: "",
  nationality: "",
  first_language: "",
  second_language: "",
  medical_inclusion_needs: "",
  sports_hobbies_interests: "",
  sports_achievements: "",
  eid: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  preferred_name: "",
  gender: "",
  // CH-04/CH-05 (September 2026 change request): both became "select all
  // that apply" — arrays now, on their own new columns
  // (academic_years_of_entry / terms) rather than reusing the old
  // single-value academic_year_of_entry/term columns, so existing saved
  // data never has to be reinterpreted as an array.
  academic_year_of_entry: "",
  academic_years_of_entry: [],
  year_group_applying_for: "",
  year_group_reason: "",
  term: "",
  terms: [],
  // CH-03: religion isn't on a child's record yet at all — same new field,
  // same option list, as AH-03 added for a parent.
  religion: "",
  english_first_home_language: "",
  english_proficiency: "",
  // Superseded by Section 5's SEN-01 (September 2026 change request) — kept
  // here only so a child saved before this section existed doesn't lose
  // whatever was already in these two columns. Nothing in the form reads or
  // writes them any more; see sen_status/sen_concerns_description/
  // sen_diagnoses/sen_diagnosis_other below for the new section.
  has_sen: "",
  sen_description: "",
  // SEN-01: the section's opening question, and its two conditional
  // follow-ups — a free-text worry description, or a "select all that
  // apply" list of diagnoses (plus its own "Other" text box).
  sen_status: "",
  sen_concerns_description: "",
  sen_diagnoses: [],
  sen_diagnosis_other: "",
  // SEN-02: "select all that apply" list of documents the family already
  // holds, with its own "None of the above" that clears (and is cleared by)
  // every other option — see MultiSelect's exclusiveOption prop.
  sen_documents_held: [],
  // SEN-04 through SEN-11 — the rest of the SEN and inclusion section.
  sen_intervention_status: "",
  sen_intervention_types: [],
  sen_intervention_other: "",
  sen_intervention_frequency: "",
  sen_lsa_status: "",
  sen_descriptive_words: [],
  sen_outside_professionals: [],
  sen_outside_professionals_other: "",
  sen_disclosure_preference: "",
  sen_additional_notes: "",
  gifted_talented: "",
  has_transfer_certificate: "",
  transfer_certificate_understanding: "",
  notes: "",
  // Separated or split households mean a child doesn't always live at the
  // account holder's address (founder feedback, 2026-09-02). `address_same_as`
  // records the CHOICE ("household" / "mother" / "father", or "" for an
  // address of their own) and `address` always holds the resolved text, so
  // anything reading the database straight — the founders' portal included —
  // sees a real address without having to follow the reference.
  address: "",
  address_same_as: "",
};

const emptySchool = {
  school_name: "",
  school_address: "",
  contact_email: "",
  contact_name: "",
  contact_phone: "",
  year_group_of_leaving: "",
  // CS-01 (September 2026 change request): "Date last attended" is removed.
  // It was already gone from this form (never rendered here); the column
  // itself is untouched in the database, this just stops the app from ever
  // reading or writing it again.
  curriculum: "",
  reason_for_leaving: "",
  reason_for_leaving_details: "",
  // CS-04/CS-05/CS-06 (September 2026 change request) — three new optional
  // questions in the "Current school" section.
  education_gaps_status: "",
  education_gaps_details: "",
  repeated_year_status: "",
  repeated_year_details: "",
  school_refusal_status: "",
  school_refusal_details: "",
  // NAV-02 (September 2026 change request): set once, when this child's
  // school section is copied from a sibling's — see the copy helpers below.
  same_as_sibling_child_id: "",
};

// NAV-02 — the fields a "same school as a sibling" copy actually carries
// over. Deliberately NOT "id" (this child keeps its own current_schools
// row) and NOT year_group_applying_for / academic_years_of_entry / terms
// (those live on the CHILD record, not current_schools, so they're already
// independent per child without any extra exclusion logic here).
const SCHOOL_COPY_FIELDS = [
  "school_name",
  "school_address",
  "contact_email",
  "contact_name",
  "contact_phone",
  "year_group_of_leaving",
  "curriculum",
  "reason_for_leaving",
  "reason_for_leaving_details",
  "education_gaps_status",
  "education_gaps_details",
  "repeated_year_status",
  "repeated_year_details",
  "school_refusal_status",
  "school_refusal_details",
];

const emptyParent = {
  full_name: "",
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  nationality: "",
  religion: "",
  first_language: "",
  second_language: "",
  employer_name: "",
  occupation_designation: "",
  eid: "",
  address: "",
  address_same_as: "",
};

// AH-02 (September 2026 change request): "British" pinned above the rest of
// the nationality list (Pattern B) on the account holder's own field —
// families relocating here are disproportionately British, so it saves most
// of them a scroll. Only applied to the parent's Nationality field for now
// (that's what AH-02 asked for); the child's nationality field is untouched.
const PINNED_NATIONALITIES = ["British"];
const NATIONALITIES_UNPINNED = NATIONALITIES.filter((n) => !PINNED_NATIONALITIES.includes(n));

// AH-03: religion isn't in the form yet at all — this is the option list for
// the new field, built the same way as the other dropdowns (Pattern A's
// "Other" comes free from FormSelect).
const RELIGIONS = [
  "Christianity",
  "Islam",
  "Hinduism",
  "Buddhism",
  "Sikhism",
  "Judaism",
  "No religion",
  "Prefer not to say",
];

// CH-05 (September 2026 change request): "please also add 'We are flexible'
// as a final option" — local to the child's Term field rather than added to
// the shared TERMS list in formOptions.js, since nothing else uses TERMS.
const TERMS_WITH_FLEXIBLE = [...TERMS, "We are flexible"];

// CH-04 (September 2026 change request): academic year of entry became
// "select all that apply" — for the year-group suggestion further down,
// which needs a single year to work from, the earliest year a family has
// ticked is the most useful one (the soonest they might actually arrive).
// "YYYY/YYYY" strings sort correctly as plain strings for any reasonable
// range of years, so no date parsing is needed here.
function earliestAcademicYear(years) {
  if (!years || !years.length) return "";
  return [...years].sort()[0];
}

// SEN-01 (September 2026 change request) — Section 5, "SEN and inclusion".
// Deliberately not a plain Yes/No any more: a family who was "told
// something when they were younger but it was never followed up" isn't a
// clean No or Yes, and forcing that choice was the whole reason this became
// its own calmer, more careful section instead of one YesNoSelect buried in
// Additional info.
const SEN_STATUS_OPTIONS = [
  "No, none at all",
  "No formal diagnosis, but we have concerns",
  "Yes, formally identified or diagnosed",
  "Yes, assessment is currently in progress",
  "We were told something when they were younger but it was never followed up",
];

// A child can genuinely have more than one of these at once, which is
// exactly why this is "select all that apply" rather than a single choice —
// see the multi-select conditional in SEN_STATUS_OPTIONS above.
const SEN_DIAGNOSIS_OPTIONS = [
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

// SEN-02 (September 2026 change request) — "Do you have any of the following
// documents?" Deliberately not gated on the SEN-01 answer: a school-issued
// monitoring plan or a People of Determination card can exist even for a
// family who answered "no formal diagnosis, but we have concerns" (or isn't
// sure what to call it yet), so this is asked of every child in the section.
const SEN_DOCUMENT_OPTIONS = [
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
const SEN_DOCUMENTS_NONE_OPTION = "None of the above";

// CS-04 (September 2026 change request).
const EDUCATION_GAPS_OPTIONS = ["No", "Yes", "Prefer to discuss"];

// CS-05.
const REPEATED_YEAR_OPTIONS = [
  "No",
  "Yes, they repeated a year",
  "Yes, it was suggested but we did not go ahead",
  "It is being discussed now",
];
function repeatedYearNeedsDetails(status) {
  return !!status && status !== "No";
}

// CS-06.
const SCHOOL_REFUSAL_OPTIONS = ["No", "Yes, refused a place", "Yes, asked to leave", "Prefer to discuss this with you"];
function schoolRefusalNeedsDetails(status) {
  return status === "Yes, refused a place" || status === "Yes, asked to leave";
}

// SEN-04 (September 2026 change request).
const SEN_INTERVENTION_STATUS_OPTIONS = [
  "No, never",
  "Yes, currently",
  "Yes, in the past",
  "Yes, but only for a short trial period",
  "I am not sure",
];

// SEN-05's "shown when SEN-04 is answered with any option beginning 'Yes'" —
// the four Yes variants above all start with the word "Yes", so this is a
// plain prefix check rather than an explicit list that would need updating
// if a wording ever changed slightly.
function senHasIntervention(status) {
  return typeof status === "string" && status.startsWith("Yes");
}

const SEN_INTERVENTION_TYPE_OPTIONS = [
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
const SEN_INTERVENTION_OTHER_OPTION = "Other";

// SEN-06.
const SEN_INTERVENTION_FREQUENCY_OPTIONS = [
  "Daily",
  "Two to three times a week",
  "Weekly",
  "Fortnightly or less",
  "It varies",
  "No longer receiving them",
];

// SEN-07 — the last option is deliberately not a dead end: choosing it shows
// a short plain-English explanation right underneath instead of just moving
// the parent on, since a family who doesn't recognise the term "Learning
// Support Assistant" shouldn't have to guess at an answer.
const SEN_LSA_OPTIONS = [
  "Yes, full time one to one",
  "Yes, part time or shared",
  "Yes, but only for specific lessons or activities",
  "No, but it has been recommended",
  "No, but we think one may be needed",
  "No, and none has ever been suggested",
  "We had one previously and it was withdrawn",
  "I am not sure what this means",
];
const SEN_LSA_NOT_SURE_OPTION = "I am not sure what this means";

// SEN-08 — deliberately starts with nothing ticked (per the document: "so a
// parent can scroll past and carry on without answering"), rendered as a
// compact grid rather than the usual pill row so 20 options don't read as a
// wall of text — see MultiSelect's layout="grid".
const SEN_DESCRIPTIVE_WORD_OPTIONS = [
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
const SEN_DESCRIPTIVE_WORDS_NONE_OPTION = "None of these";

// SEN-09.
const SEN_OUTSIDE_PROFESSIONAL_OPTIONS = [
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
const SEN_OUTSIDE_PROFESSIONALS_OTHER_OPTION = "Other";

// SEN-10 — deliberately shown on the family record in the founders app (see
// FamilyDetailPage.jsx): "it governs what our team is allowed to share with
// a school."
const SEN_DISCLOSURE_OPTIONS = [
  "Yes, disclose everything upfront. I want a school that says yes with full knowledge",
  "Yes, but let us discuss what and how first",
  "I would prefer to disclose after an offer is made",
  "I would rather not disclose. I would like to talk this through with you",
];

// The two SEN-01 answers that mean a real diagnosis or assessment is
// actually in play — this is what now decides whether the SEN supporting
// documents checklist appears, replacing the old plain has_sen === "Yes"
// check (see expectedChildDocTypes in lib/completeness.js, kept in sync
// with this same rule).
function senNeedsSupportingDocs(status) {
  return status === "Yes, formally identified or diagnosed" || status === "Yes, assessment is currently in progress";
}

// AH-09: options for "What matters most to you in a school?" — family-level,
// asked once under the account holder, not per child.
const SCHOOL_PRIORITY_OPTIONS = [
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

// AH-10: options for "What is your comfortable annual fee range, per child?"
// — fixed list, family-level, asked once under the account holder alongside
// AH-09. No "Other" in the document's spec, so this is a StrictSelect.
const FEE_RANGE_OPTIONS = [
  "Up to AED 30,000",
  "AED 30,000 to 50,000",
  "AED 50,000 to 70,000",
  "AED 70,000 to 90,000",
  "AED 90,000 to 120,000",
  "Above AED 120,000",
  "Whatever the right school costs",
  "I would like guidance on what is realistic",
];

// BUD-01: options for "Have you set a budget for the move?" — the first
// question of the new "Budget and relocation planning" section (Section 3).
// Fixed list, no "Other" in the document's spec, so this is a StrictSelect.
const BUDGET_STATUS_OPTIONS = [
  "Yes, we know our school fee and housing budget",
  "We have a rough idea",
  "No, and we would like guidance on what is realistic",
  "Our employer is covering most of it, so we are not sure of the numbers",
];

// BUD-03: options for "What is your annual housing budget?" — family-level,
// optional, part of the Budget and relocation planning section.
const HOUSING_BUDGET_OPTIONS = [
  "Up to AED 100,000",
  "AED 100,000 to 150,000",
  "AED 150,000 to 200,000",
  "AED 200,000 to 300,000",
  "AED 300,000 to 500,000",
  "Above AED 500,000",
  "Our housing is provided or paid for by an employer",
  "We are not sure yet",
];

// BUD-05: options for "Would you like us to talk you through the typical
// cost of school and family life here?" — family-level, part of the Budget
// and relocation planning section.
const COST_GUIDANCE_OPTIONS = ["Yes please", "No thank you", "Maybe later"];

const MAX_CHILDREN = 6;

// One-time backfill for a child saved before the name was split into parts
// — so an existing full_name doesn't just look blank in the new First/Last
// fields. First word becomes first name, everything else becomes last name;
// this is a starting guess the family can correct, not a real parse.
// A brand-new nullable column (like tonight's notes / sports_achievements /
// current_schools.contact_name / contact_phone) comes back as SQL NULL for
// any row saved before that column existed — merging that straight into
// emptyChild/emptySchool would hand a controlled <textarea>/<input> a null
// value instead of emptyChild's "" default. Stripping nulls first means the
// empty-string defaults win until the family saves once, same as any other
// still-unanswered field.
function dropNulls(obj) {
  const out = {};
  Object.keys(obj || {}).forEach((k) => {
    if (obj[k] !== null) out[k] = obj[k];
  });
  return out;
}

// Schema addendum 4 backfilled every existing parent and child with
// address_same_as = 'household', pointing at families.home_address. That
// household field is gone from the form now (founder feedback: the address
// belongs to each person), so on load those rows are converted to owning the
// address outright — the text the backfill wrote is already correct, it just
// stops being a copy of something the family can no longer see or edit.
function normaliseLegacyAddress(record, homeAddress) {
  if (record?.address_same_as !== "household") return record;
  return { ...record, address_same_as: "", address: record.address || homeAddress || "" };
}

function backfillNameParts(child) {
  if (child.first_name || child.last_name || !child.full_name) return child;
  const parts = child.full_name.trim().split(/\s+/);
  if (!parts.length || !parts[0]) return child;
  return {
    ...child,
    first_name: parts[0],
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}

// The best name to show for a child wherever a compact label is needed —
// preferred name first since that's what the family actually calls them day
// to day, then first name, then whatever was in the single legacy full_name
// field, blank (not a placeholder) once none of those exist yet, so a card
// simply doesn't show a name line rather than showing a fake one.
function displayNameForChild(child) {
  return (child?.preferred_name || child?.first_name || child?.full_name || "").trim();
}

// CH-02 (September 2026 change request): age is shown as "X years Y months",
// worked out live against today's date rather than typed in — a parent's
// idea of a child's age is often out of date by the time they actually apply,
// and the school year group they're picked for depends on getting this
// right. Recalculates automatically whenever the date of birth changes,
// since it's derived, not stored.
function formatAgeFromDob(dob) {
  if (!dob) return "";
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return "";
  const today = new Date();
  if (birth > today) return "";

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const yearLabel = `${years} year${years === 1 ? "" : "s"}`;
  const monthLabel = `${months} month${months === 1 ? "" : "s"}`;
  return years <= 0 ? monthLabel : `${yearLabel} ${monthLabel}`;
}

// CH-06 (September 2026 change request): suggest a year group from the
// child's date of birth, using a cut-off date — a child's year group is
// decided by how old they are on the cut-off date of the academic year
// they're joining, not by their age today. 31 August is the UK/UAE
// British-curriculum default; other curricula use a different date, which
// is exactly why Heather asked for this to be editable from the founders
// app's Settings page (public.app_settings, schema addendum 26) rather than
// fixed in code. These two constants are only the fallback used before that
// setting has loaded, or if it can't be reached at all.
const YEAR_GROUP_CUTOFF_MONTH = 7; // August (0-indexed, JS Date convention)
const YEAR_GROUP_CUTOFF_DAY = 31;

// `academicYearOfEntry` is the "2026/2027" string from the earliest ticked
// Academic year of entry option (CH-04 made that field multi-select — see
// earliestAcademicYear() at its call site) — the suggestion is worked out
// against whichever year the family is actually applying for, not against
// today, so a family enquiring in one year about starting the next still
// gets the right suggestion. `cutoffMonth` is 0-indexed (JS Date
// convention), matching YEAR_GROUP_CUTOFF_MONTH's fallback above.
function suggestedYearGroupIndex(
  dob,
  academicYearOfEntry,
  cutoffMonth = YEAR_GROUP_CUTOFF_MONTH,
  cutoffDay = YEAR_GROUP_CUTOFF_DAY
) {
  if (!dob) return -1;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return -1;

  let startYear;
  const match = /^(\d{4})\//.exec(academicYearOfEntry || "");
  if (match) {
    startYear = Number(match[1]);
  } else {
    // No entry year chosen yet — fall back to the academic year running
    // right now, so there's still a sensible suggestion to show.
    const today = new Date();
    startYear = today.getMonth() > cutoffMonth ? today.getFullYear() : today.getFullYear() - 1;
  }

  const cutoff = new Date(startYear, cutoffMonth, cutoffDay);
  if (birth > cutoff) return -1; // not born yet as of the cut-off — no sensible suggestion

  let ageAtCutoff = cutoff.getFullYear() - birth.getFullYear();
  const monthDiff = cutoff.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && cutoff.getDate() < birth.getDate())) ageAtCutoff -= 1;

  // CH-06a: FS1 (Pre-KG/Nursery) = age 3 at the cut-off, FS2/Reception =
  // age 4, Year 1 = age 5, and so on — which lines up exactly with
  // YEAR_GROUPS' array order, Reception included, so a child born in that
  // window is suggested Reception rather than being left blank.
  const index = ageAtCutoff - 3;
  if (index < 0 || index >= YEAR_GROUPS.length) return -1;
  return index;
}

function suggestedYearGroupLabel(dob, academicYearOfEntry, cutoffMonth, cutoffDay) {
  const index = suggestedYearGroupIndex(dob, academicYearOfEntry, cutoffMonth, cutoffDay);
  return index === -1 ? "" : YEAR_GROUPS[index];
}

// Card-list step keys: "mother", "father", then "child-0", "child-1"... —
// home address isn't behind a card (see the card-list section below), so it
// never appears in this array.
function buildSteps(children) {
  const list = [
    { key: "mother", role: "Mother" },
    { key: "father", role: "Father" },
    // Section 3, "Budget and relocation planning" (September 2026 change
    // request) — its own card and step, sitting after the account holder
    // details and before the children, per the document.
    { key: "budget" },
  ];
  children.forEach((_, i) => list.push({ key: `child-${i}`, childIndex: i }));
  return list;
}

function stepIndexForKey(steps, key) {
  const i = steps.findIndex((s) => s.key === key);
  return i === -1 ? 0 : i;
}

// Turns one item from getMissingItems() into the same string used as the
// `data-field-key` on that exact field/document row in the DOM below, so a
// failed Submit can scroll straight to it instead of just naming it in text.
function fieldKeyForMissingItem(item) {
  if (!item) return null;
  if (item.kind === "field") {
    if (item.owner === "parent") return `parent-${item.parentIndex}-${item.field}`;
    if (item.owner === "child") return `child-${item.childIndex}-${item.field}`;
    if (item.owner === "family") return `family-${item.field}`;
    if (item.owner === "school") return `school-${item.schoolIndex}-${item.field}`;
  }
  if (item.kind === "document") {
    if (item.owner === "parent") return `parent-doc-${item.parentIndex}-${item.docKey}`;
    if (item.owner === "child") return `child-doc-${item.childIndex}-${item.docKey}`;
  }
  return null;
}

// Always returns a fixed 2-entry [Mother, Father] array. Matches existing
// rows by their `relationship` column first; falls back to array order for
// legacy data saved before that column existed, so nobody's information
// gets dropped just because they filled the form in before this change.
function buildInitialParents(existingParents) {
  const byRole = { Mother: null, Father: null };
  (existingParents || []).forEach((p) => {
    if (p.relationship === "Mother" || p.relationship === "Father") byRole[p.relationship] = p;
  });
  const unassigned = (existingParents || []).filter((p) => p.relationship !== "Mother" && p.relationship !== "Father");
  if (!byRole.Mother && unassigned.length) byRole.Mother = unassigned.shift();
  if (!byRole.Father && unassigned.length) byRole.Father = unassigned.shift();

  return [
    { ...emptyParent, ...byRole.Mother, relationship: "Mother" },
    { ...emptyParent, ...byRole.Father, relationship: "Father" },
  ];
}

// Whichever existing parent row is tied to the signed-in user is the account
// holder; brand-new applications default to Mother until the toggle is used.
function buildInitialAccountHolderRole(existingParents, userId) {
  const holder = (existingParents || []).find((p) => p.user_id === userId);
  return holder?.relationship === "Father" ? "Father" : "Mother";
}

// Which of a parent's fields the "Same as ..." sync copies across — general
// background info that's genuinely often shared, not anything
// contact/document-specific (email, phone, employer, EID stay independent).
const SAME_AS_PRIMARY_FIELDS = ["nationality", "first_language", "second_language"];

// Parents are always stored as [Mother, Father], but whoever is actually
// filling the form is shown FIRST and is the one the other parent can copy
// from (founder feedback, 2026-09-02) — a father filling this in shouldn't
// have to scroll past the mother's blank card to reach his own, or be the
// only one without a "same as" shortcut.
function primaryParentIndex(accountHolderRole) {
  return accountHolderRole === "Father" ? 1 : 0;
}

// The database has always allowed any number of children per family
// (children.family_id, no uniqueness constraint) — this form matches that:
// two fixed parent roles (Mother, Father), then a "how many children"
// choice that adds a card per child. The Application tab opens on a card
// list (one card per person, a live progress bar + Edit button) — clicking
// Edit opens that person's full section, same fields and documents as
// before, just reached through a card instead of a step pill.
export default function ApplicationForm({ familyId, userId, initialData, onSaved, initialStepKey, initialFieldKey }) {
  const navigate = useNavigate();
  const startingChildren = initialData.children?.length ? initialData.children : [{}];

  const legacyHomeAddress = initialData.family?.home_address || "";
  const [children, setChildren] = useState(
    startingChildren.map((c) =>
      normaliseLegacyAddress(backfillNameParts({ ...emptyChild, ...dropNulls(c) }), legacyHomeAddress)
    )
  );
  const [currentSchools, setCurrentSchools] = useState(
    startingChildren.map((c) => ({ ...emptySchool, ...dropNulls(initialData.schoolsByChild?.[c.id] || {}) }))
  );
  const [parents, setParents] = useState(() =>
    buildInitialParents((initialData.parents || []).map(dropNulls)).map((p) =>
      backfillNameParts(normaliseLegacyAddress(p, legacyHomeAddress))
    )
  );
  const [accountHolderRole, setAccountHolderRole] = useState(() =>
    buildInitialAccountHolderRole(initialData.parents, userId)
  );
  // AH-09: family-level, not per-person — an ordered list of up to 5 school
  // priorities, position 0 being the family's first priority. Lives on
  // families.school_priorities rather than on either parent.
  const [schoolPriorities, setSchoolPriorities] = useState(() => initialData.family?.school_priorities || []);
  // AH-10: family-level, same shape as AH-09 — a single fixed-option answer
  // rather than a per-parent field. Lives on families.comfortable_fee_range.
  const [comfortableFeeRange, setComfortableFeeRange] = useState(() => initialData.family?.comfortable_fee_range || "");
  // AH-11: family-level, open text, optional — "where will they be based"
  // covers either or both working parents in one answer, not one per parent.
  // Lives on families.parent_work_location.
  const [parentWorkLocation, setParentWorkLocation] = useState(() => initialData.family?.parent_work_location || "");
  // BUD-01: family-level, required — the opening question of the new Budget
  // section. Lives on families.budget_status.
  const [budgetStatus, setBudgetStatus] = useState(() => initialData.family?.budget_status || "");
  // BUD-03: family-level, optional. Lives on families.housing_budget.
  const [housingBudget, setHousingBudget] = useState(() => initialData.family?.housing_budget || "");
  // BUD-04: family-level, optional, free text — deliberately not a list of
  // communities, since families arriving from abroad rarely know area names
  // yet. Lives on families.preferred_living_area.
  const [preferredLivingArea, setPreferredLivingArea] = useState(() => initialData.family?.preferred_living_area || "");
  // BUD-05: family-level, optional. Anything other than "No thank you" is
  // meant to flag the family record for follow-up — that part of the
  // request lives on the founders' side (see the follow-up note flagged to
  // Heather), but the raw answer itself is saved here either way, on
  // families.cost_guidance_response.
  const [costGuidance, setCostGuidance] = useState(() => initialData.family?.cost_guidance_response || "");

  // CH-06: the year-group cut-off, editable from the founders app's Settings
  // page (public.app_settings, schema addendum 26) rather than fixed in
  // code. Stored here already converted to JS Date's 0-indexed month, so
  // suggestedYearGroupIndex/Label never have to know the database used
  // 1-indexed months. Starts at the same August 31st default the form used
  // before this setting existed, so there's a sensible suggestion even
  // before the fetch below resolves.
  const [yearGroupCutoff, setYearGroupCutoff] = useState({
    month: YEAR_GROUP_CUTOFF_MONTH,
    day: YEAR_GROUP_CUTOFF_DAY,
  });
  useEffect(() => {
    let cancelled = false;
    fetchYearGroupCutoff().then(({ month, day }) => {
      if (!cancelled) setYearGroupCutoff({ month: month - 1, day });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // CS-02 — curriculum names other families have already typed in via
  // "Other", fetched once on load and merged onto the fixed CURRICULA list
  // below. New ones this family adds get appended locally too (see
  // registerCustomCurricula in persist()), so the dropdown updates
  // immediately without waiting on a reload.
  const [customCurricula, setCustomCurricula] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetchCustomCurricula().then((names) => {
      if (!cancelled) setCustomCurricula(names);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const curriculumOptions = useMemo(
    () => [...CURRICULA, ...customCurricula.filter((c) => !CURRICULA.includes(c))],
    [customCurricula]
  );

  const primaryIndex = primaryParentIndex(accountHolderRole);
  const secondaryIndex = 1 - primaryIndex;
  // Father's "Same as Mother" toggle — see SAME_AS_MOTHER_FIELDS above and
  // the sync effect below. Auto-detects "on" for data that already matches
  // (e.g. right after this ships) so it doesn't look off by default for
  // families who happen to already share these answers.
  const [sameAsPrimaryGeneral, setSameAsPrimaryGeneral] = useState(() => {
    const initial = buildInitialParents(initialData.parents);
    return SAME_AS_PRIMARY_FIELDS.every((f) => initial[0][f] && initial[0][f] === initial[1][f]);
  });

  // Documents live outside the save-everything-at-once flow (each upload
  // hits storage immediately), but they're keyed the same way the fetch in
  // applicationData.js returns them — "type:id" — so the two stay in sync.
  const [documentsByOwner, setDocumentsByOwner] = useState(initialData.documentsByOwner || {});

  function docsFor(ownerType, ownerId) {
    return documentsByOwner[`${ownerType}:${ownerId}`] || [];
  }

  function setDocsFor(ownerType, ownerId, docs) {
    setDocumentsByOwner((prev) => ({ ...prev, [`${ownerType}:${ownerId}`]: docs }));
  }

  const steps = useMemo(() => buildSteps(children), [children.length]);

  // The Application tab's default view is the card list; a specific card's
  // edit view only opens when something points there directly — arriving
  // from Overview's "What's left" with a real card's step key, or an
  // in-session Edit click. "home_address" (and anything else with no card)
  // keeps the list showing, since that field is already visible there.
  const initialCardStep = initialStepKey && steps.some((s) => s.key === initialStepKey) ? initialStepKey : null;
  const [showingList, setShowingList] = useState(!initialCardStep);
  const [stepIndex, setStepIndex] = useState(() => (initialCardStep ? stepIndexForKey(steps, initialCardStep) : 0));

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // What just succeeded, so the banner can say the right thing. Only ever
  // "submit" now — the separate "Save draft" action (and its own banner)
  // was removed once autosave became the only save mechanism besides Submit
  // (September 2026 change request).
  const [lastAction, setLastAction] = useState(null); // "submit" | null
  // Red inline field highlighting only appears once someone has actually
  // tried to submit — never while they're still mid-draft, since most
  // fields are expected to be empty at that point.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  // "keeps going blank" fix, part 1: a debounced autosave so nothing typed
  // ever depends on remembering to click a save button. This quiet indicator
  // is now the ONLY save feedback a family sees before Submit.
  const [autosaveStatus, setAutosaveStatus] = useState("idle"); // idle | saving | saved | error
  // NAV-02 (September 2026 change request) — which sibling (by index into
  // `children`) a "same school as a sibling" tick was made against, keyed
  // by the child's own index. Session-scoped: a newly-added sibling has no
  // id yet, so this is what lets the checkbox reflect the choice right away
  // even before the backfill effect below can persist the real child id
  // onto currentSchools[i].same_as_sibling_child_id.
  const [sameSchoolChoice, setSameSchoolChoice] = useState({});
  // Which copied school sections the family has chosen to expand and edit
  // by hand, overriding the default collapsed summary view.
  const [expandedSchoolEdit, setExpandedSchoolEdit] = useState({});
  // Which field/document to scroll to after a failed Submit — see the
  // effect below, and fieldKeyForMissingItem() above for how it's derived.
  // Also seeded from Overview's "Still outstanding" list (initialFieldKey)
  // so clicking a specific missing document there doesn't just open that
  // person's card, it scrolls straight to that exact upload row.
  const [scrollTarget, setScrollTarget] = useState(
    initialCardStep && initialFieldKey ? initialFieldKey : null
  );
  // The child a "−" click would actually delete (has saved data) — set by
  // requestChildCountChange, cleared by confirmRemoveChild/cancelRemoveChild.
  // Non-null shows the inline "remove this child?" banner instead of
  // silently dropping their card.
  const [pendingRemoveChild, setPendingRemoveChild] = useState(null); // { index, name } | null
  const [removingChild, setRemovingChild] = useState(false);
  const [removeError, setRemoveError] = useState("");

  // Keeps Father's synced fields matching Mother's live, for as long as the
  // toggle is on. Reading it back off just stops the sync — it does NOT
  // clear what Father's fields currently hold, since those are still
  // perfectly good values, just no longer tied to Mother's.
  useEffect(() => {
    if (!sameAsPrimaryGeneral) return;
    setParents((prev) => {
      const source = prev[primaryIndex];
      const target = { ...prev[secondaryIndex] };
      let changed = false;
      SAME_AS_PRIMARY_FIELDS.forEach((f) => {
        if (target[f] !== source[f]) {
          target[f] = source[f];
          changed = true;
        }
      });
      if (!changed) return prev;
      const next = [...prev];
      next[secondaryIndex] = target;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sameAsPrimaryGeneral,
    primaryIndex,
    parents[primaryIndex].nationality,
    parents[primaryIndex].first_language,
    parents[primaryIndex].second_language,
  ]);

  // Anyone who picked "same as ..." for their address has that address kept
  // in step with its source here, exactly like the Father's "Same as Mother"
  // toggle above. The stored text is always the real, resolved address —
  // never a pointer the founders' portal would have to follow — so editing
  // the household address updates everyone who shares it, in one place.
  const motherAddress = parents[0]?.address || "";
  const fatherAddress = parents[1]?.address || "";
  useEffect(() => {
    const sources = { mother: motherAddress, father: fatherAddress };
    setParents((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        if (!p.address_same_as) return p;
        const resolved = resolveAddress(p.address_same_as, sources);
        if (p.address === resolved) return p;
        changed = true;
        return { ...p, address: resolved };
      });
      return changed ? next : prev;
    });
    setChildren((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (!c.address_same_as) return c;
        const resolved = resolveAddress(c.address_same_as, sources);
        if (c.address === resolved) return c;
        changed = true;
        return { ...c, address: resolved };
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motherAddress, fatherAddress]);

  // Single source of truth for what's still missing, shared with Overview's
  // "What's left" card via lib/completeness.js — Submit is blocked exactly
  // when this is non-empty, and nothing else decides that independently.
  // Required FIELDS only — documents stopped blocking Submit on 2026-09-02
  // (founder feedback: a family still waiting on a visa or an Emirates ID
  // shouldn't be locked out of applying). Anything still to upload is tracked
  // by getOutstandingDocuments() and surfaced on the Dashboard instead.
  const missingItems = useMemo(
    () =>
      getMissingItems({
        parents,
        accountHolderRole,
        children,
        currentSchools,
        schoolPriorities,
        comfortableFeeRange,
        budgetStatus,
      }),
    [parents, accountHolderRole, children, currentSchools, schoolPriorities, comfortableFeeRange, budgetStatus]
  );
  // Per-card progress (%, missing count) for the card list — same
  // underlying numbers as missingItems, just grouped and totaled per
  // person so each card can show its own bar instead of a plain flag.
  const stepBreakdown = useMemo(
    () => getStepBreakdown({ parents, accountHolderRole, children, currentSchools, documentsByOwner, budgetStatus }),
    [parents, accountHolderRole, children, currentSchools, documentsByOwner, budgetStatus]
  );

  // Lookups so each field/document can ask "am I one of the missing ones?"
  // in O(1) without re-deriving anything — same missingItems list that
  // drives the cards and the Overview checklist.
  const missingFieldKeys = useMemo(() => {
    const set = new Set();
    missingItems.forEach((item) => {
      if (item.kind !== "field") return;
      if (item.owner === "parent") set.add(`parent:${item.parentIndex}:${item.field}`);
      else if (item.owner === "child") set.add(`child:${item.childIndex}:${item.field}`);
      else if (item.owner === "family") set.add(`family:${item.field}`);
      else if (item.owner === "school") set.add(`school:${item.schoolIndex}:${item.field}`);
    });
    return set;
  }, [missingItems]);

  function isFieldMissing(key) {
    return attemptedSubmit && missingFieldKeys.has(key);
  }

  function openCard(index) {
    setStepIndex(index);
    setShowingList(false);
  }

  function backToList() {
    setShowingList(true);
  }

  // AH-01 (September 2026 change request): First/Last replace the single
  // "Full name" field the family types into, but full_name — the real,
  // required, "as in passport" column everything else in the app already
  // reads (cards, the family tree, saving) — is kept in sync underneath, the
  // same way it already works for children.
  function updateParentAt(i, field, value) {
    setParents((prev) =>
      prev.map((p, idx) => {
        if (idx !== i) return p;
        const next = { ...p, [field]: value };
        if (field === "first_name" || field === "last_name") {
          next.full_name = [next.first_name, next.last_name].filter(Boolean).join(" ").trim();
        }
        return next;
      })
    );
  }

  // First/Middle/Last stay the fields the family actually types into, but
  // full_name (the real, required, "as in passport" column) is kept in sync
  // automatically underneath — nothing else in the app (Overview, the
  // family tree, saving) needs to know the name is now entered in parts.
  function updateChildAt(i, field, value) {
    setChildren((prev) =>
      prev.map((c, idx) => {
        if (idx !== i) return c;
        const next = { ...c, [field]: value };
        if (field === "first_name" || field === "middle_name" || field === "last_name") {
          next.full_name = [next.first_name, next.middle_name, next.last_name].filter(Boolean).join(" ").trim();
        }
        return next;
      })
    );
  }

  function updateSchoolAt(i, field, value) {
    setCurrentSchools((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }

  // NAV-02 (September 2026 change request) — every OTHER child already in
  // the form, as a candidate to copy a current school from. Pulls each
  // child's actual name (falling back to "Child N") rather than a bare
  // index, per the spec ("families are entering three and four children and
  // the numbering becomes confusing").
  function siblingOptionsFor(i) {
    return children.map((c, idx) => ({ idx, name: displayNameForChild(c) || `Child ${idx + 1}` })).filter((o) => o.idx !== i);
  }

  function sameSchoolSiblingIndexFor(i) {
    if (Object.prototype.hasOwnProperty.call(sameSchoolChoice, i)) return sameSchoolChoice[i];
    const savedId = currentSchools[i]?.same_as_sibling_child_id;
    if (!savedId) return -1;
    return children.findIndex((c) => c.id === savedId);
  }

  // The actual copy — a one-time snapshot of the sibling's current school
  // fields, not a live link. Re-ticking a different sibling, or the same
  // one again, always re-copies from whatever that sibling's fields hold
  // right now; after that, editing the sibling's own school never reaches
  // back into this child's already-copied record.
  function handleSameSchoolToggle(i, siblingIndex) {
    setSameSchoolChoice((prev) => ({ ...prev, [i]: siblingIndex }));
    setExpandedSchoolEdit((prev) => ({ ...prev, [i]: false }));
    setCurrentSchools((prev) =>
      prev.map((s, idx) => {
        if (idx !== i) return s;
        const sibling = prev[siblingIndex] || {};
        const copied = {};
        SCHOOL_COPY_FIELDS.forEach((f) => {
          copied[f] = sibling[f] ?? "";
        });
        return { ...s, ...copied, same_as_sibling_child_id: children[siblingIndex]?.id || "" };
      })
    );
  }

  // Unticking doesn't erase what was copied — it just lets the family edit
  // this child's school independently from here on, which is what "leave
  // the copy in place" (the spec's own words for the sibling-edited-later
  // case) implies for the family's own undo path too.
  function clearSameSchoolAsSibling(i) {
    setSameSchoolChoice((prev) => {
      const next = { ...prev };
      delete next[i];
      return next;
    });
    setCurrentSchools((prev) => prev.map((s, idx) => (idx === i ? { ...s, same_as_sibling_child_id: "" } : s)));
  }

  function handleChildCountChange(nextCount) {
    const clamped = Math.max(0, Math.min(MAX_CHILDREN, nextCount));
    setChildren((prev) => {
      const next = [...prev];
      while (next.length < clamped) next.push({ ...emptyChild });
      return next.slice(0, clamped);
    });
    setCurrentSchools((prev) => {
      const next = [...prev];
      while (next.length < clamped) next.push({ ...emptySchool });
      return next.slice(0, clamped);
    });
  }

  // The stepper only ever moves by one at a time, so a decrease only ever
  // drops the LAST child (matches the slice(0, clamped) above). If that
  // child was never actually saved (no id — never uploaded anything, never
  // survived a save), there's nothing to lose, so it's removed immediately
  // like any other local edit. If it WAS saved, this is real, irreversible
  // deletion — the family confirms first (see confirmRemoveChild below)
  // instead of it happening on a single stray click.
  function requestChildCountChange(nextCount) {
    const clamped = Math.max(0, Math.min(MAX_CHILDREN, nextCount));
    if (clamped >= children.length) {
      handleChildCountChange(clamped);
      return;
    }
    const target = children[children.length - 1];
    if (!target?.id) {
      handleChildCountChange(clamped);
      return;
    }
    setPendingRemoveChild({
      index: children.length - 1,
      name: displayNameForChild(target) || `Child ${children.length}`,
    });
    setRemoveError("");
  }

  // Actually deletes the pending child's saved data — their documents first
  // (documents has no FK to cascade on, since it's polymorphic across
  // parents and children — see lib/documents.js), then the children row
  // itself (current_schools cascades automatically via its own FK). Only
  // reached after the family has explicitly confirmed via the inline
  // banner in CardListView.
  async function confirmRemoveChild() {
    if (!pendingRemoveChild) return;
    const { index } = pendingRemoveChild;
    const child = children[index];
    setRemovingChild(true);
    setRemoveError("");
    try {
      if (child?.id) {
        const docs = documentsByOwner[`child:${child.id}`] || [];
        for (const doc of docs) {
          await deleteDocument(doc);
        }
        await deleteChild(child.id);
      }
      setChildren((prev) => prev.filter((_, i) => i !== index));
      setCurrentSchools((prev) => prev.filter((_, i) => i !== index));
      setDocumentsByOwner((prev) => {
        if (!child?.id) return prev;
        const next = { ...prev };
        delete next[`child:${child.id}`];
        return next;
      });
      setPendingRemoveChild(null);
    } catch (err) {
      setRemoveError(err.message || "Couldn't remove this child — try again.");
    } finally {
      setRemovingChild(false);
    }
  }

  function cancelRemoveChild() {
    setPendingRemoveChild(null);
    setRemoveError("");
  }

  // Guards every call to persist() below — the "Next" button, Submit, AND
  // the autosave effect all funnel through this so two saves can never run
  // at once. That matters here specifically: a family's children/parents
  // were once accidentally duplicated (2026-08-27) because a save partially
  // failed and a second save re-inserted rows that already existed. Autosave
  // firing mid-save is the same shape of race, just from a different
  // trigger, so it gets the same lock.
  const saveLockRef = useRef(false);
  // The exact snapshot of editable state that was last successfully sent to
  // the server — the autosave effect below only schedules a save when the
  // current state has actually drifted from this, so a save that changes
  // nothing (e.g. the id-refresh right after a prior save) doesn't schedule
  // another one and loop forever.
  const lastSavedSnapshotRef = useRef(null);
  const autosaveTimerRef = useRef(null);

  function snapshotOfEditableState() {
    return JSON.stringify({
      parents,
      children,
      currentSchools,
      accountHolderRole,
      schoolPriorities,
      comfortableFeeRange,
      parentWorkLocation,
      budgetStatus,
      housingBudget,
      preferredLivingArea,
      costGuidance,
    });
  }

  // CS-02 — after a successful save, any school's curriculum that isn't
  // already a known option (the fixed list or something already fetched)
  // gets written to curriculum_options so the next family sees it too, and
  // added to local state so it shows up in THIS family's own dropdown
  // immediately, without waiting on a reload.
  function registerCustomCurricula(savedSchools) {
    const newOnes = (savedSchools || [])
      .map((s) => (s?.curriculum || "").trim())
      .filter((name) => name && !curriculumOptions.includes(name));
    if (!newOnes.length) return;
    const unique = [...new Set(newOnes)];
    unique.forEach((name) => addCustomCurriculum(name));
    setCustomCurricula((prev) => [...prev, ...unique.filter((name) => !prev.includes(name))]);
  }

  // Shared by the "Next" button, Submit, and autosave — persists whatever's
  // currently in state, no validation. Returns the saved rows so each caller
  // can decide what happens next (Next/autosave stay put; submit also flips
  // intake_status) — or null if another save was already in flight, in which
  // case the caller should just leave it for that save (or the next change)
  // to cover.
  async function persist() {
    if (saveLockRef.current) return null;
    saveLockRef.current = true;
    const preSaveSnapshot = snapshotOfEditableState();
    try {
      const saved = await saveApplication({
        familyId,
        userId,
        children,
        currentSchools,
        parents,
        accountHolderRole,
        sameAsPrimary: sameAsPrimaryGeneral,
        schoolPriorities,
        comfortableFeeRange,
        parentWorkLocation,
        budgetStatus,
        housingBudget,
        preferredLivingArea,
        costGuidance,
      });
      // Critical: write the database-assigned ids back into state, MERGED
      // onto the existing local objects rather than replacing them — saved
      // rows only carry real database columns (see applicationData.js), so
      // a plain replace would silently wipe out the preview-only fields
      // (gender, preferred name, year group, etc) the family just typed.
      // Merging keeps both: the real id (so a second save updates instead
      // of duplicating) and the not-yet-saved fields (so they don't vanish
      // out from under whoever's filling the form in).
      setChildren((prev) => saved.children.map((sc, idx) => ({ ...prev[idx], ...sc })));
      setCurrentSchools((prev) => saved.currentSchools.map((ss, idx) => ({ ...prev[idx], ...ss })));
      if (saved.parents) setParents((prev) => saved.parents.map((sp, idx) => ({ ...prev[idx], ...sp })));
      lastSavedSnapshotRef.current = preSaveSnapshot;
      registerCustomCurricula(saved.currentSchools);
      return saved;
    } finally {
      saveLockRef.current = false;
    }
  }

  // The fix for "I filled something in and it went blank again" — rather
  // than only saving on an explicit click, every change to the editable
  // fields (once the user has actually made one — the initial data load
  // itself is never treated as a change) is quietly persisted a couple of
  // seconds after they stop typing. Switching tabs, a flaky connection, or
  // even just closing the laptop can no longer lose more than a couple of
  // seconds of typing. Autosave is now the ONLY save mechanism besides
  // Submit — the separate "Save draft" button was removed (September 2026
  // change request: "since everything is on autosave anyways") — so this
  // also calls onSaved() itself now, taking over the one thing the removed
  // button used to be responsible for (refreshing the parent page's copy
  // of the family record).
  useEffect(() => {
    if (lastSavedSnapshotRef.current === null) {
      // First run, right after mount — this IS the data that was just
      // loaded, not a change the user made, so it's the baseline, not
      // something to save.
      lastSavedSnapshotRef.current = snapshotOfEditableState();
      return;
    }
    if (snapshotOfEditableState() === lastSavedSnapshotRef.current) return;

    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      setAutosaveStatus("saving");
      try {
        const saved = await persist();
        setAutosaveStatus(saved ? "saved" : "idle");
        if (saved) onSaved?.();
      } catch (err) {
        // Quiet failure by design — the user hasn't asked for anything here,
        // so no red banner; the footer note already says autosave failed,
        // and it'll simply try again on the next change (or the next
        // successful autosave). Still logged (not swallowed entirely) so a
        // real recurring cause shows up in the browser console instead of
        // just "couldn't autosave" with no way to tell why.
        console.error("Autosave failed:", err);
        setAutosaveStatus("error");
      }
    }, 1500);

    return () => clearTimeout(autosaveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parents, children, currentSchools, accountHolderRole]);

  // NAV-02 — a sibling picked via handleSameSchoolToggle might not have a
  // real database id yet (a freshly added child, not yet autosaved). Once
  // that sibling does get one (this same autosave loop assigns it), this
  // backfills the pointer onto the copying child's current_schools row so
  // the choice actually persists, without the family having to touch the
  // checkbox again.
  useEffect(() => {
    Object.entries(sameSchoolChoice).forEach(([iStr, siblingIndex]) => {
      const i = Number(iStr);
      const siblingId = children[siblingIndex]?.id;
      if (siblingId && currentSchools[i] && currentSchools[i].same_as_sibling_child_id !== siblingId) {
        setCurrentSchools((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, same_as_sibling_child_id: siblingId } : s))
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, sameSchoolChoice]);

  // After a failed Submit, jump to the first missing item's card (or stay
  // on the list, for the home address field) AND scroll straight to that
  // exact field/document once it's actually on screen — "point at what
  // needs to get filled" instead of leaving it to a banner.
  useEffect(() => {
    if (!scrollTarget) return;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-field-key="${scrollTarget}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = el?.matches("input,select,textarea") ? el : el?.querySelector("input,select,textarea");
      focusable?.focus({ preventScroll: true });
      setScrollTarget(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollTarget, stepIndex, showingList]);

  // Saves exactly what's filled in so far, required fields or not — this is
  // the fix for the form previously refusing to save anything at all until
  // every * field was complete, which meant a family who didn't finish in
  // one sitting had nothing to come back to.
  // A raw database error ("invalid input syntax for type date...") is
  // meaningless to a family filling in the form — log the real message for
  // debugging, but show something a person can actually act on. Anything
  // that's clearly our own validation text (no SQL-shaped phrasing) still
  // passes through as-is, since those are already written to be readable.
  function friendlyError(err, fallback) {
    const msg = err?.message || "";
    console.error(err);
    const looksLikeRawDbError = /invalid input syntax|violates|constraint|column .* does not exist|duplicate key/i.test(msg);
    return looksLikeRawDbError || !msg ? fallback : msg;
  }

  // The real "finish line" — only this validates, and only this marks the
  // application as actually submitted.
  async function handleSubmitApplication(e) {
    e.preventDefault();

    // Bug fix (September 2026, take 2): the earlier fix here only
    // intercepted the Enter *keydown*, but a native <select>'s own OS-drawn
    // popup swallows that keydown before it ever reaches our onKeyDown
    // handler — so choosing an option with the keyboard (arrow keys +
    // Enter, which is exactly how you close a dropdown you clicked open)
    // still implicitly submitted the form once the popup closed, running
    // straight into the "no owning card" branch below and jumping back to
    // the overview. Checking the submit event's own `submitter` is the
    // reliable way to tell a real Submit-button click from an implicit
    // submission, regardless of which control (or which browser's select
    // popup) triggered it: the browser sets `submitter` only when an actual
    // submit button was activated, and leaves it null for every implicit
    // path. So only a genuine button click reaches the validation below.
    if (!e.nativeEvent?.submitter) {
      return;
    }

    setError("");

    if (missingItems.length) {
      setAttemptedSubmit(true);
      const first = missingItems[0];
      const cardIndex = steps.findIndex((s) => s.key === first.stepKey);
      if (cardIndex === -1) {
        // No card owns this item (home address) — the list view already
        // shows it directly.
        setShowingList(true);
      } else {
        openCard(cardIndex);
      }
      setScrollTarget(fieldKeyForMissingItem(first));
      setError(
        `${missingItems.length} required field${missingItems.length > 1 ? "s are" : " is"} still missing before you can submit — they're highlighted below, or listed under "What's left" on the Dashboard. Documents don't block submitting; upload those whenever you get them.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const saved = await persist();
      if (!saved) {
        setError("Still saving in the background — give it a second and try again.");
        return;
      }
      await submitApplication(familyId);
      setLastAction("submit");
      onSaved?.();
      // Once everything's saved and submitted, the Dashboard is more useful
      // than staying on the form — it shows the result of what was just
      // filled in, rather than the same form again.
      navigate("/app/dashboard");
    } catch (err) {
      setError(friendlyError(err, "Something went wrong submitting your application — please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  const activeStep = steps[stepIndex] || steps[0];

  // AH-06 (founder feedback, 2026-09-07): the footer's primary button used to
  // read "Submit application" on every single-person page, not just the
  // overview — which read as if filling in the Mother's details finished the
  // whole application. On a detail page (!showingList) it now saves and
  // returns to the overview instead; the real, validating submit stays on
  // the list/overview page only, since that's genuinely the end of the form.
  async function handleFooterNext() {
    setError("");
    setSaving(true);
    try {
      const saved = await persist();
      if (!saved) {
        setError("Still saving in the background — give it a second and try again.");
        return;
      }
      backToList();
    } catch (err) {
      setError(friendlyError(err, "Something went wrong saving — please try again."));
    } finally {
      setSaving(false);
    }
  }

  // NAV-01 (September 2026 change request): "at the bottom of the child
  // page, give two clear buttons: 'Add another child' and 'Submit'... don't
  // rely on the parent page for this — families are missing it there." So
  // a child's own detail page gets its own footer instead of the generic
  // "Next" — saves what's here, adds a fresh child, and opens straight onto
  // their new card (the last step in the freshly-grown list).
  async function handleAddAnotherChildFromCard() {
    setError("");
    setSaving(true);
    try {
      const saved = await persist();
      if (!saved) {
        setError("Still saving in the background — give it a second and try again.");
        return;
      }
      const newChildStepIndex = steps.length; // appended after every existing step
      requestChildCountChange(children.length + 1);
      setStepIndex(newChildStepIndex);
      setShowingList(false);
    } catch (err) {
      setError(friendlyError(err, "Something went wrong saving — please try again."));
    } finally {
      setSaving(false);
    }
  }

  // Bug fix (September 2026): "every time I select something... it goes
  // back to the main application page." Pressing Enter (which a native
  // <select>'s own keyboard interaction can send) inside any form control
  // implicitly submits the nearest <form> — and handleSubmitApplication, on
  // finding a missing item with no owning card (e.g. a family-level field),
  // calls setShowingList(true), which reads exactly like an unwanted jump
  // back to the overview. A real Submit still works: the submit button
  // itself is exempted, and Enter inside a textarea still inserts a newline
  // instead of doing nothing.
  function handleFormKeyDown(e) {
    if (e.key !== "Enter") return;
    const tag = e.target?.tagName;
    if (tag === "TEXTAREA") return;
    if (e.target?.type === "submit") return;
    e.preventDefault();
  }

  return (
    <form className="application-form" onSubmit={handleSubmitApplication} onKeyDown={handleFormKeyDown} noValidate>
      <PageHeader
        title="Application"
        subtitle={
          showingList
            ? "Work through the blocks in order. Everything saves as a draft — you can come back and edit any block later."
            : undefined
        }
      />

      <div className="application-form-body">
        {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
        {!error && lastAction === "submit" && (
          <div className="hh-form-banner hh-form-banner-success">Submitted. You can still come back and edit.</div>
        )}

        {showingList ? (
          <CardListView
            familyId={familyId}
            family={initialData.family}
            onFamilyChange={() => onSaved?.()}
            parents={parents}
            accountHolderRole={accountHolderRole}
            setAccountHolderRole={setAccountHolderRole}
            primaryIndex={primaryIndex}
            children={children}
            onChildCountChange={requestChildCountChange}
            pendingRemoveChild={pendingRemoveChild}
            removingChild={removingChild}
            removeError={removeError}
            onConfirmRemoveChild={confirmRemoveChild}
            onCancelRemoveChild={cancelRemoveChild}
            stepBreakdown={stepBreakdown}
            onEditCard={openCard}
            steps={steps}
          />
        ) : (
          <>
            <button type="button" className="hh-link-btn back-to-list-btn" onClick={backToList}>
              ‹ Back to application
            </button>
            {/* NAV-03 (September 2026 change request): this form is long enough
                that families rarely finish it in one sitting — a plain "Step X
                of Y" against the whole application (not just this person's own
                fields) at least tells them how much is left overall. */}
            <div className="hh-form-step-indicator">
              Step {stepIndex + 1} of {steps.length}
            </div>

            {(activeStep.key === "mother" || activeStep.key === "father") &&
              (() => {
                const idx = activeStep.key === "mother" ? 0 : 1;
                const role = idx === 0 ? "Mother" : "Father";
                const otherRole = idx === 0 ? "Father" : "Mother";
                const isPrimary = idx === primaryIndex;
                return (
                  <ParentSection
                    parent={parents[idx]}
                    index={idx}
                    role={role}
                    isHolder={isPrimary}
                    onChange={(field, value) => updateParentAt(idx, field, value)}
                    isFieldMissing={(field) => isFieldMissing(`parent:${idx}:${field}`)}
                    userId={userId}
                    documents={docsFor("parent", parents[idx].id)}
                    onDocumentsChange={(docs) => setDocsFor("parent", parents[idx].id, docs)}
                    // Only the parent who ISN'T filling the form gets the
                    // copy-from shortcuts — there's nothing above them to copy.
                    primaryRole={isPrimary ? null : otherRole}
                    sameAsAbove={sameAsPrimaryGeneral}
                    onToggleSameAsAbove={setSameAsPrimaryGeneral}
                    schoolPriorities={schoolPriorities}
                    onSchoolPrioritiesChange={setSchoolPriorities}
                    schoolPrioritiesError={isFieldMissing("family:school_priorities")}
                    comfortableFeeRange={comfortableFeeRange}
                    onComfortableFeeRangeChange={setComfortableFeeRange}
                    comfortableFeeRangeError={isFieldMissing("family:comfortable_fee_range")}
                    parentWorkLocation={parentWorkLocation}
                    onParentWorkLocationChange={setParentWorkLocation}
                  />
                );
              })()}

            {activeStep.key === "budget" && (
              <BudgetSection
                budgetStatus={budgetStatus}
                onChange={setBudgetStatus}
                error={isFieldMissing("family:budget_status")}
                comfortableFeeRange={comfortableFeeRange}
                onGoToFeeRange={() => {
                  openCard(primaryIndex);
                  setScrollTarget("family-comfortable_fee_range");
                }}
                housingBudget={housingBudget}
                onHousingBudgetChange={setHousingBudget}
                preferredLivingArea={preferredLivingArea}
                onPreferredLivingAreaChange={setPreferredLivingArea}
                costGuidance={costGuidance}
                onCostGuidanceChange={setCostGuidance}
              />
            )}

            {activeStep.key.startsWith("child-") &&
              (() => {
                const i = activeStep.childIndex;
                const child = children[i];
                const school = currentSchools[i];
                const displayName = displayNameForChild(child) || `Child ${i + 1}`;
                const childMissing = (field) => isFieldMissing(`child:${i}:${field}`);
                const schoolMissing = (field) => isFieldMissing(`school:${i}:${field}`);

                // NAV-02 (September 2026 change request) — "same school as a
                // sibling" only makes sense from child two onwards, and only
                // once there's actually another child to point at.
                const siblingOptions = i >= 1 ? siblingOptionsFor(i) : [];
                const sameSchoolSiblingIndex = i >= 1 ? sameSchoolSiblingIndexFor(i) : -1;
                const isSameAsSibling = sameSchoolSiblingIndex !== -1 && siblingOptions.some((o) => o.idx === sameSchoolSiblingIndex);
                const sameSchoolSiblingName = isSameAsSibling
                  ? displayNameForChild(children[sameSchoolSiblingIndex]) || `Child ${sameSchoolSiblingIndex + 1}`
                  : "";
                const schoolSectionCollapsed = isSameAsSibling && !expandedSchoolEdit[i];

                // achievement_certificate and sen_supporting_documents render inline
                // (next to Sports achievements / the SEN question) instead of in the
                // main Documents checklist below — see the two DocumentChecklist
                // instances further down in this component.
                // leaving_certificate also renders on its own, directly under the
                // Yes/No question that governs it, rather than sitting wherever it
                // falls in the main checklist — same reasoning as achievement
                // certificates and SEN documents below.
                const INLINE_DOC_KEYS = [
                  "achievement_certificate",
                  "sen_supporting_documents",
                  "psychology_report",
                  "leaving_certificate",
                ];
                const childDocTypes = CHILD_DOCUMENT_TYPES.filter((d) => !INLINE_DOC_KEYS.includes(d.key));
                const achievementDocTypes = CHILD_DOCUMENT_TYPES.filter((d) => d.key === "achievement_certificate");
                const senDocTypes = CHILD_DOCUMENT_TYPES.filter((d) => d.key === "sen_supporting_documents");
                // SEN-03 — kept its old "psychology_report" key (DU-03 just moves
                // where this slot renders, from the main checklist into this
                // section), so any file a family already uploaded there is still
                // right here, unchanged.
                const senGeneralDocTypes = CHILD_DOCUMENT_TYPES.filter((d) => d.key === "psychology_report");
                const leavingCertDocTypes = CHILD_DOCUMENT_TYPES.filter((d) => d.key === "leaving_certificate");

                return (
                  <>
                    <FormSection title={`${displayName}'s general info`} description="As it appears on their passport.">
                      <div className="hh-field-full">
                        <AvatarUpload
                          userId={userId}
                          ownerType="child"
                          ownerId={child.id}
                          name={displayNameForChild(child)}
                          fallback={`Child ${i + 1}`}
                          isChild
                          documents={docsFor("child", child.id)}
                          onDocumentsChange={(docs) => setDocsFor("child", child.id, docs)}
                        />
                      </div>
                      <FormField
                        label="First name (as in passport)"
                        required
                        fieldKey={`child-${i}-first_name`}
                        value={child.first_name}
                        onChange={(v) => updateChildAt(i, "first_name", v)}
                      />
                      <FormField
                        label="Middle name (as in passport)"
                        fieldKey={`child-${i}-middle_name`}
                        value={child.middle_name}
                        onChange={(v) => updateChildAt(i, "middle_name", v)}
                      />
                      <FormField
                        label="Last name (as in passport)"
                        required
                        fieldKey={`child-${i}-last_name`}
                        value={child.last_name}
                        onChange={(v) => updateChildAt(i, "last_name", v)}
                      />
                      <FormField
                        label="Preferred name"
                        hint="What they're actually called day to day, if different."
                        fieldKey={`child-${i}-preferred_name`}
                        value={child.preferred_name}
                        onChange={(v) => updateChildAt(i, "preferred_name", v)}
                      />
                      <StrictSelect
                        label="Gender"
                        required
                        fieldKey={`child-${i}-gender`}
                        value={child.gender}
                        onChange={(v) => updateChildAt(i, "gender", v)}
                        options={["Male", "Female"]}
                        placeholder="Select an option"
                      />
                      <DateField
                        label="Date of birth"
                        required
                        error={childMissing("date_of_birth")}
                        fieldKey={`child-${i}-date_of_birth`}
                        value={child.date_of_birth}
                        onChange={(v) => updateChildAt(i, "date_of_birth", v)}
                      />
                      <div className="hh-field">
                        <label>Age</label>
                        <input type="text" value={formatAgeFromDob(child.date_of_birth) || "—"} disabled readOnly />
                      </div>
                      <FormSelect
                        label="Nationality"
                        required
                        error={childMissing("nationality")}
                        fieldKey={`child-${i}-nationality`}
                        value={child.nationality}
                        onChange={(v) => updateChildAt(i, "nationality", v)}
                        options={NATIONALITIES}
                        placeholder="Select nationality"
                      />
                      <FormSelect
                        label="Religion"
                        fieldKey={`child-${i}-religion`}
                        value={child.religion}
                        onChange={(v) => updateChildAt(i, "religion", v)}
                        options={RELIGIONS}
                        placeholder="Select religion"
                      />
                      <MultiSelect
                        label="Academic year of entry"
                        required
                        fieldKey={`child-${i}-academic_years_of_entry`}
                        value={child.academic_years_of_entry}
                        onChange={(v) => updateChildAt(i, "academic_years_of_entry", v)}
                        options={ACADEMIC_YEARS}
                        hint="Select every year you'd be able to move — families are often flexible about timing."
                      />
                      {(() => {
                        const suggestion = suggestedYearGroupLabel(
                          child.date_of_birth,
                          earliestAcademicYear(child.academic_years_of_entry),
                          yearGroupCutoff.month,
                          yearGroupCutoff.day
                        );
                        const mismatch =
                          suggestion && child.year_group_applying_for && child.year_group_applying_for !== suggestion;
                        return (
                          <>
                            <div className="hh-field hh-field-full">
                              <FormSelect
                                label="Year group applying for"
                                required
                                fieldKey={`child-${i}-year_group_applying_for`}
                                value={child.year_group_applying_for}
                                onChange={(v) => updateChildAt(i, "year_group_applying_for", v)}
                                options={YEAR_GROUPS}
                                placeholder="Select an option"
                                hint={
                                  suggestion
                                    ? `Based on your child's date of birth, we would expect ${suggestion}.`
                                    : "Add a date of birth and academic year of entry above for a suggestion."
                                }
                              />
                            </div>
                            {mismatch && (
                              <div className="hh-field hh-field-full">
                                <label>Please tell us why you are applying for this year group</label>
                                <textarea
                                  rows={2}
                                  value={child.year_group_reason}
                                  onChange={(e) => updateChildAt(i, "year_group_reason", e.target.value)}
                                />
                              </div>
                            )}
                          </>
                        );
                      })()}
                      <MultiSelect
                        label="Term"
                        required
                        fieldKey={`child-${i}-terms`}
                        value={child.terms}
                        onChange={(v) => updateChildAt(i, "terms", v)}
                        options={TERMS_WITH_FLEXIBLE}
                        hint="Select every term that would work, or 'We are flexible' if any of them would."
                      />
                      <AddressBlock
                        label="Where does this child live?"
                        hint="Tick whichever parent they live with, or write a different address if it's neither — with family, or at a boarding school."
                        fieldKey={`child-${i}-address`}
                        sameAs={child.address_same_as}
                        address={child.address}
                        sources={
                          primaryIndex === 1
                            ? [
                                { key: "father", label: "Same as Father's address" },
                                { key: "mother", label: "Same as Mother's address" },
                              ]
                            : [
                                { key: "mother", label: "Same as Mother's address" },
                                { key: "father", label: "Same as Father's address" },
                              ]
                        }
                        onChangeSameAs={(v) => updateChildAt(i, "address_same_as", v)}
                        onChangeAddress={(v) => updateChildAt(i, "address", v)}
                      />
                      <div className="hh-field hh-field-full">
                        <label>Anything you think we should know about your child</label>
                        <textarea
                          rows={2}
                          placeholder="For example friendships, whether they find large crowds difficult, or family circumstances such as parents living separately. Nothing here is shared with a school without your permission."
                          value={child.notes}
                          onChange={(e) => updateChildAt(i, "notes", e.target.value)}
                        />
                      </div>
                    </FormSection>

                    <FormSection
                      title="Additional info"
                      description="Language, wellbeing, and anything the school should know ahead of time."
                    >
                      <FormSelect
                        label="First language"
                        value={child.first_language}
                        onChange={(v) => updateChildAt(i, "first_language", v)}
                        options={LANGUAGES}
                        placeholder="Select language"
                      />
                      <FormSelect
                        label="Second language"
                        value={child.second_language}
                        onChange={(v) => updateChildAt(i, "second_language", v)}
                        options={LANGUAGES}
                        placeholder="Select language"
                      />
                      <YesNoSelect
                        label="Is English the child's first and home-spoken language?"
                        required
                        fieldKey={`child-${i}-english_first_home_language`}
                        value={child.english_first_home_language}
                        onChange={(v) => updateChildAt(i, "english_first_home_language", v)}
                      />
                      <FormSelect
                        label="What is your child's proficiency in English?"
                        required
                        fieldKey={`child-${i}-english_proficiency`}
                        value={child.english_proficiency}
                        onChange={(v) => updateChildAt(i, "english_proficiency", v)}
                        options={ENGLISH_PROFICIENCY_LEVELS}
                        placeholder="Select an option"
                      />
                      <div className="hh-field hh-field-full">
                        <label>Sports, hobbies and interests</label>
                        <textarea
                          rows={2}
                          value={child.sports_hobbies_interests}
                          onChange={(e) => updateChildAt(i, "sports_hobbies_interests", e.target.value)}
                        />
                      </div>
                      <div className="hh-field hh-field-full">
                        <label>Sports achievements</label>
                        <textarea
                          rows={2}
                          placeholder="Trophies, selections, competitions — anything worth mentioning."
                          value={child.sports_achievements}
                          onChange={(e) => updateChildAt(i, "sports_achievements", e.target.value)}
                        />
                      </div>
                      <div className="hh-field-full">
                        <DocumentChecklist
                          title="Supporting documents for sports achievements"
                          userId={userId}
                          ownerType="child"
                          ownerId={child.id}
                          docTypes={achievementDocTypes}
                          documents={docsFor("child", child.id)}
                          onDocumentsChange={(docs) => setDocsFor("child", child.id, docs)}
                          fieldKeyPrefix={`child-doc-${i}`}
                          personLabel={displayName}
                        />
                      </div>

                      <YesNoSelect
                        label="Is your child on the Gifted or Talented Register?"
                        required
                        fieldKey={`child-${i}-gifted_talented`}
                        value={child.gifted_talented}
                        onChange={(v) => updateChildAt(i, "gifted_talented", v)}
                      />

                      <div className="hh-field hh-field-full">
                        <label>Does your child have any allergies or health conditions? *</label>
                        <textarea
                          rows={2}
                          placeholder='Please type "No" if there are no allergies or health conditions.'
                          value={child.medical_inclusion_needs}
                          onChange={(e) => updateChildAt(i, "medical_inclusion_needs", e.target.value)}
                        />
                      </div>
                    </FormSection>

                    {/* Section 5, "SEN and inclusion" (September 2026 change
                        request) — its own clearly headed section rather than
                        sitting inside Additional info, "so families find it
                        calm and unhurried" per the document. SEN-01 is the
                        first question of what will be several. */}
                    <FormSection
                      title="SEN and inclusion"
                      description="These questions help us find a school that will genuinely support your child. There are no wrong answers, and nothing here is shared with a school without your written permission."
                    >
                      <StrictSelect
                        label="Does your child have any identified special educational needs, learning difficulties or a diagnosis?"
                        required
                        fieldKey={`child-${i}-sen_status`}
                        value={child.sen_status}
                        onChange={(v) => updateChildAt(i, "sen_status", v)}
                        options={SEN_STATUS_OPTIONS}
                        placeholder="Select an option"
                      />

                      {child.sen_status === "No formal diagnosis, but we have concerns" && (
                        <div className="hh-field hh-field-full" data-field-key={`child-${i}-sen_concerns_description`}>
                          <label>Please tell us what has been worrying you</label>
                          <textarea
                            rows={2}
                            value={child.sen_concerns_description}
                            onChange={(e) => updateChildAt(i, "sen_concerns_description", e.target.value)}
                          />
                        </div>
                      )}

                      {child.sen_status === "Yes, formally identified or diagnosed" && (
                        <>
                          <MultiSelect
                            label="Which of these apply?"
                            fieldKey={`child-${i}-sen_diagnoses`}
                            value={child.sen_diagnoses}
                            onChange={(v) => updateChildAt(i, "sen_diagnoses", v)}
                            options={SEN_DIAGNOSIS_OPTIONS}
                            hint="Select every one that applies — it's common for more than one to."
                          />
                          {(child.sen_diagnoses || []).includes("Other, please tell us") && (
                            <div className="hh-field hh-field-full" data-field-key={`child-${i}-sen_diagnosis_other`}>
                              <label>Please tell us more</label>
                              <textarea
                                rows={2}
                                value={child.sen_diagnosis_other}
                                onChange={(e) => updateChildAt(i, "sen_diagnosis_other", e.target.value)}
                              />
                            </div>
                          )}
                        </>
                      )}

                      <MultiSelect
                        label="Do you have any of the following documents?"
                        fieldKey={`child-${i}-sen_documents_held`}
                        value={child.sen_documents_held}
                        onChange={(v) => updateChildAt(i, "sen_documents_held", v)}
                        options={SEN_DOCUMENT_OPTIONS}
                        exclusiveOption={SEN_DOCUMENTS_NONE_OPTION}
                      />

                      {senNeedsSupportingDocs(child.sen_status) && (
                        <div className="hh-field-full">
                          <DocumentChecklist
                            title="Supporting documents for Special Education Needs"
                            userId={userId}
                            ownerType="child"
                            ownerId={child.id}
                            docTypes={senDocTypes}
                            documents={docsFor("child", child.id)}
                            onDocumentsChange={(docs) => setDocsFor("child", child.id, docs)}
                            fieldKeyPrefix={`child-doc-${i}`}
                            personLabel={displayName}
                          />
                        </div>
                      )}

                      {/* SEN-03 — a general, always-available upload slot for
                          this section, not gated on the SEN-01 answer: a
                          family can have something worth sharing (an old
                          report, a school letter) regardless of how they
                          answered above. DU-03 moved this here from the main
                          Documents checklist further down (same underlying
                          "psychology_report" slot, so nothing already
                          uploaded is lost). */}
                      <div className="hh-field-full">
                        <DocumentChecklist
                          userId={userId}
                          ownerType="child"
                          ownerId={child.id}
                          docTypes={senGeneralDocTypes}
                          documents={docsFor("child", child.id)}
                          onDocumentsChange={(docs) => setDocsFor("child", child.id, docs)}
                          fieldKeyPrefix={`child-doc-${i}`}
                          personLabel={displayName}
                        />
                      </div>

                      <StrictSelect
                        label="Has your child ever been taken out of class for intervention or support sessions?"
                        required
                        error={childMissing("sen_intervention_status")}
                        fieldKey={`child-${i}-sen_intervention_status`}
                        value={child.sen_intervention_status}
                        onChange={(v) => updateChildAt(i, "sen_intervention_status", v)}
                        options={SEN_INTERVENTION_STATUS_OPTIONS}
                        placeholder="Select an option"
                      />

                      {senHasIntervention(child.sen_intervention_status) && (
                        <>
                          <MultiSelect
                            label="If yes, what kind of sessions?"
                            fieldKey={`child-${i}-sen_intervention_types`}
                            value={child.sen_intervention_types}
                            onChange={(v) => updateChildAt(i, "sen_intervention_types", v)}
                            options={SEN_INTERVENTION_TYPE_OPTIONS}
                          />
                          {(child.sen_intervention_types || []).includes(SEN_INTERVENTION_OTHER_OPTION) && (
                            <div className="hh-field hh-field-full" data-field-key={`child-${i}-sen_intervention_other`}>
                              <label>Please tell us more</label>
                              <textarea
                                rows={2}
                                value={child.sen_intervention_other}
                                onChange={(e) => updateChildAt(i, "sen_intervention_other", e.target.value)}
                              />
                            </div>
                          )}
                        </>
                      )}

                      {(child.sen_intervention_types || []).length > 0 && (
                        <StrictSelect
                          label="How often do these sessions happen?"
                          fieldKey={`child-${i}-sen_intervention_frequency`}
                          value={child.sen_intervention_frequency}
                          onChange={(v) => updateChildAt(i, "sen_intervention_frequency", v)}
                          options={SEN_INTERVENTION_FREQUENCY_OPTIONS}
                          placeholder="Select an option"
                        />
                      )}

                      <StrictSelect
                        label="Does your child require, or currently have, a Learning Support Assistant or shadow teacher?"
                        required
                        error={childMissing("sen_lsa_status")}
                        fieldKey={`child-${i}-sen_lsa_status`}
                        value={child.sen_lsa_status}
                        onChange={(v) => updateChildAt(i, "sen_lsa_status", v)}
                        options={SEN_LSA_OPTIONS}
                        placeholder="Select an option"
                      />
                      {child.sen_lsa_status === SEN_LSA_NOT_SURE_OPTION && (
                        <p className="hh-hint-text hh-field-full">
                          A Learning Support Assistant, sometimes called a shadow teacher, is an adult who works
                          alongside a child in class — either one-to-one or shared with a few children — to help
                          them access lessons and stay included with their classmates. It is completely fine not
                          to know whether your child needs one yet; we can help you work this out.
                        </p>
                      )}

                      <MultiSelect
                        label="Have any of these words or phrases ever been used to describe your child, by a teacher, doctor, therapist, family member or anyone else?"
                        fieldKey={`child-${i}-sen_descriptive_words`}
                        value={child.sen_descriptive_words}
                        onChange={(v) => updateChildAt(i, "sen_descriptive_words", v)}
                        options={SEN_DESCRIPTIVE_WORD_OPTIONS}
                        exclusiveOption={SEN_DESCRIPTIVE_WORDS_NONE_OPTION}
                        layout="grid"
                        hint="Select all that apply, even if it was said casually or a long time ago."
                      />

                      <MultiSelect
                        label="Is your child currently working with any professionals outside school?"
                        fieldKey={`child-${i}-sen_outside_professionals`}
                        value={child.sen_outside_professionals}
                        onChange={(v) => updateChildAt(i, "sen_outside_professionals", v)}
                        options={SEN_OUTSIDE_PROFESSIONAL_OPTIONS}
                      />
                      {(child.sen_outside_professionals || []).includes(SEN_OUTSIDE_PROFESSIONALS_OTHER_OPTION) && (
                        <div className="hh-field hh-field-full" data-field-key={`child-${i}-sen_outside_professionals_other`}>
                          <label>Please tell us more</label>
                          <textarea
                            rows={2}
                            value={child.sen_outside_professionals_other}
                            onChange={(e) => updateChildAt(i, "sen_outside_professionals_other", e.target.value)}
                          />
                        </div>
                      )}

                      <StrictSelect
                        label="Do you want your child's support needs disclosed to schools at application stage?"
                        fieldKey={`child-${i}-sen_disclosure_preference`}
                        value={child.sen_disclosure_preference}
                        onChange={(v) => updateChildAt(i, "sen_disclosure_preference", v)}
                        options={SEN_DISCLOSURE_OPTIONS}
                        placeholder="Select an option"
                      />

                      <div className="hh-field hh-field-full" data-field-key={`child-${i}-sen_additional_notes`}>
                        <label>Is there anything about your child's needs you have never written down before, but want us to know?</label>
                        <textarea
                          rows={4}
                          value={child.sen_additional_notes}
                          onChange={(e) => updateChildAt(i, "sen_additional_notes", e.target.value)}
                        />
                      </div>
                    </FormSection>

                    <FormSection title="Current school" description="Their school right now, not the one they're applying to.">
                      {/* NAV-02 (September 2026 change request): "From child two
                          onwards, add a tick box... Ticking it reveals a short
                          list of the siblings already added, by name." Only one
                          sibling on the form yet? Skip the picker and just name
                          them. */}
                      {i >= 1 && (
                        <div className="hh-field-full same-as-toggle" data-field-key={`school-${i}-same_as_sibling`}>
                          <label className="hh-checkbox-label">
                            <input
                              type="checkbox"
                              checked={isSameAsSibling}
                              disabled={siblingOptions.length === 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  handleSameSchoolToggle(i, siblingOptions[0].idx);
                                } else {
                                  clearSameSchoolAsSibling(i);
                                }
                              }}
                            />
                            Attends the same school as a sibling
                          </label>

                          {isSameAsSibling && siblingOptions.length > 1 && (
                            <div className="hh-field same-as-sibling-picker">
                              <select value={sameSchoolSiblingIndex} onChange={(e) => handleSameSchoolToggle(i, Number(e.target.value))}>
                                {siblingOptions.map((opt) => (
                                  <option key={opt.idx} value={opt.idx}>
                                    {opt.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {isSameAsSibling && (
                            <p className="hh-hint-text">
                              Using {sameSchoolSiblingName}'s current school details.{" "}
                              {schoolSectionCollapsed ? (
                                <button
                                  type="button"
                                  className="hh-link-btn"
                                  onClick={() => setExpandedSchoolEdit((prev) => ({ ...prev, [i]: true }))}
                                >
                                  Edit
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="hh-link-btn"
                                  onClick={() => setExpandedSchoolEdit((prev) => ({ ...prev, [i]: false }))}
                                >
                                  Collapse
                                </button>
                              )}
                            </p>
                          )}
                        </div>
                      )}

                      {schoolSectionCollapsed ? (
                        <p className="hh-field-full hh-hint-text">
                          {school.school_name || "School details"} — copied from {sameSchoolSiblingName}. Year group,
                          term and year of entry are still set separately for {displayName}.
                        </p>
                      ) : (
                        <>
                      <FormField
                        label="Current school"
                        required
                        error={schoolMissing("school_name")}
                        fieldKey={`school-${i}-school_name`}
                        value={school.school_name}
                        onChange={(v) => updateSchoolAt(i, "school_name", v)}
                      />
                      <FormSelect
                        label="Current school year group of leaving"
                        required
                        fieldKey={`school-${i}-year_group_of_leaving`}
                        value={school.year_group_of_leaving}
                        onChange={(v) => updateSchoolAt(i, "year_group_of_leaving", v)}
                        options={YEAR_GROUPS}
                        placeholder="Select an option"
                      />
                      <FormSelect
                        label="Current school curriculum"
                        required
                        fieldKey={`school-${i}-curriculum`}
                        value={school.curriculum}
                        onChange={(v) => updateSchoolAt(i, "curriculum", v)}
                        options={curriculumOptions}
                        placeholder="Select an option"
                      />
                      <FormSelect
                        label="Reason for leaving current school"
                        required
                        fieldKey={`school-${i}-reason_for_leaving`}
                        value={school.reason_for_leaving}
                        onChange={(v) => updateSchoolAt(i, "reason_for_leaving", v)}
                        options={REASONS_FOR_LEAVING}
                        placeholder="Select an option"
                      />
                      {REASONS_FOR_LEAVING_WITH_DETAILS.includes(school.reason_for_leaving) && (
                        <div className="hh-field hh-field-full">
                          <label>Please tell us a little more</label>
                          <textarea
                            rows={2}
                            value={school.reason_for_leaving_details}
                            onChange={(e) => updateSchoolAt(i, "reason_for_leaving_details", e.target.value)}
                          />
                        </div>
                      )}

                      <StrictSelect
                        label="Has your child had any gaps in their education?"
                        fieldKey={`school-${i}-education_gaps_status`}
                        value={school.education_gaps_status}
                        onChange={(v) => updateSchoolAt(i, "education_gaps_status", v)}
                        options={EDUCATION_GAPS_OPTIONS}
                        placeholder="Select an option"
                      />
                      {school.education_gaps_status === "Yes" && (
                        <div className="hh-field hh-field-full" data-field-key={`school-${i}-education_gaps_details`}>
                          <label>Roughly when, and for how long?</label>
                          <textarea
                            rows={2}
                            value={school.education_gaps_details}
                            onChange={(e) => updateSchoolAt(i, "education_gaps_details", e.target.value)}
                          />
                        </div>
                      )}

                      <StrictSelect
                        label="Has your child ever repeated a year, or been asked to?"
                        fieldKey={`school-${i}-repeated_year_status`}
                        value={school.repeated_year_status}
                        onChange={(v) => updateSchoolAt(i, "repeated_year_status", v)}
                        options={REPEATED_YEAR_OPTIONS}
                        placeholder="Select an option"
                      />
                      {repeatedYearNeedsDetails(school.repeated_year_status) && (
                        <div className="hh-field hh-field-full" data-field-key={`school-${i}-repeated_year_details`}>
                          <label>Please tell us a little more</label>
                          <textarea
                            rows={2}
                            value={school.repeated_year_details}
                            onChange={(e) => updateSchoolAt(i, "repeated_year_details", e.target.value)}
                          />
                        </div>
                      )}

                      <StrictSelect
                        label="Has your child ever been refused a place at a school, or asked to leave one?"
                        fieldKey={`school-${i}-school_refusal_status`}
                        value={school.school_refusal_status}
                        onChange={(v) => updateSchoolAt(i, "school_refusal_status", v)}
                        options={SCHOOL_REFUSAL_OPTIONS}
                        placeholder="Select an option"
                        hint="This will not count against your child. Knowing early means we can approach the right schools in the right way."
                      />
                      {schoolRefusalNeedsDetails(school.school_refusal_status) && (
                        <div className="hh-field hh-field-full" data-field-key={`school-${i}-school_refusal_details`}>
                          <label>Please tell us a little more</label>
                          <textarea
                            rows={2}
                            value={school.school_refusal_details}
                            onChange={(e) => updateSchoolAt(i, "school_refusal_details", e.target.value)}
                          />
                        </div>
                      )}

                      <FormField
                        label="Contact email at current school"
                        type="email"
                        hint="Used for the confidential reference request."
                        value={school.contact_email}
                        onChange={(v) => updateSchoolAt(i, "contact_email", v)}
                      />
                      <FormField
                        label="Contact name at current school"
                        hint="Who to address the reference request to, if known."
                        value={school.contact_name}
                        onChange={(v) => updateSchoolAt(i, "contact_name", v)}
                      />
                      <PhoneField
                        label="Contact phone at current school"
                        value={school.contact_phone}
                        onChange={(v) => updateSchoolAt(i, "contact_phone", v)}
                      />
                      <div className="hh-field hh-field-full">
                        <label>School address</label>
                        <textarea
                          rows={2}
                          value={school.school_address}
                          onChange={(e) => updateSchoolAt(i, "school_address", e.target.value)}
                        />
                      </div>
                        </>
                      )}
                    </FormSection>

                    <FormSection
                      title="Documents"
                      description="Upload as soon as the application is saved once — each file uploads immediately, so nothing here is lost by navigating away."
                    >
                      <div className="hh-field-full">
                        <DocumentChecklist
                          userId={userId}
                          ownerType="child"
                          ownerId={child.id}
                          docTypes={childDocTypes}
                          documents={docsFor("child", child.id)}
                          onDocumentsChange={(docs) => setDocsFor("child", child.id, docs)}
                          fieldKeyPrefix={`child-doc-${i}`}
                          personLabel={displayName}
                        />
                      </div>
                      <YesNoSelect
                        label="Do you have a transfer / leaving certificate from their current school?"
                        hint="If not yet, that's fine — the upload only appears once you say yes."
                        fieldKey={`child-${i}-has_transfer_certificate`}
                        value={child.has_transfer_certificate}
                        onChange={(v) => updateChildAt(i, "has_transfer_certificate", v)}
                      />
                      <div />
                      {child.has_transfer_certificate === "Yes" && (
                        <div className="hh-field-full">
                          <DocumentChecklist
                            userId={userId}
                            ownerType="child"
                            ownerId={child.id}
                            docTypes={leavingCertDocTypes}
                            documents={docsFor("child", child.id)}
                            onDocumentsChange={(docs) => setDocsFor("child", child.id, docs)}
                            fieldKeyPrefix={`child-doc-${i}`}
                            personLabel={displayName}
                          />
                        </div>
                      )}
                      <StrictSelect
                        label="Do you understand the Transfer Certificate and attestation process?"
                        fieldKey={`child-${i}-transfer_certificate_understanding`}
                        value={child.transfer_certificate_understanding}
                        onChange={(v) => updateChildAt(i, "transfer_certificate_understanding", v)}
                        options={["Yes, fully", "Roughly", "No, please explain it", "Not applicable"]}
                      />
                    </FormSection>
                  </>
                );
              })()}
          </>
        )}
      </div>

      <div className="application-form-footer">
        <span className="application-form-footer-hint">
          {missingItems.length
            ? `${missingItems.length} required field${missingItems.length > 1 ? "s" : ""} left`
            : "Everything required is filled in"}
          {autosaveStatus === "saving" && " · Saving…"}
          {autosaveStatus === "saved" && " · All changes saved"}
          {autosaveStatus === "error" && " · Couldn't autosave — it'll try again as soon as you change something else"}
        </span>
        <div className="application-form-footer-actions">
          {!showingList && activeStep.key.startsWith("child-") ? (
            // NAV-01: a clear, standalone choice at the foot of each child
            // page, rather than sending the family back to the overview to
            // find "add another child" or Submit for themselves.
            <>
              <button
                className="hh-btn-secondary"
                type="button"
                onClick={handleAddAnotherChildFromCard}
                disabled={saving || submitting || children.length >= MAX_CHILDREN}
              >
                {saving ? "Saving..." : "Add another child"}
              </button>
              <button className="hh-btn-primary" type="submit" disabled={saving || submitting}>
                {submitting ? "Submitting..." : "Submit application"}
              </button>
            </>
          ) : !showingList ? (
            <button className="hh-btn-primary" type="button" onClick={handleFooterNext} disabled={saving || submitting}>
              {saving ? "Saving..." : "Next"}
            </button>
          ) : (
            <button className="hh-btn-primary" type="submit" disabled={saving || submitting}>
              {submitting ? "Submitting..." : "Submit application"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

// The default Application-tab view: a "Who's creating this account?" toggle,
// the required home address, a Mother card and a Father card, a "how many
// children" stepper, then one card per child — each card shows a live
// progress bar and opens that person's full section (fields + their
// documents, all on the same page — nothing about documents lives
// separately) when "Edit" is clicked.
function CardListView({
  familyId,
  family,
  onFamilyChange,
  parents,
  accountHolderRole,
  setAccountHolderRole,
  primaryIndex,
  children,
  onChildCountChange,
  pendingRemoveChild,
  removingChild,
  removeError,
  onConfirmRemoveChild,
  onCancelRemoveChild,
  stepBreakdown,
  onEditCard,
  steps,
}) {
  const budgetIndex = steps.findIndex((s) => s.key === "budget");
  return (
    <div className="card-list-view">
      <MoveDetailsCard familyId={familyId} family={family} onFamilyChange={onFamilyChange} />

      <FormSection title="Parents" description="Tell us who's who, and who's actually filling this in.">
        <div className="hh-field-full account-holder-picker">
          <label>Who is creating this account? *</label>
          <div className="account-holder-toggle">
            <button
              type="button"
              className={"account-holder-btn" + (accountHolderRole === "Mother" ? " is-active" : "")}
              onClick={() => setAccountHolderRole("Mother")}
            >
              Mother
            </button>
            <button
              type="button"
              className={"account-holder-btn" + (accountHolderRole === "Father" ? " is-active" : "")}
              onClick={() => setAccountHolderRole("Father")}
            >
              Father
            </button>
          </div>
        </div>
      </FormSection>

      <div className="card-list-group">
        <h3 className="card-list-heading">Step 1 — Parents</h3>
        {/* Whoever ticked "who is creating this account" is shown first — it's
            their form, so their card shouldn't sit second. The two sit side by
            side rather than stacked, since they're a pair. */}
        <div className="card-list-pair">
          {[primaryIndex, 1 - primaryIndex].map((idx, position) => {
            const role = idx === 0 ? "Mother" : "Father";
            const otherRole = idx === 0 ? "Father" : "Mother";
            const stepKey = idx === 0 ? "mother" : "father";
            const pct = stepBreakdown[stepKey]?.pct ?? 0;
            return (
              <StepCard
                key={role}
                index={position + 1}
                title={role}
                subtitle={parents[idx].full_name}
                pct={pct}
                emptyHint={
                  position === 1 && pct === 0 ? `Use "Same as ${otherRole}" to copy shared details.` : null
                }
                onEdit={() => onEditCard(idx)}
              />
            );
          })}
        </div>
      </div>

      {/* Section 3, "Budget and relocation planning" (September 2026 change
          request) — its own card, sitting after the account holder details
          and before the children, per the document. */}
      <div className="card-list-group">
        <h3 className="card-list-heading">Budget and relocation planning</h3>
        <StepCard
          index={3}
          title="Budget"
          subtitle="Money and moving plans"
          pct={stepBreakdown.budget?.pct ?? 0}
          onEdit={() => onEditCard(budgetIndex)}
        />
      </div>

      {/* AH-07 (September 2026 change request): "Your children" only appears
          once the account holder has actually entered their own name — not
          once BOTH parents exist, since plenty of families only ever have
          one parent to add and shouldn't be blocked from reaching this
          section. Once any children exist (a returning family), it stays
          visible regardless, so nobody's already-entered children vanish if
          a name field is ever cleared by mistake. */}
      {!(parents[primaryIndex]?.full_name?.trim() || children.length > 0) && (
        <p className="hh-hint-text card-list-children-locked-hint">
          Add your own name above to add children.
        </p>
      )}
      {(parents[primaryIndex]?.full_name?.trim() || children.length > 0) && (
      <>
      <div className="card-list-group">
        <h3 className="card-list-heading">Your children</h3>
        <div className="child-count-block">
          <p className="hh-hint-text">A block is created below for each child.</p>
          <div className="child-count-stepper">
            <button
              type="button"
              onClick={() => onChildCountChange(children.length - 1)}
              disabled={children.length <= 0 || removingChild}
              aria-label="Fewer children"
            >
              −
            </button>
            <span>{children.length}</span>
            <button
              type="button"
              onClick={() => onChildCountChange(children.length + 1)}
              disabled={children.length >= MAX_CHILDREN}
              aria-label="More children"
            >
              +
            </button>
          </div>
        </div>
        {pendingRemoveChild && (
          <div className="child-remove-confirm">
            <p>
              Remove {pendingRemoveChild.name}'s application? Their saved info, current school details, and any uploaded
              documents will be permanently deleted.
            </p>
            {removeError && <span className="hh-error-text">{removeError}</span>}
            <div className="child-remove-confirm-actions">
              <button type="button" className="child-remove-cancel-btn" onClick={onCancelRemoveChild} disabled={removingChild}>
                Cancel
              </button>
              <button type="button" className="child-remove-btn" onClick={onConfirmRemoveChild} disabled={removingChild}>
                {removingChild ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card-list-group">
        <h3 className="card-list-heading">Children</h3>
        {children.map((child, i) => {
          const name = displayNameForChild(child);
          const breakdown = stepBreakdown[`child-${i}`];
          const childStepIndex = steps.findIndex((s) => s.key === `child-${i}`);
          return (
            <StepCard
              key={i}
              index={4 + i}
              title={children.length > 1 ? `Child ${i + 1}` : "Child"}
              subtitle={name}
              trailingText={child.year_group_applying_for || undefined}
              pct={breakdown?.pct ?? 0}
              onEdit={() => onEditCard(childStepIndex)}
            />
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}

// One row in the card list — a numbered badge, the person's role/label +
// name, a slim progress bar, and an Edit button that opens their full
// section. `trailingText`, when given, replaces the "N% complete" caption
// (used for a child's year group); `emptyHint` overrides it entirely for a
// card that's still essentially blank (Father, before anything's filled).
function StepCard({ index, title, subtitle, pct, trailingText, emptyHint, onEdit }) {
  const caption = emptyHint || trailingText || `${pct}% complete`;
  return (
    <div className="step-card">
      <div className="step-card-index">{index}</div>
      <div className="step-card-main">
        <div className="step-card-title">
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <div className="step-card-progress">
          <div className="step-card-bar">
            <div className="step-card-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
          </div>
          <span className="step-card-caption">{caption}</span>
        </div>
      </div>
      <button type="button" className="step-card-edit" onClick={onEdit}>
        {pct > 0 ? "Edit" : "Add"} ›
      </button>
    </div>
  );
}

// One parent's fields + their document checklist — both Mother and Father
// get the same passport/EID upload slots, since either one may need to
// submit ID documents for the application regardless of who the account
// holder is. The non-holder parent gets the exact same field layout so
// switching the toggle never re-shuffles the form, but only `full_name`
// carries a required asterisk for them — everything else, uploads
// included, is a bonus if the account holder chooses to fill it in.
//
// The parent who ISN'T filling the form gets two shortcuts, both copying from
// the one who is: a "Same as ..." toggle for the general-background fields
// (nationality, both languages), which lock while it's on since
// editing them independently while "synced" would be confusing about which
// value is real; and a tick on their address. `primaryRole` is the name of the
// parent being copied from, or null for the parent filling the form (there's
// nothing above them to copy).
function ParentSection({
  parent,
  index,
  role,
  isHolder,
  onChange,
  isFieldMissing,
  userId,
  documents,
  onDocumentsChange,
  missingDocKeys,
  primaryRole = null,
  sameAsAbove = false,
  onToggleSameAsAbove,
  schoolPriorities,
  onSchoolPrioritiesChange,
  schoolPrioritiesError,
  comfortableFeeRange,
  onComfortableFeeRangeChange,
  comfortableFeeRangeError,
  parentWorkLocation,
  onParentWorkLocationChange,
}) {
  const isSecondary = !!primaryRole;
  const synced = isSecondary && sameAsAbove;

  return (
    <FormSection
      title={isHolder ? `${role} — Account holder` : role}
      description={
        isHolder
          ? "This is you, the person filling in and submitting this application."
          : "Their details, as much as you have — only their full name is required."
      }
    >
      <div className="hh-field-full">
        <AvatarUpload
          userId={userId}
          ownerType="parent"
          ownerId={parent.id}
          name={parent.full_name}
          fallback={role}
          documents={documents}
          onDocumentsChange={onDocumentsChange}
        />
      </div>
      <FormField
        label="First name"
        required
        error={isFieldMissing("full_name")}
        fieldKey={`parent-${index}-first_name`}
        value={parent.first_name}
        onChange={(v) => onChange("first_name", v)}
      />
      <FormField
        label="Last name"
        required
        fieldKey={`parent-${index}-last_name`}
        value={parent.last_name}
        onChange={(v) => onChange("last_name", v)}
      />
      <FormField
        label="Email"
        type="email"
        required={isHolder}
        error={isFieldMissing("email")}
        fieldKey={`parent-${index}-email`}
        value={parent.email}
        onChange={(v) => onChange("email", v)}
      />
      <PhoneField
        label="Phone"
        required={isHolder}
        error={isFieldMissing("phone")}
        fieldKey={`parent-${index}-phone`}
        value={parent.phone}
        onChange={(v) => onChange("phone", v)}
      />

      {isSecondary && (
        <div className="hh-field-full same-as-toggle">
          <label className="hh-checkbox-label">
            <input
              type="checkbox"
              checked={sameAsAbove}
              onChange={(e) => onToggleSameAsAbove(e.target.checked)}
            />
            Same nationality &amp; languages as {primaryRole}
          </label>
        </div>
      )}

      <FormSelect
        label="Nationality"
        required={isHolder}
        error={isFieldMissing("nationality")}
        fieldKey={`parent-${index}-nationality`}
        value={parent.nationality}
        onChange={(v) => onChange("nationality", v)}
        pinned={PINNED_NATIONALITIES}
        options={NATIONALITIES_UNPINNED}
        placeholder="Select nationality"
        disabled={synced}
      />
      <FormSelect
        label="Religion"
        fieldKey={`parent-${index}-religion`}
        value={parent.religion}
        onChange={(v) => onChange("religion", v)}
        options={RELIGIONS}
        placeholder="Select religion"
      />
      <FormSelect
        label="First language"
        value={parent.first_language}
        onChange={(v) => onChange("first_language", v)}
        options={LANGUAGES}
        placeholder="Select language"
        disabled={synced}
      />
      <FormSelect
        label="Second language"
        value={parent.second_language}
        onChange={(v) => onChange("second_language", v)}
        options={LANGUAGES}
        placeholder="Select language"
        disabled={synced}
      />
      <FormField label="Employer name" value={parent.employer_name} onChange={(v) => onChange("employer_name", v)} />
      <FormField
        label="Job title"
        value={parent.occupation_designation}
        onChange={(v) => onChange("occupation_designation", v)}
      />

      <AddressBlock
        label={`${role}'s address`}
        required={isHolder}
        error={isFieldMissing("address")}
        hint={
          isSecondary
            ? `Tick the box if they live at the same address as ${primaryRole}.`
            : "The address you live at."
        }
        fieldKey={`parent-${index}-address`}
        sameAs={parent.address_same_as}
        address={parent.address}
        sources={isSecondary ? [{ key: primaryRole.toLowerCase(), label: `Same as ${primaryRole}'s address` }] : []}
        onChangeSameAs={(v) => onChange("address_same_as", v)}
        onChangeAddress={(v) => onChange("address", v)}
      />

      <div className="hh-field-full">
        <DocumentChecklist
          title={`${role} documents`}
          userId={userId}
          ownerType="parent"
          ownerId={parent.id}
          docTypes={PARENT_DOCUMENT_TYPES}
          documents={documents}
          onDocumentsChange={onDocumentsChange}
          missingDocKeys={missingDocKeys}
          fieldKeyPrefix={`parent-doc-${index}`}
          personLabel={parent.full_name || role}
        />
      </div>

      {/* AH-09 (September 2026 change request): asked once, under the
          account holder, after everything else — it's about the family as a
          whole, not this one person, which is also why it lives here rather
          than being duplicated onto the non-holder parent's page. */}
      {isHolder && (
        <>
          <RankingSelect
            label="What matters most to you in a school? Please rank your top five."
            required
            error={schoolPrioritiesError}
            fieldKey="family-school_priorities"
            value={schoolPriorities}
            onChange={onSchoolPrioritiesChange}
            options={SCHOOL_PRIORITY_OPTIONS}
            hint="We'll use this to help match your family to schools."
          />
          <StrictSelect
            label="What is your comfortable annual fee range, per child?"
            required
            error={comfortableFeeRangeError}
            fieldKey="family-comfortable_fee_range"
            value={comfortableFeeRange}
            onChange={onComfortableFeeRangeChange}
            options={FEE_RANGE_OPTIONS}
            placeholder="Select a fee range"
            hint="Per child, per year, excluding transport and uniform. This helps us shortlist realistically."
          />
          <FormField
            label="If one or both parents will be working, where will they be based?"
            fieldKey="family-parent_work_location"
            value={parentWorkLocation}
            onChange={onParentWorkLocationChange}
            hint="For example Dubai Media City, Abu Dhabi, or working from home. This helps us think about the school run."
          />
        </>
      )}
    </FormSection>
  );
}

// Section 3, "Budget and relocation planning" (September 2026 change
// request) — its own step between the account holder details and the
// children, since money is the topic families are most nervous about and
// the document specifically asks for it to be introduced gently, on its own,
// rather than folded into another section.
function BudgetSection({
  budgetStatus,
  onChange,
  error,
  comfortableFeeRange,
  onGoToFeeRange,
  housingBudget,
  onHousingBudgetChange,
  preferredLivingArea,
  onPreferredLivingAreaChange,
  costGuidance,
  onCostGuidanceChange,
}) {
  return (
    <FormSection
      title="Budget and relocation planning"
      description="These questions help us shortlist schools and areas that genuinely work for your family. If you are not sure yet, say so. Most families are not, and helping you work it out is part of what we do."
    >
      <StrictSelect
        label="Have you set a budget for the move?"
        required
        error={error}
        fieldKey="family-budget_status"
        value={budgetStatus}
        onChange={onChange}
        options={BUDGET_STATUS_OPTIONS}
        placeholder="Select an option"
      />

      {/* BUD-02: already asked and answered at AH-10 — this is a read-only
          reminder of that answer, not a second question, per the document
          ("Already captured at AH-10. Please do not ask it twice."). */}
      <div className="hh-field" data-field-key="family-comfortable_fee_range-reminder">
        <label>School fees budget</label>
        <input type="text" value={comfortableFeeRange || "Not answered yet"} disabled readOnly />
        <span className="hh-hint-text">
          From your earlier answer.{" "}
          <button type="button" className="hh-link-btn" onClick={onGoToFeeRange}>
            Change it
          </button>
        </span>
      </div>

      <StrictSelect
        label="What is your annual housing budget?"
        fieldKey="family-housing_budget"
        value={housingBudget}
        onChange={onHousingBudgetChange}
        options={HOUSING_BUDGET_OPTIONS}
        placeholder="Select an option"
        hint="Annual rent, as most homes here are paid yearly. This helps us suggest communities within reach of the schools you like."
      />

      <FormField
        label="Where are you thinking of living?"
        fieldKey="family-preferred_living_area"
        value={preferredLivingArea}
        onChange={onPreferredLivingAreaChange}
        hint="If you already have an area or community in mind, tell us. If not, leave it blank and we will help. Where you live and where your child goes to school are the same decision here."
      />

      <StrictSelect
        label="Would you like us to talk you through the typical cost of school and family life here?"
        fieldKey="family-cost_guidance_response"
        value={costGuidance}
        onChange={onCostGuidanceChange}
        options={COST_GUIDANCE_OPTIONS}
        placeholder="Select an option"
      />
    </FormSection>
  );
}
