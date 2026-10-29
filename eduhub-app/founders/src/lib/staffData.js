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
// Mixed-parent families (Miss Lyndsay, 8 Oct 2026): flags a child whose last
// name doesn't match either parent's on file, so the Caseload table can call
// their full name out instead of just the short first-name label everyone
// else uses.
function surnameOf(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}
function childSurnameDiffers(child, parents) {
  const last = (child?.last_name || "").trim().toLowerCase();
  if (!last) return false;
  const parentSurnames = (parents || [])
    .map((p) => surnameOf(p.full_name))
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  return parentSurnames.length > 0 && !parentSurnames.includes(last);
}

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
  const [families, parents, children, tasks, staff, photos] = await Promise.all([
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
      .select("id, family_id, full_name, preferred_name, first_name, last_name, year_group_applying_for, created_at")
      .order("created_at")
      .then(unwrap),
    supabase.from("tasks").select("*").is("done_at", null).order("due_date", { nullsFirst: false }).then(unwrap),
    listStaff(),
    // Profile pictures (parents only) so the caseload can show them; a failure
    // here must never stop the list loading, so it quietly gives no photos.
    supabase
      .from("documents")
      .select("owner_id, file_url")
      .eq("owner_type", "parent")
      .eq("document_type", "profile_photo")
      .then((r) => r.data || [])
      .catch(() => []),
  ]);

  const photoByParent = Object.fromEntries((photos || []).map((d) => [d.owner_id, d]));
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
        const differs = childSurnameDiffers(c, familyParents);
        const name = differs ? (c.full_name || "").trim() || displayNameForChild(c, i) : displayNameForChild(c, i);
        return c.year_group_applying_for ? `${name} (${c.year_group_applying_for})` : name;
      }),
      displayName: familyDisplayName(family, familyParents),
      photoDoc:
        ["Mother", "Father"]
          .map((r) => familyParents.find((p) => p.relationship === r))
          .concat(familyParents)
          .map((p) => (p ? photoByParent[p.id] : null))
          .find(Boolean) || null,
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
    // email_html (the full formatted body) is by far the heaviest column, and
    // every save on the family page re-reads this list. It is left out here and
    // fetched for one email only when that email is opened (see EmailsPanel).
    supabase
      .from("case_notes")
      .select(
        "id,family_id,child_id,school_id,kind,body,occurred_at,author_id,created_at,edited_at,direction,subject,external_ref,email_from,email_from_name,email_to,email_cc,email_text,email_attachments,email_message_id,read_at,mailbox_folder,ai_insight,ai_insight_at,ai_insight_error"
      )
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
const FAMILY_STAFF_COLUMNS = ["pipeline_stage", "client_stage", "destination", "origin", "membership_type", "owner_staff_id", "home_address", "dubai_available_from", "dubai_available_until", "planned_move_date"];

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

export async function createApplication({ childId, schoolId, fit, status, keepOpen }) {
  const { data, error } = await supabase
    .from("applications")
    .insert({
      child_id: childId,
      school_id: schoolId,
      fit: fit || null,
      status: status || "draft",
      ...(keepOpen ? { keep_open: true } : {}),
    })
    .select()
    .single();
  // One application per child per school (addendum 96). If it already exists
  // (a double click, two people at once), hand back the existing one instead
  // of making a duplicate or showing an error.
  if (error && error.code === "23505") {
    return unwrap(
      await supabase.from("applications").select("*").eq("child_id", childId).eq("school_id", schoolId).single()
    );
  }
  if (error) throw error;
  return data;
}

export async function updateApplication(applicationId, patch) {
  return unwrap(await supabase.from("applications").update(patch).eq("id", applicationId).select().single());
}

// A second (or later) school after a placement, or an old closed one the
// consultant wants to pursue again -- keep_open makes it show as live even
// though the child is placed elsewhere. Nothing else about the family's
// history changes.
export async function setApplicationKeepOpen(applicationId, keepOpen) {
  return unwrap(
    await supabase.from("applications").update({ keep_open: !!keepOpen }).eq("id", applicationId).select().single()
  );
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

// Every application fee for one family (all their children, all schools) --
// for the Invoices tab, which shows them next to the family's other payments.
export async function listFamilyApplicationFees(familyId) {
  if (!familyId) return [];
  return (
    unwrap(
      await supabase
        .from("application_fees")
        .select("*, application:applications!inner(id, school:schools(name), child:children!inner(full_name, preferred_name, first_name, family_id))")
        .eq("application.child.family_id", familyId)
        .order("due_date", { nullsFirst: false })
    ) || []
  );
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

// The family paid the school directly, so there is nothing for HHE to recover.
// Mirrors the Caseload's "family paid" choice (ApplicationFeeStep patchForMode
// "direct"); the accounting trigger then drops this child from the record.
export async function markFeePaidDirect(feeId) {
  return unwrap(
    await supabase
      .from("application_fees")
      .update({
        paid_direct_by_family: true,
        hhe_paid_school_on_behalf: false,
        status: "unpaid",
        paid_at: null,
        payment_proof_path: null,
        payment_proof_name: null,
      })
      .eq("id", feeId)
      .select()
      .single()
  );
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
  if ("readAt" in patch) row.read_at = patch.readAt ? new Date(patch.readAt).toISOString() : null;
  if ("occurredAt" in patch && patch.occurredAt) row.occurred_at = new Date(patch.occurredAt).toISOString();
  return unwrap(await supabase.from("case_notes").update(row).eq("id", noteId).select().single());
}

// Attachments a school sent with an email (addendum 77) live in the private
// "email-attachments" bucket -- staff get a short-lived link to open one.
export async function getEmailAttachmentUrl(path, seconds = 120) {
  const { data, error } = await supabase.storage.from("email-attachments").createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

// Claude's reading of one email (addendum 78) -- runs server-side in
// /api/email-insight so the API key never reaches the browser.
export async function requestEmailInsight(noteId) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch("/api/email-insight", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify({ noteId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Couldn't summarise that email");
  return body.note;
}

// Remember which of Claude's suggested tasks were turned into real tasks.
export async function saveEmailInsight(noteId, insight) {
  return unwrap(await supabase.from("case_notes").update({ ai_insight: insight }).eq("id", noteId).select().single());
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

// Everything the consultant calendar shows, in one calendar-shaped list
// (founders, 25 Sept 2026: "the calendar needs to be for us to know when
// tours and assessments are"). Read-merge only -- nothing is copied into
// calendar_events:
//   - tours:        school_shortlist.tour_date / tour2_date (+ times)
//   - visits:       applications.visit_date (older visits, same colour as tours)
//   - assessments:  applications.assessment_date (+ assessment_time)
//   - everything else: calendar_events (reminders, deadlines, team events)
// Every row comes back with the same shape: date "YYYY-MM-DD", start/end
// "HH:MM" (null = all day), category tour | assessment | other, and the
// family's owner, so the "Everyone" filter works on tours too.
const hhmm = (t) => (t ? String(t).slice(0, 5) : null);
function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localHHMM(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function loadCalendarEvents({ from, to } = {}) {
  const fromDay = from ? toDateOnly(from) : null;
  const toDay = to ? toDateOnly(to) : null;
  const range = (q, col) => {
    if (fromDay) q = q.gte(col, fromDay);
    if (toDay) q = q.lt(col, toDay);
    return q;
  };
  let eventsQuery = supabase.from("calendar_events").select("*").order("starts_at");
  if (from) eventsQuery = eventsQuery.gte("starts_at", new Date(from).toISOString());
  if (to) eventsQuery = eventsQuery.lt("starts_at", new Date(to).toISOString());
  const visitsQuery = range(supabase.from("applications").select("*").not("visit_date", "is", null), "visit_date");
  const assessmentsQuery = range(
    supabase.from("applications").select("*").not("assessment_date", "is", null),
    "assessment_date"
  );
  const tours1Query = range(supabase.from("school_shortlist").select("*").not("tour_date", "is", null), "tour_date");
  const tours2Query = range(supabase.from("school_shortlist").select("*").not("tour2_date", "is", null), "tour2_date");
  // Calendly consultations (addendum 105/106): booked calls, cancelled ones left off.
  let calendlyQuery = supabase.from("calendly_bookings").select("*").neq("status", "canceled").not("start_time", "is", null);
  if (from) calendlyQuery = calendlyQuery.gte("start_time", new Date(from).toISOString());
  if (to) calendlyQuery = calendlyQuery.lt("start_time", new Date(to).toISOString());

  const [events, visits, assessments, tours1, tours2, calendly, families, parents, staff, children, schools] = await Promise.all([
    eventsQuery.then(unwrap),
    visitsQuery.then(unwrap),
    assessmentsQuery.then(unwrap).catch(() => []), // addendum 80 may not have run yet
    tours1Query.then(unwrap).catch(() => []),
    tours2Query.then(unwrap).catch(() => []), // addendum 58 (second tour slot)
    calendlyQuery.then(unwrap).catch(() => []), // addendum 105 may not have run yet
    supabase.from("families").select("*").then(unwrap),
    supabase.from("parents").select("id, family_id, relationship, full_name, user_id").then(unwrap),
    listStaff(),
    supabase.from("children").select("id, family_id, full_name, preferred_name, first_name").then(unwrap),
    listSchools(),
  ]);

  const parentsByFamily = groupBy(parents, "family_id");
  const familyById = Object.fromEntries((families || []).map((f) => [f.id, f]));
  const familyNames = Object.fromEntries(
    (families || []).map((f) => [f.id, familyDisplayName(f, parentsByFamily[f.id] || [])])
  );
  const staffById = Object.fromEntries((staff || []).map((s) => [s.user_id, s]));
  const childById = Object.fromEntries((children || []).map((c) => [c.id, c]));
  const schoolById = Object.fromEntries((schools || []).map((s) => [s.id, s]));
  const childName = (c) => (c ? c.preferred_name || c.first_name || c.full_name : "Unknown child");
  const familyBits = (familyId) => ({
    family_id: familyId || null,
    familyName: familyId ? familyNames[familyId] || "Unknown family" : null,
    ownerId: familyId ? familyById[familyId]?.owner_staff_id || null : null,
    packageKey: familyId ? familyById[familyId]?.membership_type || null : null,
  });

  const out = [];

  (events || []).forEach((e) => {
    const s = new Date(e.starts_at);
    const en = e.ends_at ? new Date(e.ends_at) : null;
    out.push({
      ...e,
      key: `ev-${e.id}`,
      source: "calendar_event",
      category: "other",
      date: localDateKey(s),
      start: e.all_day ? null : localHHMM(s),
      end: e.all_day || !en ? null : localHHMM(en),
      ...familyBits(e.family_id),
      consultantName: e.created_by ? staffName(staffById[e.created_by]) : "Unassigned",
    });
  });

  // Tours -- two independent slots per shortlisted school.
  const tourSeen = new Set();
  const addTour = (r, slot) => {
    const p = slot === 2 ? "tour2_" : "tour_";
    const date = r[`${p}date`];
    if (!date) return;
    // Live calendar: a cancelled tour comes off it (it stays on School visits).
    if (r[`${p}status`] === "cancelled") return;
    const school = schoolById[r.school_id]?.name || "Unknown school";
    tourSeen.add(`${r.family_id}|${r.school_id}|${date}`);
    out.push({
      id: r.id,
      key: `tour${slot}-${r.id}`,
      source: "shortlist_tour",
      slot,
      kind: "tour",
      category: "tour",
      title: `${school} ${slot === 2 ? "2nd tour" : "tour"}`,
      schoolName: school,
      school_id: r.school_id,
      date,
      start: hhmm(r[`${p}start_time`]),
      end: hhmm(r[`${p}end_time`]),
      status: r[`${p}status`] || "offered",
      notes: "",
      all_day: !r[`${p}start_time`],
      visible_to_client: true,
      ...familyBits(r.family_id),
    });
  };
  (tours1 || []).forEach((r) => addTour(r, 1));
  (tours2 || []).forEach((r) => addTour(r, 2));

  // Older visit dates on applications -- skipped when the same school
  // already has a tour that day, so nothing shows twice.
  (visits || []).forEach((v) => {
    const child = childById[v.child_id];
    const familyId = child?.family_id || null;
    if (tourSeen.has(`${familyId}|${v.school_id}|${v.visit_date}`)) return;
    const school = schoolById[v.school_id]?.name || "Unknown school";
    out.push({
      id: v.id,
      key: `visit-${v.id}`,
      source: "application_visit",
      kind: "school_visit",
      category: "tour",
      title: `${school} visit`,
      schoolName: school,
      school_id: v.school_id,
      childName: childName(child),
      notes: v.visit_notes || "",
      date: v.visit_date,
      start: null,
      end: null,
      all_day: true,
      status: "upcoming",
      child_id: v.child_id,
      application_id: v.id,
      ...familyBits(familyId),
    });
  });

  (assessments || []).forEach((a) => {
    const child = childById[a.child_id];
    const school = schoolById[a.school_id]?.name || "Unknown school";
    out.push({
      id: a.id,
      key: `assess-${a.id}`,
      source: "application_assessment",
      kind: "assessment",
      category: "assessment",
      title: `${school} assessment`,
      schoolName: school,
      school_id: a.school_id,
      childName: childName(child),
      notes: a.assessment_notes || "",
      link: a.assessment_link || "",
      meetingId: a.assessment_meeting_id || "",
      passcode: a.assessment_passcode || "",
      date: a.assessment_date,
      start: hhmm(a.assessment_time),
      end: null,
      all_day: !a.assessment_time,
      status: "upcoming",
      child_id: a.child_id,
      application_id: a.id,
      ...familyBits(child?.family_id),
    });
  });

  // Calendly consultations: a booked call from the Consultations page, shown
  // read-only on the calendar. Linked ones carry their family; unlinked ones
  // just show the booker.
  (calendly || []).forEach((b) => {
    const start = new Date(b.start_time);
    const end = b.end_time ? new Date(b.end_time) : null;
    const name = b.event_name || "";
    const label = /sanity/i.test(name) ? "Sanity check" : /consult/i.test(name) ? "Paid consult" : "Call";
    out.push({
      id: b.id,
      key: `calendly-${b.id}`,
      source: "calendly_booking",
      kind: "consultation",
      category: "consultation",
      title: `${label}: ${b.invitee_name || b.invitee_email || "Unknown booker"}`,
      notes: "",
      date: localDateKey(start),
      start: localHHMM(start),
      end: end ? localHHMM(end) : null,
      all_day: false,
      status: "upcoming",
      eventName: name,
      bookerName: b.invitee_name || "",
      bookerEmail: b.invitee_email || "",
      bookerPhone: b.invitee_phone || "",
      joinUrl: b.join_url || "",
      hostName: b.host_name || "",
      payment_paid: b.payment_paid,
      payment_amount: b.payment_amount,
      payment_currency: b.payment_currency,
      ...familyBits(b.family_id),
      packageKey: null,
    });
  });

  out.forEach((e) => {
    e.starts_at = `${e.date}T${e.start || "00:00"}:00`;
  });
  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
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

// Some schools' signup forms reject any email longer than 40 characters
// (Aldar does -- found 13 Oct 2026). "@applications.heatherharries.com" is
// already 32 of those, so the part before the @ may be at most 8 characters.
// Every generated address is kept inside that so it works everywhere.
const ALIAS_DOMAIN_SUFFIX = "@applications.heatherharries.com";
const MAX_EMAIL_LENGTH = 40;
const MAX_ALIAS_LENGTH = MAX_EMAIL_LENGTH - ALIAS_DOMAIN_SUFFIX.length; // 8

// A person: first initial + surname (letters only, cut to fit), e.g.
// "Benjamin Boiteux-Buchanan" -> "bboiteux".
function shortPersonAlias(fullName, fallback = "parent") {
  const words = (fullName || "").trim().split(/\s+/).filter(Boolean);
  const clean = (w) =>
    (w || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  const first = clean(words[0]);
  const last = words.length > 1 ? clean(words[words.length - 1]) : "";
  const base = (last ? first.charAt(0) + last : first) || fallback;
  return base.slice(0, MAX_ALIAS_LENGTH);
}

// A family: its slug, cut to fit.
function shortFamilyAlias(displayName) {
  return slugFor(displayName, "family").slice(0, MAX_ALIAS_LENGTH);
}

// Tries the base alias; if someone already has it, keeps the start of it and
// adds two digits (still inside the length cap) and tries again.
async function saveAliasWithRetry(table, id, base) {
  let alias = base;
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await supabase
      .from(table)
      .update({ application_alias: alias, application_alias_status: "active", application_password: randomApplicationPassword() })
      .eq("id", id)
      .select()
      .single();
    // 23505 = unique_violation -- someone else already has this exact alias.
    if (error?.code === "23505") {
      const suffix = String(Math.floor(10 + Math.random() * 90));
      alias = base.slice(0, MAX_ALIAS_LENGTH - suffix.length) + suffix;
      continue;
    }
    if (error) throw error;
    return data;
  }
  throw aliasTakenError(alias);
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
  return saveAliasWithRetry("families", familyId, shortFamilyAlias(familyDisplayNameValue));
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
  return saveAliasWithRetry("parents", parentId, shortPersonAlias(parentFullName, "parent"));
}

// Addendum 115 — swap in an address someone already made by hand. The old
// one keeps working for incoming mail (kept in previous_aliases).
export async function setParentCustomApplicationAlias(parentId, alias) {
  return unwrap(await supabase.rpc("set_parent_custom_alias", { p_parent_id: parentId, p_alias: alias }));
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
    supabase
      .from("case_notes")
      .select("id, family_id, kind, body, created_at, author_id")
      .neq("kind", "email")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(unwrap),
  ]);

  const parentsByFamily = groupBy(parents, "family_id");
  const familyNames = Object.fromEntries(
    (families || []).map((f) => [f.id, familyDisplayName(f, parentsByFamily[f.id] || [])])
  );
  const staffById = Object.fromEntries((staff || []).map((s) => [s.user_id, s]));
  // An archived family (addendum 125) leaves the working lists: no tasks, payments or
  // "needs an owner" flags for them on Today.
  const archivedIds = new Set((families || []).filter((f) => f.archived_at).map((f) => f.id));

  const decorated = (tasks || []).filter((t) => !archivedIds.has(t.family_id)).map((t) => ({
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
  const decoratedPayments = (payments || []).filter((p) => !archivedIds.has(p.family_id)).map((p) => ({
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
    .filter((f) => !f.owner_staff_id && !f.archived_at)
    .map((f) => ({ id: f.id, name: familyNames[f.id] || "Unnamed family" }));

  return {
    tasks: decorated,
    families: (families || []).filter((f) => !f.archived_at),
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
    // "Offer accepted" = placed here through us.
    accepted: allApplicationStatuses.filter((a) => a.status === "offer_accepted").length,
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

// Every family's tour review for one school -- the school's Feedback tab.
// Family reviews (addendum 85) and our own visit notes both live on the
// family's school_shortlist row, so this is just that row per family.
export async function listFeedbackForSchool(schoolId) {
  const rows =
    unwrap(
      await supabase
        .from("school_shortlist")
        .select("*")
        .eq("school_id", schoolId)
        .order("shortlisted_at", { ascending: false })
    ) || [];
  const withFeedback = rows.filter((r) => r.feedback_text || r.feedback_rating);
  const familyIds = [...new Set(withFeedback.map((r) => r.family_id))];
  const [families, parents] = await Promise.all([
    familyIds.length ? supabase.from("families").select("*").in("id", familyIds).then(unwrap) : Promise.resolve([]),
    familyIds.length ? supabase.from("parents").select("*").in("family_id", familyIds).then(unwrap) : Promise.resolve([]),
  ]);
  const familiesById = Object.fromEntries((families || []).map((f) => [f.id, f]));
  const parentsByFamily = groupBy(parents, "family_id");
  return withFeedback.map((r) => ({
    ...r,
    familyName: familiesById[r.family_id] ? familyDisplayName(familiesById[r.family_id], parentsByFamily[r.family_id]) : "A family",
  }));
}

export async function addToShortlist({ familyId, schoolId, keepOpen }) {
  return unwrap(
    await supabase
      .from("school_shortlist")
      .insert({ family_id: familyId, school_id: schoolId, ...(keepOpen ? { keep_open: true } : {}) })
      .select()
      .single()
  );
}

export async function updateShortlistEntry(shortlistId, patch) {
  return unwrap(await supabase.from("school_shortlist").update(patch).eq("id", shortlistId).select().single());
}

export async function setShortlistKeepOpen(shortlistId, keepOpen) {
  return unwrap(
    await supabase.from("school_shortlist").update({ keep_open: !!keepOpen }).eq("id", shortlistId).select().single()
  );
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

// Zoom meetings linked to a family (addendum 89). When the call ends, the
// Zoom webhook finds the family by meeting ID and saves the summary as a
// Meetings note. Before the addendum is run this just returns nothing.
export async function listZoomLinks(familyId) {
  const { data, error } = await supabase
    .from("zoom_meeting_links")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return data || [];
}

export async function createZoomLink({ familyId, zoomMeetingId, joinUrl, topic }) {
  return unwrap(
    await supabase
      .from("zoom_meeting_links")
      .insert({ family_id: familyId, zoom_meeting_id: zoomMeetingId, join_url: joinUrl || null, topic: topic?.trim() || null })
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

export async function listChildApplications(childIds) {
  if (!childIds?.length) return [];
  return unwrap(await supabase.from("applications").select("*").in("child_id", childIds).order("created_at")) || [];
}

// Search rounds (addendum 84). Round 1 is implicit; a row here is round 2+
// for one child. Before the addendum is run this just returns no rounds.
export async function listSearchRounds(familyId) {
  const { data, error } = await supabase
    .from("search_rounds")
    .select("*")
    .eq("family_id", familyId)
    .order("round_number", { ascending: true });
  if (error) return [];
  return data || [];
}

// "Start new round" for one child. Earlier placements, applications and
// visits stay as history; schools not in droppedSchoolIds carry over. A case
// note records it.
export async function startSearchRound({ familyId, childId, childName, fromSchoolName, reason, reasonNote, droppedSchoolIds }) {
  const existing = await listSearchRounds(familyId);
  const next = Math.max(1, ...existing.filter((r) => r.child_id === childId).map((r) => r.round_number)) + 1;
  const row = unwrap(
    await supabase
      .from("search_rounds")
      .insert({
        family_id: familyId,
        child_id: childId,
        round_number: next,
        reason: reason || null,
        reason_note: reasonNote?.trim() || null,
        from_school_name: fromSchoolName || null,
        dropped_school_ids: droppedSchoolIds || [],
      })
      .select()
      .single()
  );
  const why = [reason, reasonNote?.trim()].filter(Boolean).join(" · ");
  await createCaseNote({
    familyId,
    childId,
    kind: "decision",
    body: `${childName || "Child"} started search round ${next}${fromSchoolName ? ` (currently at ${fromSchoolName})` : ""}${
      why ? `. Reason: ${why}` : ""
    }.${droppedSchoolIds?.length ? ` ${droppedSchoolIds.length} earlier school(s) not carried over.` : " All earlier shortlist schools carried over."}`,
  }).catch(() => {});
  return row;
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

// Addendum 74: "Update family" -- school progress the family sees on their
// Dashboard as a timeline. Insert-only; a wrong update is fixed by sending
// the right one, never by deleting.
export async function listFamilySchoolUpdates(familyId) {
  const { data, error } = await supabase
    .from("family_school_updates")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return data || [];
}

export async function createFamilySchoolUpdate({ familyId, schoolId, childId, stage, note }) {
  return unwrap(
    await supabase
      .from("family_school_updates")
      .insert({
        family_id: familyId,
        school_id: schoolId,
        child_id: childId || null,
        stage,
        note: note?.trim() || null,
      })
      .select()
      .single()
  );
}

// Addendum 76: trusted partner introductions.
export async function listPartnerServices() {
  const { data, error } = await supabase.from("partner_services").select("*").order("sort_order");
  if (error) throw error;
  return data || [];
}

export async function updatePartnerService(key, changes) {
  return unwrap(
    await supabase
      .from("partner_services")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("key", key)
      .select()
      .single()
  );
}

export async function listFamilyServiceRequests(familyId) {
  const { data, error } = await supabase
    .from("family_service_requests")
    .select("*, service:partner_services ( label )")
    .eq("family_id", familyId)
    .order("requested_at", { ascending: false });
  if (error) return [];
  return data || [];
}

export async function markServiceRequestIntroduced(id) {
  return unwrap(
    await supabase
      .from("family_service_requests")
      .update({ email_status: "sent", email_sent_at: new Date().toISOString(), email_error: "Introduced by the team" })
      .eq("id", id)
      .select("*, service:partner_services ( label )")
      .single()
  );
}

// ---------------------------------------------------------------------------
// Addendum 80: school contacts (many per school, each with a job title).
// Nothing is deleted -- someone who leaves is archived. The main contact is
// copied onto schools.admissions_contact_* by a database trigger.
// ---------------------------------------------------------------------------

export async function listSchoolContacts(schoolIds) {
  const ids = (Array.isArray(schoolIds) ? schoolIds : [schoolIds]).filter(Boolean);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("school_contacts")
    .select("*")
    .in("school_id", ids)
    .order("is_main", { ascending: false })
    .order("created_at");
  if (error) {
    // Addendum 80 not run yet -- fall back to the single contact on the school row.
    if (/school_contacts|PGRST205|42P01/i.test(error.message || error.code || "")) return null;
    throw error;
  }
  return data || [];
}

export async function createSchoolContact(schoolId, fields = {}) {
  return unwrap(
    await supabase
      .from("school_contacts")
      .insert({ school_id: schoolId, ...fields })
      .select()
      .single()
  );
}

export async function updateSchoolContact(contactId, patch) {
  return unwrap(await supabase.from("school_contacts").update(patch).eq("id", contactId).select().single());
}

export async function setMainSchoolContact(schoolId, contactId) {
  unwrap(
    await supabase.from("school_contacts").update({ is_main: false }).eq("school_id", schoolId).neq("id", contactId).select()
  );
  return updateSchoolContact(contactId, { is_main: true, archived_at: null });
}

// The two stage columns only -- re-read after anything on the family page
// that the database uses to work the stage out (addendum 80).
export async function getFamilyStages(familyId) {
  return unwrap(await supabase.from("families").select("id, pipeline_stage, client_stage").eq("id", familyId).single());
}

// ---------------------------------------------------------------------------
// Sending email to schools from a family's Emails tab (26 Sept 2026).
// Runs server-side in /api/send-email (SMTP password never reaches the browser).
// ---------------------------------------------------------------------------
export async function sendFamilyEmail(payload) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify(payload),
  });
  const raw = await res.text().catch(() => "");
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    // Not JSON: Vercel itself answered (function timed out or crashed), not our code.
    if (!res.ok) throw new Error(`Couldn't send that email: the server did not answer properly (HTTP ${res.status}). It may have timed out, so check the Sent folder before trying again.`);
  }
  if (!res.ok) {
    // detail is the raw SMTP/server error -- worth showing alongside the
    // friendly message so a login/config problem can be diagnosed without
    // needing to go dig through the Vercel function logs.
    const message = data.error || "Couldn't send that email.";
    throw new Error(data.detail && data.detail !== message ? `${message} (${data.detail})` : message);
  }
  // Sent, but the copy for the Emails tab could not be saved: say so plainly.
  if (!data.note) throw new Error(data.warning || "The email was sent, but a copy could not be saved. Do not send it again.");
  return data.note;
}

// Everyone for the To / Cc box: the family's shortlisted schools first, then every
// other school on the Schools list (Miss Lyndsay, 26 Oct 2026: typing "Queen
// Elizabeth" should bring up that school's admissions email). Archived contacts
// are left out; a school with no contacts uses its admissions email.
export async function listSchoolRecipients(familyId) {
  const [shortlist, schools, contactRes] = await Promise.all([
    familyId ? listShortlistForFamily(familyId).catch(() => []) : Promise.resolve([]),
    listSchools(),
    supabase.from("school_contacts").select("*").order("is_main", { ascending: false }).order("created_at"),
  ]);
  // Addendum 80 not run yet: contactRes.error is set, so fall back to the school row's own email.
  const contacts = contactRes.error ? [] : contactRes.data || [];
  const shortlisted = new Set(shortlist.map((r) => r.school_id));
  const ordered = [...schools].sort((a, b) => Number(shortlisted.has(b.id)) - Number(shortlisted.has(a.id)));

  const out = [];
  const seen = new Set();
  const push = (r) => {
    const key = String(r.email || "").trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ ...r, email: String(r.email).trim() });
  };
  ordered.forEach((school) => {
    const own = contacts.filter((c) => c.school_id === school.id && !c.archived_at && c.email);
    if (own.length)
      own.forEach((c) =>
        push({ email: c.email, name: c.full_name || "", title: c.job_title || "", school: school.name || "", onShortlist: shortlisted.has(school.id) })
      );
    else if (school.admissions_contact_email)
      push({
        email: school.admissions_contact_email,
        name: school.admissions_contact_name || "Admissions",
        title: "",
        school: school.name || "",
        onShortlist: shortlisted.has(school.id),
      });
  });
  return out;
}


// Per-family override of how many tours / applications the package includes
// (addendum 91). Empty = use the package's own allowance. Quietly returns
// nothing if the table isn't there yet.
export async function getFamilyAllowance(familyId) {
  const { data, error } = await supabase.from("family_package_allowance").select("*").eq("family_id", familyId).maybeSingle();
  if (error) return null;
  return data || null;
}

export async function saveFamilyAllowance(familyId, { toursIncluded, applicationsIncluded }) {
  const clean = (v) => (v === "" || v === null || v === undefined ? null : Math.max(0, parseInt(v, 10) || 0));
  return unwrap(
    await supabase
      .from("family_package_allowance")
      .upsert(
        { family_id: familyId, tours_included: clean(toursIncluded), applications_included: clean(applicationsIncluded), updated_at: new Date().toISOString() },
        { onConflict: "family_id" }
      )
      .select()
      .single()
  );
}

// Editable public pages (addendum 93) -- the Privacy policy today. Anyone can
// read a page; only a staff admin can change it (the database refuses anyone
// else). Reads quietly return null if the table isn't there yet.
export async function getSitePage(slug) {
  const { data, error } = await supabase
    .from("site_pages")
    .select("slug, title, body, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

export async function saveSitePage(slug, fields) {
  return unwrap(
    await supabase
      .from("site_pages")
      .upsert({ slug, ...fields, updated_at: new Date().toISOString() }, { onConflict: "slug" })
      .select()
      .single()
  );
}

// Application fee invoices (addendum 94/95). The invoice file goes in the private
// documents bucket under families/{family_id}/application_fee/{fee_id}/... so it
// works even before the family has made an account; the family can open it once
// they have one (addendum 95 policy), and staff can write there (addendum 35). Replacing an invoice removes
// the old file; nothing else is ever deleted.
export async function uploadFeeInvoice({ familyId, fee, file }) {
  if (!familyId) throw new Error("Couldn't tell which family this invoice belongs to.");
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const path = `families/${familyId}/application_fee/${fee.id}/invoice-${Date.now()}${ext ? "." + ext : ""}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);
  if (uploadError) throw uploadError;
  const saved = await updateApplicationFee(fee.id, { invoice_path: path, invoice_name: file.name });
  if (fee.invoice_path) await supabase.storage.from("documents").remove([fee.invoice_path]);
  return saved;
}

// Addendum 98 (9 Oct 2026): the two extra evidence files on each fee (bank
// payment proof, school receipt). Same folder as the invoice; replacing the
// file removes the old one. Only staff see or write these — the family's own
// row-level policy only reads sent fees, and the family-side query is scoped
// to the public-facing columns.
async function uploadFeeEvidence({ familyId, fee, file, pathCol, nameCol, prefix }) {
  if (!familyId) throw new Error("Couldn't tell which family this file belongs to.");
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const path = `families/${familyId}/application_fee/${fee.id}/${prefix}-${Date.now()}${ext ? "." + ext : ""}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);
  if (uploadError) throw uploadError;
  const saved = await updateApplicationFee(fee.id, { [pathCol]: path, [nameCol]: file.name });
  if (fee[pathCol]) await supabase.storage.from("documents").remove([fee[pathCol]]);
  return saved;
}

export async function uploadFeePaymentProof({ familyId, fee, file }) {
  return uploadFeeEvidence({ familyId, fee, file, pathCol: "payment_proof_path", nameCol: "payment_proof_name", prefix: "payment-proof" });
}

export async function uploadFeeSchoolReceipt({ familyId, fee, file }) {
  return uploadFeeEvidence({ familyId, fee, file, pathCol: "school_receipt_path", nameCol: "school_receipt_name", prefix: "school-receipt" });
}

export async function clearFeeEvidence({ fee, which }) {
  const pathCol = which === "payment_proof" ? "payment_proof_path" : "school_receipt_path";
  const nameCol = which === "payment_proof" ? "payment_proof_name" : "school_receipt_name";
  const existing = fee[pathCol];
  const saved = await updateApplicationFee(fee.id, { [pathCol]: null, [nameCol]: null });
  if (existing) await supabase.storage.from("documents").remove([existing]).catch(() => {});
  return saved;
}

// Addendum 98 follow-up (Heather, 9 Oct 2026): when uploading the school's
// invoice/receipt (or marking a fee paid) on one child, find the family's
// other children's unpaid fees at the same school so staff can be offered to
// copy the file over and mark them paid together.
export async function listSiblingUnpaidFeesAtSchool({ familyId, schoolId, excludeApplicationId }) {
  if (!familyId || !schoolId) return [];
  // children in this family
  const children = unwrap(
    await supabase.from("children").select("id, first_name, preferred_name, full_name").eq("family_id", familyId)
  ) || [];
  if (!children.length) return [];
  const childIds = children.map((c) => c.id);
  // their applications at the same school
  const apps = unwrap(
    await supabase.from("applications").select("id, child_id, school_id").in("child_id", childIds).eq("school_id", schoolId)
  ) || [];
  const siblingApps = apps.filter((a) => a.id !== excludeApplicationId);
  if (!siblingApps.length) return [];
  const feeApps = siblingApps.map((a) => a.id);
  const fees = unwrap(
    await supabase.from("application_fees").select("*").in("application_id", feeApps).neq("status", "paid")
  ) || [];
  const childById = Object.fromEntries(children.map((c) => [c.id, c]));
  const appById = Object.fromEntries(apps.map((a) => [a.id, a]));
  return fees.map((f) => {
    const child = childById[appById[f.application_id]?.child_id];
    return { fee: f, child, childName: child?.preferred_name || child?.first_name || child?.full_name || "sibling" };
  });
}

// ---------------------------------------------------------------------------
// Consultations -- Calendly bookings (addenda 105, 106)
// ---------------------------------------------------------------------------

export async function listCalendlyBookings() {
  return (
    unwrap(await supabase.from("calendly_bookings").select("*").order("start_time", { ascending: false, nullsFirst: false })) || []
  );
}

// Links a booking to a family and puts it on that family's Meetings tab, the
// same note the webhook writes when an email matches on its own.
export async function linkCalendlyBooking(booking, familyId) {
  unwrap(
    await supabase
      .from("calendly_bookings")
      .update({ family_id: familyId, updated_at: new Date().toISOString() })
      .eq("id", booking.id)
      .select("id")
      .single()
  );
  const when = booking.start_time
    ? new Date(booking.start_time).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "full", timeStyle: "short" }) + " (Dubai time)"
    : "";
  const lines = [
    `${booking.status === "canceled" ? "Cancelled" : "Booked"}: ${booking.event_name || "Calendly call"}`,
    when && `When: ${when}`,
    booking.host_name && `With: ${booking.host_name}`,
    booking.invitee_name && `Booked by: ${booking.invitee_name}${booking.invitee_email ? ` (${booking.invitee_email})` : ""}`,
    booking.invitee_phone && `Phone: ${booking.invitee_phone}`,
    ...(booking.answers || []).map((a) => `${a.question}: ${a.answer}`),
    booking.join_url && `Join link: ${booking.join_url}`,
  ].filter(Boolean);
  await supabase.from("case_notes").upsert(
    {
      family_id: familyId,
      kind: "meeting",
      subject: `${booking.status === "canceled" ? "Cancelled" : "Booked"}: ${booking.event_name || "Calendly call"}`,
      body: lines.join("\n"),
      occurred_at: booking.start_time || new Date().toISOString(),
      external_ref: `calendly:${booking.invitee_uri}`,
    },
    { onConflict: "external_ref", ignoreDuplicates: true }
  );
  const zoomId = booking.join_url && /zoom\.us\/j\/(\d+)/i.exec(booking.join_url)?.[1];
  if (zoomId) {
    await supabase
      .from("zoom_meeting_links")
      .insert({ family_id: familyId, zoom_meeting_id: zoomId, join_url: booking.join_url, topic: booking.event_name || null });
  }
  // A paid consultation moves a "Free sanity check" family to "Paid consult"
  // on the Caseload. Only that one step: a family already further along is
  // never moved back, and a 10-minute sanity check changes nothing.
  let movedToPaidConsult = false;
  if (booking.status !== "canceled" && isPaidConsultEvent(booking.event_name)) {
    const { data, error } = await supabase
      .from("families")
      .update({ client_stage: "paid_consult" })
      .eq("id", familyId)
      .eq("client_stage", "free_sanity_check")
      .select("id");
    movedToPaidConsult = !error && (data || []).length > 0;
  }
  return { movedToPaidConsult };
}

// "30 - Minute consult with Heather" is the paid consultation; "10 - Minute
// Sanity Check" is the free one. Matched on the event name.
export function isPaidConsultEvent(name) {
  const n = String(name || "").toLowerCase();
  return /consult/.test(n) && !/sanity/.test(n);
}

// Zoom AI summaries kept by the webhook (addendum 122), keyed by Zoom meeting ID.
// Returns { [meetingId]: [{ id, topic, body, occurred_at }] }, newest first.
export async function listZoomSummariesByMeeting() {
  const { data, error } = await supabase
    .from("zoom_unmatched_summaries")
    .select("id, zoom_meeting_id, topic, body, occurred_at")
    .order("occurred_at", { ascending: false });
  if (error) return {}; // table missing or not readable: the page still works without summaries
  const out = {};
  (data || []).forEach((r) => {
    (out[r.zoom_meeting_id] = out[r.zoom_meeting_id] || []).push(r);
  });
  return out;
}

export function zoomIdFromUrl(url) {
  return (url && /zoom\.us\/j\/(\d+)/i.exec(url)?.[1]) || "";
}

// Attach a Zoom meeting to a Calendly booking so the AI summary can find it
// when the call ends. Saves the ID on the booking itself (for the status chip
// and for later linking), and -- if the booking is already linked to a family
// -- adds a zoom_meeting_links row so the webhook attaches the summary straight
// to that family. Any already-received unmatched summary for this meeting is
// attached straight away.
export async function attachZoomToBooking(booking, meetingId) {
  const id = String(meetingId || "").trim();
  if (!id) throw new Error("No Zoom meeting ID.");
  // 1) Save on the booking.
  unwrap(
    await supabase
      .from("calendly_bookings")
      .update({ zoom_meeting_id: id, join_url: booking.join_url || `https://zoom.us/j/${id}`, updated_at: new Date().toISOString() })
      .eq("id", booking.id)
      .select("id")
      .single()
  );
  // 2) If a family is linked, make sure zoom_meeting_links has this ID so
  //    the webhook routes future summaries to that family automatically.
  if (booking.family_id) {
    const { data: existing } = await supabase
      .from("zoom_meeting_links")
      .select("id")
      .eq("family_id", booking.family_id)
      .eq("zoom_meeting_id", id)
      .limit(1);
    if (!existing || existing.length === 0) {
      await supabase
        .from("zoom_meeting_links")
        .insert({ family_id: booking.family_id, zoom_meeting_id: id, join_url: booking.join_url || `https://zoom.us/j/${id}`, topic: booking.event_name || null });
    }
    // 3) Attach any already-received summaries (addendum 122) to the family's Meetings tab.
    const { data: kept } = await supabase
      .from("zoom_unmatched_summaries")
      .select("id, topic, body, occurred_at")
      .eq("zoom_meeting_id", id)
      .is("attached_family_id", null);
    for (const z of kept || []) {
      try {
        await supabase.from("case_notes").insert({
          family_id: booking.family_id,
          kind: "meeting",
          subject: z.topic || "Zoom meeting",
          body: z.body,
          occurred_at: z.occurred_at,
          external_ref: `zoom:${id}:${z.id}`,
        });
        await supabase
          .from("zoom_unmatched_summaries")
          .update({ attached_family_id: booking.family_id, attached_at: new Date().toISOString() })
          .eq("id", z.id);
      } catch { /* a duplicate external_ref is fine */ }
    }
  }
}

export async function saveCalendlyBookingNote(bookingId, note) {
  unwrap(
    await supabase
      .from("calendly_bookings")
      .update({ staff_note: note.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", bookingId)
      .select("id")
      .single()
  );
}

// ---------------------------------------------------------------------------
// Accounting records (addendum 109). One per school payment HHE makes for a
// family; staff-only. Amounts live here and never on the family-readable fee.
// ---------------------------------------------------------------------------

export async function listAccountingRecords(familyId) {
  if (!familyId) return [];
  const [records, events, staff, invoices] = await Promise.all([
    supabase
      .from("accounting_records")
      .select(
        "*, school:schools(name), items:accounting_record_items(id, application_fee_id, amount_paid, amount_charged, difference, removed_at, child:children(full_name, preferred_name, first_name), fee:application_fees(payment_proof_path, school_receipt_path, status))"
      )
      .eq("family_id", familyId)
      .neq("status", "void")
      .order("created_at", { ascending: true })
      .then(unwrap),
    supabase
      .from("accounting_events")
      .select("record_id, kind, detail, actor, created_at")
      .eq("family_id", familyId)
      .order("created_at", { ascending: false })
      .then(unwrap)
      .catch(() => []),
    supabase.from("staff").select("user_id, full_name, email").then(unwrap).catch(() => []),
    // The Stripe invoices (addendum 116). Quietly empty if that SQL isn't run yet.
    supabase
      .from("parent_invoices")
      .select("record_id, status, amount, currency, hosted_invoice_url, due_date, paid_at, created_at")
      .eq("family_id", familyId)
      .in("status", ["open", "paid", "needs_review"])
      .then(unwrap)
      .catch(() => []),
  ]);
  const invoiceByRecord = Object.fromEntries((invoices || []).map((i) => [i.record_id, i]));
  // Only changes made by a real person get a name stamp. Rows the database
  // opened by itself (actor is null) show nothing, not "System".
  const nameOf = accountingActorNamer(staff);
  const lastByRecord = {};
  (events || []).forEach((e) => {
    if (e.record_id && e.actor && !lastByRecord[e.record_id]) lastByRecord[e.record_id] = e;
  });
  return (records || []).map((r) => {
    const e = lastByRecord[r.id];
    return { ...r, invoice: invoiceByRecord[r.id] || null, lastChange: e ? { by: nameOf(e.actor), at: e.created_at } : null };
  });
}

// Stripe invoice for an open accounting record (runs on the server, see
// api/stripe-create-invoice.js: the amount is worked out there from the
// database, never taken from the browser) and the matching void.
async function stripeCall(path, payload, fallback) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || fallback);
  return data;
}

export const createRecordInvoice = (recordId) =>
  stripeCall("/api/stripe-create-invoice", { recordId }, "Couldn't create the invoice.");

export const voidRecordInvoice = (recordId, reason) =>
  stripeCall("/api/stripe-void-invoice", { recordId, reason }, "Couldn't void the invoice.");

// Resolve an accounting_events actor (a user_id, or null for the system) to a
// display name, so every "who did what" line reads as a person, not a UUID.
function accountingActorNamer(staff) {
  const byId = Object.fromEntries((staff || []).map((s) => [s.user_id, s]));
  return (actor) => (actor ? staffName(byId[actor]) || "A teammate" : "System");
}

// Changes one field on a record and writes what changed to the log, so the
// history of who changed what stays complete.
export async function updateAccountingRecord(recordId, field, value, previous) {
  const saved = unwrap(
    await supabase.from("accounting_records").update({ [field]: value }).eq("id", recordId).select().single()
  );
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("accounting_events").insert({
      record_id: recordId,
      family_id: saved.family_id,
      kind: "record_updated",
      detail: { field, from: previous ?? null, to: value ?? null },
      actor: data?.user?.id || null,
    });
  } catch {
    // The change itself is saved; a missed log line must not undo it.
  }
  return saved;
}

// Everything the overall Accounting page needs in one go: every accounting
// record (with its children and evidence), the parents' names to label each
// family, and every package payment (owed, waiting to be confirmed, or paid).
export async function getAccountingOverview() {
  const [records, parents, payments, events, staff, invoices, stripeAlerts, directFees] = await Promise.all([
    supabase
      .from("accounting_records")
      .select(
        "*, school:schools(name), items:accounting_record_items(id, application_fee_id, amount_paid, amount_charged, difference, removed_at, child:children(full_name, preferred_name, first_name), fee:application_fees(payment_proof_path, school_receipt_path, status))"
      )
      .neq("status", "void")
      .order("created_at", { ascending: false })
      .then(unwrap),
    supabase.from("parents").select("family_id, full_name").then(unwrap),
    supabase
      .from("payments")
      .select("id, family_id, label, amount, currency, due_date, status, paid_at, submitted_at")
      .order("due_date", { ascending: true, nullsFirst: false })
      .then(unwrap),
    supabase
      .from("accounting_events")
      .select("record_id, family_id, kind, detail, actor, created_at")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(unwrap)
      .catch(() => []),
    supabase.from("staff").select("user_id, full_name, email").then(unwrap).catch(() => []),
    // Stripe (addenda 116/117). Quietly empty if that SQL isn't run yet.
    supabase
      .from("parent_invoices")
      .select("record_id, family_id, stripe_invoice_id, status, amount, currency, due_date, paid_at")
      .in("status", ["open", "paid", "needs_review"])
      .then(unwrap)
      .catch(() => []),
    supabase
      .from("stripe_events")
      .select("id, type, outcome, detail, stripe_invoice_id, received_at")
      .eq("needs_attention", true)
      .order("received_at", { ascending: false })
      .limit(20)
      .then(unwrap)
      .catch(() => []),
    // Fees the family paid the school themselves: not on any accounting record,
    // but shown (greyed) on the Application fees tab so nobody wonders about them.
    supabase
      .from("application_fees")
      .select("id, application:applications(school:schools(name), child:children(full_name, preferred_name, first_name, family_id))")
      .eq("paid_direct_by_family", true)
      .then(unwrap)
      .catch(() => []),
  ]);
  const invoiceByRecord = Object.fromEntries((invoices || []).map((i) => [i.record_id, i]));
  const byFamily = {};
  (parents || []).forEach((p) => {
    if (p.full_name) (byFamily[p.family_id] ||= []).push(p.full_name);
  });
  const familyNames = Object.fromEntries(Object.entries(byFamily).map(([id, names]) => [id, names.join(" & ")]));

  // Who last touched each record -- only real people, never the auto-open trigger.
  const nameOf = accountingActorNamer(staff);
  const lastByRecord = {};
  (events || []).forEach((e) => {
    if (e.record_id && e.actor && !lastByRecord[e.record_id]) lastByRecord[e.record_id] = e;
  });
  const withChange = (records || []).map((r) => {
    const e = lastByRecord[r.id];
    return { ...r, invoice: invoiceByRecord[r.id] || null, lastChange: e ? { by: nameOf(e.actor), at: e.created_at } : null };
  });

  return { records: withChange, payments: payments || [], familyNames, invoices: invoices || [], stripeAlerts: stripeAlerts || [], directFees: directFees || [] };
}

// Mark a flagged Stripe event as looked at (addendum 117). Stays in the table.
export async function resolveStripeEvent(eventId) {
  const { error } = await supabase.rpc("resolve_stripe_event", { p_event_id: eventId });
  if (error) throw error;
}


// Registration deposits (addendum 119). HHE paid a school's first-term
// registration deposit for a family and will invoice them for exactly that
// amount. The database function checks the user is staff and the amounts.
export async function createRegistrationDeposit({ familyId, schoolId, items }) {
  const { data, error } = await supabase.rpc("add_registration_deposit", {
    p_family: familyId,
    p_school: schoolId || null,
    p_items: (items || []).map((i) => ({ child_id: i.childId || null, amount: Number(i.amount) })),
  });
  if (error) throw error;
  return data;
}

// The school gave the deposit back to HHE, so the family is not charged for it.
export async function markDepositRefunded(recordId, reason) {
  const { error } = await supabase.rpc("mark_deposit_refunded", { p_record: recordId, p_reason: reason || null });
  if (error) throw error;
}

// What the Add a deposit form needs to fill its dropdowns.
export async function listDepositFormData() {
  const [schools, children] = await Promise.all([
    supabase.from("schools").select("id, name").order("name").then(unwrap),
    supabase.from("children").select("id, family_id, full_name, preferred_name, first_name").order("created_at").then(unwrap),
  ]);
  return { schools: schools || [], children: children || [] };
}


// ---------------------------------------------------------------------------
// The Emails page (21 Oct 2026): every email in one place, filed or not.
// "Tracked" = on a family's Emails tab (case_notes). "Untracked" = arrived at an
// address that matches no family and was kept in unmatched_emails (addendum 124).
// The list queries leave out the full HTML so the page opens quickly; the full
// email is fetched when one is opened.
// ---------------------------------------------------------------------------
export async function listAllEmails(limit = 1000) {
  // Light list (addendum 128): same emails, first 400 characters only. Falls back to the
  // full table until that SQL has been run.
  const light = await supabase
    .from("email_list")
    .select("id,family_id,direction,subject,body,email_from,email_from_name,email_to,email_cc,occurred_at,read_at,mailbox_folder,email_attachments,flagged")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (!light.error) return (light.data || []).map((r) => ({ ...r, familyName: "" }));
  const rows = unwrap(
    await supabase
      .from("case_notes")
      .select(
        "id,family_id,direction,subject,body,email_from,email_from_name,email_to,email_cc,occurred_at,read_at,mailbox_folder,email_attachments,family:families(id,account_user_id,parents(full_name,relationship))"
      )
      .eq("kind", "email")
      .order("occurred_at", { ascending: false })
      .limit(limit)
  );
  return rows.map((r) => ({
    ...r,
    familyName: r.family ? familyDisplayName(r.family, r.family.parents) : "",
  }));
}

export async function getEmailNote(noteId) {
  return unwrap(await supabase.from("case_notes").select("*").eq("id", noteId).single());
}

export async function listUnmatchedEmails(limit = 500) {
  const light = await supabase
    .from("unmatched_email_list")
    .select("id,received_at,alias,email_from,email_from_name,email_to,email_cc,subject,email_text,email_attachments,read_at,mailbox_folder,flagged")
    .eq("status", "open")
    .order("received_at", { ascending: false })
    .limit(limit);
  if (!light.error) return light.data || [];
  return unwrap(
    await supabase
      .from("unmatched_emails")
      .select("id,received_at,alias,email_from,email_from_name,email_to,email_cc,subject,email_text,email_attachments,read_at,mailbox_folder")
      .eq("status", "open")
      .order("received_at", { ascending: false })
      .limit(limit)
  );
}

export async function getUnmatchedEmail(id) {
  return unwrap(await supabase.from("unmatched_emails").select("*").eq("id", id).single());
}

export async function fileUnmatchedEmail(id, familyId) {
  return unwrap(await supabase.rpc("file_unmatched_email", { p_id: id, p_family: familyId }));
}

export async function markUnmatchedRead(id, read = true) {
  return unwrap(await supabase.rpc("mark_unmatched_read", { p_id: id, p_read: read }));
}

export async function dismissUnmatchedEmail(id) {
  return unwrap(await supabase.rpc("dismiss_unmatched_email", { p_id: id }));
}

export async function reopenUnmatchedEmail(id) {
  return unwrap(await supabase.rpc("reopen_unmatched_email", { p_id: id }));
}

// Move a filed email to a different family. Nothing is deleted.
export async function moveEmailNote(noteId, familyId) {
  return unwrap(await supabase.rpc("move_email_note", { p_note: noteId, p_family: familyId }));
}

// Unread received emails, for the badge next to "Emails" in the staff menu.
export async function countUnreadEmails() {
  const { count, error } = await supabase
    .from("case_notes")
    .select("id", { count: "exact", head: true })
    .eq("kind", "email")
    .eq("direction", "inbound")
    .eq("mailbox_folder", "inbox")
    .is("read_at", null);
  if (error) throw error;
  return count || 0;
}

// Families to choose from when filing an email: { id, name }.
export async function listFamilyChoices() {
  const rows = unwrap(
    await supabase
      .from("families")
      .select("id,account_user_id,parents(full_name,relationship)")
      .order("created_at", { ascending: false })
      .limit(1000)
  );
  return rows
    .map((f) => ({ id: f.id, name: familyDisplayName(f, f.parents) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Everything the email composer needs about one family (children, documents they can
// attach, their application address, start term), for writing from the Emails page.
export async function getEmailContext(familyId) {
  const family = unwrap(await supabase.from("families").select("*").eq("id", familyId).single());
  const [parents, children] = await Promise.all([
    supabase.from("parents").select("*").eq("family_id", familyId).order("created_at").then(unwrap),
    supabase.from("children").select("*").eq("family_id", familyId).order("created_at").then(unwrap),
  ]);
  const owners = [
    ...(parents || []).map((p) => ({ type: "parent", id: p.id, name: p.full_name || p.relationship || "Parent" })),
    ...(children || []).map((c, i) => ({
      type: "child",
      id: c.id,
      name: c.preferred_name || c.first_name || c.full_name || `Child ${i + 1}`,
    })),
  ];
  const docs = owners.length
    ? await Promise.all(
        ["parent", "child"].map((type) => {
          const ids = owners.filter((o) => o.type === type).map((o) => o.id);
          return ids.length
            ? supabase.from("documents").select("*").eq("owner_type", type).in("owner_id", ids).then(unwrap)
            : Promise.resolve([]);
        })
      ).then((x) => x.flat())
    : [];
  const documents = docs
    .filter((d) => d.file_url)
    .map((d) => {
      const owner = owners.find((o) => o.type === d.owner_type && o.id === d.owner_id);
      return {
        id: d.id,
        label: `${owner?.name || "Document"} · ${String(d.document_type || "Document").replace(/_/g, " ")}${
          d.original_filename ? ` (${d.original_filename})` : ""
        }`,
      };
    });
  const alias = (parents || []).find((p) => p.application_alias)?.application_alias || family.application_alias;
  const uniq = (key) => [...new Set((children || []).flatMap((c) => (Array.isArray(c[key]) ? c[key] : [])).filter(Boolean))];
  const terms = uniq("terms").filter((x) => !/flexible/i.test(x));
  const years = uniq("academic_years_of_entry").sort();
  const entryPhrase = terms.length
    ? `for ${terms.join(" or ")}${years.length ? `, ${years.join(" or ")}` : ""}`
    : years.length
      ? `for the ${years.join(" or ")} academic year`
      : "";
  return {
    familyId,
    familyName: familyDisplayName(family, parents),
    children: children || [],
    documents,
    familyAddress: alias ? `${alias}@applications.heatherharries.com` : "",
    moveDate: family.planned_move_date || "",
    dubaiFrom: family.dubai_available_from || "",
    dubaiUntil: family.dubai_available_until || "",
    entryPhrase,
  };
}

// Archiving a family (addendum 125): hidden from the working lists, nothing deleted.
export async function archiveFamily(familyId, reason) {
  return unwrap(await supabase.rpc("archive_family", { p_family: familyId, p_reason: reason || null }));
}
export async function restoreFamily(familyId) {
  return unwrap(await supabase.rpc("restore_family", { p_family: familyId }));
}

// "Sync" on the Emails tab: start the Titan sync on GitHub and wait for it.
// onState gets "starting" | "running" | "done" | "failed".
export async function syncEmailsNow(onState = () => {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` };
  onState("starting");
  const res = await fetch("/api/sync-emails", { method: "POST", headers });
  const first = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(first.error || "Couldn't start the sync.");
  const since = first.since || new Date().toISOString();
  onState("running");
  const deadline = Date.now() + 3 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const r = await fetch(`/api/sync-emails?since=${encodeURIComponent(since)}`, { headers });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Lost track of the sync.");
    if (j.state === "done") return "done";
    if (j.state === "failed") throw new Error("The sync ran into a problem. It will try again in 30 minutes.");
  }
  return "slow";
}

// Delete / Archive / Spam / Restore on the Emails tab: moves the email in Titan and here.
export async function moveEmailTo(kind, id, to) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/move-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify({ kind, id, to }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "Couldn't move that email.");
  return j;
}

// Flag / unflag an email here and in Titan.
export const flagEmail = (kind, id, on) => moveEmailTo(kind, id, on ? "flag" : "unflag");

// Emails the website's inbound handler could not file (addendum 129). Empty until that SQL is run.
export async function listIntakeFailures() {
  const r = await supabase
    .from("email_intake_failures")
    .select("id,created_at,alias,email_from,subject,reason")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  return r.error ? [] : r.data || [];
}
export async function resolveIntakeFailures(ids) {
  if (!ids.length) return;
  const { error } = await supabase.from("email_intake_failures").update({ resolved_at: new Date().toISOString() }).in("id", ids);
  if (error) throw error;
}

// New mail for one family's Emails tab, light (no full bodies). Used to pick up arrivals without a reload.
export async function listFamilyEmailsLight(familyId) {
  const r = await supabase
    .from("email_list")
    .select("id,family_id,direction,subject,body,email_from,email_from_name,email_to,email_cc,occurred_at,read_at,mailbox_folder,email_attachments")
    .eq("family_id", familyId)
    .order("occurred_at", { ascending: false })
    .limit(100);
  return r.error ? [] : (r.data || []).map((x) => ({ ...x, kind: "email" }));
}

// ---------------------------------------------------------------------------
// Team photos (addendum 130)
// ---------------------------------------------------------------------------
async function squareJpeg(file, size = 320) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image."))), "image/jpeg", 0.86));
}

export async function uploadStaffAvatar(userId, file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Please choose a picture (JPG or PNG).");
  const blob = await squareJpeg(file);
  const path = `${userId}/${Date.now()}.jpg`;
  const up = await supabase.storage.from("staff-avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
  if (up.error) throw up.error;
  const { data } = supabase.storage.from("staff-avatars").getPublicUrl(path);
  const { error } = await supabase.rpc("set_staff_avatar", { p_user_id: userId, p_url: data.publicUrl });
  if (error) throw error;
  return data.publicUrl;
}

// Edit your own profile. Position and role are admin-only.
export async function updateMyProfile({ fullName, phone, location, bio, languages, specialties, timezone, linkedin }) {
  const { error } = await supabase.rpc("update_my_profile", {
    p_full_name: fullName || "",
    p_phone: phone || "",
    p_location: location || "",
    p_bio: bio || "",
    p_languages: languages || [],
    p_specialties: specialties || [],
    p_timezone: timezone || "",
    p_linkedin: linkedin || "",
  });
  if (error) throw error;
}

export async function countMyFamilies(userId) {
  const { count } = await supabase.from("families").select("id", { count: "exact", head: true }).eq("owner_staff_id", userId);
  return count || 0;
}

export async function sendMyPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
  if (error) throw error;
}

export async function removeStaffAvatar(userId) {
  const { error } = await supabase.rpc("set_staff_avatar", { p_user_id: userId, p_url: "" });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// School Visits workflow (addendum 142) -- the times a parent can't tour.
// One row per block; no start/end means the whole day.
// ---------------------------------------------------------------------------

export async function listBlockedTimes(familyId) {
  return (
    unwrap(
      await supabase
        .from("family_blocked_times")
        .select("*")
        .eq("family_id", familyId)
        .order("blocks_date", { ascending: true })
        .order("blocks_start", { ascending: true, nullsFirst: true })
    ) || []
  );
}

export async function addBlockedTime({ familyId, date, start, end, reason }) {
  return unwrap(
    await supabase
      .from("family_blocked_times")
      .insert({
        family_id: familyId,
        blocks_date: date,
        blocks_start: start || null,
        blocks_end: end || null,
        reason: (reason || "").trim() || null,
      })
      .select()
      .single()
  );
}

export async function deleteBlockedTime(id) {
  const { error } = await supabase.from("family_blocked_times").delete().eq("id", id);
  if (error) throw error;
}

// School Visits workflow (addendum 143): note that the parent was asked for
// their unavailable times.
export async function markParentAvailabilityRequested(familyId) {
  return unwrap(
    await supabase
      .from("families")
      .update({ parent_availability_requested_at: new Date().toISOString() })
      .eq("id", familyId)
      .select()
      .single()
  );
}

// Email automation (addendum 144): what Claude read out of a school's reply.
// Only the ones still waiting for a consultant. If the addendum has not been
// run yet the table is missing, so this quietly returns nothing.
export async function listReplySuggestions(familyId) {
  const { data, error } = await supabase
    .from("school_reply_suggestions")
    .select("*")
    .eq("family_id", familyId)
    .eq("status", "new")
    .order("created_at");
  return error ? [] : data || [];
}

export async function resolveReplySuggestion(id, status) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return unwrap(
    await supabase
      .from("school_reply_suggestions")
      .update({ status, resolved_at: new Date().toISOString(), resolved_by: user?.id || null })
      .eq("id", id)
      .select()
      .single()
  );
}

// Everything the action flags are worked out from (see lib/familyActions.js): one query for
// the shortlists and one for the school replies still waiting to be checked. Best effort --
// if either fails (or addendum 144 has not been run) the flags are simply fewer.
export async function listFamilyActionRows(familyId) {
  let shortlistQ = supabase
    .from("school_shortlist")
    .select(
      "id, family_id, family_decision, enquiry_sent_at, enquiry_skipped_at, availability_status, tour_date, tour_status, tour2_date, tour2_status, feedback_text, school:schools(name)"
    );
  let suggQ = supabase.from("school_reply_suggestions").select("id, family_id, shortlist_id").eq("status", "new");
  if (familyId) {
    shortlistQ = shortlistQ.eq("family_id", familyId);
    suggQ = suggQ.eq("family_id", familyId);
  }
  const [rows, suggestions] = await Promise.all([
    shortlistQ.then((r) => (r.error ? [] : r.data || [])),
    suggQ.then((r) => (r.error ? [] : r.data || [])),
  ]);
  return { rows, suggestions };
}
