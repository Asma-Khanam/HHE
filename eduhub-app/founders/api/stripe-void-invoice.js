import { SB, sb, staffFor, stripe } from "./_lib/stripe.js";

// Vercel serverless function -- a consultant voids an invoice that has not
// been paid (wrong children on it, family asked for a change). Stripe is
// voided FIRST so the family can no longer pay it, then our record goes back
// to "open" (void_record_invoice, addendum 116) so it can be invoiced again.
//
// An invoice Stripe already shows as paid is never voided here.
// ENV: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const staff = await staffFor(token);
    if (!staff) return res.status(401).json({ error: "Please sign in again." });

    const { recordId, reason } = req.body || {};
    if (!recordId) return res.status(400).json({ error: "Which record is this for?" });

    const rows = await sb(
      `parent_invoices?record_id=eq.${recordId}&status=in.(open,needs_review)&select=stripe_invoice_id,status`
    );
    const live = rows[0];
    if (!live) return res.status(400).json({ error: "There is no unpaid invoice on this record to void." });

    const current = await stripe("GET", `invoices/${live.stripe_invoice_id}`);
    if (current.status === "paid") {
      return res.status(409).json({ error: "Stripe shows this invoice as paid, so it cannot be voided. Refresh the page." });
    }
    if (current.status !== "void") {
      await stripe("POST", `invoices/${live.stripe_invoice_id}/void`, {});
    }

    // Our side, run as the consultant so the database knows who did it.
    const dbRes = await fetch(`${SB()}/rest/v1/rpc/void_record_invoice`, {
      method: "POST",
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_record_id: recordId, p_reason: reason || null }),
    });
    if (!dbRes.ok) {
      const body = await dbRes.json().catch(() => ({}));
      return res.status(500).json({
        error: `Stripe voided the invoice but the record did not update (${body.message || dbRes.status}). Press Void again to finish.`,
      });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Couldn't void the invoice." });
  }
}
