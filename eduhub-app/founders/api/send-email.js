import nodemailer from "nodemailer";

// Vercel serverless function -- send an email to a school from a family's
// Emails tab (founders, 26 Sept 2026: "send emails to the schools from the
// emails tab ... like the Outlook setup").
//
// HOW IT SENDS
//   Through ImprovMX's SMTP, same as the Introductions emails. Replies are
//   pointed at the family's own application address (Reply-To), so when the
//   school answers, the reply lands back in this family's Emails tab by
//   itself through the existing webhook.
//   If the SMTP credential is ImprovMX's "Send as any alias" one (its
//   username starts with "any-alias"), the email is sent FROM the family's
//   application address itself, which looks even more natural to the school.
//
// WHAT IT SAVES
//   A copy of every sent email goes into case_notes (direction outbound) with
//   the full text, To/Cc, message ID and attachments, so the Sent folder on
//   the Emails tab shows exactly what went out and who sent it.
//
// ENV (founders Vercel project): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// VITE_SUPABASE_ANON_KEY, IMPROVMX_SMTP_USER, IMPROVMX_SMTP_PASS.
// Optional: EMAIL_FROM_NAME (default "Heather Harries Relocation").

const ALIAS_DOMAIN = "applications.heatherharries.com";
const MAX_UPLOAD_BYTES = 3_000_000; // Vercel request body limit is ~4.5MB; base64 adds a third.

const SB = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

function sbHeaders(extra = {}) {
  return { apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json", ...extra };
}

async function sb(path, init = {}) {
  const res = await fetch(`${SB()}/rest/v1/${path}`, { ...init, headers: sbHeaders({ Prefer: "return=representation", ...(init.headers || {}) }) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Supabase ${res.status}`);
  return data;
}

// Who is sending? Checked with the consultant's own session, then looked up.
async function staffFor(token) {
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !anon) return null;
  const who = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!who.ok) return null;
  const user = await who.json();
  const rows = await sb(`staff?user_id=eq.${user.id}&select=user_id,full_name,email`);
  return rows[0] ? { ...rows[0], email: rows[0].email || user.email } : null;
}

const cleanList = (list) =>
  [...new Set((Array.isArray(list) ? list : String(list || "").split(/[,;\s]+/)).map((s) => String(s).trim()).filter(Boolean))].filter(
    (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)
  );

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function textToHtml(text) {
  return escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

const safeName = (n) => String(n || "file").replace(/[^\w.\- ]+/g, "_").slice(0, 120);

let _transport;
function transport() {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: "smtp.improvmx.com",
      port: 587,
      secure: false,
      auth: { user: process.env.IMPROVMX_SMTP_USER, pass: process.env.IMPROVMX_SMTP_PASS },
      // The function is cut off at 30s (vercel.json). Nodemailer's own defaults wait
      // up to 2 minutes, so a slow mail server used to kill the function and the
      // browser only saw a blank "Couldn't send that email". Fail sooner, with a reason.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return _transport;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!SB() || !KEY()) return res.status(503).json({ error: "Email sending isn't set up yet (Supabase keys missing)." });
  if (!process.env.IMPROVMX_SMTP_USER || !process.env.IMPROVMX_SMTP_PASS)
    return res.status(503).json({ error: "Email sending isn't set up yet (IMPROVMX_SMTP_USER / IMPROVMX_SMTP_PASS missing on Vercel)." });

  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const staff = await staffFor(token);
    if (!staff) return res.status(401).json({ error: "Please sign in again." });

    const { familyId, to, cc, subject, text, ccMe, inReplyTo, references, attachments = [], documentIds = [] } = req.body || {};
    const toList = cleanList(to);
    const ccList = cleanList(cc);
    if (ccMe && staff.email) ccList.push(staff.email);
    if (!familyId) return res.status(400).json({ error: "Which family is this for?" });
    if (!toList.length) return res.status(400).json({ error: "Add at least one email address in To." });
    if (!String(text || "").trim()) return res.status(400).json({ error: "The email is empty." });

    // The family's application address -- school replies come back here.
    const [family] = await sb(`families?id=eq.${familyId}&select=id,application_alias`);
    if (!family) return res.status(404).json({ error: "Family not found." });
    const parents = await sb(`parents?family_id=eq.${familyId}&select=full_name,application_alias&order=created_at`);
    const alias = (parents.find((p) => p.application_alias)?.application_alias || family.application_alias || "").trim();
    const familyAddress = alias ? `${alias}@${ALIAS_DOMAIN}` : null;

    // 15 Oct 2026: a family with no parent/family application address yet
    // used to send fine, just silently -- fromAddress fell back to the raw
    // IMPROVMX_SMTP_USER (e.g. any-alias-1@applications.heatherharries.com)
    // and replyTo was left unset, so the school's reply had nowhere this app
    // could match it to a family: ImprovMX's catch-all still forwarded it to
    // relocate@heatherharries.com (so it looked fine from the shared inbox)
    // and still posted it to this webhook, but the alias in that reply
    // ("any-alias-1") isn't any real family's address, so it was silently
    // dropped instead of logged here. Caught via the Goodburn family: six
    // emails sent to schools with no address ever created for either
    // parent, so none of the replies made it into their Emails tab, even
    // though they were clearly arriving (relocate@'s Titan inbox had them).
    // Blocking here, instead of sending untracked, is cheap -- creating an
    // address takes one click on the Applications tab.
    if (!familyAddress) {
      return res.status(400).json({
        error:
          "This family doesn't have an application email address yet, so any reply wouldn't come back into their record. Create one for a parent on the Applications tab (Application email panel), then send again.",
      });
    }

    // Attachments: files picked on the computer (sent as base64) plus the
    // family's own documents (fetched here, straight from storage).
    const files = [];
    let uploadBytes = 0;
    for (const a of attachments.slice(0, 10)) {
      const buf = Buffer.from(String(a.content || ""), "base64");
      uploadBytes += buf.length;
      if (uploadBytes > MAX_UPLOAD_BYTES)
        return res.status(413).json({ error: "Those files are too big to send from here (3 MB max). Attach fewer or smaller files." });
      files.push({ filename: safeName(a.name), content: buf, contentType: a.type || "application/octet-stream" });
    }
    if (documentIds.length) {
      const docs = await sb(`documents?id=in.(${documentIds.slice(0, 10).join(",")})&select=id,file_url,file_type,original_filename,document_type`);
      for (const d of docs) {
        if (!d.file_url) continue;
        const path = String(d.file_url).replace(/^.*\/documents\//, "");
        const r = await fetch(`${SB()}/storage/v1/object/documents/${path.split("/").map(encodeURIComponent).join("/")}`, {
          headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}` },
        });
        if (!r.ok) return res.status(502).json({ error: `Couldn't fetch ${d.original_filename || d.document_type} from the family's documents.` });
        files.push({
          filename: safeName(d.original_filename || `${d.document_type}.${(d.file_type || "pdf").split("/").pop()}`),
          content: Buffer.from(await r.arrayBuffer()),
          contentType: d.file_type || "application/octet-stream",
        });
      }
    }

    const fromName = process.env.EMAIL_FROM_NAME || "Heather Harries Relocation";
    const sendAsAlias = /^any-alias/i.test(process.env.IMPROVMX_SMTP_USER) && familyAddress;
    const fromAddress = sendAsAlias ? familyAddress : process.env.IMPROVMX_SMTP_USER;
    const signature = `\n\n${staff.full_name || "The team"}\n${fromName}`;
    // On a reply or forward the signature goes above the quoted email, like Outlook.
    const raw = String(text).replace(/\s+$/, "");
    const cut = raw.search(/\n\s*\n\s*\n(On .+ wrote:|---------- Forwarded message)/);
    const bodyText =
      cut > 0 ? raw.slice(0, cut).trim() + signature + raw.slice(cut) : cut === 0 ? signature.trim() + raw : raw.trim() + signature;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${textToHtml(bodyText)}</div>`;

    const info = await transport().sendMail({
      from: { name: fromName, address: fromAddress },
      replyTo: familyAddress || undefined,
      to: toList,
      cc: ccList.length ? ccList : undefined,
      subject: String(subject || "").trim() || "(no subject)",
      text: bodyText,
      html,
      inReplyTo: inReplyTo || undefined,
      references: references || inReplyTo || undefined,
      attachments: files,
    });

    // Keep a copy on the family's Emails tab. The email is already sent by now, so a
    // failure here must not look like the send failed (that invites a duplicate).
    let note;
    try {
      [note] = await sb("case_notes", {
      method: "POST",
      body: JSON.stringify({
        family_id: familyId,
        kind: "email",
        direction: "outbound",
        subject: String(subject || "").trim() || "(no subject)",
        body: bodyText,
        occurred_at: new Date().toISOString(),
        author_id: staff.user_id,
        email_from: `${fromName} <${fromAddress}>`,
        email_from_name: staff.full_name || fromName,
        email_to: toList.join(", "),
        email_cc: ccList.join(", ") || null,
        email_text: bodyText,
        email_html: html,
        email_message_id: info.messageId || null,
      }),
    });
    } catch (saveErr) {
      console.error("send-email: sent but could not save the copy:", saveErr.message);
      return res.status(200).json({
        ok: true,
        note: null,
        warning: "The email was sent, but a copy could not be saved to the Emails tab. Do not send it again.",
        detail: String(saveErr.message || saveErr).slice(0, 300),
      });
    }

    // Save the attachments with it, so Sent shows them too.
    if (files.length && note) {
      const saved = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const path = `${familyId}/${note.id}/${i + 1}-${f.filename}`;
        const up = await fetch(`${SB()}/storage/v1/object/email-attachments/${path.split("/").map(encodeURIComponent).join("/")}`, {
          method: "POST",
          headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": f.contentType, "x-upsert": "true" },
          body: f.content,
        });
        saved.push({ name: f.filename, type: f.contentType, size: f.content.length, path: up.ok ? path : null, ...(up.ok ? {} : { error: "couldn't be saved" }) });
      }
      const [patched] = await sb(`case_notes?id=eq.${note.id}`, { method: "PATCH", body: JSON.stringify({ email_attachments: saved }) });
      return res.status(200).json({ ok: true, note: patched || note });
    }
    return res.status(200).json({ ok: true, note });
  } catch (err) {
    const msg = String(err?.message || err);
    const code = err?.code ? `${err.code}: ` : "";
    const detail = `${code}${err?.response || msg}`.slice(0, 300);
    console.error("send-email failed:", detail);
    const timedOut = /ETIMEDOUT|ESOCKET|ECONNECTION|ECONNRESET|timed? ?out|Greeting never received/i.test(`${err?.code} ${msg}`);
    return res.status(500).json({
      error: timedOut
        ? "The email server didn't answer in time. Check the Sent folder before trying again, in case it did go out."
        : /550|5\.1\.9|not correctly configured/i.test(msg)
        ? "The email server refused it (domain not verified for sending). Check the DKIM/SPF records on ImprovMX."
        : /\b535\b|EAUTH|invalid login|authentication/i.test(`${err?.code} ${msg}`)
        ? "The email server login failed. Check IMPROVMX_SMTP_USER / IMPROVMX_SMTP_PASS on Vercel."
        : "Couldn't send that email.",
      detail,
    });
  }
}
