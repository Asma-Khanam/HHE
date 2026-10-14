import { useEffect, useMemo, useRef, useState } from "react";
import { createApplicationFee, updateApplicationFee, deleteApplicationFee, uploadFeeInvoice, uploadFeePaymentProof, clearFeeEvidence, listSiblingUnpaidFeesAtSchool } from "../lib/staffData";
import { getSignedUrl } from "../lib/documents";
import { shortDate } from "../lib/placement";
import "./ApplicationFeeStep.css";

// Application fee step (redesign, 13 Oct 2026). Miss Lyndsay: "when i open
// each step they feel like its getting very complicated... shed like it to be
// tight, everything understood at a glance when they are on a call". So each
// fee is one row -- amount, who it covers, who paid, two file slots, delete.
// A fee that covers more than one child is one fee with its sibling chips
// ticked, not a separate line per child (Miss Lyndsay's "single payment
// across multiple siblings" ask). The database fields are unchanged.

const today = () => new Date().toISOString().slice(0, 10);

function moneyText(fee) {
  if (fee.amount === null || fee.amount === undefined || fee.amount === "") return "No amount yet";
  return `${fee.currency || "AED"} ${Number(fee.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Three mutually-exclusive "who paid" modes derived from the two existing
// booleans + status. Changing the mode writes those three fields together.
function whoMode(fee) {
  if (fee.paid_direct_by_family) return "direct";       // family paid school
  if (fee.status === "paid") return "settled";           // family paid HHE
  if (fee.hhe_paid_school_on_behalf) return "hhe";       // HHE paid school, family owes HHE
  return "pending";                                      // not decided yet
}
function patchForMode(mode) {
  // Leaving "settled" has to clear status/paid_at too -- otherwise
  // whoMode() keeps reading the fee as settled forever (status "paid" was
  // checked before the hhe_paid_school_on_behalf flag), which is why
  // "HHE paid school" looked unclickable once a fee had ever been settled.
  if (mode === "direct")
    return {
      paid_direct_by_family: true,
      hhe_paid_school_on_behalf: false,
      status: "unpaid",
      paid_at: null,
      payment_proof_path: null,
      payment_proof_name: null,
    };
  if (mode === "hhe")
    return { paid_direct_by_family: false, hhe_paid_school_on_behalf: true, status: "unpaid", paid_at: null };
  if (mode === "settled")
    return { paid_direct_by_family: false, hhe_paid_school_on_behalf: false, status: "paid", paid_at: new Date().toISOString() };
  // pending
  return { paid_direct_by_family: false, hhe_paid_school_on_behalf: false, status: "unpaid", paid_at: null };
}

export default function ApplicationFeeStep({ application, fees, familyId, onFeesChange, onLog }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [adding, setAdding] = useState({ amount: "", currency: "AED" });
  const fileInputs = useRef({});
  const paymentInputs = useRef({});

  // Siblings at the same school with no fee of their own yet -- the chips
  // in each fee row show them so one fee can cover more than one child.
  const [siblings, setSiblings] = useState([]);
  const [coverSiblings, setCoverSiblings] = useState({});
  useEffect(() => {
    let alive = true;
    if (!application?.school_id || !familyId) return;
    listSiblingUnpaidFeesAtSchool({
      familyId,
      schoolId: application.school_id,
      excludeApplicationId: application.id,
    })
      .then((rows) => alive && setSiblings(rows))
      .catch(() => alive && setSiblings([]));
    return () => {
      alive = false;
    };
  }, [familyId, application?.id, application?.school_id, fees]);

  const replace = (saved) => onFeesChange((list) => list.map((f) => (f.id === saved.id ? saved : f)));
  const drop = (id) => onFeesChange((list) => list.filter((f) => f.id !== id));

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
      const row = await createApplicationFee({
        applicationId: application.id,
        label: "Application fee",
        currency: adding.currency,
        amount: adding.amount === "" ? null : Number(adding.amount),
      });
      onFeesChange((list) => [...list, row]);
      setAdding({ amount: "", currency: "AED" });
      onLog?.("Application fee added", "fee_invoiced");
      // The new fee covers the current child by default; the sibling chips
      // start on, so an upload below spreads to any siblings in one go.
      setCoverSiblings((m) => ({ ...m, [row.id]: true }));
    } catch {
      setError("Couldn't add the fee. Please try again.");
    } finally {
      setBusy("");
    }
  }

  async function removeFee(fee) {
    try {
      await deleteApplicationFee(fee.id);
      drop(fee.id);
      onLog?.(`Application fee removed (${moneyText(fee)})`, "fee_invoiced");
      setConfirmDelete(null);
    } catch (err) {
      setError(err?.message || "Couldn't delete that fee.");
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
      await offerSiblingCopy(fee, { changes: { invoice_path: saved.invoice_path, invoice_name: saved.invoice_name }, markPaid: false });
    } catch (err) {
      setError(err.message || "Couldn't upload that invoice.");
    } finally {
      setBusy("");
    }
  }
  async function handleEvidence(fee, file) {
    if (!file) return;
    setBusy(`proof-${fee.id}`);
    setError("");
    try {
      const saved = await uploadFeePaymentProof({ familyId, fee, file });
      replace(saved);
      onLog?.(`Bank evidence uploaded for ${fee.label}`, "fee_paid");
      await offerSiblingCopy(fee, { changes: { payment_proof_path: saved.payment_proof_path, payment_proof_name: saved.payment_proof_name }, markPaid: false });
    } catch (err) {
      setError(err.message || "Couldn't upload that file.");
    } finally {
      setBusy("");
    }
  }
  async function viewFile(path) {
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
      setError("Couldn't remove that file.");
    }
  }

  // Siblings: when the chip for the current fee is ticked, apply the same
  // change to siblings' unpaid fees at the same school in one go.
  async function offerSiblingCopy(fee, { changes, markPaid }) {
    try {
      const schoolId = application?.school_id;
      if (!schoolId || !familyId) return;
      if (!coverSiblings[fee.id]) return;
      const rows = await listSiblingUnpaidFeesAtSchool({ familyId, schoolId, excludeApplicationId: application.id });
      if (!rows.length) return;
      const patch = { ...changes };
      if (markPaid) {
        patch.status = "paid";
        patch.paid_at = patch.paid_at || new Date().toISOString();
      }
      const updated = await Promise.all(rows.map((s) => updateApplicationFee(s.fee.id, patch).catch(() => null)));
      const n = updated.filter(Boolean).length;
      const schoolName = application?.school?.name || "this school";
      onLog?.(`Also applied to ${n} sibling fee${n === 1 ? "" : "s"} at ${schoolName}`, "fee_paid");
    } catch {
      /* best-effort */
    }
  }

  async function setMode(fee, mode) {
    const patch = patchForMode(mode);
    const saved = await patchFee(fee, patch);
    if (!saved) return;
    if (mode === "settled") {
      onLog?.(`${fee.label} marked settled`, "fee_paid");
      await offerSiblingCopy(fee, { changes: {}, markPaid: true });
    } else if (mode === "hhe") {
      onLog?.(`Fee marked as paid by HHE on behalf of family`, "fee_invoiced");
    } else if (mode === "direct") {
      onLog?.(`Fee marked as paid directly by family`, "fee_invoiced");
    }
  }

  return (
    <div className="afs">
      {fees.length === 0 && (
        <p className="afs-empty">No application fee yet. Add it when the school sends its invoice.</p>
      )}

      {fees.map((fee) => (
        <FeeRow
          key={fee.id}
          fee={fee}
          mode={whoMode(fee)}
          onMode={(m) => setMode(fee, m)}
          onAmount={(v) => patchFee(fee, { amount: v === "" || v === null ? null : Number(v) })}
          siblings={siblings}
          coverSib={!!coverSiblings[fee.id]}
          setCoverSib={(v) => setCoverSiblings((m) => ({ ...m, [fee.id]: v }))}
          onInvoice={(file) => handleInvoice(fee, file)}
          onEvidence={(file) => handleEvidence(fee, file)}
          onViewInvoice={() => viewFile(fee.invoice_path)}
          onViewEvidence={() => viewFile(fee.payment_proof_path)}
          onClearEvidence={() => removeEvidence(fee, "payment_proof")}
          invoiceInputRef={(el) => (fileInputs.current[fee.id] = el)}
          proofInputRef={(el) => (paymentInputs.current[fee.id] = el)}
          invoiceInput={fileInputs.current[fee.id]}
          proofInput={paymentInputs.current[fee.id]}
          busy={busy}
          schoolName={application?.school?.name}
          currentChildName={application?.child?.preferred_name || application?.child?.first_name || application?.child?.full_name}
          onDelete={() => setConfirmDelete(fee)}
        />
      ))}

      {/* Compact add form */}
      <div className="afs-add">
        <div className="afs-add-field">
          <label>Amount</label>
          <input
            type="number"
            inputMode="decimal"
            placeholder="e.g. 500"
            value={adding.amount}
            onChange={(e) => setAdding((a) => ({ ...a, amount: e.target.value }))}
          />
        </div>
        <div className="afs-add-field afs-add-ccy">
          <label>Currency</label>
          <select value={adding.currency} onChange={(e) => setAdding((a) => ({ ...a, currency: e.target.value }))}>
            <option>AED</option>
            <option>GBP</option>
            <option>USD</option>
            <option>EUR</option>
          </select>
        </div>
        <button type="button" className="afs-add-btn" disabled={busy === "add"} onClick={addFee}>
          + Add fee
        </button>
      </div>

      {error && <p className="afs-error">{error}</p>}

      {confirmDelete && (
        <div className="afs-confirm" role="dialog" aria-modal="true" onClick={() => setConfirmDelete(null)}>
          <div className="afs-confirm-box" onClick={(e) => e.stopPropagation()}>
            <h3>Delete this fee?</h3>
            <p>
              {moneyText(confirmDelete)}. This can&rsquo;t be undone. Any uploaded invoice or bank evidence is removed too.
            </p>
            <div className="afs-confirm-actions">
              <button type="button" className="afs-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button type="button" className="afs-btn afs-btn-danger" onClick={() => removeFee(confirmDelete)}>Delete fee</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
function FeeRow({
  fee, mode, onMode, onAmount, siblings, coverSib, setCoverSib,
  onInvoice, onEvidence, onViewInvoice, onViewEvidence, onClearEvidence,
  invoiceInputRef, proofInputRef, invoiceInput, proofInput,
  busy, schoolName, currentChildName, onDelete,
}) {
  // Who's covered line for the snapshot and the step head
  const coveredNames = useMemo(() => {
    const names = [currentChildName].filter(Boolean);
    if (coverSib) names.push(...siblings.map((s) => s.childName));
    return names;
  }, [currentChildName, siblings, coverSib]);

  const paid = fee.status === "paid";

  // Status tags (right side of the snapshot)
  const tags = [];
  if (paid) {
    tags.push({ cls: "afs-tag-green", text: `Settled${fee.paid_at ? " · " + shortDate(String(fee.paid_at).slice(0, 10)) : ""}` });
  } else if (mode === "hhe") {
    tags.push({ cls: "afs-tag-blue", text: "HHE paid the school" });
    tags.push({ cls: "afs-tag-amber", text: `Family owes HHE ${moneyText(fee)}` });
  } else if (mode === "direct") {
    tags.push({ cls: "afs-tag-grey", text: "Family paid school directly" });
  } else {
    tags.push({ cls: "afs-tag-grey", text: "Who paid?" });
  }

  return (
    <div className={"afs-fee" + (paid ? " is-paid" : "")}>
      {/* Snapshot bar: amount + who's covered + status tags */}
      <div className="afs-snap">
        <div className="afs-snap-main">
          <span className="afs-amount">{moneyText(fee)}</span>
          <span className="afs-covers">{coveredNames.length ? "covers " + coveredNames.join(" & ") : "no child yet"}</span>
        </div>
        <div className="afs-snap-tags">
          {tags.map((t, i) => (
            <span key={i} className={"afs-tag " + t.cls}>{t.text}</span>
          ))}
        </div>
      </div>

      {/* Siblings covered (chips) */}
      {siblings.length > 0 && (
        <div className="afs-sibs" title="Tick every child this one fee covers">
          <span className="afs-sibs-label">Covers:</span>
          <label className="afs-sib afs-sib-current">
            <input type="checkbox" checked disabled />
            {currentChildName || "This child"}
          </label>
          <label className={"afs-sib" + (coverSib ? " is-on" : "")}>
            <input type="checkbox" checked={coverSib} onChange={(e) => setCoverSib(e.target.checked)} />
            {siblings.map((s) => s.childName).join(", ")}
          </label>
          <span className="afs-sibs-hint">at {schoolName || "this school"}</span>
        </div>
      )}

      {/* Who paid - three options in one line */}
      <div className="afs-whopaid" role="radiogroup" aria-label="Who paid">
        {[
          { k: "direct", t: "Family paid school", s: "We record it." },
          { k: "hhe", t: "HHE paid school", s: "Family owes HHE." },
          { k: "settled", t: "Family paid HHE", s: "Settled." },
        ].map((o) => (
          <label key={o.k} className={"afs-opt" + (mode === o.k ? " is-on" : "")}>
            <input type="radio" name={`who-${fee.id}`} checked={mode === o.k} onChange={() => onMode(o.k)} />
            <span>
              <span className="afs-opt-t">{o.t}</span>
              <span className="afs-opt-s">{o.s}</span>
            </span>
          </label>
        ))}
      </div>

      {/* Amount edit + files */}
      <div className="afs-row">
        <label className="afs-amt">
          <span>Amount</span>
          <div className="afs-amt-input">
            <span className="afs-amt-ccy">{fee.currency || "AED"}</span>
            <input
              type="number"
              inputMode="decimal"
              defaultValue={fee.amount == null ? "" : fee.amount}
              onBlur={(e) => {
                const v = e.target.value;
                if (String(fee.amount ?? "") !== v) onAmount(v);
              }}
            />
          </div>
        </label>

        <div className={"afs-file" + (fee.invoice_path ? " is-done" : "")}>
          <div className="afs-file-main">
            <span className="afs-file-icon">📄</span>
            <div className="afs-file-text">
              <div className="afs-file-label">School invoice</div>
              {fee.invoice_path ? (
                <button type="button" className="afs-file-name" onClick={onViewInvoice} title="Open">
                  {fee.invoice_name || "invoice"} ↗
                </button>
              ) : (
                <div className="afs-file-none">None yet</div>
              )}
            </div>
          </div>
          <button type="button" className="afs-btn" onClick={() => invoiceInput?.click()} disabled={busy === `inv-${fee.id}`}>
            {busy === `inv-${fee.id}` ? "Uploading…" : fee.invoice_path ? "Replace" : "Upload"}
          </button>
          <input ref={invoiceInputRef} type="file" accept=".pdf,image/*" hidden
            onChange={(e) => { onInvoice(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

        {mode === "hhe" && (
          <div className={"afs-file" + (fee.payment_proof_path ? " is-done" : "")}>
            <div className="afs-file-main">
              <span className="afs-file-icon">🏦</span>
              <div className="afs-file-text">
                <div className="afs-file-label">Bank evidence</div>
                {fee.payment_proof_path ? (
                  <button type="button" className="afs-file-name" onClick={onViewEvidence} title="Open">
                    {fee.payment_proof_name || "evidence"} ↗
                  </button>
                ) : (
                  <div className="afs-file-none">None yet</div>
                )}
              </div>
            </div>
            <div className="afs-file-actions">
              <button type="button" className="afs-btn" onClick={() => proofInput?.click()} disabled={busy === `proof-${fee.id}`}>
                {busy === `proof-${fee.id}` ? "Uploading…" : fee.payment_proof_path ? "Replace" : "Upload"}
              </button>
              {fee.payment_proof_path && (
                <button type="button" className="afs-btn-ghost" onClick={onClearEvidence}>Remove</button>
              )}
            </div>
            <input ref={proofInputRef} type="file" accept=".pdf,image/*" hidden
              onChange={(e) => { onEvidence(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        )}
      </div>

      <div className="afs-foot">
        <span className="afs-foot-note">
          {fee.source === "openapply_sync" ? "From OpenApply · " : ""}
          {fee.sent_to_family_at ? `On family dashboard since ${shortDate(String(fee.sent_to_family_at).slice(0, 10))}` : "Not on family dashboard yet"}
        </span>
        <button type="button" className="afs-btn-ghost afs-btn-del" onClick={onDelete} title="Delete this fee">
          🗑 Delete
        </button>
      </div>
    </div>
  );
}
