// Cloudflare Email Worker — routes mail sent to *@applications.heatherharries.com
//
// What this does, in order, for every incoming message:
//   1. Reads who it was sent to (e.g. smith4821@applications.heatherharries.com)
//      and pulls out just "smith4821".
//   2. Calls the CRM's log_application_email() function in Supabase, which
//      looks up which family owns that alias, logs the email into that
//      family's case log automatically, and reports back whether the alias
//      is still active.
//   3. If it's active (or if the alias isn't recognised at all — fails open
//      on the side of not losing mail), forwards the original message on to
//      relocate@heatherharries.com untouched. If the family has deliberately
//      deactivated the alias, the message is logged for the record but not
//      forwarded.
//
// SETUP (do this after the DNS steps in the setup notes):
//   1. Cloudflare dashboard → your zone → Email → Email Routing → Email
//      Workers → Create Worker, paste this file in.
//   2. Settings → Variables for this Worker → add two secrets (encrypted,
//      not plain text): SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
//      The service_role key is the same one already used server-side
//      elsewhere for this project — NEVER put it in the founders/frontend
//      apps or in this file directly. Cloudflare secrets are the right home
//      for it, same category as an env var on a real server.
//   3. Email Routing → Routes → add a catch-all rule for
//      applications.heatherharries.com → "Send to a Worker" → this Worker.
//   4. Test by sending an email to something@applications.heatherharries.com
//      before pointing any real school application at it.

export default {
  async email(message, env, ctx) {
    const forwardTo = "relocate@heatherharries.com";

    // message.to is the full address that was actually dialled, e.g.
    // "smith4821@applications.heatherharries.com" — take just the local part.
    const alias = message.to.split("@")[0].toLowerCase();

    let shouldForward = true; // fail open: never silently swallow a real school email
    try {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/log_application_email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          p_alias: alias,
          p_from: message.from,
          p_subject: message.headers.get("subject") || "(no subject)",
          p_snippet: await extractSnippet(message),
        }),
      });

      if (res.ok) {
        // log_application_email returns a plain boolean — false only when
        // the alias exists and is deliberately marked inactive.
        const result = await res.json();
        shouldForward = result !== false;
      }
      // A non-OK response (network hiccup, Supabase briefly down) is treated
      // the same as "couldn't confirm" — still forward, because losing a
      // real school email is worse than one un-logged message.
    } catch (err) {
      // Same reasoning: log to Cloudflare's own Worker logs for later
      // debugging, but don't block the forward on it.
      console.error("log_application_email failed", err);
    }

    if (shouldForward) {
      await message.forward(forwardTo);
    } else {
      message.setReject("This application has been closed.");
    }
  },
};

// A short plain-text preview for the case log — not the full email body
// (which can be large, HTML, and isn't needed for "someone glancing at the
// timeline knows what came in"). Falls back gracefully if parsing fails.
async function extractSnippet(message) {
  try {
    const raw = await new Response(message.raw).text();
    const bodyStart = raw.indexOf("\r\n\r\n");
    const body = bodyStart >= 0 ? raw.slice(bodyStart + 4) : raw;
    return body.replace(/\s+/g, " ").trim().slice(0, 400);
  } catch {
    return "";
  }
}
