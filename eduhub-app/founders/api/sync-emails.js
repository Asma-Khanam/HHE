// "Sync" button on the Emails tab.
//
// The Titan sync (scripts/backfill-titan-emails.mjs) runs on GitHub Actions
// every 30 minutes. This lets a signed-in consultant start it right now and
// watch it finish, like Sync in Outlook.
//
//   POST /api/sync-emails            -> starts a run (or reports one already running)
//   GET  /api/sync-emails?since=ISO  -> status of the newest run started since then
//
// Needs two Vercel environment variables:
//   GITHUB_SYNC_TOKEN  fine-grained GitHub token for the HHE repo, "Actions: Read and write"
//   GITHUB_REPO        optional, defaults to Asma-Khanam/HHE
const WORKFLOW = "titan-email-sync.yml";
const SB = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const REPO = () => process.env.GITHUB_REPO || "Asma-Khanam/HHE";

async function isStaff(token) {
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !anon || !SB()) return false;
  const who = await fetch(`${SB()}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!who.ok) return false;
  const user = await who.json();
  const r = await fetch(`${SB()}/rest/v1/staff?user_id=eq.${user.id}&select=user_id`, {
    headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}` },
    signal: AbortSignal.timeout(10_000),
  });
  const rows = r.ok ? await r.json() : [];
  return rows.length > 0;
}

function gh(path, init = {}) {
  return fetch(`https://api.github.com/repos/${REPO()}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_SYNC_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
}

async function latestRun() {
  const r = await gh(`/actions/workflows/${WORKFLOW}/runs?per_page=5`);
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const data = await r.json();
  return data.workflow_runs || [];
}

export default async function handler(req, res) {
  try {
    if (!process.env.GITHUB_SYNC_TOKEN)
      return res.status(503).json({ error: "Sync isn't set up yet (GITHUB_SYNC_TOKEN is missing on Vercel)." });
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!(await isStaff(token))) return res.status(401).json({ error: "Please sign in again." });

    if (req.method === "GET") {
      const since = Date.parse(String(req.query?.since || "")) || 0;
      const run = (await latestRun()).find((r) => Date.parse(r.created_at) >= since - 15_000);
      if (!run) return res.status(200).json({ state: "waiting" });
      return res.status(200).json({
        state: run.status === "completed" ? (run.conclusion === "success" ? "done" : "failed") : "running",
        url: run.html_url,
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });

    const runs = await latestRun();
    const active = runs.find((r) => r.status !== "completed");
    if (active) return res.status(200).json({ started: false, alreadyRunning: true, since: active.created_at });

    const since = new Date().toISOString();
    const d = await gh(`/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: "main", inputs: { days: "1" } }),
    });
    if (!d.ok) {
      const t = await d.text().catch(() => "");
      return res.status(502).json({ error: `GitHub wouldn't start the sync (${d.status}). ${t.slice(0, 160)}` });
    }
    return res.status(200).json({ started: true, since });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Sync failed to start." });
  }
}
