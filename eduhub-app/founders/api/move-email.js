// Delete / Archive / Report spam / Restore on the Emails tab, kept in step with Titan.
//
// POST /api/move-email  { kind: "note" | "unmatched", id, to: "trash" | "archive" | "spam" | "inbox" | "flag" | "unflag" }
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

// Find the email in Titan: by Message-ID first; ImprovMX's forwarded copy can carry a
// different one, so fall back to the same subject within 15 minutes of the website's copy.
async function locate(client, row, sources) {
  const found = [];
  const bare = String(row.email_message_id || "").replace(/^<|>$/g, "");
  if (bare) {
    for (const box of sources) {
      const lock = await client.getMailboxLock(box.path);
      try {
        const uids = await client.search({ header: { "message-id": bare } }, { uid: true });
        if (uids && uids.length) found.push({ path: box.path, uids });
      } finally {
        lock.release();
      }
    }
  }
  if (found.length) return found;

  const when = new Date(row.occurred_at || row.received_at || 0).getTime();
  const subject = String(row.subject || "").trim();
  if (!when || !subject) return [];
  const norm = (t) => String(t || "").replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "").trim().toLowerCase();
  let best = null;
  for (const box of sources) {
    const lock = await client.getMailboxLock(box.path);
    try {
      const uids = await client.search(
        { subject: subject.slice(0, 80), since: new Date(when - 86_400_000), before: new Date(when + 2 * 86_400_000) },
        { uid: true }
      );
      if (!uids || !uids.length) continue;
      for await (const m of client.fetch(uids.join(","), { envelope: true, internalDate: true }, { uid: true })) {
        if (norm(m.envelope?.subject) !== norm(subject)) continue;
        const diff = Math.abs(new Date(m.internalDate || m.envelope?.date || 0).getTime() - when);
        if (diff <= 15 * 60_000 && (!best || diff < best.diff)) best = { diff, path: box.path, uid: m.uid };
      }
    } finally {
      lock.release();
    }
  }
  return best ? [{ path: best.path, uids: [best.uid] }] : [];
}

// act: { move: "trash" | ... } or { flag: true | false }. Returns how many messages were changed.
async function inTitan(row, act) {
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
    const target = act.move ? boxes.find(KINDS[act.move]) : null;
    if (act.move && !target) throw new Error(`Titan has no ${act.move} folder to move it to.`);
    const sources = ["inbox", "sent", "spam", "archive", "trash"]
      .map((k) => boxes.find(KINDS[k]))
      .filter((b) => b && (!target || b.path !== target.path));
    const hits = await locate(client, row, sources);
    let n = 0;
    for (const h of hits) {
      const lock = await client.getMailboxLock(h.path);
      try {
        if (act.move) await client.messageMove(h.uids.join(","), target.path, { uid: true });
        else if (act.flag) await client.messageFlagsAdd(h.uids.join(","), ["\\Flagged"], { uid: true });
        else await client.messageFlagsRemove(h.uids.join(","), ["\\Flagged"], { uid: true });
        n += h.uids.length;
      } finally {
        lock.release();
      }
    }
    return n;
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
    if (!table || !id || !["trash", "archive", "spam", "inbox", "flag", "unflag"].includes(to)) return res.status(400).json({ error: "Bad request." });

    const timeCol = table === "unmatched_emails" ? "received_at" : "occurred_at";
    const [row] = await sb(`${table}?id=eq.${id}&select=id,email_message_id,subject,${timeCol}`);
    if (!row) return res.status(404).json({ error: "That email was not found." });
    const mid = row.email_message_id || "";

    let found = null;
    {
      if (!process.env.TITAN_EMAIL || !process.env.TITAN_PASSWORD) {
        return res.status(503).json({ error: "Moving emails in Titan isn't set up yet (TITAN_EMAIL and TITAN_PASSWORD are missing on Vercel)." });
      }
      try {
        found = (await inTitan(row, to === "flag" || to === "unflag" ? { flag: to === "flag" } : { move: to })) > 0;
      } catch (e) {
        return res.status(502).json({ error: `Titan wouldn't move it: ${e?.message || "connection problem"}. Nothing was changed.` });
      }
    }

    // The same email can sit on several families; move every copy together.
    const where = mid ? `email_message_id=eq.${encodeURIComponent(mid)}` : `id=eq.${id}`;
    if (to === "flag" || to === "unflag") {
      await sb(`${table}?${where}`, { method: "PATCH", body: JSON.stringify({ flagged: to === "flag" }) });
      return res.status(200).json({ ok: true, inTitan: found });
    }
    await sb(`${table}?${where}`, { method: "PATCH", body: JSON.stringify({ mailbox_folder: to }) });
    if (to !== "inbox") {
      await sb(`${table}?${where}&read_at=is.null`, { method: "PATCH", body: JSON.stringify({ read_at: new Date().toISOString() }) });
    }
    return res.status(200).json({ ok: true, inTitan: found });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Couldn't move that email." });
  }
}
