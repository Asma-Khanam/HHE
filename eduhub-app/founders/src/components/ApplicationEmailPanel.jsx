import { useState } from "react";
import {
  generateParentApplicationAlias,
  setParentApplicationAliasStatus,
  regenerateParentApplicationPassword,
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

// The email + password pair for one already-created address. Handles the
// case where the address was generated before application_password existed
// (addendum 42, same day, before addendum 43 added it) — those rows have no
// password yet, so this offers to fill one in without touching the address
// itself, since the address may already be registered with a school.
function AddressWithPassword({ address, password, onGeneratePassword, busy }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <>
      <code className="panel-copy-value">{address}</code>
      <CopyButton value={address} label="Copy email" />
      {password ? (
        <>
          <code className="panel-copy-value">{revealed ? password : "••••••••••••"}</code>
          <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setRevealed((v) => !v)}>
            {revealed ? "Hide" : "Show"}
          </button>
          <CopyButton value={password} label="Copy password" />
        </>
      ) : (
        <button type="button" className="panel-btn panel-btn-quiet" onClick={onGeneratePassword} disabled={busy}>
          {busy ? "Generating…" : "No password yet — generate one"}
        </button>
      )}
    </>
  );
}

// One row per parent, so Mother and Father can each get their own address +
// password to register separately with a school portal (addendum 42) —
// sits alongside the family-wide one above it, doesn't replace it. Same
// password every time this address is used — addendum 43 dropped the idea
// of a different login per school, since there isn't one in practice.
function ParentAliasRow({ parent, onParentChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const alias = parent.application_alias;
  const status = parent.application_alias_status;
  const address = alias ? `${alias}@${DOMAIN}` : null;

  async function handleGenerate() {
    setBusy(true);
    setError("");
    try {
      const updated = await generateParentApplicationAlias(parent.id, parent.full_name, parent.relationship);
      onParentChange(updated);
    } catch (err) {
      setError(err.message || "Couldn't create an address.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGeneratePassword() {
    setBusy(true);
    setError("");
    try {
      const updated = await regenerateParentApplicationPassword(parent.id);
      onParentChange(updated);
    } catch (err) {
      setError(err.message || "Couldn't create a password.");
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
          <AddressWithPassword
            address={address}
            password={parent.application_password}
            onGeneratePassword={handleGeneratePassword}
            busy={busy}
          />
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
// -- this panel only shows and controls the CRM's side of it.
//
// One address per parent, and that's all (Heather, 21 Sept 2026: "just one
// for mother and one for father"). This panel used to ALSO show a third,
// family-wide address above the parents'. That block is gone from the
// screen; nothing is deleted -- families.application_alias and its
// password still exist, and mail sent to an existing family address still
// forwards and logs. Each parent's pair works for every school it's
// registered with (addendum 43).
export default function ApplicationEmailPanel({ parents, onParentChange }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Application email</h2>
      </div>

      <p className="panel-hint">
        Use these instead of relocate@heatherharries.com when registering with a school -- one address for each
        parent. Each forwards straight into the team inbox and everything sent to it lands in the case log
        automatically. A password is generated with it, ready to copy-paste, and the same pair works for every
        school it gets registered with.
      </p>

      {(parents || []).length === 0 ? (
        <p className="panel-hint">Add the parents' names on the Family details tab first, then their addresses appear here.</p>
      ) : (
        <div className="parent-alias-section">
          {parents.map((parent) => (
            <ParentAliasRow key={parent.id} parent={parent} onParentChange={onParentChange} />
          ))}
        </div>
      )}
    </section>
  );
}
