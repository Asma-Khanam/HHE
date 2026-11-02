// The Activity page (2 Nov 2026 meeting follow-up): everything the team has
// done, in one feed -- who changed what, who added what, who marked what.
//
// Read-merge only, exactly like the Calendar: nothing is copied into a new
// table. Each source already records who and when, so this turns them into one
// shape: { id, at, who, kind, title, detail, familyId, schoolId, path }.
// Sources with no "who" (an old row, or a change made before the trail
// existed) say "Someone" rather than guessing.
import { supabase } from "./supabaseClient";
import { familyDisplayName } from "./staffData";

const soft = (q) => q.then((r) => (r.error ? [] : r.data || [])).catch(() => []);

export const ACTIVITY_KINDS = [
  { key: "edit", label: "Record edits" },
  { key: "application", label: "Applications" },
  { key: "note", label: "Notes and calls" },
  { key: "email", label: "Emails" },
  { key: "task", label: "Tasks" },
  { key: "stage", label: "Stage changes" },
  { key: "placement", label: "Placements" },
  { key: "school", label: "Schools" },
];

const APP_EVENT_LABEL = {
  status_change: "moved an application",
  assessment_booked: "booked an assessment",
  assessment_completed: "recorded an assessment as done",
  document_requested: "asked for a document",
  document_received: "recorded a document as received",
  fee_invoiced: "sent an application fee to the family",
  fee_paid: "recorded an application fee as paid",
  note: "added an application note",
};

const NOTE_LABEL = {
  note: "added a note",
  call: "logged a call",
  meeting: "logged a meeting",
  email: "logged an email",
  whatsapp: "logged a WhatsApp message",
};

export async function loadActivity({ sinceDays = 30, limit = 400 } = {}) {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const sinceIso = since.toISOString();

  const [audit, appEvents, notes, stages, updates, schoolNotes, tasks, placements, families, parents, schools, staff, applications, children] =
    await Promise.all([
      soft(supabase.from("record_audit_log").select("*").gte("changed_at", sinceIso).order("changed_at", { ascending: false }).limit(limit)),
      soft(supabase.from("application_events").select("*").gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(limit)),
      soft(
        supabase
          .from("case_notes")
          .select("id, family_id, school_id, kind, body, subject, direction, occurred_at, created_at, created_by, author_id")
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(limit)
      ),
      soft(supabase.from("family_stage_history").select("*").gte("moved_at", sinceIso).order("moved_at", { ascending: false }).limit(limit)),
      soft(supabase.from("family_school_updates").select("*").gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(limit)),
      soft(supabase.from("school_notes").select("*").gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(limit)),
      soft(supabase.from("tasks").select("*").or(`created_at.gte.${sinceIso},done_at.gte.${sinceIso},assigned_at.gte.${sinceIso}`).limit(limit)),
      soft(supabase.from("family_placements").select("*").limit(limit)),
      soft(supabase.from("families").select("id, archived_at")),
      soft(supabase.from("parents").select("id, family_id, relationship, full_name")),
      soft(supabase.from("schools").select("id, name")),
      soft(supabase.from("staff").select("user_id, full_name, email")),
      soft(supabase.from("applications").select("id, child_id, school_id, status")),
      soft(supabase.from("children").select("id, family_id, full_name, preferred_name, first_name")),
    ]);

  const byId = (rows, key = "id") => Object.fromEntries(rows.map((r) => [r[key], r]));
  const parentsByFamily = parents.reduce((m, p) => ((m[p.family_id] = m[p.family_id] || []).push(p), m), {});
  const familyName = (id) => {
    const f = byId(families)[id];
    return id && f ? familyDisplayName(f, parentsByFamily[id] || []) : id ? "Unknown family" : "";
  };
  const schoolById = byId(schools);
  const childById = byId(children);
  const appById = byId(applications);
  const staffById = byId(staff, "user_id");
  const who = (userId) => staffById[userId]?.full_name || staffById[userId]?.email || null;
  const kidName = (id) => {
    const c = childById[id];
    return c ? c.preferred_name || c.first_name || c.full_name : "a child";
  };
  const familyPath = (id, tab) => (id ? `/staff/families/${id}${tab ? `?tab=${tab}` : ""}` : null);

  const out = [];
  const push = (row) => row.at && out.push(row);

  // Addendum 150: the audit log now also carries tour, fee, document, task and
  // shortlist changes, each of which belongs on its own tab.
  const AUDIT_TAB = {
    school_shortlist: "visits",
    application_fees: "applications",
    documents: "documents",
    tasks: null,
    parents: "details",
    children: "details",
    current_schools: "details",
  };
  audit.forEach((a) => {
    const added = a.field_name === "added" || a.field_name === "removed";
    push({
      id: "audit:" + a.id,
      at: a.changed_at,
      who: a.changed_by_name || who(a.changed_by),
      kind: "edit",
      title: added ? `${a.field_name} ${a.field_label || "a record"}` : `changed ${a.field_label || a.field_name}`,
      detail: added ? [a.new_value || a.old_value || ""] : [a.old_value || "(empty)", a.new_value || "(empty)"],
      isChange: !added,
      familyId: a.family_id,
      familyName: familyName(a.family_id),
      path: familyPath(a.family_id, AUDIT_TAB[a.table_name] ?? "details"),
    });
  });

  appEvents.forEach((e) => {
    const app = appById[e.application_id];
    const school = app ? schoolById[app.school_id]?.name : null;
    push({
      id: "appev:" + e.id,
      at: e.created_at,
      who: who(e.created_by),
      kind: "application",
      title: APP_EVENT_LABEL[e.event_type] || e.event_type.replace(/_/g, " "),
      detail: [[school, app ? kidName(app.child_id) : null].filter(Boolean).join(" · "), e.description || e.new_status || ""].filter(Boolean),
      familyId: app ? childById[app.child_id]?.family_id : null,
      familyName: familyName(app ? childById[app.child_id]?.family_id : null),
      schoolId: app?.school_id || null,
      path: app ? familyPath(childById[app.child_id]?.family_id, "applications") : null,
    });
  });

  notes.forEach((n) =>
    push({
      id: "note:" + n.id,
      at: n.created_at || n.occurred_at,
      who: who(n.created_by || n.author_id),
      kind: n.kind === "email" ? "email" : "note",
      title: n.kind === "email" ? (n.direction === "outgoing" ? "sent an email" : "received an email") : NOTE_LABEL[n.kind] || "added a note",
      detail: [n.subject || (n.body || "").trim().slice(0, 120)].filter(Boolean),
      familyId: n.family_id,
      familyName: familyName(n.family_id),
      schoolId: n.school_id,
      path: familyPath(n.family_id, n.kind === "email" ? "emails" : "overview"),
    })
  );

  stages.forEach((s) =>
    push({
      id: "stage:" + s.id,
      at: s.moved_at,
      who: who(s.moved_by),
      kind: "stage",
      title: "moved the family's stage",
      detail: [s.from_stage || "new", s.to_stage],
      familyId: s.family_id,
      familyName: familyName(s.family_id),
      path: familyPath(s.family_id),
    })
  );

  updates.forEach((u) =>
    push({
      id: "update:" + u.id,
      at: u.created_at,
      who: who(u.created_by),
      kind: "application",
      title: `told the family a school is at "${u.stage}"`,
      detail: [schoolById[u.school_id]?.name, u.note].filter(Boolean),
      familyId: u.family_id,
      familyName: familyName(u.family_id),
      schoolId: u.school_id,
      path: familyPath(u.family_id, "visits"),
    })
  );

  schoolNotes.forEach((n) =>
    push({
      id: "schoolnote:" + n.id,
      at: n.created_at,
      who: who(n.author_id),
      kind: "school",
      title: "added a note on a school",
      detail: [schoolById[n.school_id]?.name, (n.body || "").slice(0, 120)].filter(Boolean),
      schoolId: n.school_id,
      path: `/staff/schools/${n.school_id}`,
    })
  );

  tasks.forEach((t) => {
    const name = familyName(t.family_id);
    const path = familyPath(t.family_id);
    if (t.created_at >= sinceIso) {
      push({ id: "task-new:" + t.id, at: t.created_at, who: who(t.created_by), kind: "task", title: "added a task", detail: [t.title], familyId: t.family_id, familyName: name, path });
    }
    if (t.assigned_at && t.assigned_at >= sinceIso) {
      push({
        id: "task-give:" + t.id,
        at: t.assigned_at,
        who: who(t.assigned_by),
        kind: "task",
        title: t.assigned_by && t.assigned_by === t.assigned_to ? "took a task" : `gave a task to ${who(t.assigned_to) || "someone"}`,
        detail: [t.title],
        familyId: t.family_id,
        familyName: name,
        path,
      });
    }
    if (t.done_at && t.done_at >= sinceIso) {
      push({ id: "task-done:" + t.id, at: t.done_at, who: who(t.done_by), kind: "task", title: "finished a task", detail: [t.title], familyId: t.family_id, familyName: name, path });
    }
  });

  placements.forEach((p) => {
    if (p.created_at >= sinceIso) {
      push({
        id: "place:" + p.id,
        at: p.created_at,
        who: who(p.created_by),
        kind: "placement",
        title: "recorded a placement",
        detail: [`${kidName(p.child_id)} at ${p.school_name}`, p.start_date ? `starts ${p.start_date}` : ""].filter(Boolean),
        familyId: p.family_id,
        familyName: familyName(p.family_id),
        path: familyPath(p.family_id),
      });
    }
    if (p.moved_at && p.moved_at >= sinceIso) {
      push({
        id: "place-moved:" + p.id,
        at: p.moved_at,
        who: who(p.moved_by),
        kind: "placement",
        title: "recorded a school move",
        detail: [`${kidName(p.child_id)} left ${p.school_name}`, p.moved_reason || ""].filter(Boolean),
        familyId: p.family_id,
        familyName: familyName(p.family_id),
        path: familyPath(p.family_id),
      });
    }
  });

  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
