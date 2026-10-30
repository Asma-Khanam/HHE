// "Was it opened?" -- the invisible 1x1 image inside emails sent from the dashboard
// points here: GET /api/email-open?n=<case_notes id>. Records the open on that email
// (first time, last time, count) and returns a transparent GIF. Needs addendum 146.
//
// Ignored: anything in the first 90 seconds after sending (mail servers and security
// scanners fetch images the moment an email arrives, which would read as "opened").

const SB = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUIET_MS = 90_000;

async function record(id) {
  const h = { apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" };
  const r = await fetch(
    `${SB()}/rest/v1/case_notes?id=eq.${id}&direction=eq.outbound&select=occurred_at,email_open_count,email_first_opened_at`,
    { headers: h, signal: AbortSignal.timeout(6_000) }
  );
  const [note] = r.ok ? await r.json() : [];
  if (!note) return;
  const now = Date.now();
  if (now - new Date(note.occurred_at).getTime() < QUIET_MS) return;
  await fetch(`${SB()}/rest/v1/case_notes?id=eq.${id}`, {
    method: "PATCH",
    headers: h,
    body: JSON.stringify({
      email_first_opened_at: note.email_first_opened_at || new Date(now).toISOString(),
      email_last_opened_at: new Date(now).toISOString(),
      email_open_count: (note.email_open_count || 0) + 1,
    }),
    signal: AbortSignal.timeout(6_000),
  });
}

export default async function handler(req, res) {
  const id = String(req.query?.n || "");
  if (SB() && KEY() && UUID.test(id)) {
    try {
      await record(id);
    } catch (e) {
      console.error("email-open:", e?.message);
    }
  }
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.status(200).send(PIXEL);
}
