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
// is a table/column Postgres says doesn't exist, because whichever addendum
// added it hasn't been run yet. This used to always name addendum 3
// specifically, which was right the day it was written but actively
// misleading once later addenda started adding their own new columns (e.g.
// addendum 50's schools.admissions_process_notes) -- pointing someone at
// the wrong file wastes more time than a generic pointer would. Say what to
// do about it without guessing which file it is.
export function friendlyError(err, fallback = "Something went wrong.") {
  const message = err?.message || fallback;
  if (/does not exist|schema cache|Could not find/i.test(message)) {
    return `${message} — this usually means a backend/schema/eduhub_schema_addendum_*.sql file hasn't been run in the Supabase SQL editor yet. Check the most recently added one first.`;
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

// ---------------------------------------------------------------------------
// Team management (addendum 13) — lets an admin add, remove, and promote or
// demote teammates from inside the app, no Supabase access needed. All three
// are plain RPC calls into security-definer functions that re-check
// is_staff_admin() server-side — nothing here is trusted just because the
// button existed on screen, same as everywhere else staff can write.
// ---------------------------------------------------------------------------
export async function addStaffMember({ email, fullName, role, position }) {
  const { data, error } = await supabase.rpc("add_staff_member", {
    p_email: email.trim(),
    p_full_name: fullName?.trim() || null,
    p_role: role || "member",
    p_position: position?.trim() || null,
  });
  if (error) throw error;
  return data;
}

export async function setStaffRole(userId, role) {
  const { data, error } = await supabase.rpc("set_staff_role", { p_user_id: userId, p_role: role });
  if (error) throw error;
  return data;
}

export async function setStaffPosition(userId, position) {
  const { data, error } = await supabase.rpc("set_staff_position", { p_user_id: userId, p_position: position });
  if (error) throw error;
  return data;
}

export async function removeStaffMember(userId) {
  const { error } = await supabase.rpc("remove_staff_member", { p_user_id: userId });
  if (error) throw error;
}

// CH-06 (September 2026 change request): "please keep the cut-off date
// editable in the admin area. It differs by curriculum and we will need to
// adjust it." — a single settings row both apps read from
// public.app_settings (schema addendum 26). Any signed-in user can read it
// (the family-facing form needs it to calculate a live suggestion); only a
// staff admin can change it, enforced by that table's own RLS policy, same
// as every other admin-only action in this file.
export async function getYearGroupCutoff() {
  const { data, error } = await supabase
    .from("app_settings")
    .select("year_group_cutoff_month, year_group_cutoff_day")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw error;
  // Falls back to the UK/UAE British-curriculum default (31 August) if the
  // addendum hasn't been run yet, or the row is somehow missing — the same
  // default the form used before this setting existed.
  return {
    month: data?.year_group_cutoff_month ?? 8,
    day: data?.year_group_cutoff_day ?? 31,
  };
}

export async function updateYearGroupCutoff({ month, day }) {
  const { data, error } = await supabase
    .from("app_settings")
    .update({ year_group_cutoff_month: month, year_group_cutoff_day: day, updated_at: new Date().toISOString() })
    .eq("id", "default")
    .select("year_group_cutoff_month, year_group_cutoff_day")
    .single();
  if (error) throw error;
  return data;
}

// Logins that exist (someone used the Sign Up page) but aren't on the team
// yet — addendum 14. Lets the Team page show "here's who's waiting" instead
// of an admin having to already know and type someone's exact email.
export async function listPendingSignups() {
  const { data, error } = await supabase.rpc("list_pending_signups");
  if (error) throw error;
  return data || [];
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
    // Most recently opened/edited family first (addendum 37 — "every time I
    // open a caseload or edit something in it, that should go up"); a
    // family nobody's touched yet (last_staff_activity_at is null) sorts
    // after every family that has been, then falls back to newest-first
    // among those so it isn't an arbitrary order.
    supabase
      .from("families")
      .select("*")
      .order("last_staff_activity_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .then(unwrap),
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
  const [schools, parentDocs, childDocs, applications, tasks, schoolCatalog, caseNotes, payments] = await Promise.all([
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
    supabase
      .from("case_notes")
      .select("*")
      .eq("family_id", familyId)
      .order("occurred_at", { ascending: false })
      .then(unwrap),
    supabase.from("payments").select("*").eq("family_id", familyId).order("due_date", { nullsFirst: false }).then(unwrap),
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
    caseNotes: caseNotes || [],
    payments: payments || [],
    staff: staff || [],
    schoolCatalog: schoolCatalog || [],
    ownerName: family.owner_staff_id ? staffName(staffById[family.owner_staff_id]) : "Unassigned",
    displayName: familyDisplayName(family, parents),
  };
}

// Only the staff-managed columns are ever sent — the family's own data
// (home_address, intake_status) is theirs to change, not ours, and
// account_user_id is refused outright by a database trigger anyway.
const FAMILY_STAFF_COLUMNS = ["pipeline_stage", "client_stage", "destination", "origin", "membership_type", "owner_staff_id", "home_address", "dubai_available_from", "dubai_available_until"];

export async function updateFamily(familyId, patch) {
  const payload = {};
  FAMILY_STAFF_COLUMNS.forEach((col) => {
    if (Object.prototype.hasOwnProperty.call(patch, col)) payload[col] = patch[col] === "" ? null : patch[col];
  });
  if (!Object.keys(payload).length) return null;
  return unwrap(await supabase.from("families").update(payload).eq("id", familyId).select().single());
}

// Addendum 37 (September 2026 change request) — stamps the moment staff
// open a family's record or save a change to it, which is what the
// Caseload list's default sort (most recently touched first) is built on.
// Deliberately fire-and-forget: a family bubbling up the Caseload list a
// few seconds late because this failed once is a non-event, and nothing
// staff are looking at should ever block or show an error over this alone.
export function touchFamilyActivity(familyId) {
  supabase
    .from("families")
    .update({ last_staff_activity_at: new Date().toISOString() })
    .eq("id", familyId)
    .then(({ error }) => {
      if (error) console.error("touchFamilyActivity failed:", error);
    });
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

export async function createSchool(patch) {
  return unwrap(await supabase.from("schools").insert(patch).select().single());
}

export async function updateSchool(schoolId, patch) {
  return unwrap(await supabase.from("schools").update(patch).eq("id", schoolId).select().single());
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
// Application events + fees (addendum 60) -- the Stage Timeline and Fees
// list on an application's expanded detail. Both tables are written by
// staff through these functions today; a future OpenApply sync job writes
// into the exact same tables with source="openapply_sync" instead, so nothing
// here needs to change when that lands.
// ---------------------------------------------------------------------------

export async function listApplicationEvents(applicationIds) {
  if (!applicationIds || !applicationIds.length) return [];
  return (
    unwrap(
      await supabase
        .from("application_events")
        .select("*")
        .in("application_id", applicationIds)
        .order("occurred_at", { ascending: false })
    ) || []
  );
}

export async function createApplicationEvent({ applicationId, eventType, newStatus, description, occurredAt }) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return unwrap(
    await supabase
      .from("application_events")
      .insert({
        application_id: applicationId,
        event_type: eventType,
        new_status: newStatus || null,
        description,
        occurred_at: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
        source: "staff",
        created_by: user?.id || null,
      })
      .select()
      .single()
  );
}

// OpenApply checklist items per application (addendum 65), written by the
// OpenApply sync job. Read-only in the app -- the school's portal is the
// source of truth. Fails soft (empty) if addendum 65 hasn't been run.
export async function listChecklistItems(applicationIds) {
  if (!applicationIds || !applicationIds.length) return [];
  const { data, error } = await supabase
    .from("application_checklist_items")
    .select("*")
    .in("application_id", applicationIds)
    .order("created_at", { ascending: true });
  if (error) return [];
  return data || [];
}

export async function listApplicationFees(applicationIds) {
  if (!applicationIds || !applicationIds.length) return [];
  return (
    unwrap(
      await supabase
        .from("application_fees")
        .select("*")
        .in("application_id", applicationIds)
        .order("due_date", { nullsFirst: false })
    ) || []
  );
}

export async function createApplicationFee({ applicationId, label, amount, currency, dueDate }) {
  return unwrap(
    await supabase
      .from("application_fees")
      .insert({
        application_id: applicationId,
        label: label.trim(),
        amount: amount === "" || amount === null || amount === undefined ? null : Number(amount),
        currency: currency || "AED",
        due_date: dueDate || null,
        source: "staff",
      })
      .select()
      .single()
  );
}

export async function updateApplicationFee(feeId, patch) {
  return unwrap(await supabase.from("application_fees").update(patch).eq("id", feeId).select().single());
}

export async function deleteApplicationFee(feeId) {
  const { error } = await supabase.from("application_fees").delete().eq("id", feeId);
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

export async function updateTask(taskId, { title, dueDate, assignedTo, familyId } = {}) {
  const row = {};
  if (title !== undefined) row.title = title.trim();
  if (dueDate !== undefined) row.due_date = dueDate || null;
  if (assignedTo !== undefined) row.assigned_to = assignedTo || null;
  // Same reassignment gap as updateCalendarEvent above — the "Family"
  // select on the edit form is never disabled for a task either, so it has
  // to actually be saveable.
  if (familyId !== undefined) row.family_id = familyId || null;
  return unwrap(await supabase.from("tasks").update(row).eq("id", taskId).select().single());
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
// Payments (addendum 9) — per-family fees/deposits with an amount and due
// date. Staff-only; nothing here is client-facing.
// ---------------------------------------------------------------------------

export async function createPayment({ familyId, label, amount, currency, dueDate, notes }) {
  return unwrap(
    await supabase
      .from("payments")
      .insert({
        family_id: familyId,
        label,
        amount: amount === "" || amount === null || amount === undefined ? null : Number(amount),
        currency: currency || "AED",
        due_date: dueDate || null,
        notes: notes || null,
      })
      .select()
      .single()
  );
}

export async function updatePayment(paymentId, { label, amount, currency, dueDate, status, notes } = {}) {
  const row = {};
  if (label !== undefined) row.label = label;
  if (amount !== undefined) row.amount = amount === "" || amount === null ? null : Number(amount);
  if (currency !== undefined) row.currency = currency;
  if (dueDate !== undefined) row.due_date = dueDate || null;
  if (status !== undefined) row.status = status;
  if (notes !== undefined) row.notes = notes;
  return unwrap(await supabase.from("payments").update(row).eq("id", paymentId).select().single());
}

export async function deletePayment(paymentId) {
  const { error } = await supabase.from("payments").delete().eq("id", paymentId);
  if (error) throw error;
}

// Turns a chosen package (data/packages.js) into real payment rows for one
// family — the package fee, plus a per-additional-child fee if there's more
// than one child. Insert-only: never touches or removes an existing
// payment, so re-running this (e.g. after a child is added later) only ever
// adds what's missing, never duplicates or overwrites what a founder may
// have already edited by hand.
export async function createPackagePayments({ familyId, fees }) {
  if (!fees || !fees.length) return [];
  const created = await Promise.all(fees.map((fee) => createPayment({ familyId, label: fee.label, amount: fee.amount })));
  return created;
}

// ---------------------------------------------------------------------------
// The Today page — one fetch for the whole dashboard.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Case notes — the internal call log / activity trail (addendum 5).
//
// author_id is deliberately NOT sent from here. A database trigger stamps it
// from auth.uid() on insert and refuses to let it change on update, so the
// log can't be written under someone else's name even by a buggy client.
// ---------------------------------------------------------------------------

export async function createCaseNote({ familyId, childId, schoolId, kind, body, occurredAt, subject, direction }) {
  return unwrap(
    await supabase
      .from("case_notes")
      .insert({
        family_id: familyId,
        child_id: childId || null,
        school_id: schoolId || null,
        kind: kind || "note",
        body: body.trim(),
        // subject/direction only mean anything for kind="email" (addendum 7)
        // -- null for every other kind, same as an inbound row the Worker
        // never touched.
        subject: subject || null,
        direction: direction || null,
        // An empty date box means "just now", not a null column.
        occurred_at: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
      })
      .select()
      .single()
  );
}

export async function updateCaseNote(noteId, patch) {
  const row = {};
  if ("body" in patch) row.body = (patch.body || "").trim();
  if ("kind" in patch) row.kind = patch.kind || "note";
  if ("childId" in patch) row.child_id = patch.childId || null;
  if ("schoolId" in patch) row.school_id = patch.schoolId || null;
  if ("occurredAt" in patch && patch.occurredAt) row.occurred_at = new Date(patch.occurredAt).toISOString();
  return unwrap(await supabase.from("case_notes").update(row).eq("id", noteId).select().single());
}

export async function deleteCaseNote(noteId) {
  const { error } = await supabase.from("case_notes").delete().eq("id", noteId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Calendar (addendum 6) — deadlines, reminders, and team events. Staff see
// and manage everything; visible_to_client is the one thing that decides
// whether a given event also shows on that family's own dashboard.
//
// created_by is deliberately NOT sent from here, same reasoning as
// case_notes' author_id — a trigger stamps it from auth.uid() on insert and
// refuses to let it change on update.
// ---------------------------------------------------------------------------

// Pulls calendar_events AND tasks into one merged, calendar-shaped list.
// Tasks are not copied anywhere — this reads the exact same `tasks` rows
// TasksPanel and the Today page use, so a task added on the family page
// shows up here automatically, and a "Task" added from the calendar shows
// up on the family page automatically. Nothing here is ever written to
// `calendar_events` for a task; the two tables stay exactly what they were.
export async function loadCalendarEvents({ from, to } = {}) {
  let eventsQuery = supabase.from("calendar_events").select("*").order("starts_at");
  let tasksQuery = supabase.from("tasks").select("*").not("due_date", "is", null).order("due_date");
  let visitsQuery = supabase.from("applications").select("*").not("visit_date", "is", null).order("visit_date");
  if (from) {
    eventsQuery = eventsQuery.gte("starts_at", new Date(from).toISOString());
    tasksQuery = tasksQuery.gte("due_date", toDateOnly(from));
    visitsQuery = visitsQuery.gte("visit_date", toDateOnly(from));
  }
  if (to) {
    eventsQuery = eventsQuery.lt("starts_at", new Date(to).toISOString());
    tasksQuery = tasksQuery.lt("due_date", toDateOnly(to));
    visitsQuery = visitsQuery.lt("visit_date", toDateOnly(to));
  }

  const [events, tasks, visits, families, parents, staff, children, schools] = await Promise.all([
    eventsQuery.then(unwrap),
    tasksQuery.then(unwrap),
    visitsQuery.then(unwrap),
    supabase.from("families").select("*").then(unwrap),
    supabase.from("parents").select("id, family_id, relationship, full_name, user_id").then(unwrap),
    listStaff(),
    supabase.from("children").select("id, family_id, full_name, preferred_name, first_name").then(unwrap),
    listSchools(),
  ]);

  const parentsByFamily = groupBy(parents, "family_id");
  const familyNames = Object.fromEntries(
    (families || []).map((f) => [f.id, familyDisplayName(f, parentsByFamily[f.id] || [])])
  );
  const staffById = Object.fromEntries((staff || []).map((s) => [s.user_id, s]));
  const childById = Object.fromEntries((children || []).map((c) => [c.id, c]));
  const schoolNameById = Object.fromEntries((schools || []).map((s) => [s.id, s.name]));

  const decoratedEvents = (events || []).map((e) => ({
    ...e,
    source: "calendar_event",
    familyName: e.family_id ? familyNames[e.family_id] || "Unknown family" : null,
    consultantName: e.created_by ? staffName(staffById[e.created_by]) : "Unassigned",
  }));

  const decoratedTasks = (tasks || []).map((t) => ({
    id: t.id,
    source: "task",
    kind: "task",
    title: t.title,
    starts_at: `${t.due_date}T00:00:00`,
    all_day: true,
    status: t.done_at ? "done" : "upcoming",
    visible_to_client: false,
    family_id: t.family_id,
    created_by: t.created_by,
    assigned_to: t.assigned_to,
    done_at: t.done_at,
    familyName: t.family_id ? familyNames[t.family_id] || "Unknown family" : null,
    consultantName: t.assigned_to ? staffName(staffById[t.assigned_to]) : "Anyone",
  }));

  // School visits — read straight off applications.visit_date, same
  // read-merge approach as tasks. No family_id column on applications
  // itself, so it's looked up via the child.
  const decoratedVisits = (visits || []).map((v) => {
    const child = childById[v.child_id];
    const childName = child ? child.full_name || child.preferred_name || child.first_name : "Unknown child";
    const schoolName = schoolNameById[v.school_id] || "Unknown school";
    return {
      id: v.id,
      source: "application_visit",
      kind: "school_visit",
      title: `${schoolName} visit — ${childName}`,
      notes: v.visit_notes || "",
      starts_at: `${v.visit_date}T00:00:00`,
      all_day: true,
      status: "upcoming",
      visible_to_client: false,
      family_id: child ? child.family_id : null,
      child_id: v.child_id,
      application_id: v.id,
      familyName: child && childById[v.child_id]
        ? familyNames[child.family_id] || "Unknown family"
        : null,
      consultantName: null,
    };
  });

  return [...decoratedEvents, ...decoratedTasks, ...decoratedVisits].sort(
    (a, b) => new Date(a.starts_at) - new Date(b.starts_at)
  );
}

function toDateOnly(d) {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function createCalendarEvent({
  familyId,
  childId,
  applicationId,
  kind,
  title,
  notes,
  startsAt,
  endsAt,
  allDay,
  visibleToClient,
}) {
  return unwrap(
    await supabase
      .from("calendar_events")
      .insert({
        family_id: familyId || null,
        child_id: childId || null,
        application_id: applicationId || null,
        kind: kind || "reminder",
        title: title.trim(),
        notes: notes?.trim() || null,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        all_day: allDay ?? true,
        visible_to_client: !!visibleToClient,
      })
      .select()
      .single()
  );
}

export async function updateCalendarEvent(eventId, patch) {
  const row = {};
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.notes !== undefined) row.notes = patch.notes?.trim() || null;
  if (patch.kind !== undefined) row.kind = patch.kind;
  // Which family (and optionally child) an event belongs to CAN be changed
  // after it's created — the "Family" / "Child" selects on the edit form
  // are never disabled — so this has to accept reassignment, not just the
  // fields above. Missing this meant re-picking a family in the edit modal
  // looked like it saved (no error) but silently did nothing: the row kept
  // whichever family it was first created under, which is also why it
  // never showed up on the family you'd actually just picked.
  if (patch.familyId !== undefined) row.family_id = patch.familyId || null;
  if (patch.childId !== undefined) row.child_id = patch.childId || null;
  if (patch.applicationId !== undefined) row.application_id = patch.applicationId || null;
  if (patch.startsAt !== undefined) row.starts_at = new Date(patch.startsAt).toISOString();
  if (patch.endsAt !== undefined) row.ends_at = patch.endsAt ? new Date(patch.endsAt).toISOString() : null;
  if (patch.allDay !== undefined) row.all_day = patch.allDay;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.visibleToClient !== undefined) row.visible_to_client = !!patch.visibleToClient;

  return unwrap(await supabase.from("calendar_events").update(row).eq("id", eventId).select().single());
}

export async function deleteCalendarEvent(eventId) {
  const { error } = await supabase.from("calendar_events").delete().eq("id", eventId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Application email aliases (addendum 7) — one forwarding-only address per
// family so the same relocate@heatherharries.com never has to be reused
// across schools. The mail routing itself lives outside Supabase (Cloudflare
// Email Routing + a Worker); this is just the CRM's side of it.
// ---------------------------------------------------------------------------

// The address is just the person's name, lower case, letters only --
// "Asma Khanam" -> asmakhanam (founders, 22 Sept 2026: "no numbers, no
// symbols, don't complicate it"). Accents are folded to plain letters
// ("Zoë" -> zoe). Uniqueness is still enforced by the database column; if
// the name is already taken there is deliberately no automatic number
// tacked on -- staff get a clear message instead and decide what to do.
function slugFor(name, fallback = "family") {
  return (
    (name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/^the\s+/, "")
      .replace(/\s+family$/, "")
      .replace(/[^a-z]/g, "") || fallback
  );
}

function aliasTakenError(alias) {
  return new Error(
    `${alias}@applications.heatherharries.com is already used by someone else. Check the name on this record, or ask Heather which address to use.`
  );
}

// Addendum 43 — one password generated alongside the alias itself, reused
// as-is for every school that address gets registered with. 12 characters,
// upper/lower/digit/symbol guaranteed so it clears a typical portal's
// complexity rule without staff having to think about it, and skips
// visually ambiguous characters (0/O, 1/l/I) since this gets read off a
// screen and typed into someone else's site by hand more than once.
function randomApplicationPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const upper = letters.toUpperCase();
  const digits = "23456789";
  const symbols = "!@#$%";
  const all = letters + upper + digits + symbols;
  const pick = (set) => set[Math.floor(Math.random() * set.length)];
  const required = [pick(letters), pick(upper), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 8 }, () => pick(all));
  return [...required, ...rest].sort(() => Math.random() - 0.5).join("");
}

export async function generateApplicationAlias(familyId, familyDisplayNameValue) {
  const alias = slugFor(familyDisplayNameValue, "family");
  const { data, error } = await supabase
    .from("families")
    .update({ application_alias: alias, application_alias_status: "active", application_password: randomApplicationPassword() })
    .eq("id", familyId)
    .select()
    .single();
  // 23505 = unique_violation — someone else already has this exact name.
  if (error?.code === "23505") throw aliasTakenError(alias);
  if (error) throw error;
  return data;
}

export async function setApplicationAliasStatus(familyId, status) {
  return unwrap(
    await supabase
      .from("families")
      .update({ application_alias_status: status })
      .eq("id", familyId)
      .select()
      .single()
  );
}

// Addendum 43 follow-up — for an address that was generated before the
// application_password column existed (or otherwise ended up without one).
// Fills in a password without touching the address itself, since the
// address may already be registered with a school and shouldn't change.
export async function regenerateApplicationPassword(familyId) {
  return unwrap(
    await supabase
      .from("families")
      .update({ application_password: randomApplicationPassword() })
      .eq("id", familyId)
      .select()
      .single()
  );
}

// Addendum 42 — the same one-address-per-owner pattern as
// generateApplicationAlias above, just scoped to a single parent row so a
// family's Mother and Father can each get their own alias to register with
// a school portal separately. Seeded from THIS parent's own name — not the
// family's display name, which is the account holder's name and would put
// the same person's name on both the mother's and the father's address.
// Falls back to "parent" if this row has no name yet.
// Addendum 43 — generates the one password that goes with it, same as the
// family-wide alias above.
// `relationship` is no longer part of the address (it used to add an m/f
// suffix); the parameter stays so existing callers don't change.
export async function generateParentApplicationAlias(parentId, parentFullName, _relationship) {
  if (!(parentFullName || "").trim()) {
    throw new Error("Add this parent's name first — the application email is made from it.");
  }
  const alias = slugFor(parentFullName, "parent");
  const { data, error } = await supabase
    .from("parents")
    .update({ application_alias: alias, application_alias_status: "active", application_password: randomApplicationPassword() })
    .eq("id", parentId)
    .select()
    .single();
  if (error?.code === "23505") throw aliasTakenError(alias);
  if (error) throw error;
  return data;
}

export async function setParentApplicationAliasStatus(parentId, status) {
  return unwrap(
    await supabase
      .from("parents")
      .update({ application_alias_status: status })
      .eq("id", parentId)
      .select()
      .single()
  );
}

export async function regenerateParentApplicationPassword(parentId) {
  return unwrap(
    await supabase
      .from("parents")
      .update({ application_password: randomApplicationPassword() })
      .eq("id", parentId)
      .select()
      .single()
  );
}

export async function getTodayData() {
  const [tasks, families, parents, applications, parentDocs, childDocs, staff, payments, recentNotes] = await Promise.all([
    supabase.from("tasks").select("*").order("due_date", { nullsFirst: false }).then(unwrap),
    supabase.from("families").select("*").then(unwrap),
    supabase.from("parents").select("id, family_id, relationship, full_name, user_id").then(unwrap),
    supabase.from("applications").select("*").then(unwrap),
    supabase.from("documents").select("*").eq("owner_type", "parent").then(unwrap),
    supabase.from("documents").select("*").eq("owner_type", "child").then(unwrap),
    listStaff(),
    supabase.from("payments").select("*").in("status", ["unpaid", "submitted"]).order("due_date", { nullsFirst: false }).then(unwrap),
    // The "who did what" trail, surfaced somewhere it's actually seen day to
    // day rather than only when opening one specific family. Ten is plenty
    // for a glance — this is a feed, not a report.
    supabase.from("case_notes").select("*").order("created_at", { ascending: false }).limit(10).then(unwrap),
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

  // Profile photos live in the documents table too (same polymorphic row, so
  // they needed no schema of their own) but they are not paperwork — they're
  // never chased, never expire, and must never land in a "documents to chase"
  // count. The Document Vault filters by document type so a photo can't be
  // given a status in the first place; this is the belt to that's braces.
  const allDocs = [...(parentDocs || []), ...(childDocs || [])].filter(
    (d) => d.document_type !== "profile_photo"
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const decoratedPayments = (payments || []).map((p) => ({
    ...p,
    familyName: p.family_id ? familyNames[p.family_id] || "Unknown family" : "No family",
    isOverdue: !!p.due_date && new Date(p.due_date) < today,
  }));

  const decoratedActivity = (recentNotes || []).map((n) => ({
    ...n,
    familyName: familyNames[n.family_id] || "Unknown family",
    staffName: n.author_id ? staffName(staffById[n.author_id]) : "Unknown",
  }));

  const unownedFamilies = (families || [])
    .filter((f) => !f.owner_staff_id)
    .map((f) => ({ id: f.id, name: familyNames[f.id] || "Unnamed family" }));

  return {
    tasks: decorated,
    families: families || [],
    familyNames,
    offersInPlay: (applications || []).filter((a) => a.status === "offer").length,
    chasingDocs: allDocs.filter((d) => d.status === "chasing").length,
    expiringDocs: allDocs.filter((d) => isExpiring(d.expires_at)).length,
    documents: allDocs,
    payments: decoratedPayments,
    overduePayments: decoratedPayments.filter((p) => p.status === "unpaid" && p.isOverdue).length,
    paymentsToConfirm: decoratedPayments.filter((p) => p.status === "submitted").length,
    recentActivity: decoratedActivity,
    unownedFamilies,
  };
}

// ---------------------------------------------------------------------------
// Editing a family's own submitted answers, from the founders' side
// (addendum 33, September 2026 change request) — plus the change history
// that comes with it. Generic on purpose: RecordFieldsEditor (components/)
// is the one place that calls these, for every editable section on
// FamilyDetailPage (a parent, a child, a child's current school), so a new
// editable section later is a couple of lines there, not a new pair of
// functions here.
// ---------------------------------------------------------------------------

// Updates an existing row. `patch` is whatever changed — RecordFieldsEditor
// only ever sends the fields it actually diffed, never the whole record.
export async function updateRecordFields(table, recordId, patch) {
  if (!Object.keys(patch).length) return null;
  return unwrap(await supabase.from(table).update(patch).eq("id", recordId).select().single());
}

// For the one case a record might not exist yet — a child whose current
// school was never started on the family's own form. `extra` carries the
// foreign key (e.g. { child_id }) the row needs beyond the edited fields
// themselves.
export async function insertRecordWithFields(table, extra, patch) {
  return unwrap(
    await supabase
      .from(table)
      .insert({ ...extra, ...patch })
      .select()
      .single()
  );
}


// ---------------------------------------------------------------------------
// School visits tracker — Phase 1 (addendum 36, September 2026 change
// request). The school catalog, year group availability, and each family's
// shortlist. See the addendum's own comment for what's deliberately not
// built yet (tours/feedback, the family timetable, chase-clock automation).
// ---------------------------------------------------------------------------

export async function listSchoolsWithStats() {
  const [schools, shortlist] = await Promise.all([
    supabase.from("schools").select("*").order("name").then(unwrap),
    supabase.from("school_shortlist").select("id, school_id, availability_status").then(unwrap),
  ]);
  const bySchool = groupBy(shortlist, "school_id");
  return (schools || []).map((s) => {
    const entries = bySchool[s.id] || [];
    return {
      ...s,
      shortlistCount: entries.length,
      awaitingCount: entries.filter((e) => e.availability_status === "awaiting").length,
    };
  });
}

export async function getSchoolDetail(schoolId) {
  const [school, availability, shortlist] = await Promise.all([
    supabase.from("schools").select("*").eq("id", schoolId).single().then(unwrap),
    supabase
      .from("school_year_group_availability")
      .select("*")
      .eq("school_id", schoolId)
      .order("year_group")
      .then(unwrap),
    supabase
      .from("school_shortlist")
      .select("*")
      .eq("school_id", schoolId)
      .order("shortlisted_at", { ascending: false })
      .then(unwrap),
  ]);

  const familyIds = [...new Set((shortlist || []).map((row) => row.family_id))];
  const [families, parents, children] = await Promise.all([
    familyIds.length ? supabase.from("families").select("*").in("id", familyIds).then(unwrap) : Promise.resolve([]),
    familyIds.length ? supabase.from("parents").select("*").in("family_id", familyIds).then(unwrap) : Promise.resolve([]),
    familyIds.length
      ? supabase.from("children").select("*").in("family_id", familyIds).order("created_at").then(unwrap)
      : Promise.resolve([]),
  ]);
  const familiesById = Object.fromEntries((families || []).map((f) => [f.id, f]));
  const parentsByFamily = groupBy(parents, "family_id");
  const childrenByFamily = groupBy(children, "family_id");

  // Per-child availability answers and per-child applications at this
  // school -- so the "Shortlisted families" section can show every
  // shortlisted family's children individually (per-child availability
  // chip, plus whether that child has an application in at this school),
  // mirroring the founders' own "School visits tracker" mockup but
  // inverted: one school, many families/children instead of one family,
  // many schools.
  const shortlistIds = (shortlist || []).map((row) => row.id);
  const childIds = (children || []).map((c) => c.id);
  const [childStatus, childApplications] = await Promise.all([
    listChildAvailabilityForShortlistIds(shortlistIds),
    childIds.length
      ? supabase.from("applications").select("*").eq("school_id", schoolId).in("child_id", childIds).then(unwrap)
      : Promise.resolve([]),
  ]);
  const childStatusByShortlist = groupBy(childStatus, "shortlist_id");
  const applicationsByChild = groupBy(childApplications || [], "child_id");

  const shortlistWithNames = (shortlist || []).map((row) => {
    const family = familiesById[row.family_id];
    const familyChildren = childrenByFamily[row.family_id] || [];
    const statusByChildId = Object.fromEntries(
      (childStatusByShortlist[row.id] || []).map((s) => [s.child_id, s.availability_status])
    );
    return {
      ...row,
      familyName: family ? familyDisplayName(family, parentsByFamily[row.family_id]) : "Unknown family",
      children: familyChildren.map((child) => ({
        ...child,
        availability_status: statusByChildId[child.id] || "awaiting",
        applications: applicationsByChild[child.id] || [],
      })),
    };
  });

  // Derived counts for the school record (Phase 4 of the build note):
  // tours/toured come straight off school_shortlist's own tour_status;
  // applications/assessments/offers are read from the existing
  // `applications` table (per-child, per-school — already built and in
  // daily use on FamilyDetailPage's Applications panel) rather than
  // duplicating a second, parallel "application status" on the shortlist
  // row, which would just give staff two different answers to "has this
  // family applied here yet?" There's no "accepted" concept anywhere in
  // the schema yet (no field marks which single school a family ultimately
  // accepted) — reported as null rather than a fabricated number.
  const allApplicationStatuses = unwrap(
    await supabase.from("applications").select("status").eq("school_id", schoolId)
  ) || [];
  const stats = {
    toursBooked: shortlistWithNames.filter((r) => ["offered", "confirmed", "completed"].includes(r.tour_status)).length,
    toured: shortlistWithNames.filter((r) => r.tour_status === "completed").length,
    applications: allApplicationStatuses.filter((a) => a.status !== "draft" && a.status !== "withdrawn").length,
    assessments: allApplicationStatuses.filter((a) => ["assessment_booked", "under_review"].includes(a.status)).length,
    offers: allApplicationStatuses.filter((a) => a.status === "offer" || a.status === "offer_accepted").length,
    accepted: null,
  };

  return { school, availability: availability || [], shortlist: shortlistWithNames, stats };
}

export async function upsertYearGroupAvailability(schoolId, { id, yearGroup, status, lastCheckedAt }) {
  const row = {
    school_id: schoolId,
    year_group: yearGroup,
    status,
    last_checked_at: lastCheckedAt || new Date().toISOString(),
  };
  if (id) {
    return unwrap(
      await supabase.from("school_year_group_availability").update(row).eq("id", id).select().single()
    );
  }
  return unwrap(
    await supabase
      .from("school_year_group_availability")
      // Re-adding a year group that already has a row (unique on
      // school_id+year_group) updates it in place rather than erroring —
      // one less thing staff need to remember when correcting a typo'd
      // year group by re-entering it.
      .upsert(row, { onConflict: "school_id,year_group" })
      .select()
      .single()
  );
}

export async function deleteYearGroupAvailability(id) {
  const { error } = await supabase.from("school_year_group_availability").delete().eq("id", id);
  if (error) throw error;
}

// One family's whole shortlist, newest first — used on FamilyDetailPage.
export async function listShortlistForFamily(familyId) {
  const [shortlist, schools] = await Promise.all([
    supabase
      .from("school_shortlist")
      .select("*")
      .eq("family_id", familyId)
      .order("shortlisted_at", { ascending: false })
      .then(unwrap),
    listSchools(),
  ]);
  const schoolsById = Object.fromEntries((schools || []).map((s) => [s.id, s]));
  return (shortlist || []).map((row) => ({ ...row, school: schoolsById[row.school_id] || null }));
}

// Other families' own feedback on the same schools -- the "Other families
// on this school" panel on the redesigned School shortlist view. Batched
// across every school on the current family's shortlist in one query
// rather than one round trip per row. Never returns this family's own
// feedback (that's already shown in its own row) or a row with no
// feedback text yet.
export async function listOtherFeedbackForSchools(schoolIds, excludeFamilyId) {
  if (!schoolIds || schoolIds.length === 0) return {};
  const rows =
    unwrap(
      await supabase
        .from("school_shortlist")
        .select("id, school_id, family_id, feedback_text, feedback_rating, feedback_at")
        .in("school_id", schoolIds)
        .not("feedback_text", "is", null)
        .neq("family_id", excludeFamilyId)
        .order("feedback_at", { ascending: false })
    ) || [];

  const familyIds = [...new Set(rows.map((r) => r.family_id))];
  const [families, parents] = await Promise.all([
    familyIds.length ? supabase.from("families").select("*").in("id", familyIds).then(unwrap) : Promise.resolve([]),
    familyIds.length ? supabase.from("parents").select("*").in("family_id", familyIds).then(unwrap) : Promise.resolve([]),
  ]);
  const familiesById = Object.fromEntries((families || []).map((f) => [f.id, f]));
  const parentsByFamily = groupBy(parents, "family_id");

  const withNames = rows.map((r) => ({
    ...r,
    familyName: familiesById[r.family_id]
      ? familyDisplayName(familiesById[r.family_id], parentsByFamily[r.family_id])
      : "Another family",
  }));
  return groupBy(withNames, "school_id");
}

export async function addToShortlist({ familyId, schoolId }) {
  return unwrap(
    await supabase
      .from("school_shortlist")
      .insert({ family_id: familyId, school_id: schoolId })
      .select()
      .single()
  );
}

export async function updateShortlistEntry(shortlistId, patch) {
  return unwrap(await supabase.from("school_shortlist").update(patch).eq("id", shortlistId).select().single());
}

export async function removeFromShortlist(shortlistId) {
  const { error } = await supabase.from("school_shortlist").delete().eq("id", shortlistId);
  if (error) throw error;
}

// Year-group availability rows for a set of schools in one query — used to
// show each shortlisted school's per-child status on the family page
// (matched against each child's year_group_applying_for) without a
// round-trip per school.
export async function listYearGroupAvailabilityForSchoolIds(schoolIds) {
  if (!schoolIds || schoolIds.length === 0) return [];
  return (
    unwrap(
      await supabase.from("school_year_group_availability").select("*").in("school_id", schoolIds)
    ) || []
  );
}

// ---------------------------------------------------------------------------
// School Visits Tracker, Phase 2 & 3 (addendum 38) — per-child availability,
// tours, and feedback. (Addendum 44 removed the clash-check distance
// estimate that used to live in this section.)
// ---------------------------------------------------------------------------

// Per-child availability rows for a set of shortlist entries in one query —
// same "batch, not one call per row" shape as listYearGroupAvailabilityForSchoolIds.
export async function listChildAvailabilityForShortlistIds(shortlistIds) {
  if (!shortlistIds || shortlistIds.length === 0) return [];
  return (
    unwrap(
      await supabase.from("school_shortlist_child_status").select("*").in("shortlist_id", shortlistIds)
    ) || []
  );
}

// Upsert-by-natural-key, same convention as upsertYearGroupAvailability —
// re-answering for a child that already has a row updates it in place.
export async function upsertChildAvailability(shortlistId, childId, availabilityStatus) {
  return unwrap(
    await supabase
      .from("school_shortlist_child_status")
      .upsert(
        { shortlist_id: shortlistId, child_id: childId, availability_status: availabilityStatus },
        { onConflict: "shortlist_id,child_id" }
      )
      .select()
      .single()
  );
}

// Tour details and feedback both live as columns on the same school_shortlist
// row (see addendum 38) — one function covers both since the UI edits them
// in the same panel and there's no reason to make two round trips.
export async function updateShortlistTour(shortlistId, patch) {
  return unwrap(await supabase.from("school_shortlist").update(patch).eq("id", shortlistId).select().single());
}

// Staff-only notes per shortlisted school (addendum 63). Its own table, not a
// column on school_shortlist, because families can read school_shortlist.
export async function listShortlistNotes(shortlistIds) {
  if (!shortlistIds || shortlistIds.length === 0) return {};
  const rows = unwrap(await supabase.from("shortlist_notes").select("shortlist_id, body").in("shortlist_id", shortlistIds));
  return Object.fromEntries((rows || []).map((r) => [r.shortlist_id, r.body || ""]));
}

export async function saveShortlistNote(shortlistId, body) {
  return unwrap(
    await supabase
      .from("shortlist_notes")
      .upsert({ shortlist_id: shortlistId, body, updated_at: new Date().toISOString() })
      .select()
      .single()
  );
}

// The founders' request: once a tour's date has passed, it should flip to
// "Completed" on its own rather than someone remembering to change it by
// hand. Dates are compared in Asia/Dubai (where the schools and tours
// actually are), not the browser's own timezone. Shared between the School
// visits tab and the Overview pipeline widget so a tour completes the same
// way regardless of which one happens to load first.
export function todayInDubai() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }); // YYYY-MM-DD
}

// Founder feedback (Sept 2026, Heather via WhatsApp): "for the Hadleys
// that went to Queen Elizabeth today?" -- a same-day tour used to sit as
// "Confirmed" (and Proceed stayed locked on "Awaiting tour") until
// midnight rolled the date over, even hours after the tour itself had
// clearly finished. "HH:MM" in Asia/Dubai so it can be compared directly
// against tour_start_time/tour_end_time, which are stored the same way.
export function nowTimeInDubai() {
  return new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hour12: false });
}

// A tour counts as "past" once its own date is behind today, OR it's
// today and the time it was scheduled to end (or start, if no end time
// was set) has already gone by -- deliberately NOT "today" on its own,
// so a same-day tour later this afternoon doesn't get marked Completed
// before it's actually happened. A same-day tour with no time recorded
// at all is left for staff to mark by hand, since there's nothing to
// compare against.
function tourIsPast(dateStr, startTime, endTime, today, nowTime) {
  if (!dateStr) return false;
  if (dateStr < today) return true;
  if (dateStr > today) return false;
  const cutoff = endTime || startTime;
  return Boolean(cutoff) && cutoff <= nowTime;
}

// Only ever moves forward (never touches "Cancelled", and never
// un-completes anything).
export async function autoCompletePastTours(shortlist) {
  const today = todayInDubai();
  const nowTime = nowTimeInDubai();
  const nowIso = new Date().toISOString();

  // Founder feedback (Sept 2026): "after the date has passed, the status
  // should automatically go to completed" -- originally only checked the
  // primary tour slot. Addendum 58's independent secondary tour slot needs
  // the exact same auto-complete, on its own date/status pair, so a school
  // with a primary tour done and a secondary tour still upcoming doesn't
  // get flipped early (or a secondary tour done while the primary is still
  // pending doesn't get skipped).
  const updates = await Promise.all(
    shortlist.map((r) => {
      const patch = {};
      if (
        tourIsPast(r.tour_date, r.tour_start_time, r.tour_end_time, today, nowTime) &&
        (r.tour_status === "offered" || r.tour_status === "confirmed")
      ) {
        patch.tour_status = "completed";
        patch.tour_completed_at = nowIso;
      }
      if (
        tourIsPast(r.tour2_date, r.tour2_start_time, r.tour2_end_time, today, nowTime) &&
        (r.tour2_status === "offered" || r.tour2_status === "confirmed")
      ) {
        patch.tour2_status = "completed";
        patch.tour2_completed_at = nowIso;
      }
      if (Object.keys(patch).length === 0) return null;
      return updateShortlistTour(r.id, patch).catch(() => null);
    })
  );
  const updatedById = Object.fromEntries(updates.filter(Boolean).map((u) => [u.id, u]));
  if (Object.keys(updatedById).length === 0) return shortlist;
  return shortlist.map((r) => (updatedById[r.id] ? { ...r, ...updatedById[r.id] } : r));
}

// Every shortlist row for a family that has a tour date set, across every
// shortlisted school — what the "Tour schedule" list is built from.
// Addendum 44 dropped the same-day clash check (and the schools.latitude/
// longitude columns it read) at the founders' request, so this no longer
// needs to carry coordinates for a client-side distance estimate.
export async function listToursForFamily(familyId) {
  const shortlist = await listShortlistForFamily(familyId);
  return shortlist.filter((row) => row.tour_date);
}

// School notes feed (addendum 66): add-only log, newest first.
export async function listSchoolNotes(schoolId) {
  return unwrap(
    await supabase.from("school_notes").select("*").eq("school_id", schoolId).order("created_at", { ascending: false })
  );
}

export async function createSchoolNote(schoolId, body) {
  return unwrap(
    await supabase.from("school_notes").insert({ school_id: schoolId, body: body.trim() }).select().single()
  );
}

export async function updateSchoolNote(noteId, body) {
  return unwrap(
    await supabase
      .from("school_notes")
      .update({ body: body.trim(), edited_at: new Date().toISOString() })
      .eq("id", noteId)
      .select()
      .single()
  );
}

// Client stage history (addendum 68): every move, oldest first.
export async function listFamilyStageHistory(familyId) {
  return unwrap(
    await supabase.from("family_stage_history").select("*").eq("family_id", familyId).order("moved_at", { ascending: true })
  );
}

// Every family's moves, for the caseload's "has ever been in" filter.
export async function listAllStageHistory() {
  return unwrap(await supabase.from("family_stage_history").select("family_id, to_stage"));
}

// ---------------------------------------------------------------------------
// Addendum 70: document descriptions, partner referrals, placements
// ---------------------------------------------------------------------------
export async function updateDocumentDescription(docId, description) {
  return unwrap(
    await supabase
      .from("documents")
      .update({ description: (description || "").trim() || null })
      .eq("id", docId)
      .select()
      .single()
  );
}

export async function listPartnerReferrals(familyId) {
  return unwrap(
    await supabase.from("partner_referrals").select("*").eq("family_id", familyId).order("referred_on", { ascending: false })
  );
}

export async function createPartnerReferral({ familyId, direction, partnerName, referredOn, notes }) {
  return unwrap(
    await supabase
      .from("partner_referrals")
      .insert({
        family_id: familyId,
        direction,
        partner_name: partnerName.trim(),
        referred_on: referredOn || new Date().toISOString().slice(0, 10),
        notes: notes?.trim() || null,
      })
      .select()
      .single()
  );
}

export async function listPlacements(familyId) {
  return unwrap(
    await supabase.from("family_placements").select("*").eq("family_id", familyId).order("start_date", { ascending: true })
  );
}

// A placement is a child's school start date. Saving one also puts a
// reminder on the calendar for that day ("wish them good luck"), and
// changing the date moves that same reminder rather than adding another.
export async function createPlacement({ familyId, childId, childName, schoolName, startDate }) {
  const event = await createCalendarEvent({
    familyId,
    childId: childId || null,
    kind: "reminder",
    title: `First day at ${schoolName.trim()}: wish ${childName || "the child"} good luck`,
    notes: "Placement start date. Send a good-luck message on their first day.",
    startsAt: `${startDate}T09:00:00`,
    allDay: true,
  });
  return unwrap(
    await supabase
      .from("family_placements")
      .insert({
        family_id: familyId,
        child_id: childId || null,
        school_name: schoolName.trim(),
        start_date: startDate,
        calendar_event_id: event.id,
      })
      .select()
      .single()
  );
}

export async function updatePlacementDate(placement, startDate) {
  const row = unwrap(
    await supabase.from("family_placements").update({ start_date: startDate }).eq("id", placement.id).select().single()
  );
  if (placement.calendar_event_id) {
    await updateCalendarEvent(placement.calendar_event_id, { startsAt: `${startDate}T09:00:00`, allDay: true });
  }
  return row;
}
