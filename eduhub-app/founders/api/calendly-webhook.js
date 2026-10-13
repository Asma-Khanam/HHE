import crypto from "crypto";

// Vercel serverless function -- receives Calendly's webhook when a family books
// or cancels a call, finds the family by the booker's email, and saves the
// booking on that family's Meetings tab (case_notes kind "meeting").
// Tables: calendly_bookings, calendly_webhook_log (addendum 105).
//
// SETUP:
//   1. Run addendum 105 in Supabase.
//   2. In the hhe-founders Vercel project add CALENDLY_WEBHOOK_SIGNING_KEY (any
//      long random string you choose) and redeploy.
//   3. Register the webhook once with scripts/register-calendly-webhook.mjs
//      (uses the Calendly personal access token; passes the same signing key).
//
// Calendly signs the exact raw body: header "Calendly-Webhook-Signature" is
// "t=<unix time>,v1=<hex hmac sha256 of `${t}.${rawBody}`>". Never logs a body.

export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString("utf8");
}

const SB = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const hmac = (secret, text) => crypto.createHmac("sha256", secret).update(text).digest("hex");

async function sb(path, init = {}) {
  const res = await fetch(`${SB()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY(),
      Authorization: `Bearer ${KEY()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Supabase ${res.status}`);
  return data;
}

async function record(event, email, outcome, detail) {
  try {
    await sb("calendly_webhook_log", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        event: event || null,
        invitee_email: email || null,
        outcome,
        detail: detail ? String(detail).slice(0, 300) : null,
      }),
    });
  } catch {
    /* logging is best effort; never breaks the webhook */
  }
}

function validSignature(header, raw, key) {
  const parts = Object.fromEntries(
    String(header || "")
      .split(",")
      .map((p) => p.trim().split("="))
      .filter((p) => p.length === 2)
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  // Reject anything older than 5 minutes so a captured request can't be replayed.
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = hmac(key, `${t}.${raw}`);
  return v1.length === expected.length && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}

const enc = (s) => encodeURIComponent(s);

// parents.email first (case-insensitive). Returns the family id, or null.
async function findFamilyId(email) {
  if (!email) return null;
  const rows = await sb(`parents?email=ilike.${enc(email.trim())}&select=family_id&limit=2`);
  const ids = [...new Set((rows || []).map((r) => r.family_id))];
  return ids.length === 1 ? ids[0] : null; // two different families on one email = don't guess
}

function fmt(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) + " (Dubai time)";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!key) return res.status(500).json({ error: "CALENDLY_WEBHOOK_SIGNING_KEY is not set." });

  let raw = "";
  try {
    raw = await readRaw(req);
  } catch {
    raw = "";
  }
  if (!raw && req.body) raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

  if (!validSignature(req.headers["calendly-webhook-signature"], raw, key)) {
    await record(null, null, "bad_signature", null);
    return res.status(401).json({ error: "Bad signature" });
  }

  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    await record(null, null, "bad_json", null);
    return res.status(400).json({ error: "Bad JSON" });
  }

  const event = body.event;
  const p = body.payload || {};
  const email = (p.email || "").trim().toLowerCase();

  try {
    if (event !== "invitee.created" && event !== "invitee.canceled") {
      await record(event, email, "ignored_event", null);
      return res.status(200).json({ ignored: event || "unknown" });
    }
    const inviteeUri = p.uri;
    if (!inviteeUri) {
      await record(event, email, "no_invitee_uri", null);
      return res.status(200).json({ ignored: "no invitee uri" });
    }

    const ev = p.scheduled_event || {};
    const eventName = ev.name || "Calendly call";
    const start = ev.start_time || null;
    const end = ev.end_time || null;
    const host = (ev.event_memberships || [])[0]?.user_name || null;
    const joinUrl = ev.location?.join_url || null;
    const ref = `calendly:${inviteeUri}`;
    const phone = p.text_reminder_number || null;
    const answers = (p.questions_and_answers || [])
      .filter((q) => q?.question && q?.answer)
      .map((q) => ({ question: String(q.question).slice(0, 300), answer: String(q.answer).slice(0, 1000) }));
    const pay = p.payment || null;

    if (event === "invitee.created") {
      const familyId = await findFamilyId(email);
      await sb("calendly_bookings?on_conflict=invitee_uri", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          invitee_uri: inviteeUri,
          family_id: familyId,
          invitee_name: p.name || null,
          invitee_email: email || null,
          event_name: eventName,
          host_name: host,
          start_time: start,
          end_time: end,
          join_url: joinUrl,
          invitee_phone: phone,
          answers,
          payment_amount: pay?.amount ?? null,
          payment_currency: pay?.currency || null,
          payment_paid: pay ? pay.successful !== false : null,
          status: "active",
          rescheduled: false,
          cancel_reason: null,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!familyId) {
        await record(event, email, "unmatched", "No parent has this email; booking saved for staff to link");
        return res.status(200).json({ saved: true, matched: false });
      }

      const lines = [
        `Booked: ${eventName}`,
        start ? `When: ${fmt(start)}` : null,
        host ? `With: ${host}` : null,
        p.name ? `Booked by: ${p.name}${email ? ` (${email})` : ""}` : null,
        phone ? `Phone: ${phone}` : null,
        ...answers.map((a) => `${a.question}: ${a.answer}`),
        joinUrl ? `Join link: ${joinUrl}` : null,
        p.rescheduled || p.old_invitee ? "This replaces an earlier booking (rescheduled)." : null,
      ].filter(Boolean);
      await sb("case_notes?on_conflict=external_ref", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({
          family_id: familyId,
          kind: "meeting",
          subject: `Booked: ${eventName}`,
          body: lines.join("\n"),
          occurred_at: start || new Date().toISOString(),
          external_ref: ref,
        }),
      });

      // A paid consultation moves a "Free sanity check" family to "Paid consult"
      // on the Caseload. The filter means a family already further along is
      // never moved back, and a 10-minute sanity check changes nothing.
      // (Skipped for the one-off import of old bookings, "backfill".)
      if (!p.backfill && /consult/i.test(eventName) && !/sanity/i.test(eventName)) {
        await sb(`families?id=eq.${familyId}&client_stage=eq.free_sanity_check`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ client_stage: "paid_consult" }),
        });
      }

      // Zoom: remember the meeting id so the AI summary finds this family later.
      const zoomId = !p.backfill && joinUrl && /zoom\.us\/j\/(\d+)/i.exec(joinUrl)?.[1];
      if (zoomId) {
        await sb("zoom_meeting_links", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ family_id: familyId, zoom_meeting_id: zoomId, join_url: joinUrl, topic: eventName }),
        });
      }
      await record(event, email, "saved", null);
      return res.status(200).json({ saved: true, matched: true });
    }

    // invitee.canceled (a reschedule arrives as a cancel plus a new created)
    const reason = p.cancellation?.reason || null;
    await sb(`calendly_bookings?invitee_uri=eq.${enc(inviteeUri)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "canceled",
        rescheduled: !!p.rescheduled,
        cancel_reason: reason,
        updated_at: new Date().toISOString(),
      }),
    });
    const note = `external_ref=eq.${enc(ref)}`;
    const existing = await sb(`case_notes?${note}&select=id,body`);
    if (existing[0]) {
      const tag = p.rescheduled ? "RESCHEDULED — this booking was moved to a new time." : `CANCELLED${reason ? `: ${reason}` : ""}`;
      await sb(`case_notes?${note}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          subject: `${p.rescheduled ? "Rescheduled" : "Cancelled"}: ${eventName}`,
          body: `${tag}\n\n${existing[0].body}`,
        }),
      });
    }
    await record(event, email, existing[0] ? "canceled_note_updated" : "canceled_no_note", null);
    return res.status(200).json({ canceled: true });
  } catch (e) {
    console.error("calendly-webhook failed:", e.message);
    await record(event, email, "error", e.message);
    return res.status(500).json({ error: "Couldn't save the booking." });
  }
}
