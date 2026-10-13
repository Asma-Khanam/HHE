// One-off: registers the Calendly webhook that points at the Consultant website.
//
//   CALENDLY_TOKEN=<personal access token> \
//   CALENDLY_WEBHOOK_SIGNING_KEY=<same value as in Vercel> \
//   node scripts/register-calendly-webhook.mjs
//
// Add --list to see existing webhooks, or --delete <uri> to remove one.
// The token is read from the environment only; it is never written anywhere.

const TOKEN = process.env.CALENDLY_TOKEN;
const KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
const URL_ = "https://hhe-founders.vercel.app/api/calendly-webhook";
if (!TOKEN) {
  console.error("Set CALENDLY_TOKEN first.");
  process.exit(1);
}
const api = (path, init = {}) =>
  fetch(`https://api.calendly.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init.headers || {}) },
  }).then(async (r) => {
    const t = await r.text();
    let j = null;
    try { j = t ? JSON.parse(t) : null; } catch { j = { raw: t }; }
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j)}`);
    return j;
  });

const me = (await api("/users/me")).resource;
const org = me.current_organization;
console.log("Calendly user:", me.name, "| organization:", org);

const args = process.argv.slice(2);
if (args[0] === "--list") {
  const l = await api(`/webhook_subscriptions?organization=${encodeURIComponent(org)}&scope=organization`);
  console.log(JSON.stringify(l.collection.map((w) => ({ uri: w.uri, url: w.callback_url, events: w.events, state: w.state })), null, 2));
  process.exit(0);
}
if (args[0] === "--delete" && args[1]) {
  await api(`/webhook_subscriptions/${args[1].split("/").pop()}`, { method: "DELETE" });
  console.log("Deleted.");
  process.exit(0);
}

if (!KEY) {
  console.error("Set CALENDLY_WEBHOOK_SIGNING_KEY (same value as in Vercel).");
  process.exit(1);
}
const out = await api("/webhook_subscriptions", {
  method: "POST",
  body: JSON.stringify({
    url: URL_,
    events: ["invitee.created", "invitee.canceled"],
    organization: org,
    scope: "organization",
    signing_key: KEY,
  }),
});
console.log("Registered:", out.resource.uri, "state:", out.resource.state);
