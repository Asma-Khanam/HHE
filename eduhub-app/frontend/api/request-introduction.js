import nodemailer from "nodemailer";

// Vercel serverless function -- "Do you need help with...?" (addendum 76).
//
// A family ticks a service on their Dashboard (finding a home, visa, ...).
// This records the request and emails HHE's trusted contact for that service
// an introduction naming the client. Runs server-side so partner emails and
// the email API key never reach the browser.
//
// Sends through ImprovMX's SMTP (smtp.improvmx.com) -- the same provider
// that already handles our inbound mail.
//
// SETUP
//   1. ImprovMX -> the domain -> SMTP Credentials -> add one, e.g.
//      relocate@heatherharries.com, and copy its password.
//   2. Client Vercel project -> Settings -> Environment Variables:
//        SUPABASE_URL               -- same as VITE_SUPABASE_URL
//        SUPABASE_SERVICE_ROLE_KEY  -- Supabase -> Settings -> API (service_role)
//        IMPROVMX_SMTP_USER         -- the SMTP credential's address
//        IMPROVMX_SMTP_PASS         -- its password
//        INTRO_CC_EMAIL             -- optional; gets a copy, partner replies go here
//      then redeploy.
// Without the SMTP details the request is still saved and shows on the
// consultant site as "Not emailed yet", so nothing is lost.


const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

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

let _transport;
function transport() {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: "smtp.improvmx.com",
      port: 587,
      secure: false, // STARTTLS
      auth: { user: process.env.IMPROVMX_SMTP_USER, pass: process.env.IMPROVMX_SMTP_PASS },
    });
  }
  return _transport;
}

const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// PLACEHOLDER WORDING -- the founders will send the final text.
function buildEmail({ partner, service, client }) {
  const hello = partner.contact_name ? `Dear ${partner.contact_name},` : "Hello,";
  const lines = [
    hello,
    "",
    `We are delighted to introduce you to ${client.name}, who is relocating to Dubai with Heather Harries Education and has asked for help with ${service.toLowerCase()}.`,
    "",
    `${client.name}'s details:`,
    client.email ? `Email: ${client.email}` : null,
    client.phone ? `Phone: ${client.phone}` : null,
    client.origin ? `Moving from: ${client.origin}` : null,
    client.arriving ? `In Dubai from: ${client.arriving}` : null,
    "",
    `${client.name} knows we are making this introduction and is expecting to hear from you.`,
    "",
    "Warm regards,",
    "Heather Harries Education",
  ].filter((l) => l !== null);
  return {
    subject: `Introduction: ${client.name} — ${service}`,
    text: lines.join("\n"),
    html: lines.map((l) => (l ? `<p style="margin:0 0 4px">${esc(l)}</p>` : "<br/>")).join(""),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!SB() || !KEY()) return res.status(500).json({ error: "Server not configured" });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const serviceKeys = Array.isArray(req.body?.services) ? req.body.services.slice(0, 10) : [];
  if (!token || !serviceKeys.length) return res.status(400).json({ error: "Missing sign-in or services" });

  try {
    // Who is asking? (their own Supabase session, checked server-side)
    const userRes = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${token}` } });
    if (!userRes.ok) return res.status(401).json({ error: "Please sign in again" });
    const user = await userRes.json();

    const [family] = await sb(`families?account_user_id=eq.${user.id}&select=id,origin,dubai_available_from`);
    if (!family) return res.status(404).json({ error: "No family found" });
    const parents = await sb(`parents?family_id=eq.${family.id}&select=full_name,email,phone,user_id,relationship`);
    const holder = parents.find((p) => p.user_id === user.id) || parents.find((p) => p.full_name) || {};
    const client = {
      name: holder.full_name || "our client",
      email: holder.email || user.email,
      phone: holder.phone,
      origin: family.origin,
      arriving: family.dubai_available_from
        ? new Date(family.dubai_available_from).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
        : null,
    };

    const results = [];
    for (const key of serviceKeys) {
      const [partner] = await sb(`partner_services?key=eq.${encodeURIComponent(key)}&select=*`);
      if (!partner) continue;

      // One introduction per service per family -- never email twice.
      let [row] = await sb(`family_service_requests?family_id=eq.${family.id}&service_key=eq.${encodeURIComponent(key)}&select=*`);
      if (row?.email_status === "sent") {
        results.push(row);
        continue;
      }
      if (!row) {
        [row] = await sb("family_service_requests", {
          method: "POST",
          body: JSON.stringify({ family_id: family.id, service_key: key, requested_by: user.id }),
        });
      }

      let patch;
      if (!partner.active || !partner.contact_email) {
        patch = { email_status: "no_contact", email_error: "No contact set for this service yet" };
      } else if (!process.env.IMPROVMX_SMTP_USER || !process.env.IMPROVMX_SMTP_PASS) {
        patch = { email_status: "pending", email_error: "Email sending not set up yet" };
      } else {
        const mail = buildEmail({ partner, service: partner.label, client });
        const cc = process.env.INTRO_CC_EMAIL;
        try {
          await transport().sendMail({
            from: `"Heather Harries Education" <${process.env.IMPROVMX_SMTP_USER}>`,
            to: partner.contact_name ? `"${partner.contact_name}" <${partner.contact_email}>` : partner.contact_email,
            cc: cc || undefined,
            replyTo: cc || process.env.IMPROVMX_SMTP_USER,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
          });
          patch = { email_status: "sent", email_to: partner.contact_email, email_sent_at: new Date().toISOString(), email_error: null };
        } catch (mailErr) {
          patch = { email_status: "failed", email_to: partner.contact_email, email_error: String(mailErr.message || mailErr).slice(0, 200) };
        }
      }
      const [updated] = await sb(`family_service_requests?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      results.push(updated);
    }

    return res.status(200).json({ requests: results });
  } catch (err) {
    console.error("request-introduction error", err.message);
    return res.status(500).json({ error: "Couldn't send that — please try again." });
  }
}
