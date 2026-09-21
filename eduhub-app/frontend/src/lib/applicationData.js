import { supabase } from "./supabaseClient";

// The columns that actually get sent to Supabase for each table. As of the
// round-4 schema addendum (eduhub_schema_addendum_1.sql), this whitelist
// covers every field the form collects — nothing is preview-only anymore.
// A field left off this list on purpose would stay local-state-only; right
// now that's not true of anything below.
const CHILD_COLUMNS = [
  "id",
  "family_id",
  "full_name",
  "date_of_birth",
  "nationality",
  "first_language",
  "second_language",
  "medical_inclusion_needs",
  "sports_hobbies_interests",
  "sports_achievements",
  "eid",
  "first_name",
  "middle_name",
  "last_name",
  "preferred_name",
  "gender",
  "academic_year_of_entry",
  "year_group_applying_for",
  "year_group_reason",
  "term",
  "english_first_home_language",
  "english_proficiency",
  "has_sen",
  "sen_description",
  "gifted_talented",
  "has_transfer_certificate",
  "transfer_certificate_understanding",
  "notes",
  // CH-03/CH-04/CH-05 (September 2026 change request) — religion (Pattern A,
  // same as AH-03), and academic_years_of_entry/terms replacing the old
  // single-value academic_year_of_entry/term with "select all that apply"
  // arrays on their own new columns, so old saved data never has to be
  // reinterpreted as an array.
  "religion",
  "academic_years_of_entry",
  "terms",
  // SEN-01 (September 2026 change request, Section 5 — "SEN and inclusion")
  // — replaces the old has_sen/sen_description pair (kept above for existing
  // rows) with a calmer, more specific set: a 5-option status question, a
  // free-text "concerns" note, a multi-select diagnosis list, and its own
  // "Other" text.
  "sen_status",
  "sen_concerns_description",
  "sen_diagnoses",
  "sen_diagnosis_other",
  // SEN-02 — "select all that apply" list of documents the family already
  // holds. Its own new column, on its own addendum (28), since it can be
  // asked and answered independently of SEN-01.
  "sen_documents_held",
  // SEN-04 through SEN-11 (September 2026 change request) — the rest of the
  // SEN and inclusion section. All on their own addendum (29).
  "sen_intervention_status",
  "sen_intervention_types",
  "sen_intervention_other",
  "sen_intervention_frequency",
  "sen_lsa_status",
  "sen_descriptive_words",
  "sen_outside_professionals",
  "sen_outside_professionals_other",
  "sen_disclosure_preference",
  "sen_additional_notes",
  // Added by eduhub_schema_addendum_4.sql (2026-09-02) — a child's own
  // address, for households where they don't live at the main family
  // address. `address` always holds the real text even when it was copied
  // from a parent, so nothing reading this table has to resolve a reference.
  "address",
  "address_same_as",
];

const PARENT_COLUMNS = [
  "id",
  "family_id",
  "user_id",
  "relationship",
  "full_name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "nationality",
  "religion",
  "first_language",
  "second_language",
  "employer_name",
  "occupation_designation",
  "eid",
  // Added by eduhub_schema_addendum_4.sql (2026-09-02).
  "address",
  "address_same_as",
];

const SCHOOL_COLUMNS = [
  "id",
  "child_id",
  "school_name",
  "school_address",
  "contact_email",
  "contact_name",
  "contact_phone",
  "reference_status",
  "year_group_of_leaving",
  // CS-01 (September 2026 change request): "date_attended_last" is
  // deliberately no longer here — the app stops reading and writing it, but
  // the column itself is left in place in the database rather than dropped.
  "curriculum",
  "reason_for_leaving",
  "reason_for_leaving_details",
  // CS-04/CS-05/CS-06 (September 2026 change request).
  "education_gaps_status",
  "education_gaps_details",
  "repeated_year_status",
  "repeated_year_details",
  "school_refusal_status",
  "school_refusal_details",
  // NAV-02 (September 2026 change request): set when this school record was
  // copied from a sibling's — a one-time copy, not a live link (see
  // SCHOOL_SIBLING_COLUMN below and the copy logic in ApplicationForm.jsx).
  "same_as_sibling_child_id",
];

// The address columns are the newest thing here, added by schema addendum 4.
// If that addendum hasn't been run against this Supabase project yet, sending
// them makes Postgres reject the WHOLE row — which would mean a family
// couldn't save anything at all, not just their address. So: try with them,
// and if (and only if) Postgres says the column doesn't exist, drop those two
// fields and try once more, remembering the answer so every later save skips
// them too. Everything except the address then keeps working normally, and
// the moment the addendum is run the app picks the columns back up on its
// next reload with no code change.
const ADDRESS_COLUMNS = ["address", "address_same_as"];
let addressColumnsMissing = false;

function isMissingAddressColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return msg.includes("address") && (msg.includes("does not exist") || msg.includes("could not find"));
}

function withoutAddressColumns(payload) {
  const out = { ...payload };
  ADDRESS_COLUMNS.forEach((c) => delete out[c]);
  return out;
}

// CH-03/CH-04/CH-05 (September 2026 change request) — same "might not exist
// in this database yet" reasoning as ADDRESS_COLUMNS above, for children's
// three newest columns. Harmless to check on a school payload too, since
// pickColumns() never puts these keys there in the first place.
const CHILD_NEW_COLUMNS = ["religion", "academic_years_of_entry", "terms"];
let childNewColumnsMissing = false;

function isMissingChildNewColumnsError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    CHILD_NEW_COLUMNS.some((c) => msg.includes(c)) && (msg.includes("does not exist") || msg.includes("could not find"))
  );
}

function withoutChildNewColumns(payload) {
  const out = { ...payload };
  CHILD_NEW_COLUMNS.forEach((c) => delete out[c]);
  return out;
}

// SEN-01 (September 2026 change request) — same "might not exist in this
// database yet" guard, for children's four newest SEN columns. Separate
// from CHILD_NEW_COLUMNS above (rather than folded in) so the two addendums
// can be run in either order — a database with CH-03/04/05 but not SEN-01
// yet (or vice versa) still saves everything it can.
const CHILD_SEN_COLUMNS = ["sen_status", "sen_concerns_description", "sen_diagnoses", "sen_diagnosis_other"];
let childSenColumnsMissing = false;

function isMissingChildSenColumnsError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    CHILD_SEN_COLUMNS.some((c) => msg.includes(c)) && (msg.includes("does not exist") || msg.includes("could not find"))
  );
}

function withoutChildSenColumns(payload) {
  const out = { ...payload };
  CHILD_SEN_COLUMNS.forEach((c) => delete out[c]);
  return out;
}

// SEN-02 (September 2026 change request) — its own guard, separate from
// CHILD_SEN_COLUMNS above, because it ships as its own addendum (28) and
// should degrade gracefully on its own if that one hasn't been run yet, even
// once addendum 27 (SEN-01) has.
const CHILD_SEN_DOCUMENTS_COLUMN = "sen_documents_held";
let childSenDocumentsColumnMissing = false;

function isMissingChildSenDocumentsColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return msg.includes(CHILD_SEN_DOCUMENTS_COLUMN) && (msg.includes("does not exist") || msg.includes("could not find"));
}

function withoutChildSenDocumentsColumn(payload) {
  const out = { ...payload };
  delete out[CHILD_SEN_DOCUMENTS_COLUMN];
  return out;
}

// SEN-04 through SEN-11 (September 2026 change request) — same "might not
// exist in this database yet" guard, for the ten columns that make up the
// rest of the SEN and inclusion section, all shipped together on addendum
// 29. Kept as one guard set (not ten) since they were all built and will
// all ship in the same addendum together — unlike CHILD_SEN_COLUMNS (27) and
// CHILD_SEN_DOCUMENTS_COLUMN (28), which needed to be independent because
// they shipped as separate addendums at separate times.
const CHILD_SEN_FOLLOWUP_COLUMNS = [
  "sen_intervention_status",
  "sen_intervention_types",
  "sen_intervention_other",
  "sen_intervention_frequency",
  "sen_lsa_status",
  "sen_descriptive_words",
  "sen_outside_professionals",
  "sen_outside_professionals_other",
  "sen_disclosure_preference",
  "sen_additional_notes",
];
let childSenFollowupColumnsMissing = false;

function isMissingChildSenFollowupColumnsError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    CHILD_SEN_FOLLOWUP_COLUMNS.some((c) => msg.includes(c)) &&
    (msg.includes("does not exist") || msg.includes("could not find"))
  );
}

function withoutChildSenFollowupColumns(payload) {
  const out = { ...payload };
  CHILD_SEN_FOLLOWUP_COLUMNS.forEach((c) => delete out[c]);
  return out;
}

// CS-04/CS-05/CS-06 (September 2026 change request) — same "might not exist
// in this database yet" guard, for current_schools' six newest columns.
// Harmless to check on a child/parent payload too, since pickColumns()
// never puts these keys there in the first place.
const SCHOOL_NEW_COLUMNS = [
  "education_gaps_status",
  "education_gaps_details",
  "repeated_year_status",
  "repeated_year_details",
  "school_refusal_status",
  "school_refusal_details",
];
let schoolNewColumnsMissing = false;

function isMissingSchoolNewColumnsError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    SCHOOL_NEW_COLUMNS.some((c) => msg.includes(c)) && (msg.includes("does not exist") || msg.includes("could not find"))
  );
}

function withoutSchoolNewColumns(payload) {
  const out = { ...payload };
  SCHOOL_NEW_COLUMNS.forEach((c) => delete out[c]);
  return out;
}

// NAV-02 (September 2026 change request) — same "might not exist in this
// database yet" guard, for current_schools' new sibling-copy column.
const SCHOOL_SIBLING_COLUMN = ["same_as_sibling_child_id"];
let schoolSiblingColumnMissing = false;

function isMissingSchoolSiblingColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    SCHOOL_SIBLING_COLUMN.some((c) => msg.includes(c)) && (msg.includes("does not exist") || msg.includes("could not find"))
  );
}

function withoutSchoolSiblingColumn(payload) {
  const out = { ...payload };
  SCHOOL_SIBLING_COLUMN.forEach((c) => delete out[c]);
  return out;
}

function applyColumnGuards(payload) {
  let out = payload;
  if (addressColumnsMissing) out = withoutAddressColumns(out);
  if (childNewColumnsMissing) out = withoutChildNewColumns(out);
  if (childSenColumnsMissing) out = withoutChildSenColumns(out);
  if (childSenDocumentsColumnMissing) out = withoutChildSenDocumentsColumn(out);
  if (childSenFollowupColumnsMissing) out = withoutChildSenFollowupColumns(out);
  if (schoolNewColumnsMissing) out = withoutSchoolNewColumns(out);
  if (schoolSiblingColumnMissing) out = withoutSchoolSiblingColumn(out);
  return out;
}

// Runs one insert/update, retrying without whichever column set Postgres
// objected to. `run` takes the payload and returns Supabase's { data, error }.
// Recurses (at most twice — once per guard) so either or both missing column
// sets get dropped before giving up and surfacing a real error.
async function saveRow(payload, run) {
  const first = await run(applyColumnGuards(payload));
  if (!first.error) return first.data;

  if (!addressColumnsMissing && isMissingAddressColumnError(first.error)) {
    console.warn(
      "Address columns are missing from this database — run eduhub_schema_addendum_4_addresses.sql in the Supabase SQL editor. Saving everything else for now."
    );
    addressColumnsMissing = true;
    return saveRow(payload, run);
  }
  if (!childNewColumnsMissing && isMissingChildNewColumnsError(first.error)) {
    console.warn(
      "One or more of children.religion / academic_years_of_entry / terms is missing from this database — run eduhub_schema_addendum_25_child_religion_and_multiselects.sql in the Supabase SQL editor. Saving everything else for now."
    );
    childNewColumnsMissing = true;
    return saveRow(payload, run);
  }
  if (!childSenColumnsMissing && isMissingChildSenColumnsError(first.error)) {
    console.warn(
      "One or more of children.sen_status / sen_concerns_description / sen_diagnoses / sen_diagnosis_other is missing from this database — run eduhub_schema_addendum_27_sen_inclusion.sql in the Supabase SQL editor. Saving everything else for now."
    );
    childSenColumnsMissing = true;
    return saveRow(payload, run);
  }
  if (!childSenDocumentsColumnMissing && isMissingChildSenDocumentsColumnError(first.error)) {
    console.warn(
      "children.sen_documents_held is missing from this database — run eduhub_schema_addendum_28_sen_documents_held.sql in the Supabase SQL editor. Saving everything else for now."
    );
    childSenDocumentsColumnMissing = true;
    return saveRow(payload, run);
  }
  if (!childSenFollowupColumnsMissing && isMissingChildSenFollowupColumnsError(first.error)) {
    console.warn(
      "One or more of children.sen_intervention_status / sen_intervention_types / sen_intervention_other / sen_intervention_frequency / sen_lsa_status / sen_descriptive_words / sen_outside_professionals / sen_outside_professionals_other / sen_disclosure_preference / sen_additional_notes is missing from this database — run eduhub_schema_addendum_29_sen_followup_questions.sql in the Supabase SQL editor. Saving everything else for now."
    );
    childSenFollowupColumnsMissing = true;
    return saveRow(payload, run);
  }
  if (!schoolNewColumnsMissing && isMissingSchoolNewColumnsError(first.error)) {
    console.warn(
      "One or more of current_schools.education_gaps_status / education_gaps_details / repeated_year_status / repeated_year_details / school_refusal_status / school_refusal_details is missing from this database — run eduhub_schema_addendum_30_curriculum_options.sql in the Supabase SQL editor. Saving everything else for now."
    );
    schoolNewColumnsMissing = true;
    return saveRow(payload, run);
  }
  if (!schoolSiblingColumnMissing && isMissingSchoolSiblingColumnError(first.error)) {
    console.warn(
      "current_schools.same_as_sibling_child_id is missing from this database — run eduhub_schema_addendum_32_same_school_as_sibling.sql in the Supabase SQL editor. Saving everything else for now."
    );
    schoolSiblingColumnMissing = true;
    return saveRow(payload, run);
  }
  throw first.error;
}

function pickColumns(obj, columns) {
  const picked = {};
  columns.forEach((col) => {
    if (Object.prototype.hasOwnProperty.call(obj, col)) picked[col] = obj[col];
  });
  return picked;
}

// Postgres `date` columns reject an empty string outright ("invalid input
// syntax for type date: \"\""") — they only accept a real date or SQL NULL.
// The form always defaults an unanswered date field to "" (same as every
// other still-empty field), so every date column needs "" converted to
// null right before it's sent, or a family who hasn't reached that field
// yet can't save ANYTHING, not just that field — an unrelated autosave on
// a totally different part of the form fails too, since it's all one
// request per table.
const CHILD_DATE_COLUMNS = ["date_of_birth"];
// CS-01: no school date columns are collected on the form any more.
const SCHOOL_DATE_COLUMNS = [];

function nullifyEmptyDates(obj, dateColumns) {
  const out = { ...obj };
  dateColumns.forEach((col) => {
    if (out[col] === "") out[col] = null;
  });
  return out;
}

// A family can have any number of children (the database always supported
// this — children.family_id has no uniqueness constraint) — the form now
// matches that: fetch every child on the family, plus each child's own
// current-school record, keyed by child id.

export async function fetchApplicationData(familyId) {
  const [
    { data: children, error: childrenError },
    { data: parents, error: parentsError },
    { data: family, error: familyError },
    { data: payments, error: paymentsError },
    { data: events, error: eventsError },
  ] = await Promise.all([
    supabase.from("children").select("*").eq("family_id", familyId).order("created_at", { ascending: true }),
    supabase.from("parents").select("*").eq("family_id", familyId).order("created_at", { ascending: true }),
    supabase.from("families").select("*").eq("id", familyId).single(),
    supabase.from("payments").select("*").eq("family_id", familyId).order("due_date", { ascending: true }),
    // Row Level Security already limits this to the family's own events
    // where a founder has switched on "Show on the family's dashboard" —
    // see calendar_events_client_read in addendum 6. The extra filters here
    // are just belt-and-braces, not what's actually doing the restricting.
    supabase
      .from("calendar_events")
      .select("*")
      .eq("family_id", familyId)
      .eq("visible_to_client", true)
      .order("starts_at", { ascending: true }),
  ]);

  if (childrenError) throw childrenError;
  if (parentsError) throw parentsError;
  if (familyError) throw familyError;
  if (paymentsError) throw paymentsError;
  if (eventsError) throw eventsError;

  const childIds = (children || []).map((c) => c.id);
  let schoolsByChild = {};
  if (childIds.length) {
    const { data: schools, error: schoolsError } = await supabase
      .from("current_schools")
      .select("*")
      .in("child_id", childIds);
    if (schoolsError) throw schoolsError;
    schoolsByChild = Object.fromEntries((schools || []).map((s) => [s.child_id, s]));
  }

  // Documents are polymorphic (owner_type + owner_id, no family_id column),
  // so there's no single query that fetches "every document for this
  // family" — one query per owner (each parent row — Mother and Father both
  // — plus each child) instead. Small numbers per family, so this stays cheap.
  const ownerRefs = [
    ...(parents || []).map((p) => ({ type: "parent", id: p.id })),
    ...(children || []).map((c) => ({ type: "child", id: c.id })),
  ];
  const documentsByOwner = {};
  if (ownerRefs.length) {
    const results = await Promise.all(
      ownerRefs.map((ref) => supabase.from("documents").select("*").eq("owner_type", ref.type).eq("owner_id", ref.id))
    );
    results.forEach((res, i) => {
      if (res.error) throw res.error;
      documentsByOwner[`${ownerRefs[i].type}:${ownerRefs[i].id}`] = res.data || [];
    });
  }

  return { children: children || [], schoolsByChild, parents: parents || [], family, documentsByOwner, payments: payments || [], events: events || [] };
}

// Saves everything in one go: every child (create or update) with their own
// current-school record, the family's home address, and the parent.
//
// IMPORTANT: this always returns the full saved rows (with their real
// database ids), and the caller MUST write them back into its own state
// (setChildren/setCurrentSchools/setParent) by MERGING, not replacing —
// what comes back here only has columns that are on CHILD_COLUMNS /
// SCHOOL_COLUMNS above, so a caller that replaces its local objects
// wholesale risks losing any field that's ever added to local state ahead
// of its column being added to this whitelist. Merging keeps the saved ids
// (still critical: without them, a row that was just inserted still looks
// "new" next time Save is clicked, and gets inserted AGAIN as a duplicate —
// see the 2026-08-27 child-1/2/3 → child-1..6 duplication bug) while
// leaving any such local-only fields alone.
// AH-09 (September 2026 change request) — same "might not exist in this
// database yet" guard as ADDRESS_COLUMNS above, since school_priorities is a
// brand-new column too. Without this, saving before the addendum is run
// would reject the families update and, because that update sits between
// the children and parents loops below, silently take the parents' save
// down with it.
let schoolPrioritiesColumnMissing = false;
function isMissingSchoolPrioritiesColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return msg.includes("school_priorities") && (msg.includes("does not exist") || msg.includes("could not find"));
}

// AH-10 (September 2026 change request) — same guard, same reason, for the
// new families.comfortable_fee_range column.
let comfortableFeeRangeColumnMissing = false;
function isMissingComfortableFeeRangeColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return msg.includes("comfortable_fee_range") && (msg.includes("does not exist") || msg.includes("could not find"));
}

// AH-11 (September 2026 change request) — same guard for
// families.parent_work_location. Optional field, but still a brand-new
// column that might not exist in this database yet, and it sits in the same
// families.update() call as the two required family-level fields above, so
// it needs the same protection or a missing column here would take THOSE
// down with it too.
let parentWorkLocationColumnMissing = false;
function isMissingParentWorkLocationColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return msg.includes("parent_work_location") && (msg.includes("does not exist") || msg.includes("could not find"));
}

// BUD-01 (September 2026 change request, Section 3 — "Budget and relocation
// planning") — same guard, same reason, for families.budget_status.
let budgetStatusColumnMissing = false;
function isMissingBudgetStatusColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return msg.includes("budget_status") && (msg.includes("does not exist") || msg.includes("could not find"));
}

// BUD-03 (September 2026 change request) — same guard, same reason, for
// families.housing_budget.
let housingBudgetColumnMissing = false;
function isMissingHousingBudgetColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return msg.includes("housing_budget") && (msg.includes("does not exist") || msg.includes("could not find"));
}

// BUD-04 (September 2026 change request) — same guard, same reason, for
// families.preferred_living_area.
let preferredLivingAreaColumnMissing = false;
function isMissingPreferredLivingAreaColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return msg.includes("preferred_living_area") && (msg.includes("does not exist") || msg.includes("could not find"));
}

// BUD-05 (September 2026 change request) — same guard, same reason, for
// families.cost_guidance_response.
let costGuidanceColumnMissing = false;
function isMissingCostGuidanceColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return msg.includes("cost_guidance_response") && (msg.includes("does not exist") || msg.includes("could not find"));
}

export async function saveApplication({
  familyId,
  userId,
  children,
  currentSchools,
  parents,
  accountHolderRole,
  sameAsPrimary = false,
  schoolPriorities = [],
  comfortableFeeRange = "",
  parentWorkLocation = "",
  budgetStatus = "",
  housingBudget = "",
  preferredLivingArea = "",
  costGuidance = "",
}) {
  // Parents are stored [Mother, Father]; whichever one is filling the form is
  // the one the other copies from (founder feedback, 2026-09-02).
  const primaryIndex = accountHolderRole === "Father" ? 1 : 0;
  const secondaryIndex = 1 - primaryIndex;
  // The form keeps a "same as ..." address in step live, but what actually
  // lands in the database shouldn't depend on whether that sync happened to
  // run before this save fired — re-resolving here means the picker's choice
  // always wins. (Same belt-and-braces reasoning as SAME_AS_MOTHER_FIELDS
  // further down.) Declared up here because the children loop below reads it
  // too, and a const can't be used above its own declaration.
  const addressSources = {
    mother: parents[0]?.address || "",
    father: parents[1]?.address || "",
  };
  function withResolvedAddress(record) {
    if (!record?.address_same_as) return record;
    return { ...record, address: addressSources[record.address_same_as] || "" };
  }

  const savedChildren = [];
  const savedSchools = [];

  for (let i = 0; i < children.length; i++) {
    const child = withResolvedAddress(children[i]);
    const childPayload = { ...pickColumns(nullifyEmptyDates(child, CHILD_DATE_COLUMNS), CHILD_COLUMNS), family_id: familyId };
    const savedChild = await saveRow(childPayload, (payload) =>
      child.id
        ? supabase.from("children").update(payload).eq("id", child.id).select().single()
        : supabase.from("children").insert(payload).select().single()
    );
    savedChildren.push(savedChild);

    const school = currentSchools[i] || {};
    // same_as_sibling_child_id is a uuid column — like the date columns, it
    // rejects "" outright (the form's own empty-state), so an unset/cleared
    // choice has to become SQL NULL, not an empty string, before it's sent.
    const schoolPayload = {
      ...pickColumns(nullifyEmptyDates(school, SCHOOL_DATE_COLUMNS), SCHOOL_COLUMNS),
      child_id: savedChild.id,
      same_as_sibling_child_id: school.same_as_sibling_child_id || null,
    };
    // CS-04/CS-05/CS-06 added six brand-new columns here, so this now goes
    // through the same guarded saveRow() as children/parents — previously a
    // plain, unguarded insert/update, which would have meant a family
    // couldn't save ANY current-school info at all until addendum 30 was run.
    const savedSchool = await saveRow(schoolPayload, (payload) =>
      school.id
        ? supabase.from("current_schools").update(payload).eq("id", school.id).select().single()
        : supabase.from("current_schools").insert(payload).select().single()
    );
    savedSchools.push(savedSchool);
  }

  // families.home_address is no longer its own form field, but it's still a
  // real column the founders' portal reads, so it's kept in step with the
  // account holder's own address — the closest thing the family now has to
  // "the household address."
  function buildFamilyUpdatePayload() {
    const payload = { home_address: parents[primaryIndex]?.address || "" };
    if (!schoolPrioritiesColumnMissing) payload.school_priorities = schoolPriorities;
    if (!comfortableFeeRangeColumnMissing) payload.comfortable_fee_range = comfortableFeeRange;
    if (!parentWorkLocationColumnMissing) payload.parent_work_location = parentWorkLocation;
    if (!budgetStatusColumnMissing) payload.budget_status = budgetStatus;
    if (!housingBudgetColumnMissing) payload.housing_budget = housingBudget;
    if (!preferredLivingAreaColumnMissing) payload.preferred_living_area = preferredLivingArea;
    if (!costGuidanceColumnMissing) payload.cost_guidance_response = costGuidance;
    return payload;
  }

  // Seven columns here can each independently be missing (an addendum not
  // yet run) — Postgres only reports one missing column per error, so this
  // retries a few times, dropping whichever column it just flagged, until
  // either the update succeeds or an unrelated error surfaces.
  for (let attempt = 0; attempt < 8; attempt++) {
    const { error: familyUpdateError } = await supabase
      .from("families")
      .update(buildFamilyUpdatePayload())
      .eq("id", familyId);
    if (!familyUpdateError) break;

    if (!schoolPrioritiesColumnMissing && isMissingSchoolPrioritiesColumnError(familyUpdateError)) {
      console.warn(
        "families.school_priorities is missing from this database — run eduhub_schema_addendum_18_school_priorities.sql in the Supabase SQL editor. Saving everything else for now."
      );
      schoolPrioritiesColumnMissing = true;
      continue;
    }
    if (!comfortableFeeRangeColumnMissing && isMissingComfortableFeeRangeColumnError(familyUpdateError)) {
      console.warn(
        "families.comfortable_fee_range is missing from this database — run eduhub_schema_addendum_19_comfortable_fee_range.sql in the Supabase SQL editor. Saving everything else for now."
      );
      comfortableFeeRangeColumnMissing = true;
      continue;
    }
    if (!parentWorkLocationColumnMissing && isMissingParentWorkLocationColumnError(familyUpdateError)) {
      console.warn(
        "families.parent_work_location is missing from this database — run eduhub_schema_addendum_20_parent_work_location.sql in the Supabase SQL editor. Saving everything else for now."
      );
      parentWorkLocationColumnMissing = true;
      continue;
    }
    if (!budgetStatusColumnMissing && isMissingBudgetStatusColumnError(familyUpdateError)) {
      console.warn(
        "families.budget_status is missing from this database — run eduhub_schema_addendum_21_budget_status.sql in the Supabase SQL editor. Saving everything else for now."
      );
      budgetStatusColumnMissing = true;
      continue;
    }
    if (!housingBudgetColumnMissing && isMissingHousingBudgetColumnError(familyUpdateError)) {
      console.warn(
        "families.housing_budget is missing from this database — run eduhub_schema_addendum_22_housing_budget.sql in the Supabase SQL editor. Saving everything else for now."
      );
      housingBudgetColumnMissing = true;
      continue;
    }
    if (!preferredLivingAreaColumnMissing && isMissingPreferredLivingAreaColumnError(familyUpdateError)) {
      console.warn(
        "families.preferred_living_area is missing from this database — run eduhub_schema_addendum_23_preferred_living_area.sql in the Supabase SQL editor. Saving everything else for now."
      );
      preferredLivingAreaColumnMissing = true;
      continue;
    }
    if (!costGuidanceColumnMissing && isMissingCostGuidanceColumnError(familyUpdateError)) {
      console.warn(
        "families.cost_guidance_response is missing from this database — run eduhub_schema_addendum_24_cost_guidance_response.sql in the Supabase SQL editor. Saving everything else for now."
      );
      costGuidanceColumnMissing = true;
      continue;
    }
    throw familyUpdateError;
  }

  // Parents — always exactly two rows, Mother and Father. Whichever one's
  // `relationship` matches `accountHolderRole` (the role the signed-in
  // person picked at the top of the Parent step) gets `user_id` — that's
  // what makes it "their" row, distinct from the other parent who was just
  // entered as information.
  // "Same as Mother" is also enforced right here, not just by the live
  // client-side sync effect in ApplicationForm.jsx — that effect keeps the
  // on-screen fields matching while the box is ticked, but whatever gets
  // written to the database should never depend on exactly when a save
  // happened to fire relative to that sync. This was the cause of the
  // toggle looking "on" in the form while Father's nationality/
  // languages saved as empty: forcing the copy here means the box being
  // checked always wins, no matter the timing.
  const SAME_AS_PRIMARY_FIELDS = ["nationality", "first_language", "second_language"];


  const savedParents = [];
  for (let i = 0; i < parents.length; i++) {
    let parent = withResolvedAddress(parents[i]);
    if (i === secondaryIndex && sameAsPrimary) {
      const source = parents[primaryIndex];
      parent = { ...parent };
      SAME_AS_PRIMARY_FIELDS.forEach((f) => {
        parent[f] = source[f];
      });
    }
    const payload = { ...pickColumns(parent, PARENT_COLUMNS), family_id: familyId };
    if (parent.relationship === accountHolderRole) payload.user_id = userId;

    const saved = await saveRow(payload, (p) =>
      parent.id
        ? supabase.from("parents").update(p).eq("id", parent.id).select().single()
        : supabase.from("parents").insert(p).select().single()
    );
    savedParents.push(saved);
  }

  return { children: savedChildren, currentSchools: savedSchools, parents: savedParents };
}

// Marks the intake form itself as submitted (separate from a specific
// child's application to a specific school later on — see families.intake_status
// in the schema). Called after saveApplication succeeds AND every required
// field/document has already been checked client-side.
// The family's own "where from / where to" — a family can write these two
// columns directly (see families_guard_client_edit, addendum 12; only
// pipeline_stage/owner_staff_id/membership_type/the application alias are
// staff-only), so this is a plain update, not routed through the big
// saveApplication pipeline. Founders just read these same columns
// (including the two Dubai availability dates, addendum 53) on their Case
// panel — no separate sync needed.
export async function updateMoveDetails(familyId, { origin, destination, dubaiAvailableFrom, dubaiAvailableUntil }) {
  const patch = { origin: origin ?? null, destination: destination ?? null };
  // The two availability dates are optional extras on the same card --
  // only touch them when the caller actually passes one, so a plain
  // origin/destination save (the common case) doesn't have to know they
  // exist.
  if (dubaiAvailableFrom !== undefined) patch.dubai_available_from = dubaiAvailableFrom || null;
  if (dubaiAvailableUntil !== undefined) patch.dubai_available_until = dubaiAvailableUntil || null;

  const { data, error } = await supabase.from("families").update(patch).eq("id", familyId).select().single();
  if (error) throw error;
  return data;
}

// "How did you hear about us?" -- saved on its own so a database that hasn't
// had addendum 70 run yet can't break the rest of the application.
export async function updateReferralSource(familyId, { source, detail }) {
  const { data, error } = await supabase
    .from("families")
    .update({ referral_source: source || null, referral_source_detail: detail || null })
    .eq("id", familyId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function submitApplication(familyId) {
  const { error } = await supabase
    .from("families")
    .update({ intake_status: "submitted", intake_submitted_at: new Date().toISOString() })
    .eq("id", familyId);
  if (error) throw error;
}

// Permanently removes one child's saved application data: the children row
// itself, plus its current_schools row via that table's own
// `on delete cascade` foreign key — no separate call needed for that part.
// Documents are NOT covered by that cascade (the documents table is
// polymorphic across parents and children, so it has no FK to cascade on)
// — the caller is responsible for deleting that child's document rows +
// storage files first (see lib/documents.js's deleteDocument), before
// calling this. Only ever called after the family has explicitly confirmed
// removing that child in the UI — this is real, irreversible deletion.
export async function deleteChild(childId) {
  const { error } = await supabase.from("children").delete().eq("id", childId);
  if (error) throw error;
}
