import { useEffect, useState } from "react";
import { listPartnerServices, updatePartnerService, friendlyError } from "../lib/staffData";

// Settings -> Trusted partners (addendum 76). One contact per service; when a
// family ticks that service on their Dashboard, the introduction email goes
// to the email set here. Saves when you leave a box.
export default function PartnersSettings() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [savedKey, setSavedKey] = useState("");

  useEffect(() => {
    listPartnerServices()
      .then(setRows)
      .catch((e) => {
        setRows([]);
        setError(friendlyError(e, "Couldn't load partners — has addendum 76 been run?"));
      });
  }, []);

  async function save(row, field, value) {
    if ((row[field] ?? "") === value) return;
    try {
      const updated = await updatePartnerService(row.key, { [field]: field === "active" ? value : value.trim() || null });
      setRows((l) => l.map((r) => (r.key === row.key ? updated : r)));
      setSavedKey(row.key + field);
      setTimeout(() => setSavedKey(""), 1500);
    } catch (e) {
      setError(friendlyError(e, "Couldn't save that."));
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Trusted partners</h2>
      </div>
      <p className="panel-hint">
        Families can ask to be introduced from their Dashboard. The introduction email goes to the contact below. A service
        with no email still records the request, so the team can introduce them by hand.
      </p>
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
      {rows && rows.length > 0 && (
        <div className="partners-table">
          <div className="partners-row partners-head">
            <span>Service</span>
            <span>Contact name</span>
            <span>Company</span>
            <span>Email</span>
            <span>On</span>
          </div>
          {rows.map((r) => (
            <div key={r.key} className={"partners-row" + (r.active ? "" : " is-off")}>
              <strong>{r.label}</strong>
              {["contact_name", "contact_company", "contact_email"].map((f) => (
                <input
                  key={f}
                  className={"panel-input" + (savedKey === r.key + f ? " is-saved" : "")}
                  type={f === "contact_email" ? "email" : "text"}
                  defaultValue={r[f] || ""}
                  placeholder={f === "contact_email" ? "name@company.com" : ""}
                  onBlur={(e) => save(r, f, e.target.value)}
                />
              ))}
              <input type="checkbox" checked={r.active} onChange={(e) => save(r, "active", e.target.checked)} aria-label={`${r.label} on`} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
