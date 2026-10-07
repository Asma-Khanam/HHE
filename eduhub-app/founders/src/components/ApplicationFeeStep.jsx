import { useRef, useState } from "react";
import AutosaveField from "./Autosave";
import { createApplicationFee, updateApplicationFee, uploadFeeInvoice } from "../lib/staffData";
import { getSignedUrl } from "../lib/documents";
import { shortDate } from "../lib/placement";
import "./ApplicationFeeStep.css";

const today = () => new Date().toISOString().slice(0, 10);

function money(fee) {
  if (fee.amount === null || fee.amount === undefined || fee.amount === "") return "No amount yet";
  return `${fee.currency || "AED"} ${Number(fee.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The "Application fee" step, between Apply and Assessment (Miss Lyndsay,
// 7 Oct 2026): what the fee is, when it was paid, the invoice file, and a
// button that puts it on the family's Billing page. Everything saves itself.
export default function ApplicationFeeStep({ application, fees, familyUserId, onFeesChange, onLog }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const fileInputs = useRef({});

  const replace = (saved) => onFeesChange((list) => list.map((f) => (f.id === saved.id ? saved : f)));

  async function patchFee(fee, changes) {
    try {
      setError("");
      const saved = await updateApplicationFee(fee.id, changes);
      replace(saved);
      return saved;
    } catch {
      setError("Couldn't save that. Check your connection and try again.");
      return null;
    }
  }

  async function addFee() {
    setBusy("add");
    setError("");
    try {
      const row = await createApplicationFee({ applicationId: application.id, label: "Application fee", currency: "AED" });
      onFeesChange((list) => [...list, row]);
      onLog?.("Application fee added", "fee_invoiced");
    } catch {
      setError("Couldn't add the fee. Please try again.");
    } finally {
      setBusy("");
    }
  }

  async function handleInvoice(fee, file) {
    if (!file) return;
    setBusy(`inv-${fee.id}`);
    setError("");
    try {
      const saved = await uploadFeeInvoice({ familyUserId, fee, file });
      replace(saved);
      onLog?.(`Invoice uploaded for ${fee.label}`, "fee_invoiced");
    } catch (err) {
      setError(err.message || "Couldn't upload that invoice.");
    } finally {
      setBusy("");
    }
  }

  async function viewInvoice(fee) {
    try {
      window.open(await getSignedUrl(fee.invoice_path), "_blank", "noopener");
    } catch {
      setError("Couldn't open that invoice.");
    }
  }

  async function send(fee) {
    const saved = await patchFee(fee, { sent_to_family_at: new Date().toISOString() });
    if (saved) onLog?.(`${fee.label} sent to the family's dashboard`, "fee_invoiced");
  }

  async function markPaid(fee, date) {
    const saved = await patchFee(fee, date ? { status: "paid", paid_at: `${date}T12:00:00Z` } : { status: "unpaid", paid_at: null });
    if (saved && date) onLog?.(`${fee.label} paid on ${shortDate(date)}`, "fee_paid");
  }

  return (
    <div className="afs">
      {fees.length === 0 && <p className="ps-hint">No application fee yet. Add it when the school sends its invoice.</p>}

      {fees.map((fee) => {
        const paid = fee.status === "paid";
        const waived = fee.status === "waived";
        const sent = !!fee.sent_to_family_at;
        return (
          <div key={fee.id} className={"afs-fee" + (paid ? " is-paid" : "")}>
            <div className="afs-head">
              <strong>{fee.label}</strong>
              <span className="afs-amount">{money(fee)}</span>
              <span className={"afs-pill " + (paid ? "is-paid" : waived ? "is-waived" : "is-due")}>
                {paid ? `Paid${fee.paid_at ? " " + shortDate(String(fee.paid_at).slice(0, 10)) : ""}` : waived ? "Waived" : "Unpaid"}
              </span>
              {fee.source === "openapply_sync" && <span className="afs-source">From OpenApply</span>}
            </div>

            <div className="afs-grid">
              <AutosaveField
                label="Name of the fee"
                value={fee.label}
                onSave={async (v) => !!(await patchFee(fee, { label: v || "Application fee" }))}
              />
              <AutosaveField
                label="Amount (AED)"
                type="number"
                value={fee.amount === null || fee.amount === undefined ? "" : String(fee.amount)}
                onSave={async (v) => !!(await patchFee(fee, { amount: v === null || v === "" ? null : Number(v) }))}
              />
              <label className="ps-field">
                <span>Due date</span>
                <input
                  type="date"
                  className="panel-input"
                  value={fee.due_date ? String(fee.due_date).slice(0, 10) : ""}
                  onChange={(e) => patchFee(fee, { due_date: e.target.value || null })}
                />
              </label>
              <label className="ps-field">
                <span>Date paid</span>
                <input
                  type="date"
                  className="panel-input"
                  value={paid && fee.paid_at ? String(fee.paid_at).slice(0, 10) : ""}
                  onChange={(e) => markPaid(fee, e.target.value || null)}
                />
              </label>
            </div>
            {!paid && !waived && (
              <button type="button" className="apx-link" onClick={() => markPaid(fee, today())}>
                Mark as paid today
              </button>
            )}

            <div className="afs-invoice">
              <span className="afs-label">Invoice</span>
              {fee.invoice_path ? (
                <>
                  <button type="button" className="apx-link" onClick={() => viewInvoice(fee)}>
                    {fee.invoice_name || "View invoice"} ↗
                  </button>
                  <button type="button" className="apx-link" onClick={() => fileInputs.current[fee.id]?.click()}>
                    Replace
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="panel-btn"
                  disabled={busy === `inv-${fee.id}`}
                  onClick={() => fileInputs.current[fee.id]?.click()}
                >
                  {busy === `inv-${fee.id}` ? "Uploading…" : "Upload invoice"}
                </button>
              )}
              <input
                ref={(el) => (fileInputs.current[fee.id] = el)}
                type="file"
                accept=".pdf,image/*"
                hidden
                onChange={(e) => {
                  handleInvoice(fee, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>

            <AutosaveField
              label="Payment link (add when it's ready)"
              placeholder="https://…"
              value={fee.payment_url}
              onSave={async (v) => !!(await patchFee(fee, { payment_url: v }))}
            />

            <div className="afs-send">
              {sent ? (
                <>
                  <span className="afs-sent">✓ On the family&apos;s dashboard since {shortDate(String(fee.sent_to_family_at).slice(0, 10))}</span>
                  <button type="button" className="apx-link" onClick={() => patchFee(fee, { sent_to_family_at: null })}>
                    Hide from the family
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="panel-btn panel-btn-primary"
                    disabled={paid || fee.amount === null || fee.amount === undefined}
                    onClick={() => send(fee)}
                  >
                    Send to family dashboard
                  </button>
                  <span className="ps-hint">
                    {fee.amount === null || fee.amount === undefined
                      ? "Add the amount first."
                      : paid
                      ? "Already paid."
                      : "The family sees the amount, the invoice and the payment link on their Billing page."}
                  </span>
                </>
              )}
            </div>
          </div>
        );
      })}

      {error && <p className="afs-error">{error}</p>}
      <div className="ps-actions">
        <button type="button" className="panel-btn" disabled={busy === "add"} onClick={addFee}>
          + Add a fee
        </button>
      </div>
    </div>
  );
}
