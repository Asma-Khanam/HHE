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
// SELECTORS BELOW ARE A FIRST GUESS, NOT VERIFIED AGAINST THE REAL SITE.
// I (Claude) have only seen screenshots of OpenApply's Checklist and
// Invoices & Fees pages, never its actual HTML -- and I'm not able to log
// into a family's real portal myself to check (that's credential-entry,
// which I don't do). So this ships in DEBUG_MODE by default: it logs in,
// takes a full-page screenshot and saves the page's HTML for the Checklist
// and Invoices & Fees pages into ./debug-output/, and does NOT write
// anything to Supabase. Run it once in debug mode, download the screenshots
// from the GitHub Actions run (see the workflow file), send them to me, and
// I'll fill in the real selectors below from what they actually look like.
// Flip DEBUG_MODE off (see README) once that's done.
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
    // Guesses -- OpenApply's login form field names vary by deployment.
    emailSelector: 'input[type="email"], input[name="email"], input#email',
    passwordSelector: 'input[type="password"], input[name="password"], input#password',
    submitSelector: 'button[type="submit"], input[type="submit"]',
    // Something on the page that only appears once logged in -- used to
    // confirm login succeeded rather than assuming it did.
    loggedInIndicator: 'text=Checklist',
  },
  checklist: {
    // Text link/tab that opens the Checklist page from wherever login lands.
    navLinkText: "Checklist",
    // A row selector for each checklist item -- guessed as a table row.
    itemRowSelector: "table tr",
  },
  invoices: {
    navLinkText: "Invoices",
    rowSelector: "table tr",
  },
  // Best-effort mapping from whatever status text OpenApply shows to our
  // own applications.status values (must be one of the values in
  // founders/src/lib/workflow.js APPLICATION_STATUSES). Matching is
  // case-insensitive substring match, checked in order -- put more specific
  // phrases first. UNVERIFIED against real OpenApply wording.
  statusTextMap: [
    { match: "offer", status: "offer" },
    { match: "accepted", status: "offer" },
    { match: "reject", status: "rejected" },
    { match: "declined", status: "rejected" },
    { match: "withdraw", status: "withdrawn" },
    { match: "under review", status: "under_review" },
    { match: "assessment", status: "under_review" },
    { match: "reference", status: "reference_requested" },
    { match: "document", status: "documents_pending" },
    { match: "submitted", status: "submitted" },
    { match: "complete", status: "submitted" },
  ],
};

function mapStatusText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const rule of CONFIG.statusTextMap) {
    if (lower.includes(rule.match)) return rule.status;
  }
  return null;
}

// ----------------------------------------------------------------------------
// Data to sync: every application at an OpenApply-tagged school, for a
// family that has a stored application login. Joined client-side, same
// style as the rest of this codebase (see staffData.js's own comment on
// why: small row counts, each query stays obvious about what it needs).
// ----------------------------------------------------------------------------
const ALIAS_DOMAIN = "applications.heatherharries.com";

async function loadSyncTargets() {
  const { data: schools, error: schoolsErr } = await supabase
    .from("schools")
    .select("id, name, openapply_login_url, application_platform")
    .eq("application_platform", "openapply")
    .not("openapply_login_url", "is", null);
  if (schoolsErr) throw schoolsErr;
  if (!schools.length) return [];
  const schoolById = Object.fromEntries(schools.map((s) => [s.id, s]));

  let appsQuery = supabase
    .from("applications")
    .select("id, child_id, school_id, status")
    .in("school_id", schools.map((s) => s.id));
  if (DEBUG_ONLY_APPLICATION_ID) appsQuery = appsQuery.eq("id", DEBUG_ONLY_APPLICATION_ID);
  const { data: applications, error: appsErr } = await appsQuery;
  if (appsErr) throw appsErr;
  if (!applications.length) return [];

  const { data: children, error: childrenErr } = await supabase
    .from("children")
    .select("id, family_id")
    .in("id", applications.map((a) => a.child_id));
  if (childrenErr) throw childrenErr;
  const familyIdByChild = Object.fromEntries(children.map((c) => [c.id, c.family_id]));

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
      application_alias: login ? `${login.application_alias}@${ALIAS_DOMAIN}` : null,
      application_password: login ? login.application_password : null,
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
      return { app, family, school, existingFees: feesByApplication[app.id] || [] };
    })
    .filter((t) => t.family?.application_alias && t.family?.application_password && t.school?.openapply_login_url);
}

// ----------------------------------------------------------------------------
// One application's sync: log in, read both pages, diff, write.
// ----------------------------------------------------------------------------
async function syncOne(browser, target, debugDir) {
  const { app, family, school, existingFees } = target;
  const label = `${school.name} / application ${app.id}`;
  console.log(`\n--- ${label} ---`);

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    // openapply_login_url (addendum 62) -- the portal dashboard, not the
    // public "apply now" link. Navigating here while logged out is expected
    // to redirect to OpenApply's own login form; that's fine, the fields
    // below are filled in on whatever page actually has them.
    await page.goto(school.openapply_login_url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.fill(CONFIG.login.emailSelector, family.application_alias);
    await page.fill(CONFIG.login.passwordSelector, family.application_password);
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {}),
      page.click(CONFIG.login.submitSelector),
    ]);

    const loggedIn = await page
      .locator(CONFIG.login.loggedInIndicator)
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    if (!loggedIn) {
      console.warn(`  Could not confirm login succeeded for ${label} -- skipping.`);
      if (DEBUG_MODE) await saveDebugArtifacts(page, debugDir, app.id, "login-uncertain");
      return false; // caller stops the whole run: never retry logins (account lockout risk)
    }

    // --- Checklist page: overall status ---
    await clickNavLink(page, CONFIG.checklist.navLinkText);
    if (DEBUG_MODE) await saveDebugArtifacts(page, debugDir, app.id, "checklist");
    const checklistText = await page.locator("body").innerText();
    const mappedStatus = mapStatusText(checklistText);

    // --- Invoices & Fees page ---
    await clickNavLink(page, CONFIG.invoices.navLinkText);
    if (DEBUG_MODE) await saveDebugArtifacts(page, debugDir, app.id, "invoices");
    const feeRows = await extractFeeRows(page);

    if (DEBUG_MODE) {
      console.log(`  [debug] mapped status: ${mappedStatus || "(no match)"}`);
      console.log(`  [debug] fee rows found: ${JSON.stringify(feeRows, null, 2)}`);
      console.log(`  [debug] no writes performed -- OPENAPPLY_SYNC_DEBUG is on.`);
      return;
    }

    await applyStatus(app, mappedStatus);
    await applyFees(app, feeRows, existingFees);
  } catch (err) {
    console.error(`  Failed on ${label}:`, err.message);
    if (DEBUG_MODE) await saveDebugArtifacts(page, debugDir, app.id, "error").catch(() => {});
  } finally {
    await context.close();
  }
}

async function clickNavLink(page, text) {
  const link = page.getByText(text, { exact: false }).first();
  await link.click({ timeout: 10000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
}

// Guessed extraction: every table row with at least 2 cells is treated as
// "label | amount | [due date] | [status]". UNVERIFIED -- this is exactly
// what a debug run's saved HTML lets us replace with something exact.
async function extractFeeRows(page) {
  const rows = await page.locator(CONFIG.invoices.rowSelector).all();
  const results = [];
  for (const row of rows) {
    const cells = await row.locator("td, th").allInnerTexts();
    if (cells.length < 2) continue;
    const [label, amountText, dueDateText, statusText] = cells;
    if (!label || /^(item|invoice|description|fee)$/i.test(label.trim())) continue; // skip header row
    const amount = parseFloat((amountText || "").replace(/[^0-9.]/g, "")) || null;
    results.push({
      label: label.trim(),
      amount,
      due_date_text: (dueDateText || "").trim() || null,
      paid: /paid/i.test(statusText || ""),
      external_invoice_ref: label.trim(), // placeholder ref until we see real invoice numbers
    });
  }
  return results;
}

async function applyStatus(app, mappedStatus) {
  if (!mappedStatus || mappedStatus === app.status) return;
  const { error: updateErr } = await supabase
    .from("applications")
    .update({ status: mappedStatus })
    .eq("id", app.id);
  if (updateErr) throw updateErr;
  const { error: eventErr } = await supabase.from("application_events").insert({
    application_id: app.id,
    event_type: "status_change",
    new_status: mappedStatus,
    description: `Status changed to ${mappedStatus} (synced from OpenApply)`,
    source: "openapply_sync",
  });
  if (eventErr) throw eventErr;
  console.log(`  Status: ${app.status} -> ${mappedStatus}`);
}

async function applyFees(app, feeRows, existingFees) {
  const existingByRef = Object.fromEntries(existingFees.map((f) => [f.external_invoice_ref, f]));
  for (const row of feeRows) {
    const previous = existingByRef[row.external_invoice_ref];
    const nextStatus = row.paid ? "paid" : "unpaid";
    const payload = {
      application_id: app.id,
      label: row.label,
      amount: row.amount,
      due_date: null, // due_date_text isn't parsed to a real date yet -- needs a real sample to know the format
      status: nextStatus,
      paid_at: row.paid ? new Date().toISOString() : null,
      source: "openapply_sync",
      external_invoice_ref: row.external_invoice_ref,
    };
    const { data: saved, error: upsertErr } = await supabase
      .from("application_fees")
      .upsert(payload, { onConflict: "application_id,external_invoice_ref" })
      .select()
      .single();
    if (upsertErr) throw upsertErr;

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
    void saved;
  }
}

async function saveDebugArtifacts(page, debugDir, applicationId, tag) {
  const dir = path.join(debugDir, String(applicationId));
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${tag}.png`), fullPage: true }).catch(() => {});
  const html = await page.content().catch(() => "");
  await fs.writeFile(path.join(dir, `${tag}.html`), html).catch(() => {});
}

async function main() {
  const targets = await loadSyncTargets();
  console.log(`Found ${targets.length} application(s) to sync (debug mode: ${DEBUG_MODE}).`);
  if (!targets.length) return;

  const debugDir = path.join(process.cwd(), "debug-output");
  if (DEBUG_MODE) await fs.mkdir(debugDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    for (const target of targets) {
      const ok = await syncOne(browser, target, debugDir);
      if (ok === false) {
        console.error("Login failed -- stopping the run so no further login attempts are made.");
        break;
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Sync run failed:", err);
  process.exit(1);
});
