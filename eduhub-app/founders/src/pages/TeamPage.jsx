import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  listStaff,
  listPendingSignups,
  addStaffMember,
  setStaffRole,
  setStaffPosition,
  removeStaffMember,
  friendlyError,
} from "../lib/staffData";
import "../components/panels.css";
import "./TeamPage.css";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// One row of the "Pending signups" list — its own name/position/role
// fields, so granting one person doesn't touch what's typed for another.
function PendingRow({ signup, onGrant, busy }) {
  const [fullName, setFullName] = useState(signup.full_name || "");
  const [position, setPosition] = useState("");
  const [role, setRole] = useState("member");

  return (
    <li className="team-row team-row-pending">
      <div className="team-row-avatar team-row-avatar-pending">
        {(signup.full_name || signup.email || "?").charAt(0).toUpperCase()}
      </div>
      <div className="team-row-info">
        <div className="team-row-name">{signup.full_name || signup.email}</div>
        <div className="team-row-meta">
          {signup.email} · signed up {formatDate(signup.created_at)}
        </div>
      </div>
      <div className="team-row-controls team-row-controls-pending">
        <input
          className="panel-input"
          type="text"
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <input
          className="panel-input"
          type="text"
          placeholder="Position (e.g. COO)"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        />
        <select className="panel-select" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button
          type="button"
          className="panel-btn panel-btn-primary"
          disabled={busy}
          onClick={() => onGrant(signup, { fullName, position, role })}
        >
          {busy ? "Granting…" : "Grant access"}
        </button>
      </div>
    </li>
  );
}

// Who's on the team, and the only place that's ever changed from now on —
// see eduhub_schema_addendum_13_staff_admin.sql for why this used to mean
// asking whoever had Supabase access to run SQL by hand. An admin manages
// everyone (including other admins) from here; a member can't reach this
// page at all (StaffShell only links to it for admins, and the database
// itself refuses these actions from anyone who isn't one, so a member
// typing the URL directly still can't do anything through it).
//
// Granting access (addendum 14) works from a list of people who've already
// created their own login on the Sign Up page — "Pending signups" — rather
// than an admin having to know and type their exact email from memory.
export default function TeamPage() {
  const [meId, setMeId] = useState(null);
  const [rows, setRows] = useState(null);
  const [pending, setPending] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [editingPositionId, setEditingPositionId] = useState(null);
  const [positionDraft, setPositionDraft] = useState("");

  async function load() {
    try {
      const [staff, pendingSignups, { data }] = await Promise.all([
        listStaff(),
        listPendingSignups(),
        supabase.auth.getUser(),
      ]);
      setMeId(data?.user?.id || null);
      setRows(staff);
      setPending(pendingSignups);
    } catch (err) {
      setError(friendlyError(err, "Couldn't load the team."));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleGrant(signup, { fullName, position, role }) {
    setBusyId(signup.user_id);
    setError("");
    try {
      await addStaffMember({ email: signup.email, fullName, role, position });
      await load();
    } catch (err) {
      setError(friendlyError(err, "Couldn't grant access."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRoleChange(row, newRole) {
    setBusyId(row.user_id);
    setError("");
    try {
      await setStaffRole(row.user_id, newRole);
      await load();
    } catch (err) {
      setError(friendlyError(err, "Couldn't change that role."));
    } finally {
      setBusyId(null);
    }
  }

  function startEditingPosition(row) {
    setEditingPositionId(row.user_id);
    setPositionDraft(row.position || "");
  }

  async function savePosition(row) {
    setBusyId(row.user_id);
    setError("");
    try {
      await setStaffPosition(row.user_id, positionDraft);
      setEditingPositionId(null);
      await load();
    } catch (err) {
      setError(friendlyError(err, "Couldn't update that position."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(row) {
    if (!window.confirm(`Remove ${row.full_name || row.email} from the team? They'll keep their login but lose all access.`)) {
      return;
    }
    setBusyId(row.user_id);
    setError("");
    try {
      await removeStaffMember(row.user_id);
      await load();
    } catch (err) {
      setError(friendlyError(err, "Couldn't remove that person."));
    } finally {
      setBusyId(null);
    }
  }

  if (rows === null && !error) return <div className="team-page">Loading…</div>;

  return (
    <div className="team-page">
      <h1 className="team-page-title">Team</h1>
      <p className="team-page-subtitle">
        Everyone here can see and work on every family. Admins can also grant access, remove people, and promote or
        demote them — so this never has to go through Supabase again.
      </p>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <section className="panel">
        <div className="panel-head">
          <h2>
            Pending signups
            {pending.length > 0 && <span className="panel-count">{pending.length}</span>}
          </h2>
        </div>
        <p className="panel-hint">
          These people have created a login on the Sign Up page but don't have access yet. Give each one a name,
          position, and role, then grant access.
        </p>
        {pending.length === 0 ? (
          <p className="panel-hint">Nobody waiting right now.</p>
        ) : (
          <ul className="panel-list">
            {pending.map((signup) => (
              <PendingRow key={signup.user_id} signup={signup} onGrant={handleGrant} busy={busyId === signup.user_id} />
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>
            Current team
            {rows?.length > 0 && <span className="panel-count">{rows.length}</span>}
          </h2>
        </div>
        <ul className="panel-list">
          {(rows || []).map((row) => (
            <li key={row.user_id} className="team-row">
              <div className="team-row-avatar">{(row.full_name || row.email || "?").charAt(0).toUpperCase()}</div>
              <div className="team-row-info">
                <div className="team-row-name">
                  {row.full_name || row.email}
                  {row.user_id === meId && <span className="team-row-you"> · You</span>}
                </div>
                <div className="team-row-meta">
                  {row.email} · joined {formatDate(row.created_at)}
                </div>
              </div>

              {editingPositionId === row.user_id ? (
                <div className="team-row-position-edit">
                  <input
                    className="panel-input"
                    type="text"
                    placeholder="Position"
                    value={positionDraft}
                    onChange={(e) => setPositionDraft(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="panel-btn panel-btn-primary"
                    disabled={busyId === row.user_id}
                    onClick={() => savePosition(row)}
                  >
                    Save
                  </button>
                  <button type="button" className="panel-btn" onClick={() => setEditingPositionId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" className="team-row-position" onClick={() => startEditingPosition(row)}>
                  {row.position || "+ Add position"}
                </button>
              )}

              <div className="team-row-controls">
                <select
                  className="panel-select"
                  value={row.role}
                  disabled={busyId === row.user_id}
                  onChange={(e) => handleRoleChange(row, e.target.value)}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="button"
                  className="panel-btn team-row-remove"
                  disabled={busyId === row.user_id}
                  onClick={() => handleRemove(row)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
