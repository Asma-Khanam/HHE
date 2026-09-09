import { useEffect, useRef, useState } from "react";
import { submitPaymentProof, getReceiptUrl } from "../lib/payments";
import "./PaymentsCard.css";

function formatMoney(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "";
  return `${currency || "AED"} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function statusMeta(status) {
  if (status === "paid") return { label: "Confirmed by Heather Harries", tone: "good" };
  if (status === "waived") return { label: "Waived", tone: "muted" };
  if (status === "submitted") return { label: "Awaiting confirmation", tone: "pending" };
  return { label: "Awaiting payment", tone: "due" };
}

// Mirrors the Document Vault card: HHE lists what's owed, the family
// uploads proof once they've paid (bank transfer happens outside the app —
// nothing here moves money), and it shows up for founders to confirm. A row
// is only ever editable while it's still "unpaid" — once a receipt is
// submitted, the database itself refuses any further change from this side
// until a founder acts on it.
export default function PaymentsCard({ userId, payments }) {
  const [rows, setRows] = useState(payments || []);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const fileInputs = useRef({});

  // `rows` only starts as a copy of `payments` so an upload can flip a row
  // to "submitted" instantly without waiting on a full refetch. But that
  // means it also has to be kept in sync when the parent hands us a new
  // `payments` array (e.g. the dashboard's very first render happens before
  // the family's data has loaded, so this starts as [] and payments arrives
  // moments later as a prop update) — without this, that first empty
  // snapshot would stick forever and every real payment would just never
  // appear, no matter what the database actually has.
  useEffect(() => {
    setRows(payments || []);
  }, [payments]);

  async function handleFile(payment, file) {
    if (!file) return;
    setBusyId(payment.id);
    setError("");
    try {
      const updated = await submitPaymentProof({ userId, payment, file });
      setRows((list) => list.map((p) => (p.id === payment.id ? updated : p)));
    } catch (err) {
      setError(err.message || "Couldn't upload that receipt.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleViewReceipt(payment) {
    setError("");
    try {
      const url = await getReceiptUrl(payment.receipt_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message || "Couldn't open that file.");
    }
  }

  return (
    <div className="pay-card">
      <div className="pay-card-header">
        <h3>
          Payments <span className="pay-card-count">{rows.length}</span>
        </h3>
      </div>

      {error && <p className="pay-card-error">{error}</p>}

      {rows.length === 0 && <p className="pay-card-hint">No payments on file yet.</p>}

      <ul className="pay-card-list">
        {rows.map((payment) => {
          const meta = statusMeta(payment.status);
          return (
            <li key={payment.id} className="pay-card-row">
              <div className="pay-card-row-info">
                <div className="pay-card-row-label">{payment.label}</div>
                <div className="pay-card-row-tags">
                  {formatMoney(payment.amount, payment.currency) && (
                    <span className="pay-card-row-tag">{formatMoney(payment.amount, payment.currency)}</span>
                  )}
                  {payment.due_date && (
                    <span className="pay-card-row-tag pay-card-row-tag-muted">Due {formatDate(payment.due_date)}</span>
                  )}
                  <span className={`pay-card-row-status is-${meta.tone}`}>{meta.label}</span>
                </div>
              </div>

              <div className="pay-card-row-actions">
                {payment.status === "unpaid" && (
                  <>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      ref={(el) => (fileInputs.current[payment.id] = el)}
                      style={{ display: "none" }}
                      onChange={(e) => handleFile(payment, e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      className="pay-card-btn pay-card-btn-primary"
                      disabled={busyId === payment.id}
                      onClick={() => fileInputs.current[payment.id]?.click()}
                    >
                      {busyId === payment.id ? "Uploading…" : "Upload receipt"}
                    </button>
                  </>
                )}
                {(payment.status === "submitted" || payment.status === "paid") && payment.receipt_path && (
                  <button type="button" className="pay-card-btn" onClick={() => handleViewReceipt(payment)}>
                    View receipt
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
