import { useEffect, useMemo, useState } from "react";
import { createRegistrationDeposit, listDepositFormData, friendlyError } from "../lib/staffData";
import { childName } from "../lib/accounting";

// Add a registration deposit: HHE paid a school's first-term registration
// deposit for a family and will invoice them for exactly that amount. Opens a
// record on the Accounting page (addendum 119) that then follows the same steps
// as an application fee: how and when we paid, invoice, family pays.
export default function AddDepositForm({ families, onSaved, onCancel }) {
  const [form, setForm] = useState(null); // { schools, children }
  const [familyId, setFamilyId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [lines, setLines] = useState([{ childId: "", amount: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listDepositFormData()
      .then(setForm)
      .catch((err) => setError(friendlyError(err, "Couldn't load schools and children.")));
  }, []);

  const kids = useMemo(() => (form && familyId ? form.children.filter((c) => c.family_id === familyId) : []), [form, familyId]);

  function setLine(i, patch) {
    setLines((list) => list.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!familyId) return setError("Choose the family.");
    if (!schoolId) return setError("Choose the school.");
    const filled = lines.filter((l) => String(l.amount).trim() !== "");
    if (!filled.length) return setError("Add the amount we paid.");
    if (filled.some((l) => !(Number(l.amount) > 0))) return setError("Each amount must be more than 0.");
    setBusy(true);
    try {
      await createRegistrationDeposit({ familyId, schoolId, items: filled });
      onSaved();
    } catch (err) {
      const text = String(err?.message || "");
      setError(
        /add_registration_deposit|schema cache|does not exist/i.test(text)
          ? "The deposit SQL (addendum 119) has not been run yet."
          : friendlyError(err, "Couldn't save the deposit.")
      );
      setBusy(false);
    }
  }

  return (
    <form className="acct2-form" onSubmit={save}>
      <div className="acct2-form-head">
        <h2>Add a registration deposit</h2>
        <p>
          Use this when we paid a school&apos;s first-term registration deposit for a family. We invoice them for exactly this
          amount. If the school gives it back to us, mark it refunded and the family is not charged.
        </p>
      </div>
      <div className="acct2-form-grid">
        <label>
          Family
          <select
            value={familyId}
            onChange={(e) => {
              setFamilyId(e.target.value);
              setLines([{ childId: "", amount: "" }]);
            }}
          >
            <option value="">Choose a family…</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          School
          <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} disabled={!form}>
            <option value="">{form ? "Choose a school…" : "Loading…"}</option>
            {(form?.schools || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="acct2-form-lines">
        <span className="acct2-form-label">What we paid</span>
        {lines.map((l, i) => (
          <div key={i} className="acct2-form-line">
            <select value={l.childId} onChange={(e) => setLine(i, { childId: e.target.value })} disabled={!familyId}>
              <option value="">{familyId ? "Which child (optional)" : "Choose a family first"}</option>
              {kids.map((c) => (
                <option key={c.id} value={c.id}>
                  {childName(c)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount (AED)"
              value={l.amount}
              onChange={(e) => setLine(i, { amount: e.target.value })}
            />
            {lines.length > 1 && (
              <button type="button" className="acct2-link" onClick={() => setLines((list) => list.filter((_, n) => n !== i))}>
                Remove
              </button>
            )}
          </div>
        ))}
        <button type="button" className="acct2-link" onClick={() => setLines((list) => [...list, { childId: "", amount: "" }])}>
          + Add another child
        </button>
      </div>

      {error && <p className="acct-error">{error}</p>}
      <div className="acct2-form-actions">
        <button type="submit" className="acct2-btn is-primary" disabled={busy}>
          {busy ? "Saving…" : "Save deposit"}
        </button>
        <button type="button" className="acct2-btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
