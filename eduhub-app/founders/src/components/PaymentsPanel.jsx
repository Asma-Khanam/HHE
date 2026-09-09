import { useMemo, useState } from "react";
import { createPayment, updatePayment, deletePayment, createPackagePayments } from "../lib/staffData";
import { getSignedUrl } from "../lib/documents";
import { daysUntil } from "../lib/workflow";
import { packageLabel, computePackageFees } from "../data/packages";
import "./panels.css";

function formatMoney(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "";
  return `${currency || "AED"} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dueLabel(dueDate) {
  const d = daysUntil(dueDate);
  if (d === null) return "no due date";
  if (d === 0) return "due today";
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
  if (d === 1) return "due tomorrow";
  return `due in ${d} days`;
}

function statusLabel(payment) {
  if (payment.status === "paid") return "paid";
  if (payment.status === "waived") return "waived";
  if (payment.status === "submitted") return "receipt uploaded — awaiting confirmation";
  return dueLabel(payment.due_date);
}

// Per-family fees and deposits (addendums 9 + 11) — a founder adds what's
// owed, the family uploads a receipt from their own dashboard once they've
// paid (status flips to "submitted"), and a founder confirms or rejects it
// here. The database itself refuses anything else a family might try to
// change on a payment row — this panel is just the staff side of the same
// flow the client's Payments card drives.
export default function PaymentsPanel({ familyId, payments: initialPayments, membershipType, childCount }) {
  const [payments, setPayments] = useState(initialPayments || []);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const needsAttention = payments.filter((p) => p.status === "unpaid" || p.status === "submitted");
  const settled = payments.filter((p) => p.status === "paid" || p.status === "waived");

  // What createPackagePayments would add for the family's current package —
  // only the fees that don't already exist as a payment row (matched by
  // label, since that's what a re-run would also produce). Recomputes
  // whenever the package or child count changes, e.g. after adding a child.
  const missingPackageFees = useMemo(() => {
    if (!membershipType) return [];
    const existingLabels = new Set(payments.map((p) => p.label));
    return computePackageFees(membershipType, childCount).filter((fee) => !existingLabels.has(fee.label));
  }, [membershipType, childCount, payments]);

  async function handleGeneratePackageFees() {
    setGenerating(true);
    setError("");
    try {
      const created = await createPackagePayments({ familyId, fees: missingPackageFees });
      setPayments((list) => [...list, ...created]);
    } catch (err) {
      setError(err.message || "Couldn't add those payments.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setError("");
    try {
      const created = await createPayment({ familyId, label: label.trim(), amount, dueDate });
      setPayments((list) => [...list, created]);
      setLabel("");
      setAmount("");
      setDueDate("");
      setAdding(false);
    } catch (err) {
      setError(err.message || "Couldn't add that payment.");
    } finally {
      setBusy(false);
    }
  }

  async function apply(payment, changes) {
    const previous = payments;
    setPayments((list) => list.map((p) => (p.id === payment.id ? { ...p, ...changes } : p)));
    try {
      const updated = await updatePayment(payment.id, changes);
      setPayments((list) => list.map((p) => (p.id === payment.id ? updated : p)));
    } catch (err) {
      setError(err.message || "Couldn't update that payment.");
      setPayments(previous);
    }
  }

  async function handleViewReceipt(payment) {
    setError("");
    try {
      const url = await getSignedUrl(payment.receipt_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message || "Couldn't open that file.");
    }
  }

  async function handleReject(payment) {
    // Back to unpaid so the family can try again — clearing the old
    // receipt so it's obvious a fresh one is expected, not the rejected one.
    await apply(payment, { status: "unpaid", receipt_path: null, submitted_at: null });
  }

  async function handleDelete(payment) {
    const previous = payments;
    setPayments((list) => list.filter((p) => p.id !== payment.id));
    try {
      await deletePayment(payment.id);
    } catch (err) {
      setError(err.message || "Couldn't remove that payment.");
      setPayments(previous);
    }
  }

  function renderPayment(payment) {
    const overdue = payment.status === "unpaid" && daysUntil(payment.due_date) !== null && daysUntil(payment.due_date) < 0;
    return (
      <li key={payment.id} className={"task-row" + (payment.status === "paid" || payment.status === "waived" ? " is-done" : "")}>
        <button
          type="button"
          className={"task-check" + (payment.status === "paid" ? " is-checked" : "")}
          onClick={() => apply(payment, { status: payment.status === "unpaid" || payment.status === "submitted" ? "paid" : "unpaid" })}
          aria-label={payment.status === "paid" ? "Mark unpaid" : "Mark paid"}
          title={payment.status === "waived" ? "Waived" : "Toggle paid — for cash/manual confirmation without a receipt"}
        >
          {payment.status === "paid" ? "✓" : payment.status === "waived" ? "–" : ""}
        </button>
        <div className="task-row-text">
          <div className="task-row-title">
            {payment.label}
            {formatMoney(payment.amount, payment.currency) && (
              <span className="doc-row-tag doc-row-tag-muted" style={{ marginLeft: 8 }}>
                {formatMoney(payment.amount, payment.currency)}
              </span>
            )}
          </div>
          <div className={"task-row-meta" + (overdue ? " is-overdue" : "") + (payment.status === "submitted" ? " is-overdue" : "")}>
            {statusLabel(payment)}
          </div>
        </div>

        <span className="task-row-actions">
          {payment.status === "submitted" && (
            <>
              <button type="button" className="panel-btn" onClick={() => handleViewReceipt(payment)}>
                View receipt
              </button>
              <button
                type="button"
                className="panel-btn panel-btn-primary"
                onClick={() => apply(payment, { status: "paid" })}
              >
                Confirm
              </button>
              <button type="button" className="panel-btn panel-btn-quiet" onClick={() => handleReject(payment)}>
                Reject
              </button>
            </>
          )}
          {payment.status === "paid" && payment.receipt_path && (
            <button type="button" className="panel-btn panel-btn-quiet" onClick={() => handleViewReceipt(payment)}>
              View receipt
            </button>
          )}
          {payment.status === "unpaid" && (
            <button
              type="button"
              className="panel-btn panel-btn-quiet"
              onClick={() => apply(payment, { status: "waived" })}
              title="Waive this payment"
            >
              Waive
            </button>
          )}
          <button
            type="button"
            className="panel-btn panel-btn-quiet"
            onClick={() => handleDelete(payment)}
            title="Remove payment"
          >
            ✕
          </button>
        </span>
      </li>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          Payments
          {needsAttention.length > 0 && <span className="panel-count">{needsAttention.length}</span>}
        </h2>
        <button type="button" className="panel-btn" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Add payment"}
        </button>
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {missingPackageFees.length > 0 && (
        <div className="hh-form-banner">
          {packageLabel(membershipType)}:{" "}
          {missingPackageFees.map((f) => `${f.label.split("—")[1]?.trim() || f.label} (AED ${f.amount.toLocaleString()})`).join(", ")}{" "}
          not on file yet.{" "}
          <button
            type="button"
            className="panel-btn panel-btn-primary"
            onClick={handleGeneratePackageFees}
            disabled={generating}
            style={{ marginLeft: 8 }}
          >
            {generating ? "Adding…" : "+ Add to payments"}
          </button>
        </div>
      )}

      {needsAttention.length === 0 && settled.length === 0 ? (
        <p className="panel-hint">Nothing owed on file for this family yet.</p>
      ) : (
        <ul className="panel-list">
          {needsAttention.map(renderPayment)}
          {settled.map(renderPayment)}
        </ul>
      )}

      {adding && (
        <form className="panel-form" onSubmit={handleAdd}>
          <input
            type="text"
            className="panel-input panel-form-grow"
            placeholder="e.g. Registration fee"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
          <input
            type="number"
            step="0.01"
            className="panel-input"
            placeholder="Amount (AED)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input type="date" className="panel-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <button type="submit" className="panel-btn panel-btn-primary" disabled={busy || !label.trim()}>
            {busy ? "Adding…" : "Add"}
          </button>
        </form>
      )}
    </section>
  );
}
