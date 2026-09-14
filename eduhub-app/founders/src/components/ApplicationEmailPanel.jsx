import { useState } from "react";
import {
  generateApplicationAlias,
  setApplicationAliasStatus,
  generateParentApplicationAlias,
  setParentApplicationAliasStatus,
} from "../lib/staffData";
import "./panels.css";

const DOMAIN = "applications.heatherharries.com";

// Copies either the address or its password, and briefly confirms which one
// just went to the clipboard — the two "Copy" buttons sit right next to each
// other so the confirmation has to say which it was, not just "Copied".
function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button type="button" className="panel-btn panel-btn-quiet" onClick={handleCopy}>
      {copied ? "Copied" : label}
    </button>
  );
}

// One row per parent, so Mother and Father can each get their own address +
// password to register separately with a school portal (addendum 42) —
// sits alongside the family-wide one above it, doesn't replace it. Same
// password every time this address is used — addendum 43 dropped the idea
// of a different login per school, since there isn't one in practice.
function ParentAliasRow({ parent, onParentChange, familyDisplayNameValue }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState(false);

  const alias = parent.application_alias;
  const status = parent.application_alias_status;
  const address = alias ? `${alias}@${DOMAIN}` : null;

  async function handleGenerate() {
    setBusy(true);
    setError("");
    try {
      const updated = await generateParentApplicationAlias(parent.id, familyDisplayNameValue, parent.relationship);
      onParentChange(updated);
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
      const updated = await setParentApplicationAliasStatus(parent.id, status === "active" ? "inactive" : "active");
      onParentChange(updated);
    } catch (err) {
      setError(err.message || "Couldn't update that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="parent-alias-row">
      <span className="parent-alias-role">{parent.relationship}</span>
      {!address ? (
        <button type="button" className="panel-btn panel-btn-quiet" onClick={handleGenerate} disabled={busy}>
          {busy ? "Creating…" : "+ Create address"}
        </button>
      ) : (
        <>
          <code className="panel-copy-value">{address}</code>
          <CopyButton value={address} label="Copy email" />
          <code className="panel-copy-value">{revealed ? parent.application_password : "••••••••••••"}</code>
          <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setRevealed((v) => !v)}>
            {revealed ? "Hide" : "Show"}
          </button>
          <CopyButton value={parent.application_password} label="Copy password" />
          <span className={"families-badge" + (status === "active" ? " is-submitted" : "")}>
            {status === "active" ? "Active" : "Inactive"}
          </span>
          <button type="button" className="panel-btn panel-btn-quiet" onClick={handleToggle} disabled={busy}>
            {busy ? "Working…" : status === "active" ? "Deactivate" : "Reactivate"}
          </button>
        </>
      )}
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
    </div>
  );
}

// The actual mail routing lives outside this app (ImprovMX catch-all
// forwarding on applications.heatherharries.com into relocate@heatherharries.com)
// — this panel only shows and controls the CRM's side of it. Each address
// (the family-wide one below, and each parent's own one further down) comes
// with a password generated the moment the address is created — the same
// email + password pair gets used, unchanged, for every school it's
// registered with. Addendum 43 replaced an earlier per-school-login design
// once it turned out schools don't actually need a different password each.
export default function ApplicationEmailPanel({ family, familyDisplayNameValue, onFamilyChange, parents, onParentChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState(false);

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
            automatically. A password is generated with it, ready to copy-paste, and the same pair works for every
            school it gets registered with.
          </p>
          <button type="button" className="panel-btn panel-btn-primary" onClick={handleGenerate} disabled={busy}>
            {busy ? "Creating…" : "+ Create application address"}
          </button>
        </>
      ) : (
        <>
          <div className="panel-copy-row">
            <code className="panel-copy-value">{address}</code>
            <CopyButton value={address} label="Copy email" />
          </div>
          <div className="panel-copy-row">
            <code className="panel-copy-value">{revealed ? family.application_password : "••••••••••••"}</code>
            <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setRevealed((v) => !v)}>
              {revealed ? "Hide" : "Show"}
            </button>
            <CopyButton value={family.application_password} label="Copy password" />
          </div>
          <p className="panel-hint">
            {status === "active"
              ? "Register this email + password with schools now — the same pair every time. Mail sent to the address forwards to the team inbox and logs itself in the case log below."
              : "Deactivated — mail sent here still logs to the case log for the record, but no longer forwards. Turn it back on if you need to reach the school again."}
          </p>
          <button type="button" className="panel-btn" onClick={handleToggle} disabled={busy}>
            {busy ? "Working…" : status === "active" ? "Deactivate" : "Reactivate"}
          </button>
        </>
      )}

      {(parents || []).length > 0 && (
        <div className="parent-alias-section">
          <p className="panel-hint">
            Some schools want each parent registered separately rather than sharing the family address above — create
            a second address (with its own password) per parent only if that comes up.
          </p>
          {parents.map((parent) => (
            <ParentAliasRow
              key={parent.id}
              parent={parent}
              onParentChange={onParentChange}
              familyDisplayNameValue={familyDisplayNameValue}
            />
          ))}
        </div>
      )}
    </section>
  );
}
