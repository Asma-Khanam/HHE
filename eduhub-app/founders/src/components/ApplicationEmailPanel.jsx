import { useState } from "react";
import { generateApplicationAlias, setApplicationAliasStatus } from "../lib/staffData";
import "./panels.css";

const DOMAIN = "applications.heatherharries.com";

// One forwarding-only address per family, so relocate@heatherharries.com
// never has to be re-registered with a school that only allows one
// family/application per email. The actual mail routing lives outside this
// app (Cloudflare Email Routing + a Worker) — this panel only shows and
// controls the CRM's side of it. See the calendar_events sibling addendum's
// README note for the DNS setup this depends on.
export default function ApplicationEmailPanel({ family, familyDisplayNameValue, onFamilyChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const alias = family.application_alias;
  const status = family.application_alias_status;
  const address = alias ? `${alias}@${DOMAIN}` : null;

  async function handleGenerate() {
    setBusy(true);
    setError("");
    try {
      const updated = await generateApplicationAlias(family.id, familyDisplayNameValue);
      onFamilyChange(updated);
    } catch (err) {
      setError(err.message || "Couldn't create an address.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle() {
    setBusy(true);
    setError("");
    try {
      const updated = await setApplicationAliasStatus(family.id, status === "active" ? "inactive" : "active");
      onFamilyChange(updated);
    } catch (err) {
      setError(err.message || "Couldn't update that.");
    } finally {
      setBusy(false);
    }
  }

  function handleCopy() {
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Application email</h2>
        {address && (
          <span className={"families-badge" + (status === "active" ? " is-submitted" : "")}>
            {status === "active" ? "Active" : "Inactive"}
          </span>
        )}
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {!address ? (
        <>
          <p className="panel-hint">
            Use this instead of relocate@heatherharries.com when registering with a school — it's unique to this
            family, forwards straight into the team inbox, and everything sent to it lands in the case log below
            automatically.
          </p>
          <button type="button" className="panel-btn panel-btn-primary" onClick={handleGenerate} disabled={busy}>
            {busy ? "Creating…" : "+ Create application address"}
          </button>
        </>
      ) : (
        <>
          <div className="panel-copy-row">
            <code className="panel-copy-value">{address}</code>
            <button type="button" className="panel-btn panel-btn-quiet" onClick={handleCopy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="panel-hint">
            {status === "active"
              ? "Register this with schools now. Mail sent here forwards to the team inbox and logs itself in the case log below."
              : "Deactivated — mail sent here still logs to the case log for the record, but no longer forwards. Turn it back on if you need to reach the school again."}
          </p>
          <button type="button" className="panel-btn" onClick={handleToggle} disabled={busy}>
            {busy ? "Working…" : status === "active" ? "Deactivate" : "Reactivate"}
          </button>
        </>
      )}
    </section>
  );
}
