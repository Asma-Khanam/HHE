import { useState } from "react";
import { addPortalCredential, updatePortalCredential, deletePortalCredential, friendlyError } from "../lib/staffData";
import "./panels.css";

const EMPTY_FORM = { schoolName: "", portalUrl: "", loginEmail: "", loginPassword: "", notes: "", parentId: "" };

function toFormState(row) {
  return {
    schoolName: row.school_name || "",
    portalUrl: row.portal_url || "",
    loginEmail: row.login_email || "",
    loginPassword: row.login_password || "",
    notes: row.notes || "",
    parentId: row.parent_id || "",
  };
}

function toPayload(form, familyId) {
  return {
    family_id: familyId,
    parent_id: form.parentId || null,
    school_name: form.schoolName.trim(),
    portal_url: form.portalUrl.trim() || null,
    login_email: form.loginEmail.trim(),
    login_password: form.loginPassword,
    notes: form.notes.trim() || null,
  };
}

function CredentialForm({ form, setForm, parents, onCancel, onSubmit, busy, submitLabel }) {
  return (
    <form
      className="portal-credential-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="portal-credential-form-row">
        <label>
          <span>School</span>
          <input
            className="panel-input"
            value={form.schoolName}
            onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))}
            placeholder="e.g. GEMS Wellington Academy"
            required
          />
        </label>
        <label>
          <span>Registered under</span>
          <select
            className="panel-select"
            value={form.parentId}
            onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
          >
            <option value="">The family address</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.relationship} — {p.full_name || "unnamed"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="portal-credential-form-row">
        <label>
          <span>Portal URL (optional)</span>
          <input
            className="panel-input"
            value={form.portalUrl}
            onChange={(e) => setForm((f) => ({ ...f, portalUrl: e.target.value }))}
            placeholder="https://admissions.school.com"
          />
        </label>
        <label>
          <span>Login email</span>
          <input
            className="panel-input"
            value={form.loginEmail}
            onChange={(e) => setForm((f) => ({ ...f, loginEmail: e.target.value }))}
            placeholder="the alias used to register"
            required
          />
        </label>
        <label>
          <span>Password</span>
          <input
            className="panel-input"
            value={form.loginPassword}
            onChange={(e) => setForm((f) => ({ ...f, loginPassword: e.target.value }))}
            required
          />
        </label>
      </div>

      <label>
        <span>Notes (optional)</span>
        <textarea
          className="panel-input"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Anything else worth remembering about this login."
        />
      </label>

      <div className="note-form-actions">
        <button type="button" className="panel-btn panel-btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="submit"
          className="panel-btn panel-btn-primary"
          disabled={busy || !form.schoolName.trim() || !form.loginEmail.trim() || !form.loginPassword}
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function CredentialItem({ row, parentById, onEdit, onDelete, busy }) {
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const owner = row.parent_id ? parentById[row.parent_id] : null;

  return (
    <li className="portal-credential-item">
      <div className="portal-credential-head">
        <span className="portal-credential-school">{row.school_name}</span>
        <span className="portal-credential-tag">{owner ? `${owner.relationship}'s address` : "Family address"}</span>
      </div>
      <div className="portal-credential-fields">
        {row.portal_url && (
          <div>
            <span className="portal-credential-field-label">Portal</span>
            <a href={row.portal_url} target="_blank" rel="noreferrer">
              {row.portal_url}
            </a>
          </div>
        )}
        <div>
          <span className="portal-credential-field-label">Login</span>
          <code>{row.login_email}</code>
        </div>
        <div>
          <span className="portal-credential-field-label">Password</span>
          <code>{revealed ? row.login_password : "••••••••"}</code>
        </div>
      </div>
      {row.notes && <p className="panel-hint" style={{ marginTop: 6 }}>{row.notes}</p>}
      <div className="portal-credential-actions">
        <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setRevealed((v) => !v)}>
          {revealed ? "Hide password" : "Show password"}
        </button>
        <button type="button" className="panel-btn panel-btn-quiet" onClick={() => onEdit(row)}>
          Edit
        </button>
        {confirming ? (
          <span className="note-confirm">
            <span>Delete this login? It won't be recoverable.</span>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="is-danger" onClick={() => onDelete(row.id)} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </button>
          </span>
        ) : (
          <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

// Addendum 42 — where staff store the login a family or parent's
// application alias got registered with on a school's own admissions
// portal, so the team can go back into that same account later (a decision,
// a document request) instead of re-registering or resetting a password.
// Staff-only end to end — the underlying table has no client-facing RLS
// policy at all, so families never see any part of this panel's data.
export default function PortalCredentialsPanel({ familyId, parents, credentials, onChange }) {
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parentById = Object.fromEntries((parents || []).map((p) => [p.id, p]));

  function startAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setComposing(true);
    setError("");
  }

  function startEdit(row) {
    setForm(toFormState(row));
    setEditingId(row.id);
    setComposing(true);
    setError("");
  }

  function cancel() {
    setComposing(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  async function handleSubmit() {
    setBusy(true);
    setError("");
    try {
      if (editingId) {
        const updated = await updatePortalCredential(editingId, toPayload(form, familyId));
        onChange((list) => list.map((r) => (r.id === updated.id ? updated : r)));
      } else {
        const created = await addPortalCredential(toPayload(form, familyId));
        onChange((list) => [created, ...list]);
      }
      cancel();
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that login."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    setBusy(true);
    setError("");
    try {
      await deletePortalCredential(id);
      onChange((list) => list.filter((r) => r.id !== id));
    } catch (err) {
      setError(friendlyError(err, "Couldn't delete that login."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          School portal logins
          {credentials.length > 0 && <span className="panel-count">{credentials.length}</span>}
        </h2>
        {!composing && (
          <button type="button" className="panel-btn" onClick={startAdd}>
            + Add login
          </button>
        )}
      </div>

      <p className="panel-hint">
        Staff only — families never see this. Save the login here whenever a school's own admissions portal needs a
        password, so the team can get back in later without resetting it.
      </p>

      {composing && (
        <CredentialForm
          form={form}
          setForm={setForm}
          parents={parents || []}
          onCancel={cancel}
          onSubmit={handleSubmit}
          busy={busy}
          submitLabel={editingId ? "Save changes" : "Save login"}
        />
      )}

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {credentials.length === 0 ? (
        <p className="panel-hint">No portal logins saved for this family yet.</p>
      ) : (
        <ul className="portal-credential-list">
          {credentials.map((row) => (
            <CredentialItem
              key={row.id}
              row={row}
              parentById={parentById}
              onEdit={startEdit}
              onDelete={handleDelete}
              busy={busy}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
