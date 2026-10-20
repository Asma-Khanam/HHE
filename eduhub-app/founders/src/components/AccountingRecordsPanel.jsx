import { useCallback, useEffect, useState } from "react";
import AutosaveField from "./Autosave";
import { listAccountingRecords, updateAccountingRecord, createRecordInvoice, voidRecordInvoice } from "../lib/staffData";
import { STATUS_LABEL, money, childName, sum, liveItems, recordFlags, invoiceBlockers, timeAgo } from "../lib/accounting";
import "./panels.css";
import "./AccountingRecordsPanel.css";

// The accounting record for each school HHE has paid on a family's behalf
// (Miss Lyndsay's flowchart, 15 Oct 2026). A record opens by itself when
// "HHE paid school" is ticked on the Application fee step (addendum 109).
// Here staff add how and when HHE paid the school, and see per child what we
// paid, what we charge and the difference. The amounts are staff-only: the
// family only ever sees the one figure they are charged.

const METHODS = [
  ["qashio", "Qashio"],
  ["bank", "Bank transfer"],
];

function CopyLink({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ae-link"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export default function AccountingRecordsPanel({ familyId, onGoToApplications }) {
  const [records, setRecords] = useState(null);
  const [error, setError] = useState("");
  // Which record is asking "are you sure?", which is mid-request, and any message.
  const [confirm, setConfirm] = useState(null); // { id, kind: "invoice" | "void" }
  const [working, setWorking] = useState(null);
  const [notice, setNotice] = useState({});

  const load = useCallback(async () => {
    try {
      setError("");
      setRecords(await listAccountingRecords(familyId));
    } catch (err) {
      const msg = String(err?.message || "");
      setError(
        /does not exist|schema cache/i.test(msg)
          ? "The accounting tables aren't in the database yet. Run addendum 109."
          : "Couldn't load the accounting records."
      );
      setRecords([]);
    }
  }, [familyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(record, field, value) {
    try {
      const updated = await updateAccountingRecord(record.id, field, value, record[field]);
      setRecords((list) => list.map((r) => (r.id === record.id ? { ...r, ...updated } : r)));
      return true;
    } catch {
      return false;
    }
  }

  async function runInvoice(record, kind) {
    setWorking(record.id);
    setConfirm(null);
    setNotice((n) => ({ ...n, [record.id]: null }));
    try {
      const result = kind === "invoice" ? await createRecordInvoice(record.id) : await voidRecordInvoice(record.id);
      setNotice((n) => ({
        ...n,
        [record.id]: {
          ok: true,
          text:
            kind === "invoice"
              ? result.emailed
                ? "Invoice sent. Stripe has emailed the family their pay link."
                : "Invoice created, but Stripe could not email it. Copy the pay link and send it."
              : "Invoice voided. The family can no longer pay it, and the record is open again.",
        },
      }));
      await load();
    } catch (err) {
      setNotice((n) => ({ ...n, [record.id]: { ok: false, text: err.message } }));
    } finally {
      setWorking(null);
    }
  }

  if (records === null) return null;
  if (records.length === 0 && !error) return null;

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>
          School payments by HHE <span className="panel-count">{records.length}</span>
        </h3>
      </div>
      <p className="panel-hint">
        Opens by itself when "HHE paid school" is ticked on an application fee. Families never see what we paid the
        school, only what they are charged.
      </p>
      {error && <p className="panel-hint ar-error">{error}</p>}

      <div className="ar-list">
        {records.map((record) => {
          const items = liveItems(record);
          const open = record.status === "open";
          const cur = record.currency || "AED";
          const flags = recordFlags(record);
          const blockers = open ? invoiceBlockers(record) : [];

          return (
            <div key={record.id} className="ar-card">
              <div className="ar-card-head">
                <div className="ar-card-title">
                  <strong>{record.kind === "registration_deposit" ? "Registration deposit · " : ""}{record.school?.name || "School"}</strong>
                  {record.lastChange && (
                    <span className="ar-lastchange">
                      Updated by {record.lastChange.by} · {timeAgo(record.lastChange.at)}
                    </span>
                  )}
                </div>
                <span className={"ar-status is-" + record.status}>{STATUS_LABEL[record.status] || record.status}</span>
              </div>

              {open ? (
                <div className="ar-fields">
                  <AutosaveField
                    label="Record name"
                    value={record.name || ""}
                    placeholder="e.g. Kirkton Jebel Ali fees"
                    onSave={(v) => save(record, "name", v)}
                  />
                  <label className="ar-select">
                    <span className="panel-field-label">Paid the school by</span>
                    <select
                      className="panel-select"
                      value={record.school_payment_method || ""}
                      onChange={(e) => save(record, "school_payment_method", e.target.value || null)}
                    >
                      <option value="">Not set</option>
                      {METHODS.map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <AutosaveField
                    label="Date we paid the school"
                    type="date"
                    value={record.school_paid_at || ""}
                    onSave={(v) => save(record, "school_paid_at", v)}
                  />
                  <AutosaveField
                    label="Reference (Qashio or bank)"
                    value={record.school_payment_reference || ""}
                    placeholder="Transaction reference"
                    onSave={(v) => save(record, "school_payment_reference", v)}
                  />
                </div>
              ) : (
                <p className="panel-hint">
                  {record.name ? `${record.name} · ` : ""}
                  {METHODS.find(([k]) => k === record.school_payment_method)?.[1] || "Method not set"}
                  {record.school_paid_at ? ` · ${record.school_paid_at}` : ""}
                  {record.school_payment_reference ? ` · ${record.school_payment_reference}` : ""}
                </p>
              )}

              <table className="ar-table">
                <thead>
                  <tr>
                    <th>Child</th>
                    <th>We paid</th>
                    <th>We charge</th>
                    <th>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td>{childName(i.child)}</td>
                      <td className={i.amount_paid === null ? "ar-missing" : ""}>{money(i.amount_paid, cur)}</td>
                      <td>{money(i.amount_charged, cur)}</td>
                      <td>{money(i.difference, cur)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td>{money(sum(items, "amount_paid"), cur)}</td>
                    <td>{money(sum(items, "amount_charged"), cur)}</td>
                    <td>{money(sum(items, "difference"), cur)}</td>
                  </tr>
                </tfoot>
              </table>

              <p className="ar-paid">
                Family paid: <strong>{record.status === "paid" ? "yes" : "no"}</strong>
              </p>

              {open && items.length > 0 && !record.invoice && (
                <div className="ar-invoice">
                  {blockers.length > 0 ? (
                    <div className="ar-blockers">
                      <button type="button" className="panel-btn panel-btn-primary" disabled>
                        {`Invoice the family · ${money(sum(items, "amount_charged"), cur)}`}
                      </button>
                      <p className="ar-blockers-title">Before you can invoice:</p>
                      <ul>
                        {blockers.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  ) : confirm?.id === record.id && confirm.kind === "invoice" ? (
                    <div className="ar-confirm">
                      <span>
                        Send the family an invoice for <strong>{money(sum(items, "amount_charged"), cur)}</strong> (
                        {items.length} {items.length === 1 ? "child" : "children"})? Stripe emails it to them.
                      </span>
                      <button type="button" className="panel-btn panel-btn-primary" onClick={() => runInvoice(record, "invoice")}>
                        Yes, send invoice
                      </button>
                      <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setConfirm(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="panel-btn panel-btn-primary"
                      disabled={working === record.id}
                      onClick={() => setConfirm({ id: record.id, kind: "invoice" })}
                    >
                      {working === record.id ? "Creating invoice…" : `Invoice the family · ${money(sum(items, "amount_charged"), cur)}`}
                    </button>
                  )}
                </div>
              )}

              {record.invoice && (
                <div className="ar-invoice">
                  <div className="ar-invoice-row">
                    <span>
                      Stripe invoice <strong>{money(record.invoice.amount, record.invoice.currency)}</strong> ·{" "}
                      {record.invoice.status === "paid"
                        ? `paid ${record.invoice.paid_at ? new Date(record.invoice.paid_at).toLocaleDateString("en-GB") : ""}`
                        : record.invoice.status === "needs_review"
                          ? "needs a look: Stripe's payment did not match"
                          : record.invoice.due_date
                            ? `waiting, due ${new Date(record.invoice.due_date).toLocaleDateString("en-GB")}`
                            : "waiting for the family"}
                    </span>
                    {record.invoice.hosted_invoice_url && (
                      <a className="ae-link" href={record.invoice.hosted_invoice_url} target="_blank" rel="noreferrer">
                        Open pay link
                      </a>
                    )}
                    {record.invoice.hosted_invoice_url && <CopyLink value={record.invoice.hosted_invoice_url} />}
                  </div>
                  {record.invoice.status !== "paid" &&
                    (confirm?.id === record.id && confirm.kind === "void" ? (
                      <div className="ar-confirm">
                        <span>Void this invoice? The family will no longer be able to pay it.</span>
                        <button type="button" className="panel-btn ar-danger" onClick={() => runInvoice(record, "void")}>
                          Yes, void it
                        </button>
                        <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setConfirm(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="panel-btn panel-btn-quiet"
                        disabled={working === record.id}
                        onClick={() => setConfirm({ id: record.id, kind: "void" })}
                      >
                        {working === record.id ? "Working…" : "Void invoice"}
                      </button>
                    ))}
                </div>
              )}

              {notice[record.id] && (
                <p className={"ar-notice" + (notice[record.id].ok ? " is-ok" : " is-bad")}>{notice[record.id].text}</p>
              )}

              {flags.length > 0 && (
                <div className="ar-chips">
                  {flags.map((f) => (
                    <span key={f} className="ar-chip">
                      {f}
                    </span>
                  ))}
                </div>
              )}
              {onGoToApplications && flags.length > 0 && (
                <button type="button" className="panel-btn panel-btn-quiet" onClick={onGoToApplications}>
                  Open Applications
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
