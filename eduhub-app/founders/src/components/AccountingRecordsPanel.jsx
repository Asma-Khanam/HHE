import { useCallback, useEffect, useState } from "react";
import AutosaveField from "./Autosave";
import { listAccountingRecords, updateAccountingRecord } from "../lib/staffData";
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

const STATUS_LABEL = {
  open: "School paid · not invoiced yet",
  invoiced: "Invoiced · waiting for the family",
  paid: "Family paid",
};

function money(n, currency = "AED") {
  if (n === null || n === undefined || n === "") return "—";
  return `${currency} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function childName(c) {
  return (c?.preferred_name || c?.first_name || (c?.full_name || "").split(" ")[0] || "Child").trim();
}

function sum(rows, key) {
  return rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);
}

export default function AccountingRecordsPanel({ familyId, onGoToApplications }) {
  const [records, setRecords] = useState(null);
  const [error, setError] = useState("");

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
          const items = (record.items || []).filter((i) => !i.removed_at);
          const open = record.status === "open";
          const cur = record.currency || "AED";
          const missingAmount = items.filter((i) => i.amount_paid === null || i.amount_paid === undefined);
          const withProof = items.filter((i) => i.fee?.payment_proof_path).length;
          const withReceipt = items.filter((i) => i.fee?.school_receipt_path).length;
          const flags = [];
          missingAmount.forEach((i) =>
            flags.push(`Enter what we paid the school for ${childName(i.child)} (Application fee step).`)
          );
          if (open && (!record.school_payment_method || !record.school_paid_at))
            flags.push("Add how and when we paid the school.");
          if (open && withProof < items.length)
            flags.push(`Our bank or Qashio evidence is uploaded for ${withProof} of ${items.length} children.`);
          if (open && withReceipt < items.length)
            flags.push(`The school's receipt is uploaded for ${withReceipt} of ${items.length} children.`);

          return (
            <div key={record.id} className="ar-card">
              <div className="ar-card-head">
                <strong>{record.school?.name || "School"}</strong>
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

              {flags.length > 0 && (
                <ul className="ar-flags">
                  {flags.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
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
