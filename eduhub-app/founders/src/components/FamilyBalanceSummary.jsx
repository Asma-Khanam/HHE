import { useEffect, useState } from "react";
import { listFamilyApplicationFees } from "../lib/staffData";
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
export default function FamilyBalanceSummary({ familyId, payments = [], onGoToApplications }) {
  const [fees, setFees] = useState(null);
  const [error, setError] = useState("");

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
      {fees === null ? (
        <p className="panel-hint">Loading…</p>
      ) : feeRows.length === 0 ? (
        <p className="panel-hint">
          None yet. Add one from the Applications tab, on the school's Application fee step.
        </p>
      ) : (
        <ul className="panel-list">
          {feeRows.map((f) => (
            <li key={f.id} className={"task-row" + (feePaid(f) ? " is-done" : "")}>
              <div className="task-row-text">
                <div className="task-row-title">
                  {f.application?.school?.name || "School"} · {childName(f.application?.child)}
                  {money(f.amount, f.currency) && (
                    <span className="doc-row-tag doc-row-tag-muted" style={{ marginLeft: 8 }}>
                      {money(f.amount, f.currency)}
                    </span>
                  )}
                </div>
                <div className="task-row-meta">
                  {f.label || "Application fee"}
                  {feePaid(f)
                    ? ` · paid ${f.paid_at ? day(f.paid_at) : ""}`
                    : f.due_date
                      ? ` · due ${day(f.due_date)}`
                      : ""}
                  {" · "}
                  {f.sent_to_family_at ? "sent to family" : "not sent to family yet"}
                  {f.payment_url ? " · payment link added" : ""}
                </div>
              </div>
              <span className="task-row-actions">
                {f.invoice_path && (
                  <button type="button" className="panel-btn panel-btn-quiet" onClick={() => openInvoice(f.invoice_path)}>
                    View invoice
                  </button>
                )}
                {onGoToApplications && (
                  <button type="button" className="panel-btn panel-btn-quiet" onClick={onGoToApplications}>
                    Open in Applications
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
