import { useState } from "react";
import { archiveFamily, restoreFamily, friendlyError } from "../lib/staffData";
import "./ArchiveFamilyControl.css";

// Archive a family that decides not to move (Miss Lyndsay, 21 Oct 2026). Nothing is
// deleted: they leave the Caseload, Workload and Dashboard, and can be restored.
const REASONS = ["Not moving", "Went elsewhere", "Not responding", "Duplicate account", "Other"];

export default function ArchiveFamilyControl({ family, onChanged }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
      setOpen(false);
      setNote("");
      await onChanged?.();
    } catch (e) {
      setError(friendlyError(e, "Couldn't change that."));
    } finally {
      setBusy(false);
    }
  }

  if (family.archived_at) {
    const when = new Date(family.archived_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return (
      <div className="afc-banner" role="status">
        <div>
          <strong>Archived on {when}</strong>
          {family.archived_reason ? ` · ${family.archived_reason}` : ""}
          <div className="afc-sub">Hidden from the Caseload, Workload and Dashboard. Everything on their record is kept.</div>
        </div>
        <button type="button" className="panel-btn" disabled={busy} onClick={() => run(() => restoreFamily(family.id))}>
          {busy ? "Restoring…" : "Restore family"}
        </button>
        {error && <p className="afc-error">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="afc-row">
        <button type="button" className="afc-btn" onClick={() => setOpen(true)} title="Hide this family from the working lists. Nothing is deleted.">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="4" width="18" height="4" rx="1" />
            <path d="M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 12h4" />
          </svg>
          Archive family
        </button>
      </div>
    );
  }

  return (
    <div className="afc-panel">
      <strong>Archive this family?</strong>
      <p className="afc-sub">
        They will leave the Caseload, Workload and Dashboard. Nothing is deleted, and you can restore them from the
        Archived tab.
      </p>
      <div className="afc-fields">
        <select className="panel-select" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy}>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          className="panel-input"
          placeholder="Anything to add? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          className="panel-btn panel-btn-primary"
          disabled={busy}
          onClick={() => run(() => archiveFamily(family.id, note.trim() ? `${reason} (${note.trim()})` : reason))}
        >
          {busy ? "Archiving…" : "Archive"}
        </button>
        <button type="button" className="panel-btn panel-btn-quiet" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <p className="afc-error">{error}</p>}
    </div>
  );
}
