// Vercel serverless function -- "Delete my account" (Apple guideline 5.1.1(v)).
//
// The signed-in family asks to delete their own account. Steps:
//   1. check who is asking (their own Supabase session)
//   2. erase_family_data() (addendum 126): documents rows, children, parents,
//      address etc. The family ROW stays, archived, so invoices and payment
//      records are kept for accounting.
//   3. remove their uploaded files from Storage (folder named after their user id)
//   4. delete the login itself
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (already set for this project).

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

// every file under "<userId>/" (folders appear as entries with no id)
async function listAll(prefix, out = []) {
  let offset = 0;
  for (;;) {
    const r = await fetch(`${SB()}/storage/v1/object/list/documents`, {
      method: "POST",
      headers: H(),
      body: JSON.stringify({ prefix, limit: 100, offset }),
    });
    if (!r.ok) throw new Error(`Storage list ${r.status}`);
    const items = await r.json();
    for (const it of items) {
      if (it.id) out.push(`${prefix}/${it.name}`);
      else await listAll(`${prefix}/${it.name}`, out);
    }
    if (items.length < 100) return out;
    offset += 100;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!SB() || !KEY()) return res.status(500).json({ error: "Server not configured" });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Please sign in again" });
  if (req.body?.confirm !== "DELETE") return res.status(400).json({ error: "Please type DELETE to confirm" });

  try {
    const userRes = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${token}` } });
    if (!userRes.ok) return res.status(401).json({ error: "Please sign in again" });
    const user = await userRes.json();

    // Staff accounts are never deleted from the client app.
    const staffRes = await fetch(`${SB()}/rest/v1/staff?user_id=eq.${user.id}&select=user_id`, { headers: H() });
    if (staffRes.ok && (await staffRes.json()).length) {
      return res.status(403).json({ error: "Team accounts can't be deleted here." });
    }

    // 1) database
    const rpc = await fetch(`${SB()}/rest/v1/rpc/erase_family_data`, {
      method: "POST",
      headers: H(),
      body: JSON.stringify({ p_user: user.id }),
    });
    if (!rpc.ok) {
      const t = await rpc.text();
      return res.status(500).json({ error: `Could not erase your details (${t.slice(0, 160)})` });
    }

    // 2) files
    let filesLeft = 0;
    try {
      const paths = await listAll(user.id);
      for (let i = 0; i < paths.length; i += 100) {
        const del = await fetch(`${SB()}/storage/v1/object/documents`, {
          method: "DELETE",
          headers: H(),
          body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }),
        });
        if (!del.ok) filesLeft += Math.min(100, paths.length - i);
      }
    } catch {
      filesLeft = -1;
    }

    // 3) the login
    const au = await fetch(`${SB()}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: H() });
    if (!au.ok) return res.status(500).json({ error: "Your details were erased but the login could not be removed. Please contact us." });

    return res.status(200).json({ ok: true, filesLeft });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Something went wrong" });
  }
}
