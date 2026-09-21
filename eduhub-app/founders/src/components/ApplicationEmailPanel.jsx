import { useState } from "react";
import {
  generateParentApplicationAlias,
  setParentApplicationAliasStatus,
  regenerateParentApplicationPassword,
} from "../lib/staffData";
import "./panels.css";
import "./ApplicationEmailPanel.css";

const DOMAIN = "applications.heatherharries.com";

// Copies a value and briefly confirms it went to the clipboard.
function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button type="button" className={"ae-btn" + (copied ? " is-done" : "")} onClick={handleCopy}>
      {copied ? "Copied" : label}
    </button>
  );
}

// One card per parent (Mother, Father). Each parent gets their own address
// and password to register with a school; the same pair works for every
// school (addendum 42/43). Addresses are never deleted -- an address that
// shouldn't be used any more is deactivated, and can be turned back on.
function ParentAliasCard({ parent, onParentChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState(false);

  const alias = parent.application_alias;
  const status = parent.application_alias_status;
  const address = alias ? `${alias}@${DOMAIN}` : null;
  const active = status === "active";

  async function run(action, fallback) {
    setBusy(true);
    setError("");
    try {
      onParentChange(await action());
    } catch (err) {
      setError(err.message || fallback);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={"ae-card" + (address && !active ? " is-inactive" : "")}>
      <div className="ae-card-head">
        <div className="ae-who">
          <span className="ae-role">{parent.relationship}</span>
          {parent.full_name && <span className="ae-name">{parent.full_name}</span>}
        </div>
        {address && <span className={"ae-badge" + (active ? " is-active" : "")}>{active ? "Active" : "Inactive"}</span>}
      </div>

      {!address ? (
        <div className="ae-empty">
          <p className="ae-empty-text">No address yet.</p>
          <button
            type="button"
            className="panel-btn panel-btn-primary"
            disabled={busy}
            onClick={() =>
              run(
                () => generateParentApplicationAlias(parent.id, parent.full_name, parent.relationship),
                "Couldn't create an address."
              )
            }
          >
            {busy ? "Creating…" : "+ Create address"}
          </button>
        </div>
      ) : (
        <>
          <div className="ae-field">
            <span className="ae-label">Email</span>
            <div className="ae-value">
              <code className="ae-code">{address}</code>
              <CopyButton value={address} />
            </div>
          </div>

          <div className="ae-field">
            <span className="ae-label">Password</span>
            {parent.application_password ? (
              <div className="ae-value">
                <code className="ae-code">{revealed ? parent.application_password : "••••••••••••"}</code>
                <button type="button" className="ae-btn" onClick={() => setRevealed((v) => !v)}>
                  {revealed ? "Hide" : "Show"}
                </button>
                <CopyButton value={parent.application_password} />
              </div>
            ) : (
              <div className="ae-value">
                <span className="ae-muted">No password yet</span>
                <button
                  type="button"
                  className="ae-btn"
                  disabled={busy}
                  onClick={() => run(() => regenerateParentApplicationPassword(parent.id), "Couldn't create a password.")}
                >
                  {busy ? "Generating…" : "Generate one"}
                </button>
              </div>
            )}
          </div>

          <div className="ae-card-foot">
            <button
              type="button"
              className="ae-link"
              disabled={busy}
              onClick={() =>
                run(
                  () => setParentApplicationAliasStatus(parent.id, active ? "inactive" : "active"),
                  "Couldn't update that."
                )
              }
            >
              {busy ? "Working…" : active ? "Deactivate this address" : "Reactivate this address"}
            </button>
          </div>
        </>
      )}

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
    </div>
  );
}

// The actual mail routing lives outside this app (ImprovMX catch-all
// forwarding on applications.heatherharries.com into relocate@heatherharries.com);
// this panel only shows and controls the CRM's side of it.
//
// One address per parent, and that's all (Heather, 21 Sept 2026: "just one
// for mother and one for father"). The old family-wide address is no longer
// shown, but nothing was deleted -- families.application_alias still exists,
// and mail sent to an existing family address still forwards and logs.
export default function ApplicationEmailPanel({ parents, onParentChange }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Application email</h2>
      </div>

      <p className="panel-hint ae-intro">
        Use these instead of relocate@heatherharries.com when registering with a school: one address per parent.
        Mail sent to them reaches the team inbox and is logged in the case log. The same email and password work
        for every school.
      </p>

      {(parents || []).length === 0 ? (
        <p className="panel-hint">Add the parents' names on the Family details tab first, then their addresses appear here.</p>
      ) : (
        <div className="ae-grid">
          {parents.map((parent) => (
            <ParentAliasCard key={parent.id} parent={parent} onParentChange={onParentChange} />
          ))}
        </div>
      )}
    </section>
  );
}
