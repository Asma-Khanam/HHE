import crypto from "crypto";

// Vercel serverless function -- receives Zoom's webhook when a meeting's AI
// Companion summary is ready, finds the family the meeting was linked to
// (zoom_meeting_links, addendum 89) and saves the summary on that family's
// Meetings tab as a meeting note.
//
// SETUP (needs someone with admin access to the HHE Zoom account):
//   1. marketplace.zoom.us -> Develop -> Build App -> "General app" (or
//      "Webhook only" app) -> turn on Event Subscriptions.
//   2. Event notification endpoint URL:
//        https://hhe-founders.vercel.app/api/zoom-webhook
//      Subscribe to the event "Meeting Summary Completed" (AI Companion
//      meeting summary). Copy the app's "Secret Token".
//   3. In the hhe-founders Vercel project add ZOOM_WEBHOOK_SECRET_TOKEN with
//      that secret token (plus SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY,
//      already there for the email functions) and redeploy.
//   4. Click Validate in Zoom. Activate the app on the account.
//   5. AI Companion meeting summary must be on for the meetings (it is on the
//      Pro plan per the founders). The host must be on that Zoom account.
//
// Never logs a request body.

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

function summaryText(o) {
  const parts = [];
  if (o.summary_overview) parts.push(String(o.summary_overview).trim());
  (o.summary_details || []).forEach((d) => {
    if (d?.summary) parts.push(`${d.label ? d.label + "\n" : ""}${String(d.summary).trim()}`);
  });
  if (Array.isArray(o.next_steps) && o.next_steps.length) parts.push("Next steps\n" + o.next_steps.map((s) => `- ${s}`).join("\n"));
  return parts.join("\n\n").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secret) return res.status(500).json({ error: "ZOOM_WEBHOOK_SECRET_TOKEN is not set." });

  const body = req.body || {};

  // Zoom's one-off URL check when the endpoint is saved.
  if (body.event === "endpoint.url_validation") {
    const plainToken = body.payload?.plainToken || "";
    return res.status(200).json({ plainToken, encryptedToken: hmac(secret, plainToken) });
  }

  // Everything else must be signed by Zoom.
  const ts = req.headers["x-zm-request-timestamp"];
  const sig = req.headers["x-zm-signature"];
  const expected = `v0=${hmac(secret, `v0:${ts}:${JSON.stringify(body)}`)}`;
  if (!ts || !sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(401).json({ error: "Bad signature" });
  }

  try {
    if (body.event !== "meeting.summary_completed") return res.status(200).json({ ignored: body.event || "unknown" });

    const o = body.payload?.object || {};
    const meetingId = String(o.meeting_id || "").replace(/\D/g, "");
    if (!meetingId) return res.status(200).json({ ignored: "no meeting id" });

    const links = await sb(
      `zoom_meeting_links?zoom_meeting_id=eq.${meetingId}&select=family_id,join_url,topic&order=created_at.desc&limit=1`
    );
    const link = links[0];
    if (!link) return res.status(200).json({ ignored: "meeting not linked to a family" });

    const text = summaryText(o);
    if (!text) return res.status(200).json({ ignored: "empty summary" });

    const when = o.meeting_start_time || o.summary_start_time || o.summary_created_time || new Date().toISOString();
    const url = link.join_url ? `\n\nZoom link: ${link.join_url}` : "";
    await sb("case_notes?on_conflict=external_ref", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        family_id: link.family_id,
        kind: "meeting",
        subject: o.meeting_topic || link.topic || "Zoom meeting",
        body: `${text}${url}`,
        occurred_at: new Date(when).toISOString(),
        external_ref: `zoom:${o.meeting_uuid || meetingId + ":" + when}`,
      }),
    });
    return res.status(200).json({ saved: true });
  } catch (e) {
    console.error("zoom-webhook failed:", e.message);
    return res.status(500).json({ error: "Couldn't save the summary." });
  }
}
