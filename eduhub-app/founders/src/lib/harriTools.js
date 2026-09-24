// The tools Harri (the consultant-site robot) can use. They run HERE, in the
// consultant's browser, with their own Supabase session -- so Harri only
// ever sees what the signed-in consultant can already see, and every tool
// is read-only. Results are trimmed down before going to Claude: no ids
// Claude doesn't need, no empty fields, long text cut short.

import { supabase } from "./supabaseClient";
import {
  familyDisplayName,
  getFamilyDetail,
  getTodayData,
  listFamilies,
  listSchoolsWithStats,
  listShortlistForFamily,
  listStaff,
  loadCalendarEvents,
  shortId,
  todayInDubai,
} from "./staffData";
import { computeInsights, loadInsightsData } from "./insights";
import { displayNameForChild } from "./completeness";

const KEEP_IDS = new Set(["id", "family_id"]);

// Drop ids, nulls, empty strings; cut long text.
function compact(obj, maxText = 400) {
  if (Array.isArray(obj)) return obj.map((o) => compact(o, maxText));
  if (!obj || typeof obj !== "object") {
    return typeof obj === "string" && obj.length > maxText ? obj.slice(0, maxText) + "…" : obj;
  }
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    if ((k.endsWith("_id") || k === "id" || k.endsWith("_by")) && !KEEP_IDS.has(k)) continue;
    if (/password|alias_secret|token|storage_path|file_path/i.test(k)) continue;
    if (Array.isArray(v) && !v.length) continue;
    out[k] = compact(v, maxText);
  }
  return out;
}

const lc = (s) => String(s || "").toLowerCase();
const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};

async function familyNameMap() {
  const [{ data: families }, { data: parents }] = await Promise.all([
    supabase.from("families").select("*"),
    supabase.from("parents").select("family_id, relationship, full_name"),
  ]);
  const byFamily = {};
  (parents || []).forEach((p) => (byFamily[p.family_id] ||= []).push(p));
  return Object.fromEntries((families || []).map((f) => [f.id, familyDisplayName(f, byFamily[f.id] || [])]));
}

// ------------------------------------------------------------------ tools

async function find_families(input = {}) {
  const all = await listFamilies();
  const q = lc(input.query).trim();
  const rows = all.filter((f) => {
    if (q) {
      const hay = [
        f.displayName,
        shortId(f.id),
        ...(f.parents || []).map((p) => p.full_name),
        ...(f.children || []).map((c) => [c.full_name, c.preferred_name, c.first_name].join(" ")),
      ]
        .join(" ")
        .toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    if (input.pipeline_stage && !lc(f.pipeline_stage).includes(lc(input.pipeline_stage))) return false;
    if (input.client_stage && !lc(f.client_stage).includes(lc(input.client_stage))) return false;
    if (input.arriving_from && (!f.dubai_available_from || f.dubai_available_from < input.arriving_from)) return false;
    if (input.arriving_to && (!f.dubai_available_from || f.dubai_available_from > input.arriving_to)) return false;
    if (input.owner) {
      if (lc(input.owner) === "unassigned") {
        if (f.owner_staff_id) return false;
      } else if (!lc(f.ownerName).includes(lc(input.owner))) return false;
    }
    return true;
  });
  return {
    total_matching: rows.length,
    families: rows.slice(0, 25).map((f) =>
      compact({
        family_id: f.id,
        name: f.displayName,
        ref: shortId(f.id),
        children: f.childLabels,
        pipeline_stage: f.pipeline_stage,
        client_stage: f.client_stage,
        owner: f.ownerName,
        moving_from: f.origin,
        in_dubai_from: f.dubai_available_from,
        in_dubai_until: f.dubai_available_until,
        open_tasks: f.openTaskCount,
        next_task: f.nextTask ? { title: f.nextTask.title, due: f.nextTask.due_date } : null,
      })
    ),
  };
}

async function get_family({ family_id }) {
  const [d, shortlist] = await Promise.all([getFamilyDetail(family_id), listShortlistForFamily(family_id).catch(() => [])]);
  const f = d.family;
  const docs = Object.values(d.documentsByOwner || {})
    .flat()
    .filter((doc) => doc.document_type !== "profile_photo");
  const docStatus = {};
  docs.forEach((doc) => (docStatus[doc.status || "uploaded"] = (docStatus[doc.status || "uploaded"] || 0) + 1));
  const notes = d.caseNotes || [];

  return compact({
    family_id: f.id,
    name: d.displayName,
    ref: shortId(f.id),
    owner: d.ownerName,
    pipeline_stage: f.pipeline_stage,
    client_stage: f.client_stage,
    package: f.membership_type,
    moving_from: f.origin,
    destination: f.destination,
    in_dubai_from: f.dubai_available_from,
    in_dubai_until: f.dubai_available_until,
    application_form: f.intake_status,
    on_file_since: f.created_at?.slice(0, 10),
    parents: d.parentsOrdered.map((p) => ({
      name: p.full_name,
      relationship: p.relationship,
      email: p.email,
      phone: p.phone,
      nationality: p.nationality,
      job_title: p.occupation_designation,
      company: p.employer_name,
      qualification: p.highest_qualification,
      move_type: p.move_type,
    })),
    children: d.children.map((c, i) => ({
      name: displayNameForChild(c, i),
      full_name: c.full_name,
      date_of_birth: c.date_of_birth,
      year_group_applying_for: c.year_group_applying_for,
      current_school: d.currentSchools[i],
      applications: (d.applicationsByChild[c.id] || []).map((a) => ({
        school: a.schoolName,
        status: a.status,
        submitted_at: a.submitted_at,
        visit_date: a.visit_date,
        offer_decision_by: a.offer_decision_by,
        offer_accepted_on: a.offer_accepted_on,
        notes: a.notes,
      })),
    })),
    shortlist: shortlist.map((s) => ({
      school: s.school?.name,
      availability: s.availability_status,
      tour_date: s.tour_date,
      tour_status: s.tour_status,
      family_view: s.family_interest,
      family_note: s.family_interest_note,
    })),
    open_tasks: d.tasks.filter((t) => !t.done_at).map((t) => ({ title: t.title, due: t.due_date })),
    payments: d.payments.map((p) => ({ label: p.label, amount: p.amount, currency: p.currency, status: p.status, due: p.due_date })),
    documents_by_status: docStatus,
    documents_to_chase: docs.filter((doc) => doc.status === "chasing").map((doc) => doc.document_type),
    latest_emails: notes
      .filter((n) => n.kind === "email")
      .slice(0, 6)
      .map((n) => ({
        date: n.occurred_at?.slice(0, 10),
        direction: n.direction,
        from: n.email_from_name || n.email_from,
        subject: n.subject,
        summary: n.ai_insight?.summary || (n.email_text || n.body || "").slice(0, 200),
      })),
    latest_notes: notes
      .filter((n) => n.kind !== "email")
      .slice(0, 5)
      .map((n) => ({ date: n.occurred_at?.slice(0, 10), kind: n.kind, text: n.body })),
  });
}

async function get_tasks({ scope = "all_open", family_id, mine_only } = {}) {
  const [{ tasks }, staff, { data: auth }] = await Promise.all([getTodayData(), listStaff(), supabase.auth.getUser()]);
  const me = auth?.user?.id;
  const staffById = Object.fromEntries((staff || []).map((s) => [s.user_id, s.full_name || s.email]));
  const today = todayInDubai();
  const inScope = (t) => {
    const due = t.due_date;
    if (scope === "overdue") return due && due < today;
    if (scope === "today") return due === today;
    if (scope === "this_week") return due && due <= addDays(today, 7);
    if (scope === "next_14_days") return due && due <= addDays(today, 14);
    return true;
  };
  const rows = (tasks || [])
    .filter((t) => !t.done_at)
    .filter((t) => (family_id ? t.family_id === family_id : true))
    .filter((t) => (mine_only ? t.assigned_to === me : true))
    .filter(inScope);
  return {
    today,
    count: rows.length,
    tasks: rows.slice(0, 40).map((t) =>
      compact({
        title: t.title,
        due: t.due_date,
        overdue: t.due_date && t.due_date < today ? true : null,
        family: t.familyName,
        family_id: t.family_id,
        assigned_to: t.assigned_to ? staffById[t.assigned_to] : "Anyone",
      })
    ),
  };
}

async function get_calendar({ from, to }) {
  const end = addDays(to, 1);
  const events = await loadCalendarEvents({ from, to: end });
  return {
    count: events.length,
    events: events.slice(0, 60).map((e) =>
      compact({
        title: e.title,
        kind: e.kind,
        when: e.all_day ? e.starts_at?.slice(0, 10) : e.starts_at,
        family: e.familyName,
        family_id: e.family_id,
        consultant: e.consultantName,
        notes: e.notes,
      })
    ),
  };
}

async function get_overview() {
  const [today, raw] = await Promise.all([getTodayData(), loadInsightsData().catch(() => null)]);
  let insights = null;
  if (raw) {
    try {
      const ins = computeInsights(raw, { range: "all", hideTest: true });
      insights = { kpis: ins.kpis, findings: ins.findings, top_origins: ins.origins?.slice(0, 5), top_sources: ins.referral?.slice(0, 5) };
    } catch {
      insights = null;
    }
  }
  return compact({
    today: todayInDubai(),
    families_on_file: today.families.length,
    open_tasks: today.tasks.filter((t) => !t.done_at).length,
    overdue_tasks: today.tasks.filter((t) => !t.done_at && t.due_date && t.due_date < todayInDubai()).length,
    offers_in_play: today.offersInPlay,
    documents_to_chase: today.chasingDocs,
    documents_expiring_soon: today.expiringDocs,
    overdue_payments: today.overduePayments,
    payments_to_confirm: today.paymentsToConfirm,
    unassigned_families: today.unownedFamilies,
    recent_activity: today.recentActivity.slice(0, 6).map((n) => ({
      when: n.created_at?.slice(0, 10),
      who: n.staffName,
      family: n.familyName,
      kind: n.kind,
      what: n.subject || n.body,
    })),
    analytics: insights,
  }, 300);
}

async function recent_emails({ days = 7, category } = {}) {
  const d = Math.min(Math.max(Number(days) || 7, 1), 60);
  const since = new Date(Date.now() - d * 86400000).toISOString();
  const [{ data, error }, names] = await Promise.all([
    supabase
      .from("case_notes")
      .select("family_id, subject, email_from, email_from_name, occurred_at, direction, ai_insight, email_text, body")
      .eq("kind", "email")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(60),
    familyNameMap(),
  ]);
  if (error) throw error;
  const rows = (data || []).filter((n) => !category || n.ai_insight?.category === category);
  return {
    days: d,
    count: rows.length,
    emails: rows.slice(0, 30).map((n) =>
      compact({
        date: n.occurred_at?.slice(0, 16).replace("T", " "),
        family: names[n.family_id],
        family_id: n.family_id,
        direction: n.direction,
        from: n.email_from_name || n.email_from,
        subject: n.subject,
        category: n.ai_insight?.category,
        urgency: n.ai_insight?.urgency,
        summary: n.ai_insight?.summary || (n.email_text || n.body || "").slice(0, 200),
      })
    ),
  };
}

async function find_schools({ query } = {}) {
  const schools = await listSchoolsWithStats();
  const q = lc(query).trim();
  const rows = q ? schools.filter((s) => lc([s.name, s.location, s.curriculum].join(" ")).includes(q)) : schools;
  return {
    count: rows.length,
    schools: rows.slice(0, 20).map((s) => {
      const c = compact(s, 300);
      c.families_shortlisted = s.shortlistCount;
      return c;
    }),
  };
}

const TOOLS = { find_families, get_family, get_tasks, get_calendar, get_overview, recent_emails, find_schools };

export const TOOL_LABELS = {
  find_families: "Searching the caseload",
  get_family: "Opening the family file",
  get_tasks: "Checking the to-do list",
  get_calendar: "Peeking at the calendar",
  get_overview: "Crunching the numbers",
  recent_emails: "Reading the inbox",
  find_schools: "Flipping through the school list",
};

export async function runHarriTool(name, input) {
  const fn = TOOLS[name];
  if (!fn) return { error: `Unknown tool ${name}` };
  try {
    const out = await fn(input || {});
    const json = JSON.stringify(out);
    return json.length > 24000 ? { note: "Result was long and has been cut short", partial_json: json.slice(0, 24000) } : out;
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}
