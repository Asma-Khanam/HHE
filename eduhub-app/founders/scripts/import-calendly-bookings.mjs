// One-off: imports the bookings that already exist in Calendly (made before the
// webhook was registered) into the Consultations page. Safe to run again: a
// booking that is already imported is only updated, never duplicated.
//
//   CALENDLY_TOKEN=<personal access token> \
//   CALENDLY_WEBHOOK_SIGNING_KEY=<same value as in Vercel> \
//   node scripts/import-calendly-bookings.mjs --dry      (just lists what it finds)
//   node scripts/import-calendly-bookings.mjs            (imports them)
//
// Options: --since=2025-01-01   (default: 12 months ago)
// Each booking is sent to /api/calendly-webhook, signed like Calendly signs it,
// marked "backfill" so old bookings never change a family's stage. Cancelled
// bookings are skipped. Nothing is ever written to Calendly.

import crypto from "crypto";

const TOKEN = process.env.CALENDLY_TOKEN;
const KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
const URL_ = process.env.WEBHOOK_URL || "https://hhe-founders.vercel.app/api/calendly-webhook";
const DRY = process.argv.includes("--dry");
// Only relocation bookings (same rule as the webhook). Teacher and Intern
// Interviews are recruitment and are never imported.
const RELOCATION_EVENT = /consult|sanity|meeting with heather/i;
const sinceArg = process.argv.find((a) => a.startsWith("--since="));
const since = sinceArg ? new Date(sinceArg.split("=")[1]) : new Date(Date.now() - 365 * 24 * 3600 * 1000);

if (!TOKEN || (!DRY && !KEY)) {
  console.error("Set CALENDLY_TOKEN (and CALENDLY_WEBHOOK_SIGNING_KEY unless --dry) first.");
  process.exit(1);
}

async function api(pathOrUrl) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `https://api.calendly.com${pathOrUrl}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const t = await r.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch { j = { raw: t }; }
  if (r.status === 429) {
    await new Promise((res) => setTimeout(res, 3000));
    return api(pathOrUrl);
  }
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j)}`);
  return j;
}

async function all(path) {
  const out = [];
  let next = path;
  while (next) {
    const j = await api(next);
    out.push(...(j.collection || []));
    next = j.pagination?.next_page || null;
  }
  return out;
}

async function send(event, payload) {
  const raw = JSON.stringify({ event, payload });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", KEY).update(`${t}.${raw}`).digest("hex");
  const res = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Calendly-Webhook-Signature": `t=${t},v1=${sig}` },
    body: raw,
  });
  return `${res.status} ${await res.text()}`;
}

const me = (await api("/users/me")).resource;
console.log("Calendly:", me.name, "| importing events since", since.toISOString().slice(0, 10), DRY ? "(dry run)" : "");

const events = await all(
  `/scheduled_events?organization=${encodeURIComponent(me.current_organization)}&min_start_time=${encodeURIComponent(since.toISOString())}&count=100&sort=start_time:asc`
);
console.log(`Found ${events.length} events.`);

let imported = 0;
let skipped = 0;
let skippedOther = 0;
for (const ev of events) {
  const invitees = await all(`${ev.uri.replace("https://api.calendly.com", "")}/invitees?count=100`);
  for (const inv of invitees) {
    if (!RELOCATION_EVENT.test(ev.name || "")) {
      skippedOther++;
      continue;
    }
    const when = new Date(ev.start_time).toLocaleString("en-GB", { timeZone: "Asia/Dubai" });
    if (ev.status === "canceled" || inv.status === "canceled") {
      skipped++;
      continue;
    }
    const line = `${when} | ${ev.name} | ${inv.name} <${inv.email}>${inv.payment ? ` | paid ${inv.payment.amount} ${inv.payment.currency}` : ""}`;
    if (DRY) {
      console.log(line);
      imported++;
      continue;
    }
    const payload = {
      uri: inv.uri,
      email: inv.email,
      name: inv.name,
      text_reminder_number: inv.text_reminder_number || null,
      questions_and_answers: inv.questions_and_answers || [],
      payment: inv.payment || null,
      backfill: true,
      scheduled_event: {
        name: ev.name,
        start_time: ev.start_time,
        end_time: ev.end_time,
        location: { type: ev.location?.type, join_url: ev.location?.join_url || null },
        event_memberships: (ev.event_memberships || []).map((m) => ({ user_name: m.user_name })),
      },
    };
    console.log(line, "->", await send("invitee.created", payload));
    imported++;
    await new Promise((res) => setTimeout(res, 250));
  }
}
console.log(`${DRY ? "Would import" : "Imported"} ${imported}; skipped ${skipped} cancelled and ${skippedOther} non-relocation (interviews etc.).`);
