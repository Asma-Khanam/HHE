import { supabase } from "./supabaseClient";
import { displayNameForChild } from "./completeness";
import { isExpiring } from "./workflow";

// All the fetching and writing this app does. The reads rely on the staff
// read policies from eduhub_schema_addendum_2_staff.sql; the writes rely on
// the staff write policies from addendum 3. A logged-in user with no `staff`
// row gets empty results or a permission error from every one of these.
//
// Everything joins client-side rather than using PostgREST's embedded
// selects — the row counts here are small (one agency's caseload), and
// separate queries keep each one obvious about which policy it depends on.

function groupBy(rows, key) {
  const out = {};
  (rows || []).forEach((row) => {
    const k = row[key];
    (out[k] ||= []).push(row);
  });
  return out;
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// Every page's catch block runs its error through this. The one failure
// that's actually likely in practice — and the most confusing to read raw —
// is opening the app before addendum 3 has been run, where Postgres just
// says a relation or column doesn't exist. Say what to do about it.
export function friendlyError(err, fallback = "Something went wrong.") {
  const message = err?.message || fallback;
  if (/does not exist|schema cache|Could not find/i.test(message)) {
    return `${message} — this usually means eduhub_schema_addendum_3_staff_workflow.sql hasn't been run in the Supabase SQL editor yet.`;
  }
  return message;
}

// The account holder is whichever parent row's user_id matches the family's
// own account_user_id — same rule the client app uses to decide which side
// of the form is "required." Falls back to Mother if nothing matches (a
// family with no parent rows yet, or from before that link existed).
export function resolveAccountHolderRole(family, parents) {
  const holder = (parents || []).find((p) => p.user_id === family?.account_user_id);
  return holder?.relationship === "Father" ? "Father" : "Mother";
}

// A short, human-friendly label for a family — the account holder's name if
// there is one, else whichever parent has a name on file, else just the
// short id. This is deliberately built from real data already on the row,
// not a guessed-at surname (parents.full_name is free text, not split into
// first/last the way children's names are).
export function familyDisplayName(family, parents) {
  const holderRole = resolveAccountHolderRole(family, parents);
  const holder = (parents || []).find((p) => p.relationship === holderRole && p.full_name);
  if (holder) return holder.full_name;
  const anyNamed = (parents || []).find((p) => p.full_name);
  if (anyNamed) return anyNamed.full_name;
  return `Family ${shortId(family.id)}`;
}

// The first 8 characters of the UUID, uppercased — a short, unique-enough
// reference code for a person to say out loud or jot down, without needing
// the full UUID.
export function shortId(id) {
  return (id || "").replace(/-/g, "").slice(0, 8).toUpperCase();
}

// Two ordered [Mother, Father] entries (one may be a bare placeholder if
// that side was never filled in) — the shape getMissingItems() expects,
// same as the client app builds for its own form state.
function orderedParents(parents) {
  const mother = (parents || []).find((p) => p.relationship === "Mother");
  const father = (parents || []).find((p) => p.relationship === "Father");
  return [mother || { relationship: "Mother" }, father || { relationship: "Father" }];
}

// ---------------------------------------------------------------------------
// Who's signed in
// ---------------------------------------------------------------------------

export async function getCurrentStaff() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("staff").select("*").eq("user_id", user.id).maybeSingle();
  return data || null;
}

// Everyone on the team, for the owner dropdown. Depends on addendum 3's
// staff_read_team policy — before that ran, a staff member could only see
// their own row.
export async function listStaff() {
  return unwrap(await supabase.from("staff").select("*").order("created_at")) || [];
}

function staffName(staffRow) {
  return staffRow?.full_name || staffRow?.email || "Unassigned";
}

// ---------------------------------------------------------------------------
// Caseload list
// ---------------------------------------------------------------------------

// One fetch for the whole caseload table: every family, who's on it, their
// children (with the year group they're applying for), their owner, and the
// next open task — everything the table shows, without a query per row.
export async function listFamilies() {
  const [families, parents, children, tasks, staff] = await Promise.all([
    supabase.from("families").select("*").order("created_at", { ascending: false }).then(unwrap),
    supabase.from("parents").select("id, family_id, relationship, full_name, user_id").then(unwrap),
    supabase
      .from("children")
      .select("id, family_id, full_name, preferred_name, first_name, year_group_applying_for, created_at")
      .order("created_at")
      .then(unwrap),
    supabase.from("tasks").select("*").is("done_at", null).order("due_date", { nullsFirst: false }).then(unwrap),
    listStaff(),
  ]);

  const parentsByFamily = groupBy(parents, "family_id");
  const childrenByFamily = groupBy(children, "family_id");
  const tasksByFamily = groupBy(tasks, "family_id");
  const staffById = Object.fromEntries((staff || []).map((s) => [s.user_id, s]));

  return (families || []).map((family) => {
    const familyParents = parentsByFamily[family.id] || [];
    const familyChildren = childrenByFamily[family.id] || [];
    const familyTasks = tasksByFamily[family.id] || [];
    return {
      ...family,
      parents: familyParents,
      children: familyChildren,
      childLabels: familyChildren.map((c, i) => {
        const name = displayNameForChild(c, i);
        return c.year_group_applying_for ? `${name} (${c.year_group_applying_for})` : name;
      }),
      displayName: familyDisplayName(family, familyParents),
      ownerName: family.owner_staff_id ? staffName(staffById[family.owner_staff_id]) : "Unassigned",
      ownerInitial: family.owner_staff_id ? staffName(staffById[family.owner_staff_id]).charAt(0).toUpperCase() : "—",
      nextTask: familyTasks[0] || null,
      openTaskCount: familyTasks.length,
    };
  });
}

// ---------------------------------------------------------------------------
// One family's whole record
// ---------------------------------------------------------------------------

export async function getFamilyDetail(familyId) {
  const family = unwrap(await supabase.from("families").select("*").eq("id", familyId).single());

  const [parents, children, staff] = await Promise.all([
    supabase.from("parents").select("*").eq("family_id", familyId).order("created_at").then(unwrap),
    supabase.from("children").select("*").eq("family_id", familyId).order("created_at").then(unwrap),
    listStaff(),
  ]);

  const childIds = (children || []).map((c) => c.id);
  const parentIds = (parents || []).map((p) => p.id);

  const empty = Promise.resolve({ data: [] });
  const [schools, parentDocs, childDocs, applications, tasks, schoolCatalog] = await Promise.all([
    childIds.length ? supabase.from("current_schools").select("*").in("child_id", childIds).then(unwrap) : empty.then(unwrap),
    parentIds.length
      ? supabase.from("documents").select("*").eq("owner_type", "parent").in("owner_id", parentIds).then(unwrap)
      : empty.then(unwrap),
    childIds.length
      ? supabase.from("documents").select("*").eq("owner_type", "child").in("owner_id", childIds).then(unwrap)
      : empty.then(unwrap),
    childIds.length
      ? supabase.from("applications").select("*").in("child_id", childIds).order("created_at").then(unwrap)
      : empty.then(unwrap),
    supabase.from("tasks").select("*").eq("family_id", familyId).order("due_date", { nullsFirst: false }).then(unwrap),
    listSchools(),
  ]);

  const documentsByOwner = {};
  [...(parentDocs || []), ...(childDocs || [])].forEach((doc) => {
    const key = `${doc.owner_type}:${doc.owner_id}`;
    (documentsByOwner[key] ||= []).push(doc);
  });

  const schoolsByChild = groupBy(schools, "child_id");
  const currentSchools = (children || []).map((c) => (schoolsByChild[c.id] || [])[0] || {});

  const schoolNameById = Object.fromEntries((schoolCatalog || []).map((s) => [s.id, s.name]));
  const applicationsByChild = groupBy(
    (applications || []).map((a) => ({ ...a, schoolName: schoolNameById[a.school_id] || "Unknown school" })),
    "child_id"
  );

  const staffById = Object.fromEntries((staff || []).map((s) => [s.user_id, s]));

  return {
    family,
    parents: parents || [],
    parentsOrdered: orderedParents(parents),
    accountHolderRole: resolveAccountHolderRole(family, parents),
    children: children || [],
    currentSchools,
    documentsByOwner,
    applicationsByChild,
    tasks: tasks || [],
    staff: staff || [],
    schoolCatalog: schoolCatalog || [],
    ownerName: family.owner_staff_id ? staffName(staffById[family.owner_staff_id]) : "Unassigned",
    displayName: familyDisplayName(family, parents),
  };
}

// Only the staff-managed columns are ever sent — the family's own data
// (home_address, intake_status) is theirs to change, not ours, and
// account_user_id is refused outright by a database trigger anyway.
const FAMILY_STAFF_COLUMNS = ["pipeline_stage", "destination", "origin", "membership_type", "owner_staff_id"];

export async function updateFamily(familyId, patch) {
  const payload = {};
  FAMILY_STAFF_COLUMNS.forEach((col) => {
    if (Object.prototype.hasOwnProperty.call(patch, col)) payload[col] = patch[col] === "" ? null : patch[col];
  });
  if (!Object.keys(payload).length) return null;
  return unwrap(await supabase.from("families").update(payload).eq("id", familyId).select().single());
}

// ---------------------------------------------------------------------------
// Documents — review state only. file_url and friends are immutable at the
// database level (see addendum 3's documents_protect_file trigger), so this
// can only ever change how a document is marked, never what it points at.
// ---------------------------------------------------------------------------

export async function updateDocumentReview(documentId, { status, expires_at, staff_note }) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const payload = { reviewed_by: user?.id || null, reviewed_at: new Date().toISOString() };
  if (status !== undefined) payload.status = status;
  if (expires_at !== undefined) payload.expires_at = expires_at || null;
  if (staff_note !== undefined) payload.staff_note = staff_note || null;
  return unwrap(await supabase.from("documents").update(payload).eq("id", documentId).select().single());
}

// ---------------------------------------------------------------------------
// Schools catalog + applications
// ---------------------------------------------------------------------------

export async function listSchools() {
  return unwrap(await supabase.from("schools").select("*").order("name")) || [];
}

export async function createSchool({ name, location }) {
  return unwrap(await supabase.from("schools").insert({ name, location: location || null }).select().single());
}

export async function createApplication({ childId, schoolId, fit, status }) {
  return unwrap(
    await supabase
      .from("applications")
      .insert({ child_id: childId, school_id: schoolId, fit: fit || null, status: status || "draft" })
      .select()
      .single()
  );
}

export async function updateApplication(applicationId, patch) {
  return unwrap(await supabase.from("applications").update(patch).eq("id", applicationId).select().single());
}

export async function deleteApplication(applicationId) {
  const { error } = await supabase.from("applications").delete().eq("id", applicationId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function createTask({ familyId, title, dueDate, assignedTo }) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return unwrap(
    await supabase
      .from("tasks")
      .insert({
        family_id: familyId || null,
        title,
        due_date: dueDate || null,
        assigned_to: assignedTo || null,
        created_by: user?.id || null,
      })
      .select()
      .single()
  );
}

export async function setTaskDone(taskId, done) {
  return unwrap(
    await supabase
      .from("tasks")
      .update({ done_at: done ? new Date().toISOString() : null })
      .eq("id", taskId)
      .select()
      .single()
  );
}

export async function deleteTask(taskId) {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// The Today page — one fetch for the whole dashboard.
// ---------------------------------------------------------------------------

export async function getTodayData() {
  const [tasks, families, parents, applications, parentDocs, childDocs, staff] = await Promise.all([
    supabase.from("tasks").select("*").order("due_date", { nullsFirst: false }).then(unwrap),
    supabase.from("families").select("*").then(unwrap),
    supabase.from("parents").select("id, family_id, relationship, full_name, user_id").then(unwrap),
    supabase.from("applications").select("*").then(unwrap),
    supabase.from("documents").select("*").eq("owner_type", "parent").then(unwrap),
    supabase.from("documents").select("*").eq("owner_type", "child").then(unwrap),
    listStaff(),
  ]);

  const parentsByFamily = groupBy(parents, "family_id");
  const familyNames = Object.fromEntries(
    (families || []).map((f) => [f.id, familyDisplayName(f, parentsByFamily[f.id] || [])])
  );
  const staffById = Object.fromEntries((staff || []).map((s) => [s.user_id, s]));

  const decorated = (tasks || []).map((t) => ({
    ...t,
    familyName: t.family_id ? familyNames[t.family_id] || "Unknown family" : "No family",
    assigneeInitial: t.assigned_to ? staffName(staffById[t.assigned_to]).charAt(0).toUpperCase() : null,
  }));

  const allDocs = [...(parentDocs || []), ...(childDocs || [])];

  return {
    tasks: decorated,
    families: families || [],
    familyNames,
    offersInPlay: (applications || []).filter((a) => a.status === "offer").length,
    chasingDocs: allDocs.filter((d) => d.status === "chasing").length,
    expiringDocs: allDocs.filter((d) => isExpiring(d.expires_at)).length,
    documents: allDocs,
  };
}
