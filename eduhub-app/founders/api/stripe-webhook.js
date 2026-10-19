import crypto from "crypto";
import { rpc } from "./_lib/stripe.js";

// Vercel serverless function -- Stripe tells us an invoice was paid.
//
// This is the ONLY thing that ever marks a record paid. It trusts nothing it
// has not verified:
//   1. The request must carry a valid Stripe signature for the exact raw body
//      (made with STRIPE_WEBHOOK_SECRET) and be fresh (within 5 minutes).
//   2. The database then applies the event once only (event id), re-checks the
//      amount, currency and live/test mode against the invoice, and flags
//      anything that does not match instead of marking it paid (addendum 116).
// A failure to save returns 500 so Stripe retries; a flagged event still
// returns 200 (it is stored and needs a person, retrying would not help).
//
// SETUP (Stripe dashboard -> Developers -> Webhooks):
//   Endpoint URL: https://hhe-founders.vercel.app/api/stripe-webhook
//   Events: invoice.paid
//   Copy the "Signing secret" (whsec_...) into Vercel as STRIPE_WEBHOOK_SECRET.
//
// Never logs a request body.

export const config = { api: { bodyParser: false } };

const TOLERANCE_SECONDS = 300;

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString("utf8");
}

function verifySignature(raw, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i), p.slice(i + 1)];
    })
  );
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  // Stripe may send more than one v1 signature while a secret is being rolled.
  return header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .some((p) => {
      const sig = p.slice(3);
      return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: "Stripe webhook isn't set up yet (STRIPE_WEBHOOK_SECRET missing)." });

  const raw = await readRaw(req);
  if (!verifySignature(raw, req.headers["stripe-signature"], secret)) {
    return res.status(400).json({ error: "Bad signature." });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: "Bad body." });
  }

  // Only a paid invoice matters here. Anything else is acknowledged and ignored.
  if (event.type !== "invoice.paid") return res.status(200).json({ ignored: event.type });

  const invoice = event.data?.object || {};
  try {
    const result = await rpc("apply_stripe_invoice_paid", {
      p_event_id: event.id,
      p_event_type: event.type,
      p_livemode: !!event.livemode,
      p_stripe_invoice_id: invoice.id,
      p_amount_paid_minor: invoice.amount_paid ?? null,
      p_currency: invoice.currency || "",
      // Only what is needed to trace it; no card or bank details are ever in an invoice event.
      p_payload: {
        invoice: invoice.id,
        customer: invoice.customer,
        amount_paid: invoice.amount_paid,
        amount_due: invoice.amount_due,
        currency: invoice.currency,
        status: invoice.status,
        number: invoice.number,
      },
    });
    return res.status(200).json(result);
  } catch (err) {
    // Not saved: ask Stripe to send it again.
    return res.status(500).json({ error: err.message || "Couldn't save the event." });
  }
}
