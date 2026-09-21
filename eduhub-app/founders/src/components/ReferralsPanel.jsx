import { useEffect, useState } from "react";
import { listPartnerReferrals, createPartnerReferral, friendlyError } from "../lib/staffData";
import "./panels.css";

const DIRECTION_LABEL = { in: "Partner referred them to us", out: "We referred them to a partner" };

function fmt(d) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

// Where the family heard about us (they answer that themselves on their
// application) plus a running log of partner referrals in both directions.
// Add-only, like the case log: nothing here is deleted.
export default function ReferralsPanel({ family }) {
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [direction, setDirection] = useState("in");
  const [partner, setPartner] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listPartnerReferrals(family.id)
      .then((r) => alive && setRows(r))
      .catch((e) => {
        if (alive) {
          setRows([]);
          setError(friendlyError(e, "Couldn't load referrals."));
        }
      });
    return () => {
      alive = false;
    };
  }, [family.id]);

  async function add() {
    if (!partner.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const row = await createPartnerReferral({
        familyId: family.id,
        direction,
        partnerName: partner,
        referredOn: date,
        notes,
      });
      setRows((l) => [row, ...(l || [])]);
      setPartner("");
      setDate("");
      setNotes("");
      setAdding(false);
    } catch (e) {
      setError(friendlyError(e, "Couldn't save that referral."));
    } finally {
      setBusy(false);
    }
  }

  const source = family.referral_source
    ? family.referral_source + (family.referral_source_detail ? ` (${family.referral_source_detail})` : "")
    : "";

  return (
    <section className="family-detail-card">
      <div className="panel-head">
        <h2>Referrals</h2>
        {!adding && (
          <button type="button" className="panel-btn" onClick={() => setAdding(true)}>
            + Add partner referral
          </button>
        )}
      </div>
      <p className="ref-source">
        <span className="ref-source-label">Heard about us via</span>{" "}
        {source || <span className="is-muted">Not answered yet</span>}
      </p>
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {adding && (
        <div className="ref-form">
          <select className="panel-select" value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="in">{DIRECTION_LABEL.in}</option>
            <option value="out">{DIRECTION_LABEL.out}</option>
          </select>
          <input className="panel-input" placeholder="Partner name" value={partner} onChange={(e) => setPartner(e.target.value)} />
          <input className="panel-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="panel-input ref-notes" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button type="button" className="panel-btn panel-btn-primary" onClick={add} disabled={busy || !partner.trim()}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setAdding(false)} disabled={busy}>
            Cancel
          </button>
        </div>
      )}

      {rows && rows.length > 0 && (
        <ul className="ref-list">
          {rows.map((r) => (
            <li key={r.id} className="ref-item">
              <span className={"ref-dir is-" + r.direction}>{r.direction === "in" ? "In" : "Out"}</span>
              <span className="ref-main">
                <strong>{r.partner_name}</strong> · {DIRECTION_LABEL[r.direction]}
                {r.notes ? ` · ${r.notes}` : ""}
              </span>
              <span className="ref-date">{fmt(r.referred_on)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
