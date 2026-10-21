#!/usr/bin/env node
// Backfill the Emails tab from the Titan mailbox (relocate@heatherharries.com).
//
// Why: some emails reached Titan but never showed on a family's Emails tab
// (sent to a generic address, sent by hand from Titan, replies that arrived
// before thread-matching existed, one too big for Vercel...). Titan has all of
// them, sent and received. This reads Titan over IMAP and files each one.
//
// It is SAFE BY DEFAULT: with no flags it only reads and prints a report (and
// writes a CSV). Nothing is written to Supabase until you add --commit.
//
//   cd eduhub-app/founders
//   npm install                       (first time only: adds imapflow + mailparser)
//   export SUPABASE_URL=...           (same as the Vercel value)
//   export SUPABASE_SERVICE_ROLE_KEY=...
//   export TITAN_EMAIL=relocate@heatherharries.com
//   export TITAN_PASSWORD=...         (type it yourself; it is never stored)
//   node scripts/backfill-titan-emails.mjs --since 2026-10-12            # report only
//   node scripts/backfill-titan-emails.mjs --since 2026-10-12 --commit   # actually file them
//
// Flags:
//   --since YYYY-MM-DD   how far back to read Titan (default 2026-10-12)
//   --commit             write to Supabase (otherwise a dry run)
//   --keep-unmatched     also keep emails that match no family in "Untracked emails"
//                        (off by default so newsletters etc. don't flood that list)
//   --folders a,b        mailbox names to read (default: Inbox and Sent, found automatically)
//
// How an email is matched to a family, in this order:
//   1. an application address (current or old) anywhere in From/To/Cc/Reply-To/Delivered-To
//   2. the thread: In-Reply-To / References point at an email already on a family's tab
//      (or one filed earlier in this same run, so whole chains follow each other)
//   3. the family's surname in the subject ("Goodburn Family"), only when one family has it
//      (switch off with --no-name-match). These show as "by family name in subject" so you can check them.
//   4. otherwise: no match (reported; kept only with --keep-unmatched)
// Spam, Archive and Trash are read too (after addendum 127) and kept as separate folders on the site.
// Already-filed emails are skipped (same Message-ID, or same family + sender + subject
// within 10 minutes), so running this twice never duplicates anything.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import fs from "node:fs";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};
const COMMIT = has("--commit");
const KEEP_UNMATCHED = has("--keep-unmatched");
const SINCE = new Date(`${val("--since", "2026-10-12")}T00:00:00Z`);
const SB = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TITAN_USER = process.env.TITAN_EMAIL || "relocate@heatherharries.com";
const TITAN_PASS = process.env.TITAN_PASSWORD;
const ALIAS_DOMAIN = "applications.heatherharries.com";
const OWN_DOMAIN = /@(applications\.)?heatherharries\.com$/i;
const MAX_FILE = 12_000_000;
const MAX_INLINE = 300_000;

if (Number.isNaN(SINCE.getTime())) die("--since must look like 2026-10-12");
if (!SB || !KEY) die("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see the top of this file).");
if (!TITAN_PASS) die("Set TITAN_PASSWORD first (type it in your own terminal).");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const hdrs = (extra = {}) => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, ...extra });

async function sbGetAll(path) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${SB}/rest/v1/${path}${path.includes("?") ? "&" : "?"}limit=1000&offset=${off}`, { headers: hdrs() });
    if (!r.ok) throw Object.assign(new Error(`${path.split("?")[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`), { status: r.status });
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

async function sbInsert(table, row) {
  const r = await fetch(`${SB}/rest/v1/${table}`, {
    method: "POST",
    headers: hdrs({ "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`${table} insert failed: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return (await r.json())[0];
}

async function sbPatch(table, id, patch) {
  const r = await fetch(`${SB}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: hdrs({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`${table} patch failed: ${r.status}`);
}

const plain = (id) => String(id || "").replace(/[<>\s]/g, "").toLowerCase();
const safeName = (n) => String(n || "attachment").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
const normSubject = (s) => String(s || "").replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, "").replace(/\s+/g, " ").trim().toLowerCase();
const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const ist = (d) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().replace("T", " ").slice(0, 16);

// ---------------------------------------------------------------- what Supabase already has
console.log("Reading Supabase...");
const families = await sbGetAll("families?select=id,application_alias");
const parents = await sbGetAll("parents?select=family_id,full_name,application_alias,previous_aliases");
const aliasToFamily = new Map();
const names = new Map();
for (const f of families) if (f.application_alias) aliasToFamily.set(f.application_alias.toLowerCase(), f.id);
for (const p of parents) {
  if (p.application_alias) aliasToFamily.set(p.application_alias.toLowerCase(), p.family_id);
  for (const a of p.previous_aliases || []) aliasToFamily.set(String(a).toLowerCase(), p.family_id);
  names.set(p.family_id, [...(names.get(p.family_id) || []), (p.full_name || "").trim()].filter(Boolean));
}
const famName = (id) => (names.get(id) || []).join(" & ") || id.slice(0, 8);

// Surname -> family, for emails that name the family in the subject ("Goodburn Family",
// "Re: Teddy Goodburn Enquiry"). Only used when ONE family has that surname.
const surnameTo = new Map();
const STOP = new Set(["heather", "harries", "relocate", "relocation", "education", "family", "school", "admissions", "dubai", "north"]);
for (const p of parents) {
  const w = String(p.full_name || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z\s'-]/g, " ").trim().split(/\s+/).filter(Boolean);
  const sn = w[w.length - 1];
  if (!sn || sn.length < 4 || STOP.has(sn)) continue;
  if (!surnameTo.has(sn)) surnameTo.set(sn, new Set());
  surnameTo.get(sn).add(p.family_id);
}

// Titan folders (Spam, Archive, Trash) are mirrored once addendum 127 has been run.
let FOLDERS_ON = true;
try {
  await sbGetAll("case_notes?select=mailbox_folder&limit=1");
  await sbGetAll("unmatched_emails?select=mailbox_folder&limit=1");
} catch {
  FOLDERS_ON = false;
  console.warn("Note: addendum 127 not run yet, so Spam/Archive/Trash are skipped. Only Inbox and Sent are read.");
}

const lookback = new Date(SINCE.getTime() - 60 * 86400_000).toISOString();
const notes = await sbGetAll(
  `case_notes?select=id,family_id,direction,subject,email_from,occurred_at,email_message_id${FOLDERS_ON ? ",mailbox_folder" : ""}&kind=eq.email&occurred_at=gte.${lookback}`
);
let unmatchedRows = [];
let haveUnmatchedTable = true;
try {
  unmatchedRows = await sbGetAll(`unmatched_emails?select=id,email_message_id,subject,email_from,received_at${FOLDERS_ON ? ",mailbox_folder" : ""}&received_at=gte.${lookback}`);
} catch (e) {
  haveUnmatchedTable = false;
  console.warn("Note: unmatched_emails table not found (addendum 124 not run). Unmatched emails will only be reported.");
}

const idToFamilies = new Map(); // plain message id -> Set(family)
const have = new Set(); // `${family}|${plainId}`
const recent = []; // fallback dedupe: {family, subj, from, t}
const addId = (id, fam) => {
  const p = plain(id);
  if (!p) return;
  if (!idToFamilies.has(p)) idToFamilies.set(p, new Set());
  idToFamilies.get(p).add(fam);
  have.add(`${fam}|${p}`);
};
for (const n of notes) {
  addId(n.email_message_id, n.family_id);
  recent.push({ family: n.family_id, subj: normSubject(n.subject), from: String(n.email_from || "").toLowerCase(), t: new Date(n.occurred_at).getTime() });
}
// Existing rows by message id, so a move in Titan (to Spam, Archive, Trash or back) shows on the site.
const existingByMsg = new Map(); // plain id -> [{ table, id, folder }]
const trackExisting = (table, rows) => {
  for (const r of rows) {
    const k = plain(r.email_message_id);
    if (!k) continue;
    if (!existingByMsg.has(k)) existingByMsg.set(k, []);
    existingByMsg.get(k).push({ table, id: r.id, folder: r.mailbox_folder || "inbox" });
  }
};
trackExisting("case_notes", notes);
trackExisting("unmatched_emails", unmatchedRows);
const haveUnmatched = new Set(unmatchedRows.map((u) => plain(u.email_message_id)).filter(Boolean));

// ---------------------------------------------------------------- read Titan
console.log(`Connecting to Titan as ${TITAN_USER}...`);
const client = new ImapFlow({ host: "imap.titan.email", port: 993, secure: true, auth: { user: TITAN_USER, pass: TITAN_PASS }, logger: false });
client.on("error", () => {});
await client.connect().catch((e) => die(`Couldn't sign in to Titan: ${e.message}. (If Titan uses two-step login, make an app password.)`));

const boxes = await client.list();
const wanted = val("--folders", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const chosen = [];
for (const b of boxes) {
  const isInbox = b.path.toUpperCase() === "INBOX";
  const isSent = b.specialUse === "\\Sent" || /^sent( items| mail)?$/i.test(b.path);
  const isSpam = b.specialUse === "\\Junk" || /^(spam|junk)( e-?mail)?$/i.test(b.path);
  const isArchive = b.specialUse === "\\Archive" || /^archive[sd]?$/i.test(b.path);
  const isTrash = b.specialUse === "\\Trash" || /^(trash|deleted( items| messages)?|bin)$/i.test(b.path);
  const mbox = isSpam ? "spam" : isArchive ? "archive" : isTrash ? "trash" : "inbox";
  const normal = isInbox || isSent;
  const extra = FOLDERS_ON && (isSpam || isArchive || isTrash);
  if (wanted.length ? wanted.some((w) => w.toLowerCase() === b.path.toLowerCase()) : normal || extra) chosen.push({ path: b.path, sent: isSent, mbox: isSent ? "inbox" : mbox });
}
if (!chosen.length) die(`Couldn't find Inbox/Sent. Folders on Titan: ${boxes.map((b) => b.path).join(", ")}. Use --folders "Name1,Name2".`);
console.log(`Reading: ${chosen.map((c) => c.path).join(", ")} since ${SINCE.toISOString().slice(0, 10)}`);

const items = [];
for (const box of chosen) {
  const lock = await client.getMailboxLock(box.path);
  try {
    const uids = await client.search({ since: SINCE }, { uid: true });
    console.log(`  ${box.path}: ${uids.length} emails`);
    if (!uids.length) continue;
    for await (const m of client.fetch(uids.join(","), { source: true, internalDate: true }, { uid: true })) {
      try {
        const parsed = await simpleParser(m.source);
        items.push({ folder: box.path, mbox: box.mbox, sent: box.sent, parsed, date: parsed.date || m.internalDate || new Date() });
      } catch {
        /* unreadable message: skip */
      }
    }
  } finally {
    lock.release();
  }
}
await client.logout().catch(() => {});
items.sort((a, b) => a.date - b.date);

// ---------------------------------------------------------------- match + file
const ADDR_HEADERS = new Set(["from", "to", "cc", "bcc", "reply-to", "delivered-to", "x-original-to", "envelope-to", "x-forwarded-to"]);
const addrList = (v) => (v?.value || []).map((a) => (a.address ? (a.name ? `${a.name} <${a.address}>` : a.address) : "")).filter(Boolean).join(", ");

function aliasFamilies(parsed) {
  const text = (parsed.headerLines || []).filter((l) => ADDR_HEADERS.has(l.key)).map((l) => l.line).join("\n");
  const found = new Set();
  for (const m of text.matchAll(/([a-z0-9._+-]+)@applications\.heatherharries\.com/gi)) {
    const a = m[1].toLowerCase();
    if (a.startsWith("any-alias")) continue; // the send-as login, not a family
    const fam = aliasToFamily.get(a);
    if (fam) found.add(fam);
  }
  return found;
}

function threadFamilies(parsed) {
  const ids = [parsed.inReplyTo, ...(Array.isArray(parsed.references) ? parsed.references : [parsed.references])].filter(Boolean);
  const found = new Set();
  for (const id of ids) for (const f of idToFamilies.get(plain(id)) || []) found.add(f);
  return found;
}

function nameFamilies(parsed) {
  const words = String(parsed.subject || "").toLowerCase().replace(/['\u2019]s\b/g, "").replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter(Boolean);
  const found = new Set();
  for (const w of words) {
    const set = surnameTo.get(w);
    if (set && set.size === 1) found.add([...set][0]);
  }
  return found;
}

async function saveAttachments(parsed, folderPrefix, html) {
  const saved = [];
  let outHtml = html;
  const atts = parsed.attachments || [];
  for (const a of atts) {
    const name = safeName(a.filename || (a.related ? "image" : "attachment"));
    const inline = !!(a.related && a.cid);
    const cid = String(a.cid || "").replace(/[<>]/g, "");
    const entry = { name, type: a.contentType || null, size: a.size || a.content?.length || 0, path: null, inline, cid: cid || null };
    if (inline && outHtml && a.content.length <= MAX_INLINE) {
      outHtml = outHtml.split(`cid:${cid}`).join(`data:${a.contentType || "image/png"};base64,${a.content.toString("base64")}`);
      continue;
    }
    if (a.content.length > MAX_FILE) {
      entry.error = "too large to copy over";
      saved.push(entry);
      continue;
    }
    if (COMMIT) {
      try {
        const path = `${folderPrefix}/${saved.length + 1}-${name}`;
        const up = await fetch(`${SB}/storage/v1/object/email-attachments/${path.split("/").map(encodeURIComponent).join("/")}`, {
          method: "POST",
          headers: hdrs({ "Content-Type": a.contentType || "application/octet-stream", "x-upsert": "true" }),
          body: a.content,
        });
        if (up.ok) entry.path = path;
        else entry.error = `upload failed (${up.status})`;
      } catch {
        entry.error = "upload error";
      }
    }
    saved.push(entry);
  }
  return { saved, html: outHtml };
}

// A move in Titan: update the folder of rows the site already has.
let nMoved = 0;
if (FOLDERS_ON) {
  for (const it of items) {
    const k = plain(it.parsed.messageId);
    for (const ex of existingByMsg.get(k) || []) {
      if (ex.folder === it.mbox) continue;
      if (COMMIT) {
        try {
          await sbPatch(ex.table, ex.id, { mailbox_folder: it.mbox });
        } catch {
          continue;
        }
      }
      ex.folder = it.mbox;
      nMoved++;
    }
  }
}

const report = [];
let nFiled = 0, nSkipped = 0, nUnmatched = 0, nKept = 0, nErr = 0;

for (const it of items) {
  const p = it.parsed;
  const fromAddr = (p.from?.value?.[0]?.address || "").toLowerCase();
  const outbound = it.sent || OWN_DOMAIN.test(fromAddr);
  const direction = outbound ? "outbound" : "inbound";
  const msgId = p.messageId || null;
  const subject = p.subject || "(no subject)";
  const row = { date: ist(it.date), folder: it.folder, direction, from: fromAddr, to: addrList(p.to).slice(0, 120), subject: subject.slice(0, 90), result: "", family: "" };

  let fams = aliasFamilies(p);
  let how = "address";
  if (!fams.size) {
    fams = threadFamilies(p);
    how = "thread";
  }
  if (!fams.size && !has("--no-name-match")) {
    fams = nameFamilies(p);
    how = "family name in subject";
  }

  if (!fams.size) {
    nUnmatched++;
    row.result = "NO MATCH";
    if (KEEP_UNMATCHED && haveUnmatchedTable && !(msgId && haveUnmatched.has(plain(msgId)))) {
      if (COMMIT) {
        try {
          const u = await sbInsert("unmatched_emails", {
            received_at: it.date.toISOString(),
            alias: null,
            email_from: fromAddr,
            email_from_name: p.from?.value?.[0]?.name || null,
            email_to: addrList(p.to),
            email_cc: addrList(p.cc) || null,
            subject,
            email_text: p.text || "",
            email_html: p.html || null,
            email_message_id: msgId ? String(msgId).slice(0, 500) : null,
            in_reply_to: p.inReplyTo ? String(p.inReplyTo).slice(0, 1000) : null,
            ...(FOLDERS_ON ? { mailbox_folder: it.mbox, read_at: it.mbox === "inbox" ? null : new Date().toISOString() } : {}),
          });
          const { saved } = await saveAttachments(p, `unmatched/${u.id}`, null);
          if (saved.length) await sbPatch("unmatched_emails", u.id, { email_attachments: saved, attachment_count: saved.length });
          row.result = "NO MATCH: kept in Untracked emails";
          nKept++;
        } catch (e) {
          row.result = `ERROR keeping it: ${e.message}`;
          nErr++;
        }
      } else row.result = "NO MATCH: would keep in Untracked emails";
      if (msgId) haveUnmatched.add(plain(msgId));
    }
    report.push(row);
    continue;
  }

  const labels = [];
  let didSomething = false;
  for (const fam of fams) {
    const label = famName(fam);
    const t = it.date.getTime();
    const dupId = msgId && have.has(`${fam}|${plain(msgId)}`);
    const dupFuzzy = recent.some((r) => r.family === fam && r.subj === normSubject(subject) && r.from === fromAddr && Math.abs(r.t - t) < 10 * 60_000);
    if (dupId || dupFuzzy) {
      labels.push(`${label} (already there)`);
      continue;
    }
    didSomething = true;
    const snippet = (p.text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    const base = {
      family_id: fam,
      kind: "email",
      direction,
      subject,
      body: outbound ? p.text || snippet || "(no text)" : `${snippet || "(no preview available)"}\n\nFrom: ${fromAddr || "(unknown sender)"}`,
      occurred_at: it.date.toISOString(),
      email_from: addrList(p.from) || fromAddr,
      email_from_name: p.from?.value?.[0]?.name || null,
      email_to: addrList(p.to),
      email_cc: addrList(p.cc) || null,
      email_text: p.text || "",
      email_message_id: msgId ? String(msgId).slice(0, 500) : null,
      ...(FOLDERS_ON ? { mailbox_folder: it.mbox } : {}),
      // Mail pulled in from Spam, Archive or Trash, and our own sent mail, is not "new".
      ...(FOLDERS_ON && (it.mbox !== "inbox" || outbound) ? { read_at: new Date().toISOString() } : {}),
    };
    if (COMMIT) {
      try {
        const note = await sbInsert("case_notes", { ...base, email_html: p.html || null });
        const { saved, html } = await saveAttachments(p, `${fam}/${note.id}`, p.html || null);
        const patch = {};
        if (saved.length) patch.email_attachments = saved;
        if (html && html !== p.html) patch.email_html = html;
        if (Object.keys(patch).length) await sbPatch("case_notes", note.id, patch);
        labels.push(`${label} (FILED, by ${how})`);
        nFiled++;
      } catch (e) {
        labels.push(`${label} (ERROR: ${e.message})`);
        nErr++;
        continue;
      }
    } else {
      labels.push(`${label} (would file, by ${how})`);
      nFiled++;
    }
    // so later emails in the same thread follow it, even in a dry run
    addId(msgId, fam);
    recent.push({ family: fam, subj: normSubject(subject), from: fromAddr, t });
  }
  if (!didSomething) nSkipped++;
  row.result = labels.join("; ");
  row.family = [...fams].map(famName).join(" | ");
  report.push(row);
}

// ---------------------------------------------------------------- report
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const file = `titan-backfill-report-${stamp}.csv`;
fs.writeFileSync(
  file,
  ["date (IST),folder,direction,from,to,subject,result", ...report.map((r) => [r.date, r.folder, r.direction, r.from, r.to, r.subject, r.result].map(csv).join(","))].join("\n")
);
for (const r of report) console.log(`${r.date} ${r.direction.padEnd(8)} ${r.from.slice(0, 32).padEnd(32)} ${r.subject.slice(0, 50).padEnd(50)} -> ${r.result}`);
console.log(
  `\n${COMMIT ? "DONE" : "DRY RUN (nothing written)"}: ${items.length} Titan emails read. ` +
    `${COMMIT ? "Filed" : "Would file"} ${nFiled}, already on the site ${nSkipped}, no family match ${nUnmatched}` +
    `${KEEP_UNMATCHED ? ` (${COMMIT ? "kept" : "would keep"} ${COMMIT ? nKept : nUnmatched})` : ""}, moved between folders ${nMoved}, errors ${nErr}.`
);
console.log(`Report saved: ${file}`);
if (!COMMIT) console.log("Happy with it? Run again with --commit to file them.");
