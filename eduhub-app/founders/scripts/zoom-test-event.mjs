// Sends a pretend "meeting summary completed" event to the live Zoom webhook,
// signed the same way Zoom signs it, so the whole path can be tested without a
// real Zoom call: signature check, finding the family, saving the note and the
// zoom_webhook_log row.
//
// Usage (the secret is the ZOOM_WEBHOOK_SECRET_TOKEN from Vercel; it is read
// from your terminal and never stored in this file):
//   read -s ZOOM_WEBHOOK_SECRET_TOKEN; export ZOOM_WEBHOOK_SECRET_TOKEN
//   node scripts/zoom-test-event.mjs <zoom meeting id linked on a TEST family>
import crypto from "crypto";

const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
const meetingId = (process.argv[2] || "").replace(/\D/g, "");
const url = process.env.WEBHOOK_URL || "https://hhe-founders.vercel.app/api/zoom-webhook";
if (!secret || !meetingId) {
  console.error("Needs ZOOM_WEBHOOK_SECRET_TOKEN in the environment and a meeting id as the first argument.");
  process.exit(1);
}

const raw = JSON.stringify({
  event: "meeting.summary_completed",
  event_ts: Date.now(),
  payload: {
    account_id: "TEST",
    object: {
      meeting_id: Number(meetingId),
      meeting_uuid: `TEST-${crypto.randomUUID()}`,
      meeting_topic: "TEST: webhook check",
      meeting_start_time: new Date(Date.now() - 30 * 60000).toISOString(),
      summary_overview: "Test summary — café, school visits and applications.",
      summary_details: [{ label: "Test", summary: "This note was sent by scripts/zoom-test-event.mjs. You can delete it." }],
      next_steps: ["Check this appears on the Meetings tab"],
    },
  },
});
const ts = String(Math.floor(Date.now() / 1000));
const sig = "v0=" + crypto.createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex");

const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "x-zm-request-timestamp": ts, "x-zm-signature": sig },
  body: raw,
});
console.log(res.status, await res.text());
