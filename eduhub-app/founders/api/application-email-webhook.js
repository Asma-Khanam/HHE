import { getEmailInsight, insightEnabled } from "./_lib/emailInsight.js";

// Vercel serverless function — receives ImprovMX's webhook POST for mail
// sent to *@applications.heatherharries.com and logs it against the right
// family (addendum 7 + 49's log_application_email).
//
// Why this exists (September 2026 change request)
// -------------------------------------------------------------------------
// addendum 7 was written assuming Cloudflare Email Routing + a Cloudflare
// Email Worker (backend/utilities/cloudflare-application-email-worker.js,
// now retired). The actual mail provider in use is ImprovMX, which works
// differently: instead of running a Worker per inbound message, you point
// an alias's "Forwards to" field at a URL and ImprovMX POSTs the parsed
// email there as JSON. Because ImprovMX also lets one alias forward to
// MULTIPLE comma-separated destinations (emails and/or webhooks) at once,
// this function only needs to log the email -- ImprovMX itself keeps
// forwarding it to relocate@heatherharries.com in parallel, so nothing
// about the "get the mail into the real inbox" half of this changes.
//
// One real behaviour change from the Cloudflare design: that Worker could
// SUPPRESS forwarding for a deactivated alias. ImprovMX's forwarding rule
// doesn't know about our database's active/inactive flag, so a deactivated
// alias's mail still reaches relocate@heatherharries.com -- it's just also
// correctly logged as such. Deactivating an alias in the app is now purely
// a record-keeping flag, not a mail block. If that block is ever needed,
// it would mean giving that one alias its own ImprovMX rule pointed only at
// this webhook (no email destination) -- not something this function does
// on its own.
//
// SETUP:
//   1. In ImprovMX, open applications.heatherharries.com's Aliases, find the
//      catch-all alias ("*") -- ImprovMX creates one by default -- and set
//      its "Forwards to" field to:
//        relocate@heatherharries.com, https://hhe-founders.vercel.app/api/application-email-webhook?key=<APPLICATION_EMAIL_WEBHOOK_SECRET>
//      (comma-separated: the real inbox AND this webhook, both fire on every
//      inbound message).
//   2. In the founders Vercel project -> Settings -> Environment Variables,
//      add (Production, and Preview if you test there):
//        SUPABASE_URL                      -- same value as VITE_SUPABASE_URL
//        SUPABASE_SERVICE_ROLE_KEY         -- Supabase dashboard -> Settings -> API
//                                             (service_role, NOT the anon key --
//                                             never put this one in VITE_ vars)
//        APPLICATION_EMAIL_WEBHOOK_SECRET  -- any random string you make up
//   3. Use that same secret in the ImprovMX URL's ?key= above. Redeploy after
//      adding the env vars so this function can see them.
//   4. Test by emailing any address at applications.heatherharries.com and
//      checking the family's Emails tab.
//
// Addendum 77 (24 Sept 2026): the whole email is now kept -- full HTML,
// full text, to/cc, sender name -- via log_application_email_full, plus
// attachments uploaded to the private "email-attachments" bucket. Inline
// images (cid:) are folded straight into the HTML so the email renders as
// sent. If addendum 77 hasn't been run yet, this quietly falls back to the
// old 4-argument log_application_email so nothing stops logging.
//
// Never logs a raw request body anywhere -- it can contain a school's full
// message.

const MAX_HTML = 900_000; // chars -- far above any normal email
const MAX_INLINE_IMAGE = 400_000; // bytes of base64 we're happy to inline

function sbHeaders(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

const addr = (list) =>
  (Array.isArray(list) ? list : list ? [list] : [])
    .map((p) =>
      typeof p === "string"
        ? p
        : p?.name && p.name.toLowerCase() !== String(p.email || "").toLowerCase()
          ? `${p.name} <${p.email}>`
          : p?.email
    )
    .filter(Boolean)
    .join(", ");

function headerValue(headers, name) {
  if (!headers) return null;
  if (Array.isArray(headers)) {
    const hit = headers.find((h) => String(h?.[0] ?? h?.name ?? "").toLowerCase() === name);
    return hit ? hit[1] ?? hit.value : null;
  }
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : null;
}

// ImprovMX sends file content base64-encoded; fall back to raw bytes if a
// payload ever arrives that clearly isn't base64.
function toBuffer(content) {
  const c = String(content || "");
  return /^[A-Za-z0-9+/=\r\n]+$/.test(c) ? Buffer.from(c, "base64") : Buffer.from(c, "binary");
}

const safeName = (n) => String(n || "attachment").replace(/[^\w.\- ]+/g, "_").slice(0, 120);

async function callRpc(name, args) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: sbHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { ok: r.ok, status: r.status, json, text };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  if (req.query.key !== process.env.APPLICATION_EMAIL_WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body || {};
  // ImprovMX's "to" field is an array of { name, email } -- the alias that
  // was actually dialled is the local part before the @. A school may cc
  // several people, so pick the first recipient on our own domain.
  const recipients = [...(Array.isArray(body.to) ? body.to : []), ...(Array.isArray(body.cc) ? body.cc : [])];
  const ours = recipients.find((r) => /@applications\.heatherharries\.com$/i.test(r?.email || "")) || recipients[0];
  const alias = ours?.email ? ours.email.split("@")[0].toLowerCase() : null;

  if (!alias) {
    // Nothing we can log against -- still 200 so ImprovMX doesn't retry
    // forever over a message it will never be able to route.
    res.status(200).json({ logged: false, reason: "no alias in payload" });
    return;
  }

  const fromEmail = body.from?.email || (typeof body.from === "string" ? body.from : "") || "(unknown sender)";
  const text = typeof body.text === "string" ? body.text : "";
  let html = typeof body.html === "string" ? body.html : "";
  // ImprovMX splits files in two: "attachments" (real files) and "inlines"
  // (images pasted into the body, referenced from the HTML as cid:...).
  const toSave = []; // { item, inline, cid }
  for (const a of Array.isArray(body.attachments) ? body.attachments : []) {
    if (a?.content) toSave.push({ item: a, inline: false, cid: null });
  }
  for (const a of Array.isArray(body.inlines) ? body.inlines : []) {
    const cid = String(a?.cid || "").replace(/[<>]/g, "");
    const b64 = typeof a?.content === "string" ? a.content : "";
    if (!b64) continue;
    if (cid && html && b64.length <= MAX_INLINE_IMAGE && /^[A-Za-z0-9+/=\r\n]+$/.test(b64)) {
      // Small image: fold straight into the HTML.
      html = html.split(`cid:${cid}`).join(`data:${a.type || "image/png"};base64,${b64.replace(/\s+/g, "")}`);
    } else {
      // Big photo: store it; the Emails tab swaps cid: for a private link.
      toSave.push({ item: a, inline: true, cid: cid || null });
    }
  }
  if (html.length > MAX_HTML) html = ""; // absurdly large -- fall back to text

  const messageId =
    body["message-id"] || body.messageId || body.message_id || headerValue(body.headers, "message-id") || null;

  try {
    let result = await callRpc("log_application_email_full", {
      p_alias: alias,
      p_from: fromEmail,
      p_from_name: body.from?.name || null,
      p_to: addr(body.to),
      p_cc: addr(body.cc),
      p_subject: body.subject || "(no subject)",
      p_text: text,
      p_html: html || null,
      p_message_id: messageId ? String(messageId).slice(0, 500) : null,
    });

    if (!result.ok && (result.status === 404 || /PGRST202|Could not find the function/i.test(result.text))) {
      // Addendum 77 not run yet -- old behaviour.
      result = await callRpc("log_application_email", {
        p_alias: alias,
        p_from: fromEmail,
        p_subject: body.subject || "(no subject)",
        p_snippet: text.replace(/\s+/g, " ").trim().slice(0, 400),
      });
      res.status(200).json({ logged: result.ok, legacy: true });
      return;
    }

    if (!result.ok) {
      console.error("log_application_email_full failed", result.status, result.text.slice(0, 300));
      res.status(200).json({ logged: false });
      return;
    }

    const out = result.json || {};
    if (out.logged && out.note_id && !out.duplicate && toSave.length) {
      // Every file gets a row -- if an upload fails the Emails tab still
      // shows its name with "couldn't be saved", so nothing goes missing
      // silently.
      const saved = [];
      for (const { item: a, inline, cid } of toSave) {
        const name = safeName(a.name || a.filename || (inline ? "image" : "attachment"));
        const entry = { name, type: a.type || null, size: 0, path: null, inline, cid };
        try {
          const buf = toBuffer(a.content);
          entry.size = buf.length;
          const path = `${out.family_id}/${out.note_id}/${saved.length + 1}-${name}`;
          const up = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/email-attachments/${encodeURI(path)}`, {
            method: "POST",
            headers: sbHeaders({ "Content-Type": a.type || "application/octet-stream", "x-upsert": "true" }),
            body: buf,
          });
          if (up.ok) entry.path = path;
          else {
            entry.error = `upload failed (${up.status})`;
            console.error("attachment upload failed", up.status, (await up.text()).slice(0, 200));
          }
        } catch (e) {
          entry.error = "upload error";
          console.error("attachment upload error", e?.message);
        }
        saved.push(entry);
      }
      if (saved.length) {
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/case_notes?id=eq.${out.note_id}`, {
          method: "PATCH",
          headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
          body: JSON.stringify({ email_attachments: saved }),
        });
      }
    }

    // Claude's reading of the email (summary, dates, suggested to-dos) --
    // best effort, never blocks logging. Staff can re-run it from the tab.
    if (out.logged && out.note_id && !out.duplicate && insightEnabled()) {
      try {
        const insight = await getEmailInsight({
          subject: body.subject,
          email_from: fromEmail,
          email_from_name: body.from?.name,
          email_text: text,
          email_html: html,
        });
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/case_notes?id=eq.${out.note_id}`, {
          method: "PATCH",
          headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
          body: JSON.stringify({ ai_insight: insight, ai_insight_at: new Date().toISOString() }),
        });
      } catch (e) {
        console.error("email insight failed", e?.message);
      }
    }

    res.status(200).json({ logged: !!out.logged });
  } catch (err) {
    console.error("application-email-webhook error", err?.message);
    // Still 200: this only logs a case note. It never affects whether the
    // school's email itself gets through -- ImprovMX forwards that
    // independently, in parallel, regardless of what happens here.
    res.status(200).json({ logged: false });
  }
}
