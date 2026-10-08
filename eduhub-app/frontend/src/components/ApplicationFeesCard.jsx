import { useState } from "react";
import { openBillingDocument, toBillingItem } from "../lib/billingDocument";
import { getSignedUrl } from "../lib/documents";
import "./ApplicationFeesCard.css";

function money(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "";
  return `${currency || "AED"} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function day(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// School application fees the team has sent over. Shows the invoice and a
// Pay now button (once a payment link has been added).
export default function ApplicationFeesCard({ fees = [], loadError = "", billTo }) {
  const [error, setError] = useState("");

  async function openInvoice(path) {
    try {
      window.open(await getSignedUrl(path), "_blank", "noopener");
    } catch {
      setError("Couldn't open the invoice.");
    }
  }

  function openDoc(kind, fee) {
    try {
      openBillingDocument({ kind, item: toBillingItem(fee, "fee"), billTo });
    } catch (err) {
      setError(err.message);
    }
  }

  if (fees.length === 0 && !error && !loadError) return null;

  return (
    <section className="appfee-card">
      <h3>Application fees</h3>
      {(error || loadError) && <p className="appfee-error">{error || loadError}</p>}
      <ul className="appfee-list">
        {fees.map((f) => {
          const paid = f.status === "paid" || !!f.paid_at;
          return (
            <li key={f.id} className="appfee-row">
              <div className="appfee-main">
                <strong>{f.application?.school?.name || "School"}</strong>
                <span className="appfee-sub">
                  {f.label || "Application fee"}
                  {f.due_date && !paid ? ` · due ${day(f.due_date)}` : ""}
                </span>
              </div>
              <div className="appfee-amount">{money(f.amount, f.currency)}</div>
              <div className="appfee-actions">
                {paid ? (
                  <span className="appfee-badge is-paid">Paid {f.paid_at ? day(f.paid_at) : ""}</span>
                ) : (
                  <span className="appfee-badge">Awaiting payment</span>
                )}
                {f.invoice_path && (
                  <button type="button" className="appfee-btn" onClick={() => openInvoice(f.invoice_path)}>
                    View invoice
                  </button>
                )}
                {!f.invoice_path && (
                  <button type="button" className="appfee-btn" onClick={() => openDoc("invoice", f)}>
                    Invoice
                  </button>
                )}
                {paid && (
                  <button type="button" className="appfee-btn" onClick={() => openDoc("receipt", f)}>
                    Receipt
                  </button>
                )}
                {!paid &&
                  (f.payment_url ? (
                    <a className="appfee-btn is-primary" href={f.payment_url} target="_blank" rel="noopener noreferrer">
                      Pay now
                    </a>
                  ) : (
                    <span className="appfee-soon">Payment link coming soon</span>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
