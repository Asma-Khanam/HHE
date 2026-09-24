import { useEffect, useState } from "react";
import { listFamilyServiceRequests, markServiceRequestIntroduced, friendlyError } from "../lib/staffData";
import "./panels.css";

const STATUS = {
  sent: { label: "Introduced", tone: "good" },
  pending: { label: "Not emailed yet", tone: "warn" },
  no_contact: { label: "No partner contact set", tone: "warn" },
  failed: { label: "Email failed", tone: "bad" },
};

function fmt(d) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

// What the family asked to be introduced for from their Dashboard
// (addendum 76). Anything the email couldn't cover can be done by hand and
// marked as introduced here.
export default function IntroductionsPanel({ family }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listFamilyServiceRequests(family.id).then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, [family.id]);

  if (!rows || rows.length === 0) return null;

  async function markDone(row) {
    try {
      const updated = await markServiceRequestIntroduced(row.id);
      setRows((l) => l.map((r) => (r.id === row.id ? updated : r)));
    } catch (e) {
      setError(friendlyError(e, "Couldn't update that."));
    }
  }

  return (
    <section className="family-detail-card">
      <div className="panel-head">
        <h2>Introductions requested</h2>
      </div>
      <p className="family-detail-hint">Asked for by the family on their Dashboard.</p>
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
      <ul className="ref-list">
        {rows.map((r) => {
          const st = STATUS[r.email_status] || STATUS.pending;
          return (
            <li key={r.id} className="ref-item">
              <span className="ref-main">
                <strong>{r.service?.label || r.service_key}</strong> · asked {fmt(r.requested_at)}
                {r.email_to && r.email_status === "sent" ? ` · emailed ${r.email_to}` : ""}
              </span>
              <span className={"intro-status is-" + st.tone}>{st.label}</span>
              {r.email_status !== "sent" && (
                <button type="button" className="panel-btn" onClick={() => markDone(r)}>
                  Mark introduced
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
