// Vercel serverless function — receives ImprovMX's webhook POST for mail
// sent to *@applications.heatherharries.com and logs it against the right
// family (addendum 7 + 49's log_application_email).
//
// Why this exists (September 2026 change request)
// -------------------------------------------------------------------------
// addendum 7 was written assuming Cloudflare Email Routing + a Cloudflare
// Email Worker (backend/utilities/cloudflare-application-email-worker.js,
// now retired). The actual mail provider in use is ImprovMX, which works
// differently: instead of running a Worker per inbound message, you point
// an alias's "Forwards to" field at a URL and ImprovMX POSTs the parsed
// email there as JSON. Because ImprovMX also lets one alias forward to
// MULTIPLE comma-separated destinations (emails and/or webhooks) at once,
// this function only needs to log the email -- ImprovMX itself keeps
// forwarding it to relocate@heatherharries.com in parallel, so nothing
// about the "get the mail into the real inbox" half of this changes.
//
// One real behaviour change from the Cloudflare design: that Worker could
// SUPPRESS forwarding for a deactivated alias. ImprovMX's forwarding rule
// doesn't know about our database's active/inactive flag, so a deactivated
// alias's mail still reaches relocate@heatherharries.com -- it's just also
// correctly logged as such. Deactivating an alias in the app is now purely
// a record-keeping flag, not a mail block. If that block is ever needed,
// it would mean giving that one alias its own ImprovMX rule pointed only at
// this webhook (no email destination) -- not something this function does
// on its own.
//
// SETUP:
//   1. In ImprovMX, open applications.heatherharries.com's Aliases, find the
//      catch-all alias ("*") -- ImprovMX creates one by default -- and set
//      its "Forwards to" field to:
//        relocate@heatherharries.com, https://hhe-founders.vercel.app/api/application-email-webhook?key=<APPLICATION_EMAIL_WEBHOOK_SECRET>
//      (comma-separated: the real inbox AND this webhook, both fire on every
//      inbound message).
//   2. In the founders Vercel project -> Settings -> Environment Variables,
//      add (Production, and Preview if you test there):
//        SUPABASE_URL                      -- same value as VITE_SUPABASE_URL
//        SUPABASE_SERVICE_ROLE_KEY         -- Supabase dashboard -> Settings -> API
//                                             (service_role, NOT the anon key --
//                                             never put this one in VITE_ vars)
//        APPLICATION_EMAIL_WEBHOOK_SECRET  -- any random string you make up
//   3. Use that same secret in the ImprovMX URL's ?key= above. Redeploy after
//      adding the env vars so this function can see them.
//   4. Test by emailing any address at applications.heatherharries.com and
//      checking the family's Emails tab.
//
// Never logs a raw request body anywhere -- it can contain a school's full
// message.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  if (req.query.key !== process.env.APPLICATION_EMAIL_WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body || {};
  // ImprovMX's "to" field is an array of { name, email } -- the alias that
  // was actually dialled is the local part before the @.
  const toEmail = Array.isArray(body.to) ? body.to[0]?.email : null;
  const alias = toEmail ? toEmail.split("@")[0].toLowerCase() : null;

  if (!alias) {
    // Nothing we can log against -- still 200 so ImprovMX doesn't retry
    // forever over a message it will never be able to route.
    res.status(200).json({ logged: false, reason: "no alias in payload" });
    return;
  }

  try {
    const supaRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/log_application_email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        p_alias: alias,
        p_from: body.from?.email || "(unknown sender)",
        p_subject: body.subject || "(no subject)",
        p_snippet: (body.text || "").replace(/\s+/g, " ").trim().slice(0, 400),
      }),
    });

    if (!supaRes.ok) {
      console.error("log_application_email failed", supaRes.status, await supaRes.text());
      res.status(200).json({ logged: false });
      return;
    }

    res.status(200).json({ logged: true });
  } catch (err) {
    console.error("application-email-webhook error", err);
    // Still 200: this only logs a case note. It never affects whether the
    // school's email itself gets through -- ImprovMX forwards that
    // independently, in parallel, regardless of what happens here.
    res.status(200).json({ logged: false });
  }
}
