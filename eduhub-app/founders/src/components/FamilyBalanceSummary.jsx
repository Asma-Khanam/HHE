import { useEffect, useState } from "react";
import { listFamilyApplicationFees, updateApplicationFee } from "../lib/staffData";
import { openBillingDocument, toBillingItem } from "../lib/billingDocument";
import { getSignedUrl } from "../lib/documents";
import "./FamilyBalanceSummary.css";

function money(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "";
  return `${currency || "AED"} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function day(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function childName(c) {
  return (c?.preferred_name || c?.first_name || (c?.full_name || "").split(" ")[0] || "").trim();
}

// The Invoices tab's running total, plus every school application fee from the
// Applications tab listed in one place (read-only here: you add, upload the
// invoice and send them from the Applications tab, and they appear here).
// Outstanding = unpaid package payments + unpaid application fees.
export default function FamilyBalanceSummary({ familyId, payments = [], billTo, onGoToApplications }) {
  const [fees, setFees] = useState(null);
  const [error, setError] = useState("");
  // One receipt for several children (Miss Lyndsay, 8 Oct 2026): families
  // tend to pay for all their children's application fees in one go. Tick
  // the fees that payment covers, pick the date and mark them paid together.
  const [selected, setSelected] = useState({});
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busyBulk, setBusyBulk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listFamilyApplicationFees(familyId)
      .then((rows) => !cancelled && setFees(rows))
      .catch(() => {
        if (!cancelled) {
          setFees([]);
          setError("Couldn't load the application fees.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  async function openInvoice(path) {
    try {
      window.open(await getSignedUrl(path), "_blank", "noopener,noreferrer");
    } catch {
      setError("Couldn't open that invoice.");
    }
  }

  function openDoc(kind, fee) {
    try {
      openBillingDocument({ kind, item: toBillingItem(fee, "fee"), billTo });
    } catch (err) {
      setError(err.message);
    }
  }

  async function markSelectedPaid() {
    const ids = Object.keys(selected).filter((id) => selected[id]);
    if (ids.length === 0) return;
    setBusyBulk(true);
    setError("");
    try {
      const paidAt = `${payDate}T12:00:00Z`;
      const updated = await Promise.all(
        ids.map((id) => updateApplicationFee(id, { status: "paid", paid_at: paidAt }))
      );
      setFees((rows) => (rows || []).map((f) => updated.find((u) => u.id === f.id) || f));
      setSelected({});
    } catch {
      setError("Couldn't mark those as paid. Please try again.");
    } finally {
      setBusyBulk(false);
    }
  }

  const feeRows = fees || [];
  const feePaid = (f) => f.status === "paid" || !!f.paid_at;
  const feeWaived = (f) => f.status === "waived";
  const owedFees = feeRows.filter((f) => !feePaid(f) && !feeWaived(f));
  const paidFees = feeRows.filter(feePaid);
  const owedPayments = payments.filter((p) => p.status === "unpaid" || p.status === "submitted");
  const paidPayments = payments.filter((p) => p.status === "paid");

  const sum = (rows) => rows.reduce((t, r) => t + (Number(r.amount) || 0), 0);
  const outstanding = sum(owedFees) + sum(owedPayments);
  const paid = sum(paidFees) + sum(paidPayments);
  const currency = payments[0]?.currency || feeRows[0]?.currency || "AED";

  return (
    <section className="panel fbs">
      <div className="panel-head">
        <h2>Balance</h2>
      </div>
      <div className="fbs-tiles">
        <div className="fbs-tile is-due">
          <span>Outstanding</span>
          <strong>{money(outstanding, currency)}</strong>
          <em>
            {owedPayments.length + owedFees.length} item{owedPayments.length + owedFees.length === 1 ? "" : "s"}
          </em>
        </div>
        <div className="fbs-tile is-paid">
          <span>Paid so far</span>
          <strong>{money(paid, currency)}</strong>
          <em>{paidPayments.length + paidFees.length} items</em>
        </div>
        <div className="fbs-tile">
          <span>Total billed</span>
          <strong>{money(outstanding + paid, currency)}</strong>
          <em>payments + school application fees</em>
        </div>
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <h3 className="fbs-sub">School application fees</h3>
      {(() => {
        const chosen = feeRows.filter((f) => selected[f.id] && !feePaid(f) && !feeWaived(f));
        if (chosen.length === 0 && owedFees.length < 2) return null;
        const total = chosen.reduce((t, f) => t + (Number(f.amount) || 0), 0);
        const ccy = chosen[0]?.currency || currency;
        return (
          <div className="fbs-bulk">
            <span className="fbs-bulk-text">
              {chosen.length === 0
                ? "Tick the fees one payment covers to mark them paid together."
                : `${chosen.length} fee${chosen.length === 1 ? "" : "s"} selected · ${money(total, ccy)}`}
            </span>
            <label className="fbs-bulk-date">
              <span>Paid on</span>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </label>
            <button
              type="button"
              className="panel-btn panel-btn-primary"
              disabled={chosen.length === 0 || busyBulk || !payDate}
              onClick={markSelectedPaid}
            >
              {busyBulk ? "Marking…" : "Mark selected as paid"}
            </button>
          </div>
        );
      })()}
      {fees === null ? (
        <p className="panel-hint">Loading…</p>
      ) : feeRows.length === 0 ? (
        <p className="panel-hint">
          None yet. Add one from the Applications tab, on the school's Application fee step.
        </p>
      ) : (
        <ul className="inv-list">
          {feeRows.map((f) => {
            const isPaid = feePaid(f);
            const dd = f.due_date ? new Date(f.due_date) : null;
            const overdue = !isPaid && !feeWaived(f) && dd && dd < new Date(new Date().toDateString());
            let chip = { text: "Awaiting payment", tone: "due" };
            if (isPaid) chip = { text: "Paid", tone: "paid" };
            else if (feeWaived(f)) chip = { text: "Waived", tone: "muted" };
            else if (overdue) chip = { text: "Overdue", tone: "over" };
            return (
              <li key={f.id} className={"inv-row" + (isPaid ? " is-done" : "")}>
                {!isPaid && !feeWaived(f) ? (
                  <label className="inv-tick" title="Include in a shared payment">
                    <input
                      type="checkbox"
                      checked={!!selected[f.id]}
                      onChange={(e) => setSelected((cur) => ({ ...cur, [f.id]: e.target.checked }))}
                    />
                  </label>
                ) : (
                  <span className="inv-tick is-empty" aria-hidden="true" />
                )}
                <span className={"inv-chip is-" + chip.tone}>{chip.text}</span>
                <div className="inv-main">
                  <div className="inv-title">
                    {f.application?.school?.name || "School"} · {childName(f.application?.child)}
                  </div>
                  <div className={"inv-meta" + (overdue ? " is-overdue" : "")}>
                    {f.label || "Application fee"}
                    {isPaid ? (f.paid_at ? ` · paid ${day(f.paid_at)}` : "") : f.due_date ? ` · due ${day(f.due_date)}` : ""}
                  </div>
                  <div className="inv-tags">
                    <span className={"inv-tag" + (f.sent_to_family_at ? " is-on" : "")}>
                      {f.sent_to_family_at ? "Sent to family" : "Not sent to family yet"}
                    </span>
                    {f.invoice_path ? <span className="inv-tag is-on">Invoice uploaded</span> : <span className="inv-tag">No invoice yet</span>}
                    {f.payment_url ? <span className="inv-tag is-on">Payment link added</span> : <span className="inv-tag">No payment link</span>}
                  </div>
                </div>
                <div className="inv-amount">{money(f.amount, f.currency)}</div>
                <span className="inv-actions">
                  {f.invoice_path && (
                    <button type="button" className="panel-btn" onClick={() => openInvoice(f.invoice_path)}>
                      View invoice
                    </button>
                  )}
                  <button type="button" className="panel-btn panel-btn-quiet" onClick={() => openDoc("invoice", f)}>
                    Invoice
                  </button>
                  {isPaid && (
                    <button type="button" className="panel-btn panel-btn-quiet" onClick={() => openDoc("receipt", f)}>
                      Receipt
                    </button>
                  )}
                  {onGoToApplications && (
                    <button type="button" className="panel-btn panel-btn-quiet" onClick={onGoToApplications}>
                      Edit in Applications
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
