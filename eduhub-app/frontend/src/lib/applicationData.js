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
  "religion",
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
  "term",
  "english_first_home_language",
  "english_proficiency",
  "has_sen",
  "sen_description",
  "gifted_talented",
  "has_transfer_certificate",
  "notes",
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
  "date_attended_last",
  "curriculum",
  "reason_for_leaving",
];

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
const SCHOOL_DATE_COLUMNS = ["date_attended_last"];

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
  ] = await Promise.all([
    supabase.from("children").select("*").eq("family_id", familyId).order("created_at", { ascending: true }),
    supabase.from("parents").select("*").eq("family_id", familyId).order("created_at", { ascending: true }),
    supabase.from("families").select("*").eq("id", familyId).single(),
  ]);

  if (childrenError) throw childrenError;
  if (parentsError) throw parentsError;
  if (familyError) throw familyError;

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

  return { children: children || [], schoolsByChild, parents: parents || [], family, documentsByOwner };
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
export async function saveApplication({
  familyId,
  userId,
  children,
  currentSchools,
  parents,
  accountHolderRole,
  homeAddress,
  sameAsMotherGeneral = false,
}) {
  const savedChildren = [];
  const savedSchools = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childPayload = { ...pickColumns(nullifyEmptyDates(child, CHILD_DATE_COLUMNS), CHILD_COLUMNS), family_id: familyId };
    let savedChild;
    if (child.id) {
      const { data, error } = await supabase.from("children").update(childPayload).eq("id", child.id).select().single();
      if (error) throw error;
      savedChild = data;
    } else {
      const { data, error } = await supabase.from("children").insert(childPayload).select().single();
      if (error) throw error;
      savedChild = data;
    }
    savedChildren.push(savedChild);

    const school = currentSchools[i] || {};
    const schoolPayload = { ...pickColumns(nullifyEmptyDates(school, SCHOOL_DATE_COLUMNS), SCHOOL_COLUMNS), child_id: savedChild.id };
    let savedSchool;
    if (school.id) {
      const { data, error } = await supabase
        .from("current_schools")
        .update(schoolPayload)
        .eq("id", school.id)
        .select()
        .single();
      if (error) throw error;
      savedSchool = data;
    } else {
      const { data, error } = await supabase.from("current_schools").insert(schoolPayload).select().single();
      if (error) throw error;
      savedSchool = data;
    }
    savedSchools.push(savedSchool);
  }

  const { error: familyUpdateError } = await supabase
    .from("families")
    .update({ home_address: homeAddress })
    .eq("id", familyId);
  if (familyUpdateError) throw familyUpdateError;

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
  // toggle looking "on" in the form while Father's nationality/religion/
  // languages saved as empty: forcing the copy here means the box being
  // checked always wins, no matter the timing.
  const SAME_AS_MOTHER_FIELDS = ["nationality", "religion", "first_language", "second_language"];

  const savedParents = [];
  for (let i = 0; i < parents.length; i++) {
    let parent = parents[i];
    if (i === 1 && sameAsMotherGeneral) {
      const mother = parents[0];
      parent = { ...parent };
      SAME_AS_MOTHER_FIELDS.forEach((f) => {
        parent[f] = mother[f];
      });
    }
    const payload = { ...parent, family_id: familyId };
    if (parent.relationship === accountHolderRole) payload.user_id = userId;

    let saved;
    if (parent.id) {
      const { data, error } = await supabase.from("parents").update(payload).eq("id", parent.id).select().single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabase.from("parents").insert(payload).select().single();
      if (error) throw error;
      saved = data;
    }
    savedParents.push(saved);
  }

  return { children: savedChildren, currentSchools: savedSchools, parents: savedParents };
}

// Marks the intake form itself as submitted (separate from a specific
// child's application to a specific school later on — see families.intake_status
// in the schema). Called after saveApplication succeeds AND every required
// field/document has already been checked client-side.
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
