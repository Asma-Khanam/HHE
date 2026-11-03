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
import { CHILD_DOCUMENT_TYPES, PARENT_DOCUMENT_TYPES } from "../data/documentTypes";

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


// ---- Reading the audit log like a person would -------------------------------
// The audit log stores raw database values ("10:00:00", "true", an ISO
// timestamp). Show them the way the rest of the app does, in Dubai time.
const DUBAI = "Asia/Dubai";
export function tidyValue(v) {
  if (v === null || v === undefined || v === "") return "not set";
  const t = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("en-GB", { timeZone: DUBAI, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return new Date(t + "T00:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
  }
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(t)) return t.slice(0, 5);
  if (t === "true") return "Yes";
  if (t === "false") return "No";
  return t.replace(/_/g, " ");
}

// "cat4 results" (how the database names a document) -> "CAT4 results" (how the
// family and the team name it).
function docTitle(text) {
  const t = String(text || "").toLowerCase();
  const hit = [...CHILD_DOCUMENT_TYPES, ...PARENT_DOCUMENT_TYPES].find((d) => d.key.replace(/_/g, " ") === t);
  return hit ? hit.label : text;
}

const PLACE_LABEL = {
  school_shortlist: "School visits",
  application_fees: "Applications",
  documents: "Documents",
  tasks: "Tasks",
  parents: "Family details",
  children: "Family details",
  current_schools: "Family details",
};

// Several fields saved together (one tour edit touches date, start, status...)
// arrive as several rows a second apart. Join those into one entry: same
// person, same record, within 90 seconds of each other.
function mergeAuditEntries(rows) {
  const sorted = [...rows].sort((a, b) => String(a.at).localeCompare(String(b.at))); // oldest first
  const groups = [];
  sorted.forEach((r) => {
    // Only edits to one record join together. Anything added is always its own
    // entry, so nothing is ever hidden behind a count.
    const g = groups.find(
      (x) => !r.isAdd && !x.isAdd && x.who === r.who && x.table === r.table && x.recordId === r.recordId && new Date(r.at) - new Date(x.lastAt) < 90000
    );
    if (g) {
      g.items.push(r);
      g.lastAt = r.at;
    } else groups.push({ ...r, items: [r], lastAt: r.at });
  });
  return groups.map((g) => {
    if (g.isAdd) return g;
    // Same field changed twice in one save: keep the first old and the last new.
    const byField = [];
    g.items.forEach((it) => {
      const f = byField.find((x) => x.field === it.field);
      if (f) f.new = it.rawNew;
      else byField.push({ field: it.field, label: it.label, old: it.rawOld, new: it.rawNew });
    });
    let real = byField.filter((f) => tidyValue(f.old) !== tidyValue(f.new));
    // Marking a fee paid also flips who paid it. That is a side effect of the
    // same click, so it stays in the log but is not shown as a second change.
    if (g.table === "application_fees" && byField.some((f) => f.field === "status" || f.field === "paid_at")) {
      real = real.filter((f) => f.field !== "hhe_paid_school_on_behalf" && f.field !== "paid_direct_by_family");
    }
    const changes = real.length ? real : byField;
    const words = changes.map((c) => String(c.label || c.field).split(" "));
    let prefix = [];
    if (changes.length > 1) {
      for (let i = 0; i < words[0].length; i++) {
        if (words.every((w) => w[i] === words[0][i])) prefix.push(words[0][i]);
        else break;
      }
    }
    const single = changes.length === 1;
    return {
      ...g,
      at: g.lastAt, // the whole save is dated by its last row
      title: single ? `changed ${changes[0].label || changes[0].field}` : prefix.length ? `changed the ${prefix.join(" ")}` : `changed ${changes.length} details`,
      changes: changes.map((c) => {
        const rest = single ? "" : String(c.label || c.field).split(" ").slice(prefix.length).join(" ");
        return { label: rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "", old: tidyValue(c.old), new: tidyValue(c.new) };
      }),
    };
  });
}

// With familyId, only that family's history is read (the History tab on a family).
export async function loadActivity({ sinceDays = 30, limit = 400, familyId = null } = {}) {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const sinceIso = since.toISOString();
  const scope = (q) => (familyId ? q.eq("family_id", familyId) : q);

  // Application events belong to a child, not a family, so for one family
  // find that family's applications first.
  let appIds = null;
  if (familyId) {
    const kids = await soft(supabase.from("children").select("id").eq("family_id", familyId));
    const apps = kids.length ? await soft(supabase.from("applications").select("id").in("child_id", kids.map((k) => k.id))) : [];
    appIds = apps.map((a) => a.id);
  }

  const [audit, appEvents, notes, stages, updates, schoolNotes, tasks, placements, families, parents, schools, staff, applications, children] =
    await Promise.all([
      soft(scope(supabase.from("record_audit_log").select("*").gte("changed_at", sinceIso)).order("changed_at", { ascending: false }).limit(limit)),
      appIds && appIds.length === 0
        ? Promise.resolve([])
        : soft((appIds ? supabase.from("application_events").select("*").in("application_id", appIds) : supabase.from("application_events").select("*")).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(limit)),
      soft(
        scope(
          supabase
            .from("case_notes")
            .select("id, family_id, school_id, kind, body, subject, direction, occurred_at, created_at, created_by, author_id")
            .gte("created_at", sinceIso)
        )
          .order("created_at", { ascending: false })
          .limit(limit)
      ),
      soft(scope(supabase.from("family_stage_history").select("*").gte("moved_at", sinceIso)).order("moved_at", { ascending: false }).limit(limit)),
      soft(scope(supabase.from("family_school_updates").select("*").gte("created_at", sinceIso)).order("created_at", { ascending: false }).limit(limit)),
      familyId ? Promise.resolve([]) : soft(supabase.from("school_notes").select("*").gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(limit)),
      soft(scope(supabase.from("tasks").select("*").or(`created_at.gte.${sinceIso},done_at.gte.${sinceIso},assigned_at.gte.${sinceIso}`)).limit(limit)),
      soft(scope(supabase.from("family_placements").select("*")).limit(limit)),
      soft(supabase.from("families").select("id, archived_at, owner_staff_id")),
      soft(supabase.from("parents").select("id, family_id, relationship, full_name")),
      soft(supabase.from("schools").select("id, name")),
      soft(supabase.from("staff").select("user_id, full_name, email")),
      soft(supabase.from("applications").select("id, child_id, school_id, status")),
      soft(supabase.from("children").select("id, family_id, full_name, preferred_name, first_name")),
    ]);

  // So an entry can open the exact thing it is about: which file was added, and
  // which school a fee belongs to.
  const docIds = [...new Set(audit.filter((a) => a.table_name === "documents").map((a) => a.record_id))];
  const feeIds = [...new Set(audit.filter((a) => a.table_name === "application_fees").map((a) => a.record_id))];
  const [docInfo, feeInfo] = await Promise.all([
    docIds.length ? soft(supabase.from("documents").select("id, original_filename").in("id", docIds)) : [],
    feeIds.length ? soft(supabase.from("application_fees").select("id, application_id").in("id", feeIds)) : [],
  ]);
  const fileName = Object.fromEntries(docInfo.map((d) => [d.id, d.original_filename]));
  const feeApp = Object.fromEntries(feeInfo.map((f) => [f.id, f.application_id]));

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
  // A link to a family, optionally straight to one tab and one school's row.
  const familyPath = (id, tab, school, hl) => {
    if (!id) return null;
    const q = [tab && `tab=${tab}`, school && `school=${school}`, hl && `hl=${encodeURIComponent(hl)}`].filter(Boolean).join("&");
    return `/staff/families/${id}${q ? `?${q}` : ""}`;
  };

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
  const auditRows = [];
  audit.forEach((a) => {
    const added = a.field_name === "added" || a.field_name === "removed";
    const isDoc = a.table_name === "documents";
    const fieldLabel = isDoc && added ? docTitle(a.field_label) : a.field_label;
    auditRows.push({
      id: "audit:" + a.id,
      at: a.changed_at,
      who: a.changed_by_name || who(a.changed_by),
      kind: "edit",
      where: PLACE_LABEL[a.table_name] || "Family details",
      table: a.table_name,
      recordId: a.record_id,
      field: a.field_name,
      label: fieldLabel,
      rawOld: a.old_value,
      rawNew: a.new_value,
      isAdd: added,
      fromFamily: a.changed_by_name === "The family",
      title: added ? `${a.field_name} ${fieldLabel || "a record"}` : `changed ${a.field_label || a.field_name}`,
      detail: added ? [isDoc ? docTitle(a.new_value || a.old_value || "") : a.new_value || a.old_value || "", isDoc ? fileName[a.record_id] || "" : ""].filter(Boolean) : [],
      isChange: false,
      familyId: a.family_id,
      familyName: familyName(a.family_id),
      path: (() => {
        const tab = AUDIT_TAB[a.table_name] ?? "details";
        if (a.table_name === "documents") return familyPath(a.family_id, tab, null, `doc:${a.record_id}`);
        if (a.table_name === "school_shortlist") return familyPath(a.family_id, tab, null, `sv-row-${a.record_id}`);
        if (a.table_name === "application_fees") {
          const sid = appById[feeApp[a.record_id]]?.school_id;
          return familyPath(a.family_id, tab, sid, sid ? `app-row-school-${sid}` : null);
        }
        return familyPath(a.family_id, tab);
      })(),
    });
  });
  mergeAuditEntries(auditRows).forEach((g) => {
    const { items: _items, lastAt: _lastAt, isAdd, ...row } = g;
    push({ ...row, isChange: !isAdd });
  });

  appEvents.forEach((e) => {
    const app = appById[e.application_id];
    const school = app ? schoolById[app.school_id]?.name : null;
    push({
      id: "appev:" + e.id,
      __type: e.event_type,
      at: e.created_at,
      who: who(e.created_by),
      kind: "application",
      title: APP_EVENT_LABEL[e.event_type] || e.event_type.replace(/_/g, " "),
      detail: [[school, app ? kidName(app.child_id) : null].filter(Boolean).join(" · "), e.description || e.new_status || ""].filter(Boolean),
      familyId: app ? childById[app.child_id]?.family_id : null,
      familyName: familyName(app ? childById[app.child_id]?.family_id : null),
      schoolId: app?.school_id || null,
      path: app ? familyPath(childById[app.child_id]?.family_id, "applications", app.school_id, `app-row-school-${app.school_id}`) : null,
      schoolName: school || "",
    });
  });

  notes.forEach((n) =>
    push({
      id: "note:" + n.id,
      at: n.created_at || n.occurred_at,
      who: who(n.created_by || n.author_id),
      kind: n.kind === "email" ? "email" : "note",
      fromFamily: n.kind === "email" && n.direction !== "outgoing",
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
      path: familyPath(u.family_id, "visits", u.school_id),
      schoolName: schoolById[u.school_id]?.name || "",
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

  // A fee marked paid is written twice: once as an application event ("recorded
  // an application fee as paid") and once as the field changes. Show it once,
  // with the school and child from the event as the context line.
  const feeEntries = out.filter((r) => r.table === "application_fees" && r.changes);
  const dropped = new Set();
  out.forEach((r) => {
    if (!r.id.startsWith("appev:") || !(r.__type || "").startsWith("fee_")) return;
    const m = feeEntries.find((f) => f.familyId === r.familyId && Math.abs(new Date(f.at) - new Date(r.at)) <= 120000);
    if (m) {
      m.context = r.detail[0] || "";
      dropped.add(r.id);
    }
  });

  const owners = Object.fromEntries(families.map((f) => [f.id, f.owner_staff_id]));
  return out
    .filter((r) => !dropped.has(r.id))
    .map((r) => ({ ...r, ownerStaffId: owners[r.familyId] || null }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
