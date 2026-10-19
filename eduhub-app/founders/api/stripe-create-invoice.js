import { rpc, sb, staffFor, stripe, toMinor } from "./_lib/stripe.js";

// Vercel serverless function -- a consultant presses "Invoice the family" on an
// open accounting record. Stripe makes and emails the invoice.
//
// WHAT THE AMOUNT COMES FROM
//   The database (prepare_record_invoice: the children still on the record x
//   the flat fee). Nothing the browser sends is trusted for money; the browser
//   only says WHICH record. After Stripe finalises the invoice the amount is
//   checked again against the database before the record moves to "invoiced".
//
// IF SOMETHING FAILS
//   Before the record is saved as invoiced, any invoice already made in Stripe
//   is voided so a family is never left holding an invoice we have no record of.
//
// ENV (founders Vercel project): STRIPE_SECRET_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY.
// Optional: STRIPE_INVOICE_DAYS_DUE (default 7).

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let stripeInvoiceId = null;
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const staff = await staffFor(token);
    if (!staff) return res.status(401).json({ error: "Please sign in again." });

    const recordId = req.body?.recordId;
    if (!recordId) return res.status(400).json({ error: "Which record is this for?" });

    // What to charge, straight from the database. Refuses if the record is not open.
    const plan = await rpc("prepare_record_invoice", { p_record_id: recordId });
    if (!plan.email) return res.status(400).json({ error: "This family has no email on their account, so there is nowhere to send the invoice." });
    const currency = String(plan.currency || "AED").toLowerCase();

    // Reused if the family has been invoiced before.
    let customerId = plan.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe(
        "POST",
        "customers",
        { email: plan.email, name: plan.name, metadata: { family_id: plan.family_id } },
        `hhe-customer-${plan.family_id}`
      );
      customerId = customer.id;
    }

    // A voided invoice earlier on the same record needs a fresh idempotency key.
    const earlier = await sb(`parent_invoices?record_id=eq.${recordId}&select=id`);
    const attempt = earlier.length + 1;
    const key = (step) => `hhe-record-${recordId}-${attempt}-${step}`;

    const days = Number(process.env.STRIPE_INVOICE_DAYS_DUE) || 7;
    const invoice = await stripe(
      "POST",
      "invoices",
      {
        customer: customerId,
        collection_method: "send_invoice",
        days_until_due: days,
        currency,
        // Never sweep up anything else waiting on this customer.
        pending_invoice_items_behavior: "exclude",
        description: "Heather Harries Education Hub: school application support",
        metadata: { record_id: recordId, family_id: plan.family_id },
      },
      key("invoice")
    );
    stripeInvoiceId = invoice.id;

    for (const [i, line] of plan.lines.entries()) {
      await stripe(
        "POST",
        "invoiceitems",
        {
          customer: customerId,
          invoice: invoice.id,
          currency,
          amount: toMinor(line.amount),
          description: `Application support: ${line.child}`,
        },
        key(`item-${i}`)
      );
    }

    const finalised = await stripe("POST", `invoices/${invoice.id}/finalize`, {}, key("finalize"));

    // Belt and braces: what Stripe will collect must equal what the database says.
    if (finalised.amount_due !== toMinor(plan.total) || String(finalised.currency).toLowerCase() !== currency) {
      throw new Error("Stripe's invoice total did not match the record, so it was cancelled. Nothing was sent.");
    }

    await rpc("record_stripe_invoice_created", {
      p_record_id: recordId,
      p_stripe_invoice_id: finalised.id,
      p_stripe_customer_id: customerId,
      p_livemode: !!finalised.livemode,
      p_amount: plan.total,
      p_hosted_invoice_url: finalised.hosted_invoice_url || null,
      p_invoice_pdf_url: finalised.invoice_pdf || null,
      p_due_date: finalised.due_date ? new Date(finalised.due_date * 1000).toISOString().slice(0, 10) : null,
      p_actor: staff.user_id,
    });
    stripeInvoiceId = null; // saved: from here on it is a real invoice

    // Stripe emails the family their invoice with the pay link. A failure here
    // does not undo the invoice; the link is on the Client website too.
    let emailed = true;
    try {
      await stripe("POST", `invoices/${finalised.id}/send`, {}, key("send"));
    } catch {
      emailed = false;
    }

    return res.status(200).json({
      ok: true,
      amount: plan.total,
      currency: plan.currency,
      hostedInvoiceUrl: finalised.hosted_invoice_url,
      emailed,
    });
  } catch (err) {
    if (stripeInvoiceId) {
      try {
        await stripe("POST", `invoices/${stripeInvoiceId}/void`, {});
      } catch {
        // If this fails too the invoice stays a draft/open in Stripe; staff can void it there.
      }
    }
    return res.status(err.status || 500).json({ error: err.message || "Couldn't create the invoice." });
  }
}
