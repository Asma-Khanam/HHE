// Delete / Archive / Report spam / Restore on the Emails tab, kept in step with Titan.
//
// POST /api/move-email  { kind: "note" | "unmatched", id, to: "trash" | "archive" | "spam" | "inbox" }
//
// Finds the email in the relocate@ Titan mailbox by its Message-ID and moves it to the
// matching folder there (Delete goes to Trash, so it can always be put back), then
// updates the website's copy. A copy sent from the dashboard that never sat in Titan
// is only changed on the website. The 30 minute Titan sync agrees with both, so a
// move made here is never undone by it.
//
// Needs Vercel variables TITAN_EMAIL and TITAN_PASSWORD (same values as the GitHub secrets).
import { ImapFlow } from "imapflow";

const SB = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbHeaders = (extra = {}) => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json", ...extra });

async function sb(path, init = {}) {
  const res = await fetch(`${SB()}/rest/v1/${path}`, { ...init, headers: sbHeaders(init.headers), signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Supabase ${res.status}`);
  return data;
}

async function isStaff(token) {
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !anon) return false;
  const who = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  if (!who.ok) return false;
  const user = await who.json();
  const rows = await sb(`staff?user_id=eq.${user.id}&select=user_id`);
  return rows.length > 0;
}

const KINDS = {
  trash: (b) => b.specialUse === "\\Trash" || /^(trash|deleted( items| messages)?|bin)$/i.test(b.path),
  archive: (b) => b.specialUse === "\\Archive" || /^archive[sd]?$/i.test(b.path),
  spam: (b) => b.specialUse === "\\Junk" || /^(spam|junk)( e-?mail)?$/i.test(b.path),
  inbox: (b) => b.path.toUpperCase() === "INBOX",
  sent: (b) => b.specialUse === "\\Sent" || /^sent( items| mail)?$/i.test(b.path),
};

async function moveInTitan(messageId, to) {
  const client = new ImapFlow({
    host: "imap.titan.email",
    port: 993,
    secure: true,
    auth: { user: process.env.TITAN_EMAIL, pass: process.env.TITAN_PASSWORD },
    logger: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  client.on("error", () => {});
  await client.connect();
  try {
    const boxes = await client.list();
    const target = boxes.find(KINDS[to]);
    if (!target) throw new Error(`Titan has no ${to} folder to move it to.`);
    const bare = String(messageId).replace(/^<|>$/g, "");
    let moved = 0;
    for (const kind of ["inbox", "sent", "spam", "archive", "trash"]) {
      const box = boxes.find(KINDS[kind]);
      if (!box || box.path === target.path) continue;
      const lock = await client.getMailboxLock(box.path);
      try {
        const uids = await client.search({ header: { "message-id": bare } }, { uid: true });
        if (uids && uids.length) {
          await client.messageMove(uids.join(","), target.path, { uid: true });
          moved += uids.length;
        }
      } finally {
        lock.release();
      }
    }
    return moved;
  } finally {
    await client.logout().catch(() => {});
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    if (!SB() || !KEY()) return res.status(503).json({ error: "Not set up yet (Supabase keys missing)." });
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!(await isStaff(token))) return res.status(401).json({ error: "Please sign in again." });

    const { kind, id, to } = req.body || {};
    const table = kind === "unmatched" ? "unmatched_emails" : kind === "note" ? "case_notes" : null;
    if (!table || !id || !["trash", "archive", "spam", "inbox"].includes(to)) return res.status(400).json({ error: "Bad request." });

    const [row] = await sb(`${table}?id=eq.${id}&select=id,email_message_id`);
    if (!row) return res.status(404).json({ error: "That email was not found." });
    const mid = row.email_message_id || "";

    let inTitan = null;
    if (mid) {
      if (!process.env.TITAN_EMAIL || !process.env.TITAN_PASSWORD) {
        return res.status(503).json({ error: "Moving emails in Titan isn't set up yet (TITAN_EMAIL and TITAN_PASSWORD are missing on Vercel)." });
      }
      try {
        inTitan = (await moveInTitan(mid, to)) > 0;
      } catch (e) {
        return res.status(502).json({ error: `Titan wouldn't move it: ${e?.message || "connection problem"}. Nothing was changed.` });
      }
    }

    // The same email can sit on several families; move every copy together.
    const where = mid ? `email_message_id=eq.${encodeURIComponent(mid)}` : `id=eq.${id}`;
    await sb(`${table}?${where}`, { method: "PATCH", body: JSON.stringify({ mailbox_folder: to }) });
    if (to !== "inbox") {
      await sb(`${table}?${where}&read_at=is.null`, { method: "PATCH", body: JSON.stringify({ read_at: new Date().toISOString() }) });
    }
    return res.status(200).json({ ok: true, inTitan });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Couldn't move that email." });
  }
}
