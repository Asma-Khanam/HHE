// Sends a fake, correctly signed Calendly booking to the live webhook, so the
// whole path (signature check -> Supabase -> Consultations page) can be tested
// without making a real Calendly booking.
//
//   CALENDLY_WEBHOOK_SIGNING_KEY=<same value as in Vercel> \
//   node scripts/send-test-calendly-event.mjs            (a booking)
//   ... node scripts/send-test-calendly-event.mjs cancel   (cancels that booking)
//   ... node scripts/send-test-calendly-event.mjs paid     (a booking with a USD 100 payment)
//
// Optional: TEST_EMAIL=<a parent's email in the CRM> to test the auto-link.
// The test row is labelled "TEST consult (delete after)"; remove it from the
// calendly_bookings table when done.

import crypto from "crypto";

const KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
const URL_ = process.env.WEBHOOK_URL || "https://hhe-founders.vercel.app/api/calendly-webhook";
if (!KEY) {
  console.error("Set CALENDLY_WEBHOOK_SIGNING_KEY first.");
  process.exit(1);
}
const mode = process.argv[2] || "book";
const email = process.env.TEST_EMAIL || "test.family@example.com";
const start = new Date(Date.now() + 14 * 24 * 3600 * 1000);
start.setUTCHours(6, 30, 0, 0); // 10:30 Dubai
const end = new Date(start.getTime() + 30 * 60 * 1000);

const payload = {
  uri: "https://api.calendly.com/scheduled_events/TEST-EVENT/invitees/TEST-INVITEE",
  email,
  name: "Test Family (delete after)",
  text_reminder_number: "+971500000000",
  questions_and_answers: [
    { question: "Whatsapp Number?", answer: "+971500000000" },
    { question: "What would you like to discuss on the Call?", answer: "Relocating from the UK to Dubai in January with two children." },
    { question: "Students year group", answer: "Year 6 and Year 9" },
  ],
  scheduled_event: {
    name: "TEST consult (delete after)",
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    location: { type: "zoom", join_url: "https://us06web.zoom.us/j/86280117948" },
    event_memberships: [{ user_name: "Heather Harries" }],
  },
  payment: mode === "paid" ? { amount: 100, currency: "USD", successful: true, provider: "stripe" } : null,
  cancellation: mode === "cancel" ? { reason: "Test cancellation" } : undefined,
};

const event = mode === "cancel" ? "invitee.canceled" : "invitee.created";
const raw = JSON.stringify({ event, payload });
const t = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac("sha256", KEY).update(`${t}.${raw}`).digest("hex");

const res = await fetch(URL_, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Calendly-Webhook-Signature": `t=${t},v1=${sig}` },
  body: raw,
});
console.log(event, "->", res.status, await res.text());
