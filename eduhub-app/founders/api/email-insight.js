import { getEmailInsight, insightEnabled } from "./_lib/emailInsight.js";

// POST /api/email-insight  { noteId }  -- Authorization: Bearer <staff session>
// The "Summarise with Claude" button on the Emails tab. Reads and writes the
// case note AS the signed-in staff member (their own token + the anon key),
// so the database's own staff-only rules decide who can use this.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!insightEnabled()) return res.status(503).json({ error: "Claude isn't connected yet (no ANTHROPIC_API_KEY)." });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const noteId = req.body?.noteId;
  if (!url || !anon) return res.status(500).json({ error: "Server not configured" });
  if (!token || !noteId) return res.status(400).json({ error: "Missing sign-in or email" });

  const headers = { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    const r = await fetch(`${url}/rest/v1/case_notes?id=eq.${encodeURIComponent(noteId)}&kind=eq.email&select=*`, { headers });
    const rows = r.ok ? await r.json() : [];
    const note = rows[0];
    if (!note) return res.status(404).json({ error: "Email not found" });

    let patch;
    try {
      const insight = await getEmailInsight(note);
      patch = { ai_insight: insight, ai_insight_at: new Date().toISOString(), ai_insight_error: null };
    } catch (e) {
      patch = { ai_insight_error: String(e.message || e).slice(0, 300), ai_insight_at: new Date().toISOString() };
    }

    const u = await fetch(`${url}/rest/v1/case_notes?id=eq.${encodeURIComponent(noteId)}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    const [saved] = u.ok ? await u.json() : [];
    if (!saved) return res.status(500).json({ error: "Couldn't save the summary (has addendum 78 been run?)" });
    if (patch.ai_insight_error) return res.status(502).json({ error: patch.ai_insight_error, note: saved });
    return res.status(200).json({ note: saved });
  } catch (err) {
    console.error("email-insight error", err?.message);
    return res.status(500).json({ error: "Couldn't summarise that email — please try again." });
  }
}
