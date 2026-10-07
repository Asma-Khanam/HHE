// ============================================================================
// OpenApply sync (Track B) -- September 2026, Asma/Heather.
//
// WHAT THIS DOES: for every application at a school tagged
// schools.application_platform = 'openapply', logs into that school's
// OpenApply portal using the family's own stored login
// (families.application_alias / application_password -- the same one login
// per family reused across every school, addendum 7 & 43), reads the
// Checklist page (overall status) and the Invoices & Fees page (each fee's
// amount/due date/paid status), and writes anything new or changed into
// application_events and application_fees -- the EXACT SAME tables staff
// write into by hand from the founders app's "Timeline & fees" panel. The
// UI tells the two apart by `source`: 'staff' vs 'openapply_sync'.
//
// WHY MANUAL ENTRY STAYS: Heather/Asma's own instruction -- if a login
// breaks, OpenApply changes its page layout, or a school isn't even on
// OpenApply, staff can just keep logging updates by hand in the same panel.
// This script is additive, never the only way information gets in.
//
// ----------------------------------------------------------------------------
// SELECTOR STATUS (22 Sept 2026): confirmed against a real Queen
// Elizabeth's School (OpenApply) Checklist and Invoices & Fees page --
// openapply-debug-output/5712009d-.../checklist.html + invoices.html, a
// debug run against Layla Hadley's application. Login, the checklist's
// "Submit Application Form" item -> draft/submitted signal, and the
// per-child-filtered Invoices table are all real selectors now, not
// guesses. Still unconfirmed: anything past "submitted" (assessment
// booked, under review, offer, rejected -- nothing seen on OpenApply's own
// pages ties to those yet, so this script never sets them) and whether a
// Paid/closed invoices table exists somewhere on the Invoices & Fees page
// (only seen a family with nothing paid so far -- every fee row read here
// is treated as unpaid until a paid one is seen). DEBUG_MODE and
// WRITES_ENABLED both still default to off/false: run a debug pass, check
// the console output against what's actually true for that application,
// and only then flip them (see README).
// ----------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Debug mode is ON by default -- must be explicitly turned off once the
// selectors below have been checked against a real page. See README.md.
const DEBUG_MODE = (process.env.OPENAPPLY_SYNC_DEBUG ?? "true") !== "false";
// Limit a debug run to one application (its `applications.id`), so the
// first calibration pass only touches one real family's portal instead of
// logging into everyone's at once. Leave unset to process everything.
const DEBUG_ONLY_APPLICATION_ID = process.env.OPENAPPLY_SYNC_DEBUG_APPLICATION_ID || null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ----------------------------------------------------------------------------
// SELECTOR / MAPPING CONFIG -- the only part of this file that should need
// changing once we see the real site. Everything else (the Supabase reads
// and writes) is already wired to the real schema.
// ----------------------------------------------------------------------------
const CONFIG = {
  login: {
    // Confirmed 22 Sept 2026 against a real Queen Elizabeth's School
    // (OpenApply) login page -- see openapply-debug-output/5712009d-.../
    // login-uncertain.html from an earlier run. Real fields are
    // input#parent_email / input#parent_password, but the type-based
    // selectors below already matched them correctly (that run's login
    // failure was bad credentials, not a selector miss -- confirmed by a
    // later run with the same selectors succeeding).
    emailSelector: 'input[type="email"], input[name="email"], input#email',
    passwordSelector: 'input[type="password"], input[name="password"], input#password',
    submitSelector: 'button[type="submit"], input[type="submit"]',
    loggedInIndicator: 'text=Checklist',
  },
  // Confirmed against a real Checklist page, 22 Sept 2026 (see
  // openapply-debug-output/5712009d-.../checklist.html). The Checklist page
  // is per-STUDENT (URL /students/<id>/profile): each required item is a
  // div.item, id="checklist-<n>", carrying a "completed" class once done,
  // plus a .due-state with the completion date. Only one item maps onto our
  // own application status today -- "Submit Application Form" being done is
  // the one reliable signal the application itself has gone in. The rest
  // (Emirates ID, passport copies, school reports, ...) are document
  // checklist items -- read and logged, not mapped to a status, since
  // nothing we've seen ties them to assessment/decision stages.
  checklist: {
    containerSelector: ".content-items.checklist",
    itemSelector: ".content-items.checklist .item",
    titleSelector: ".title-head > span",
    dueDateSelector: ".due-state",
    // Schools word this item slightly differently ("Submit Application
    // Form", "Submit the application", "Application form submitted").
    submitItemTitleMatch: /submit(ted)?\s+(the\s+|your\s+)?application|application\s+form\s+submitted/i,
  },
  // Confirmed against the same run's Invoices & Fees page. That page is
  // per-FAMILY, not per-student -- it lists every child's fees in one
  // table, so rows have to be matched to the right child by the "Student
  // Name" column (extractFeeRows does this). Only the "Open Invoices"
  // table has been seen so far, for a family with nothing paid yet -- a
  // paid/closed invoices table may exist elsewhere on the page or behind a
  // filter, not yet confirmed. Every row read from here is treated as
  // unpaid until that's checked against a family that has actually paid.
  invoices: {
    rowSelector: "table.js-open-invoices tbody tr",
  },
};

// Parses OpenApply's "17 September, 2026" style date into an ISO
// yyyy-mm-dd, or null if it doesn't look like that shape -- never guesses.
function parseOpenApplyDate(text) {
  if (!text) return null;
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s*,?\s*(\d{4})/);
  if (!m) return null;
  const d = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Reads the per-student Checklist page into {completed, total, submittedAt,
// items}. submittedAt (a raw OpenApply date string) is only set when the
// "Submit Application Form" item is done -- everything else on this page is
// a document checklist item, not an application status.
async function extractChecklist(page) {
  const container = page.locator(CONFIG.checklist.containerSelector).first();
  const dataCompleted = await container.getAttribute("data-completed").catch(() => null);
  const rows = await page.locator(CONFIG.checklist.itemSelector).all();
  const items = [];
  let submittedAt = null;
  for (const row of rows) {
    const cls = (await row.getAttribute("class")) || "";
    const done = /\bcompleted\b/.test(cls);
    const title = ((await row.locator(CONFIG.checklist.titleSelector).first().innerText().catch(() => "")) || "").trim();
    const dueText = ((await row.locator(CONFIG.checklist.dueDateSelector).first().innerText().catch(() => "")) || "").trim() || null;
    const rowId = (await row.getAttribute("id")) || "";
    items.push({ title, done, dueText, externalRef: rowId || `title-${title}` });
    if (done && CONFIG.checklist.submitItemTitleMatch.test(title) && dueText) {
      submittedAt = dueText;
    }
  }
  return {
    completed: dataCompleted != null ? Number(dataCompleted) : items.filter((i) => i.done).length,
    total: items.length,
    submittedAt,
    items,
  };
}

// ----------------------------------------------------------------------------
// Data to sync: every application at an OpenApply-tagged school, for a
// family that has a stored application login. Joined client-side, same
// style as the rest of this codebase (see staffData.js's own comment on
// why: small row counts, each query stays obvious about what it needs).
// ----------------------------------------------------------------------------
const ALIAS_DOMAIN = "applications.heatherharries.com";
// Flipped on 22 Sept 2026 -- selectors confirmed against a real debug run
// (Layla Hadley / Queen Elizabeth's School), see the CONFIG comment above.
const WRITES_ENABLED = true;

function deriveLoginUrl(applicationUrl) {
  try {
    const u = new URL(applicationUrl || "");
    return /(^|\.)openapply\.com$/i.test(u.hostname) ? `${u.origin}/dashboard` : null;
  } catch {
    return null;
  }
}

async function loadSyncTargets() {
  // Every school that runs on OpenApply: tagged as such, OR whose "apply
  // now" link is an openapply.com address (so nobody has to tag schools one
  // by one). The portal login page is the stored openapply_login_url, or
  // else <that school's openapply.com host>/dashboard.
  const { data: rawSchools, error: schoolsErr } = await supabase
    .from("schools")
    .select("id, name, openapply_login_url, application_platform, application_url")
    .or("application_platform.eq.openapply,application_url.ilike.%openapply.com%");
  if (schoolsErr) throw schoolsErr;
  const schools = (rawSchools || [])
    .map((sc) => ({ ...sc, openapply_login_url: sc.openapply_login_url || deriveLoginUrl(sc.application_url) }))
    .filter((sc) => sc.openapply_login_url);
  if (!schools.length) return [];
  const schoolById = Object.fromEntries(schools.map((s) => [s.id, s]));

  let appsQuery = supabase
    .from("applications")
    .select("id, child_id, school_id, status, submitted_at, openapply_student_id")
    .in("school_id", schools.map((s) => s.id));
  if (DEBUG_ONLY_APPLICATION_ID) appsQuery = appsQuery.eq("id", DEBUG_ONLY_APPLICATION_ID);
  const { data: applications, error: appsErr } = await appsQuery;
  if (appsErr) throw appsErr;
  if (!applications.length) return [];

  const { data: children, error: childrenErr } = await supabase
    .from("children")
    .select("id, family_id, first_name, last_name")
    .in("id", applications.map((a) => a.child_id));
  if (childrenErr) throw childrenErr;
  const familyIdByChild = Object.fromEntries(children.map((c) => [c.id, c.family_id]));

  const childById = Object.fromEntries(children.map((c) => [c.id, c]));
  const familyIds = [...new Set(children.map((c) => c.family_id))];
  const { data: families, error: familiesErr } = await supabase
    .from("families")
    .select("id")
    .in("id", familyIds);
  if (familiesErr) throw familiesErr;

  // The working portal login is the PARENT's own alias + password (parents
  // table, addenda 42/43), not the older family-level one. Oldest parent row
  // with both set and not marked inactive is used (normally the mother).
  const { data: parents, error: parentsErr } = await supabase
    .from("parents")
    .select("family_id, full_name, relationship, application_alias, application_alias_status, application_password, created_at")
    .in("family_id", familyIds)
    .order("created_at", { ascending: true });
  if (parentsErr) throw parentsErr;
  const familyById = {};
  families.forEach((f) => {
    // Mother first (her alias is the one registered on the school portals),
    // then anyone else with a login. Never guesses between two logins silently.
    const candidates = (parents || []).filter(
      (p) => p.family_id === f.id && p.application_alias && p.application_password && p.application_alias_status !== "inactive"
    );
    const login = candidates.find((p) => p.relationship === "Mother") || candidates[0];
    if (login) console.log(`Family ${f.id}: using the ${login.relationship || "parent"} login (${candidates.length} available)`);
    familyById[f.id] = {
      id: f.id,
      application_alias: login ? `${String(login.application_alias).trim()}@${ALIAS_DOMAIN}` : null,
      application_password: login ? String(login.application_password).trim() : null,
      login_role: login ? login.relationship || "unknown" : null,
      login_raw_lengths: login
        ? { alias: String(login.application_alias).length, password: String(login.application_password).length }
        : null,
    };
  });

  const { data: existingFees, error: feesErr } = await supabase
    .from("application_fees")
    .select("*")
    .in("application_id", applications.map((a) => a.id));
  if (feesErr) throw feesErr;
  const feesByApplication = {};
  (existingFees || []).forEach((f) => {
    (feesByApplication[f.application_id] ||= []).push(f);
  });

  return applications
    .map((app) => {
      const familyId = familyIdByChild[app.child_id];
      const family = familyById[familyId];
      const school = schoolById[app.school_id];
      return { app, family, school, child: childById[app.child_id], existingFees: feesByApplication[app.id] || [] };
    })
    .filter((t) => t.family?.application_alias && t.family?.application_password && t.school?.openapply_login_url);
}

// ----------------------------------------------------------------------------
// One school + one family login = ONE sign-in, then every one of that
// family's children at that school is read in turn. One failed login never
// stops the run (the other families still sync) and is never retried, so an
// account can't be locked out.
// ----------------------------------------------------------------------------
const OUTCOME = {
  ok: "ok",
  loginFailed: "login_failed",
  studentNotFound: "student_not_found",
  error: "error",
};

// Tells staff, on the application itself, what the last sync did -- so a
// family that can't be synced is visible instead of silently skipped.
// (Needs addendum 92; quietly does nothing if it hasn't been run yet.)
async function recordOutcome(app, status, note) {
  if (DEBUG_MODE || !WRITES_ENABLED) return;
  const patch = { openapply_sync_status: status, openapply_sync_note: note || null };
  if (status !== OUTCOME.ok) patch.openapply_last_synced_at = new Date().toISOString();
  const { error } = await supabase.from("applications").update(patch).eq("id", app.id);
  if (error) console.warn(`  (could not record sync status: ${error.message})`);
}

async function isLoggedIn(page) {
  const indicator = await page
    .locator(CONFIG.login.loggedInIndicator)
    .first()
    .isVisible({ timeout: 10000 })
    .catch(() => false);
  if (indicator) return true;
  // Other schools label their dashboard differently: signed in = the
  // password box is gone and we are no longer on a sign-in page.
  const passwordStillThere = await page.locator(CONFIG.login.passwordSelector).first().isVisible().catch(() => false);
  return !passwordStillThere && !/sign_in|login|session/i.test(page.url());
}

async function syncGroup(browser, group, debugDir) {
  const { school, family } = group[0];
  const label = `${school.name} / family ${family.id}`;
  console.log(`\n=== ${label} (${group.length} application${group.length === 1 ? "" : "s"}) ===`);
  const context = await browser.newContext();
  const page = await context.newPage();
  const results = [];
  try {
    await page.goto(school.openapply_login_url, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (DEBUG_MODE) {
      const info = [
        `role: ${family.login_role}`,
        `email: ${family.application_alias.slice(0, 3)}***@${family.application_alias.split("@")[1]}`,
        `stored alias length: ${family.login_raw_lengths?.alias} (typed: ${family.application_alias.split("@")[0].length})`,
        `stored password length: ${family.login_raw_lengths?.password} (typed: ${family.application_password.length})`,
        `password has spaces: ${/\s/.test(family.application_password)}`,
      ].join("\n");
      await fs.mkdir(path.join(debugDir, group[0].app.id), { recursive: true });
      await fs.writeFile(path.join(debugDir, group[0].app.id, "login-info.txt"), info + "\n");
    }
    await page.fill(CONFIG.login.emailSelector, family.application_alias);
    await page.fill(CONFIG.login.passwordSelector, family.application_password);
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {}),
      page.click(CONFIG.login.submitSelector),
    ]);

    if (!(await isLoggedIn(page))) {
      // Most often: this family hasn't got an account on this school's portal
      // yet (the application hasn't been started there), or the password
      // differs. Never retried -- repeated bad logins can lock an account.
      console.warn(`  Could not sign in for ${label} -- skipping this family at this school.`);
      if (DEBUG_MODE) await saveDebugArtifacts(page, debugDir, group[0].app.id, "login-uncertain");
      for (const t of group) await recordOutcome(t.app, OUTCOME.loginFailed, "Couldn't sign in to this school's OpenApply portal with the stored login. Check the account exists there and the password matches.");
      return group.map(() => OUTCOME.loginFailed);
    }

    for (const target of group) {
      results.push(await syncStudent(page, target, debugDir));
    }
    return results;
  } catch (err) {
    console.error(`  Failed on ${label}:`, err.message);
    if (DEBUG_MODE) await saveDebugArtifacts(page, debugDir, group[0].app.id, "error").catch(() => {});
    for (const t of group.slice(results.length)) await recordOutcome(t.app, OUTCOME.error, String(err.message).slice(0, 300));
    return [...results, ...group.slice(results.length).map(() => OUTCOME.error)];
  } finally {
    await context.close();
  }
}

async function syncStudent(page, target, debugDir) {
  const { app, school, child, existingFees } = target;
  const label = `${school.name} / ${child?.first_name || "child"} (application ${app.id})`;
  console.log(`\n--- ${label} ---`);
  try {
    // Read-only navigation: plain page loads (GET) straight to the pages
    // OpenApply itself links from the dashboard. Nothing is clicked, filled
    // or submitted beyond the login form.
    const origin = new URL(school.openapply_login_url).origin;
    // Back to the dashboard so the student links are on screen.
    await page.goto(school.openapply_login_url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});

    // Which OpenApply student is this child? Use the stored id if there is
    // one, otherwise match the child's name against the dashboard's own
    // student links. No clear single match = skip, never guess.
    let studentId = app.openapply_student_id || null;
    if (!studentId) studentId = await findStudentId(page, child);
    if (!studentId) {
      console.warn(`  Could not tell which OpenApply student is ${child?.first_name || "this child"} -- skipping.`);
      if (DEBUG_MODE) await saveDebugArtifacts(page, debugDir, app.id, "dashboard");
      await recordOutcome(app, OUTCOME.studentNotFound, "Signed in, but couldn't find this child on the school's portal by name. Check the spelling matches, or the application hasn't been started there.");
      return OUTCOME.studentNotFound;
    }
    console.log(`  Using OpenApply student ${studentId}`);

    // --- Checklist page ---
    await page.goto(`${origin}/students/${studentId}/profile`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    if (DEBUG_MODE) await saveDebugArtifacts(page, debugDir, app.id, "checklist");
    const checklist = await extractChecklist(page);

    // --- Invoices & Fees page ---
    await page.goto(`${origin}/fees`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    if (DEBUG_MODE) await saveDebugArtifacts(page, debugDir, app.id, "invoices");
    const feeRows = await extractFeeRows(page, child);
    const feesPageLoaded = /\/fees/.test(page.url());

    if (DEBUG_MODE) {
      console.log(
        `  [debug] checklist: ${checklist.completed}/${checklist.total} complete` +
          (checklist.submittedAt ? `, application form submitted ${checklist.submittedAt}` : "")
      );
      console.log(`  [debug] fee rows found: ${JSON.stringify(feeRows, null, 2)}`);
      console.log(`  [debug] no writes performed -- OPENAPPLY_SYNC_DEBUG is on.`);
      return OUTCOME.ok;
    }
    if (!WRITES_ENABLED) {
      console.log("  Writes are switched off (WRITES_ENABLED=false) -- nothing saved.");
      return OUTCOME.ok;
    }
    await applyChecklist(app, checklist, studentId);
    await applyFees(app, feeRows, existingFees, feesPageLoaded);
    await recordOutcome(app, OUTCOME.ok, null);
    return OUTCOME.ok;
  } catch (err) {
    console.error(`  Failed on ${label}:`, err.message);
    if (DEBUG_MODE) await saveDebugArtifacts(page, debugDir, app.id, "error").catch(() => {});
    await recordOutcome(app, OUTCOME.error, String(err.message).slice(0, 300));
    return OUTCOME.error;
  }
}

// Match the child to one of the dashboard's "/students/<id>/profile" links by
// name. Returns the id only when exactly one distinct student matches.
async function findStudentId(page, child) {
  if (!child?.first_name) return null;
  const first = child.first_name.trim().toLowerCase();
  const last = (child.last_name || "").trim().toLowerCase();
  const links = await page.locator('a[href*="/students/"][href$="/profile"]').all();
  const ids = new Set();
  for (const link of links) {
    const href = (await link.getAttribute("href")) || "";
    const text = ((await link.innerText().catch(() => "")) || "").toLowerCase();
    const m = href.match(/\/students\/(\d+)\/profile/);
    if (!m || !text.includes(first)) continue;
    if (last && !text.includes(last)) continue;
    ids.add(m[1]);
  }
  return ids.size === 1 ? [...ids][0] : null;
}

async function clickNavLink(page, text) {
  const link = page.getByText(text, { exact: false }).first();
  await link.click({ timeout: 10000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
}

// The Invoices & Fees table is per-FAMILY, listing every child's fees
// together -- rows are filtered down to this child's own by the "Student
// Name" column so one child's fee never lands on a sibling's application.
// Columns confirmed 22 Sept 2026 (td[data-label="..."] is exact, not
// positional -- see CONFIG.invoices' comment on what's still unconfirmed).
async function extractFeeRows(page, child) {
  const childName = `${child?.first_name || ""} ${child?.last_name || ""}`.trim().toLowerCase();
  const rows = await page.locator(CONFIG.invoices.rowSelector).all();
  const results = [];
  for (const row of rows) {
    const studentText = (
      (await row.locator('td[data-label="Student Name"]').innerText().catch(() => "")) || ""
    )
      .trim()
      .toLowerCase();
    if (childName && studentText && !studentText.includes(childName) && !childName.includes(studentText)) continue;

    const label =
      ((await row.locator('td[data-label="Invoice"] a').first().innerText().catch(() => "")) || "").trim() || "Invoice";
    const type = ((await row.locator('td[data-label="Type"]').innerText().catch(() => "")) || "").trim();
    const amountText = (await row.locator('td[data-label="Amount Due"]').innerText().catch(() => "")) || "";
    const amount = parseFloat(amountText.replace(/[^0-9.]/g, "")) || null;
    const dueDateText =
      ((await row.locator('td[data-label="Due Date"]').innerText().catch(() => "")) || "").trim() || null;
    // The "Pay Now" link is /fees/<id> -- a stable id, unlike the filename,
    // so upserts don't create a duplicate row if the filename ever changes.
    const payHref = (await row.locator('a[href^="/fees/"]').first().getAttribute("href").catch(() => "")) || "";
    const feeId = (payHref.match(/\/fees\/(\d+)/) || [])[1] || label;
    results.push({
      label: type ? `${type} — ${label}` : label,
      amount,
      due_date_text: dueDateText,
      paid: false, // every row here comes from the Open Invoices table -- see CONFIG.invoices comment
      external_invoice_ref: `openapply-${feeId}`,
    });
  }
  return results;
}

// What the Checklist page tells us, written onto the application:
// - the application's submitted date (filled in if empty, never overwritten)
// - draft -> submitted once "Submit Application Form" is done (the ONLY
//   status move this sync makes -- never past submitted, never backwards)
// - every checklist item into application_checklist_items (addendum 65),
//   so the Applications tab can show what's done and what's still missing
// - when it last synced.
async function applyChecklist(app, checklist, studentId) {
  const submittedIso = parseOpenApplyDate(checklist.submittedAt);
  const patch = { openapply_last_synced_at: new Date().toISOString() };
  if (studentId) patch.openapply_student_id = String(studentId);
  if (submittedIso) patch.openapply_applied_at = submittedIso;
  if (submittedIso && !app.submitted_at) patch.submitted_at = submittedIso;
  const movesToSubmitted = app.status === "draft" && !!checklist.submittedAt;
  if (movesToSubmitted) patch.status = "submitted";

  const { error: updateErr } = await supabase.from("applications").update(patch).eq("id", app.id);
  if (updateErr) throw updateErr;
  console.log(`  Application updated: ${JSON.stringify(patch)}`);

  if (movesToSubmitted) {
    const { error: eventErr } = await supabase.from("application_events").insert({
      application_id: app.id,
      event_type: "status_change",
      new_status: "submitted",
      description: `Application form submitted (synced from OpenApply, ${checklist.submittedAt})`,
      source: "openapply_sync",
    });
    if (eventErr) throw eventErr;
  }

  // Checklist items -- select-then-insert/update rather than upsert: the
  // unique index behind external_ref is partial (WHERE ... IS NOT NULL),
  // which PostgREST's ON CONFLICT can't target.
  const { data: existing, error: listErr } = await supabase
    .from("application_checklist_items")
    .select("id, external_ref, status")
    .eq("application_id", app.id);
  if (listErr) throw listErr;
  const byRef = Object.fromEntries((existing || []).map((r) => [r.external_ref, r]));
  for (const item of checklist.items) {
    const row = {
      application_id: app.id,
      title: item.title,
      required: true,
      status: item.done ? "done" : "pending",
      completed_at: item.done ? parseOpenApplyDate(item.dueText) : null,
      external_ref: item.externalRef,
      source: "openapply_sync",
      updated_at: new Date().toISOString(),
    };
    const prev = byRef[item.externalRef];
    const { error } = prev
      ? await supabase.from("application_checklist_items").update(row).eq("id", prev.id)
      : await supabase.from("application_checklist_items").insert(row);
    if (error) throw error;
    if (prev && prev.status !== "done" && item.done) {
      await supabase.from("application_events").insert({
        application_id: app.id,
        event_type: "document_received",
        description: `${item.title} done on OpenApply (synced)`,
        source: "openapply_sync",
      });
    }
  }
  console.log(`  Checklist saved: ${checklist.completed}/${checklist.total} done`);
}

async function applyFees(app, feeRows, existingFees, feesPageLoaded = false) {
  const existingByRef = Object.fromEntries(existingFees.map((f) => [f.external_invoice_ref, f]));
  for (const row of feeRows) {
    const previous = existingByRef[row.external_invoice_ref];
    const nextStatus = row.paid ? "paid" : "unpaid";
    const payload = {
      application_id: app.id,
      label: row.label,
      amount: row.amount,
      due_date: parseOpenApplyDate(row.due_date_text),
      status: nextStatus,
      paid_at: row.paid ? new Date().toISOString() : null,
      source: "openapply_sync",
      external_invoice_ref: row.external_invoice_ref,
    };
    // Not .upsert(): the unique index on (application_id, external_invoice_ref)
    // is partial, which PostgREST's ON CONFLICT can't target -- that's what
    // made every earlier write fail silently.
    const { error: saveErr } = previous
      ? await supabase.from("application_fees").update(payload).eq("id", previous.id)
      : await supabase.from("application_fees").insert(payload);
    if (saveErr) throw saveErr;

    if (!previous) {
      await supabase.from("application_events").insert({
        application_id: app.id,
        event_type: "fee_invoiced",
        description: `${row.label} invoiced (synced from OpenApply)`,
        source: "openapply_sync",
      });
      console.log(`  New fee: ${row.label}`);
    } else if (previous.status !== "paid" && nextStatus === "paid") {
      await supabase.from("application_events").insert({
        application_id: app.id,
        event_type: "fee_paid",
        description: `${row.label} marked paid (synced from OpenApply)`,
        source: "openapply_sync",
      });
      console.log(`  Fee paid: ${row.label}`);
    }
  }
  await markVanishedFeesPaid(app, feeRows, existingFees, feesPageLoaded);
}

// OpenApply's "Open Invoices" table only lists what is still owed, so an
// invoice that was open on a previous run and has now vanished from it has
// been paid (or cancelled). Only inferred when the fees page genuinely loaded,
// and the event says plainly that it was inferred.
async function markVanishedFeesPaid(app, feeRows, existingFees, feesPageLoaded) {
  if (!feesPageLoaded) return;
  const stillOpen = new Set(feeRows.map((r) => r.external_invoice_ref));
  for (const fee of existingFees) {
    if (fee.source !== "openapply_sync" || fee.status !== "unpaid") continue;
    if (!fee.external_invoice_ref?.startsWith("openapply-") || stillOpen.has(fee.external_invoice_ref)) continue;
    const { error } = await supabase
      .from("application_fees")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", fee.id);
    if (error) throw error;
    await supabase.from("application_events").insert({
      application_id: app.id,
      event_type: "fee_paid",
      description: `${fee.label} no longer listed as open on OpenApply -- treated as paid (inferred)`,
      source: "openapply_sync",
    });
    console.log(`  Fee no longer open (treated as paid): ${fee.label}`);
  }
}

async function saveDebugArtifacts(page, debugDir, applicationId, tag) {
  const dir = path.join(debugDir, String(applicationId));
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${tag}.png`), fullPage: true }).catch(() => {});
  const html = await page.content().catch(() => "");
  await fs.writeFile(path.join(dir, `${tag}.html`), html).catch(() => {});
}

// Waits a moment between sign-ins so we are polite to the school portals.
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await loadSyncTargets();
  const groups = new Map();
  for (const t of targets) {
    const key = `${t.school.id}:${t.family.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  console.log(
    `Found ${targets.length} application(s) across ${groups.size} school/family sign-in(s) (debug mode: ${DEBUG_MODE}).`
  );
  if (!targets.length) return;

  const debugDir = path.join(process.cwd(), "debug-output");
  if (DEBUG_MODE) await fs.mkdir(debugDir, { recursive: true });

  const tally = {};
  const failedInARow = {}; // per school, so one broken school can't eat the whole run
  const browser = await chromium.launch({ headless: true });
  try {
    for (const group of groups.values()) {
      const schoolId = group[0].school.id;
      if ((failedInARow[schoolId] || 0) >= 5) {
        console.warn(`Skipping ${group[0].school.name}: 5 sign-ins in a row failed there.`);
        tally.skipped = (tally.skipped || 0) + group.length;
        continue;
      }
      const outcomes = await syncGroup(browser, group, debugDir);
      for (const o of outcomes) tally[o] = (tally[o] || 0) + 1;
      failedInARow[schoolId] = outcomes.every((o) => o === OUTCOME.loginFailed) ? (failedInARow[schoolId] || 0) + 1 : 0;
      await pause(1500);
    }
  } finally {
    await browser.close();
  }
  console.log(`\nDone. ${JSON.stringify(tally)}`);
  // Only a crash fails the run; a family without a portal account is normal
  // and is shown on the application, not as a red tick.
}

main().catch((err) => {
  console.error("Sync run failed:", err);
  process.exit(1);
});
