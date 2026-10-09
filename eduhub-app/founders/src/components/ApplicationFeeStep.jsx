import { useRef, useState } from "react";
import AutosaveField from "./Autosave";
import { createApplicationFee, updateApplicationFee, uploadFeeInvoice, uploadFeePaymentProof, clearFeeEvidence, listSiblingUnpaidFeesAtSchool } from "../lib/staffData";
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
export default function ApplicationFeeStep({ application, fees, familyId, onFeesChange, onLog }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const fileInputs = useRef({});
  const paymentInputs = useRef({});

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
      const saved = await uploadFeeInvoice({ familyId, fee, file });
      replace(saved);
      onLog?.(`Invoice uploaded for ${fee.label}`, "fee_invoiced");
      await offerSiblingCopy({ changes: { invoice_path: saved.invoice_path, invoice_name: saved.invoice_name }, markPaid: false, humanLabel: "the school invoice/receipt" });
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

  // Addendum 98 (Heather, 9 Oct 2026): bank evidence that HHE paid the school.
  async function handleEvidence(fee, which, file) {
    if (!file) return;
    setBusy(`${which}-${fee.id}`);
    setError("");
    try {
      const saved = await uploadFeePaymentProof({ familyId, fee, file });
      replace(saved);
      onLog?.(`Bank payment evidence uploaded for ${fee.label}`, "fee_paid");
      await offerSiblingCopy({ changes: { payment_proof_path: saved.payment_proof_path, payment_proof_name: saved.payment_proof_name }, markPaid: false, humanLabel: "the bank payment evidence" });
    } catch (err) {
      setError(err.message || "Couldn't upload that file.");
    } finally {
      setBusy("");
    }
  }

  // Heather, 9 Oct 2026: when the same payment covers more than one child
  // ("add the invoice to the eldest, auto-update the others"), after an
  // upload or a mark-paid, offer to copy the file onto the siblings' fees at
  // the same school and mark theirs paid too, in one confirm box.
  async function offerSiblingCopy({ changes, markPaid, humanLabel }) {
    try {
      const schoolId = application?.school_id;
      if (!schoolId || !familyId) return;
      const siblings = await listSiblingUnpaidFeesAtSchool({
        familyId,
        schoolId,
        excludeApplicationId: application.id,
      });
      if (!siblings.length) return;
      const schoolName = application?.school?.name || "this school";
      const names = siblings.map((s) => s.childName).join(", ");
      const paidBit = markPaid ? " and mark their fees paid" : "";
      const ok = window.confirm(
        `Copy ${humanLabel} to ${names}'s fee${siblings.length > 1 ? "s" : ""} at ${schoolName}${paidBit}?`
      );
      if (!ok) return;
      const patch = { ...changes };
      if (markPaid) {
        patch.status = "paid";
        patch.paid_at = patch.paid_at || new Date().toISOString();
      }
      const updated = await Promise.all(
        siblings.map((s) => updateApplicationFee(s.fee.id, patch).catch(() => null))
      );
      const done = updated.filter(Boolean).length;
      onLog?.(`Also applied to ${done} sibling fee${done === 1 ? "" : "s"} at ${schoolName}`, "fee_paid");
    } catch {
      /* best-effort, don't block the main action */
    }
  }

  async function viewEvidence(fee, which) {
    const path = which === "payment_proof" ? fee.payment_proof_path : fee.school_receipt_path;
    try {
      window.open(await getSignedUrl(path), "_blank", "noopener");
    } catch {
      setError("Couldn't open that file.");
    }
  }

  async function removeEvidence(fee, which) {
    try {
      const saved = await clearFeeEvidence({ fee, which });
      replace(saved);
    } catch {
      setError("Couldn't remove that file. Please try again.");
    }
  }

  async function send(fee) {
    const saved = await patchFee(fee, { sent_to_family_at: new Date().toISOString() });
    if (saved) onLog?.(`${fee.label} sent to the family's dashboard`, "fee_invoiced");
  }

  async function markPaid(fee, date) {
    const saved = await patchFee(fee, date ? { status: "paid", paid_at: `${date}T12:00:00Z` } : { status: "unpaid", paid_at: null });
    if (saved && date) {
      onLog?.(`${fee.label} paid on ${shortDate(date)}`, "fee_paid");
      await offerSiblingCopy({ changes: { paid_at: `${date}T12:00:00Z` }, markPaid: true, humanLabel: `the payment date (${shortDate(date)})` });
    }
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
              <span className="afs-label">School invoice / receipt</span>
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

            <div className="afs-invoice">
              <span className="afs-label">We paid the school</span>
              {fee.payment_proof_path ? (
                <>
                  <button type="button" className="apx-link" onClick={() => viewEvidence(fee, "payment_proof")}>
                    {fee.payment_proof_name || "View file"} ↗
                  </button>
                  <button type="button" className="apx-link" onClick={() => paymentInputs.current[fee.id]?.click()}>
                    Replace
                  </button>
                  <button type="button" className="apx-link apx-link-quiet" onClick={() => removeEvidence(fee, "payment_proof")}>
                    Remove
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="panel-btn"
                  disabled={busy === `payment_proof-${fee.id}`}
                  onClick={() => paymentInputs.current[fee.id]?.click()}
                >
                  {busy === `payment_proof-${fee.id}` ? "Uploading…" : "Upload bank payment evidence"}
                </button>
              )}
              <input
                ref={(el) => (paymentInputs.current[fee.id] = el)}
                type="file"
                accept=".pdf,image/*"
                hidden
                onChange={(e) => {
                  handleEvidence(fee, "payment_proof", e.target.files?.[0]);
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
