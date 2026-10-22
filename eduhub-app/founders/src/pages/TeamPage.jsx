import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { CLIENT_STAGES } from "../lib/workflow";
import {
  listFamilies,
  listStaff,
  listPendingSignups,
  addStaffMember,
  setStaffRole,
  setStaffPosition,
  removeStaffMember,
  uploadStaffAvatar,
  removeStaffAvatar,
  friendlyError,
} from "../lib/staffData";
import StaffAvatar from "../components/StaffAvatar";
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
  const [families, setFamilies] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [editingPositionId, setEditingPositionId] = useState(null);
  const [positionDraft, setPositionDraft] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);

  async function load() {
    try {
      const [staff, pendingSignups, { data }, familyList] = await Promise.all([
        listStaff(),
        listPendingSignups(),
        supabase.auth.getUser(),
        listFamilies().catch(() => null), // the workload table is a nice-to-have; never block the page on it
      ]);
      setFamilies(familyList);
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
    setConfirmRemoveId(null);
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

  async function handleAvatar(row, file) {
    if (!file) return;
    setBusyId(row.user_id);
    setError("");
    try {
      await uploadStaffAvatar(row.user_id, file);
      await load();
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that photo."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleAvatarRemove(row) {
    setBusyId(row.user_id);
    setError("");
    try {
      await removeStaffAvatar(row.user_id);
      await load();
    } catch (err) {
      setError(friendlyError(err, "Couldn't remove that photo."));
    } finally {
      setBusyId(null);
    }
  }

  // Families per consultant (owner), split by where the family is.
  const workload = (() => {
    if (!families || !rows) return null;
    const make = (id, name) => ({ id, name, active: 0, byStage: {} });
    const map = new Map(rows.map((r) => [r.user_id, make(r.user_id, r.full_name || r.email)]));
    families.forEach((f) => {
      if (f.archived_at) return; // archived families are not anyone's workload
      let key = f.owner_staff_id || "none";
      if (!map.has(key)) map.set(key, make(key, key === "none" ? "Unassigned" : "Former staff"));
      const w = map.get(key);
      if (f.client_stage) w.byStage[f.client_stage] = (w.byStage[f.client_stage] || 0) + 1;
      if (f.client_stage !== "placed") w.active += 1;
    });
    if (!map.has("none")) map.set("none", make("none", "Unassigned"));
    const list = [...map.values()];
    const unassigned = list.filter((w) => w.id === "none");
    return [...list.filter((w) => w.id !== "none").sort((a, b) => b.active - a.active || a.name.localeCompare(b.name)), ...unassigned];
  })();

  if (rows === null && !error) return <div className="team-page">Loading…</div>;

  const staffById = new Map((rows || []).map((r) => [r.user_id, r]));
  const adminCount = (rows || []).filter((r) => r.role === "admin").length;
  const maxActive = Math.max(1, ...(workload || []).map((w) => w.active));

  return (
    <div className="team-page">
      <header className="team-hero">
        <div>
          <h1 className="team-page-title">Team</h1>
          <p className="team-page-subtitle">
            Everyone here can see and work on every family. Admins can also grant access, remove people and change roles.
          </p>
        </div>
        {rows?.length > 0 && (
          <div className="team-hero-people" aria-label="Team members">
            <div className="team-stack">
              {rows.map((r) => (
                <StaffAvatar key={r.user_id} person={r} size={44} ring />
              ))}
            </div>
            <span className="team-hero-count">
              {rows.length} {rows.length === 1 ? "person" : "people"} · {adminCount} admin{adminCount === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </header>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <div className="team-layout">
        <section className="team-main">
          <div className="team-section-head">
            <h2>
              Current team
              {rows?.length > 0 && <span className="panel-count">{rows.length}</span>}
            </h2>
          </div>
          <div className="team-cards">
            {(rows || []).map((row) => {
              const busy = busyId === row.user_id;
              return (
                <article key={row.user_id} className={"team-card" + (row.user_id === meId ? " is-me" : "")}>
                  <div className="team-card-photo">
                    <StaffAvatar person={row} size={84} />
                    <label className={"team-card-camera" + (busy ? " is-busy" : "")} title="Change photo">
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        disabled={busy}
                        onChange={(e) => {
                          handleAvatar(row, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                      <span aria-hidden="true">📷</span>
                    </label>
                  </div>
                  <div className="team-card-name">
                    {row.full_name || row.email}
                    {row.user_id === meId && <span className="team-row-you"> · You</span>}
                  </div>
                  <span className={"team-role-pill" + (row.role === "admin" ? " is-admin" : "")}>
                    {row.role === "admin" ? "Admin" : "Member"}
                  </span>

                  {editingPositionId === row.user_id ? (
                    <div className="team-row-position-edit">
                      <input
                        className="panel-input"
                        type="text"
                        placeholder="Position"
                        value={positionDraft}
                        onChange={(e) => setPositionDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && savePosition(row)}
                        autoFocus
                      />
                      <button type="button" className="panel-btn panel-btn-primary" disabled={busy} onClick={() => savePosition(row)}>
                        Save
                      </button>
                      <button type="button" className="panel-btn" onClick={() => setEditingPositionId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="team-card-position" onClick={() => startEditingPosition(row)}>
                      {row.position || "+ Add position"}
                    </button>
                  )}

                  {row.bio && <p className="team-card-bio">{row.bio}</p>}
                  {((row.specialties || []).length > 0 || (row.languages || []).length > 0) && (
                    <div className="chip-row">
                      {(row.specialties || []).map((c) => <span key={"s" + c} className="chip chip-static">{c}</span>)}
                      {(row.languages || []).map((c) => <span key={"l" + c} className="chip chip-static chip-lang">{c}</span>)}
                    </div>
                  )}
                  <div className="team-card-meta">
                    {row.email}
                    {row.phone && (<><br />{row.phone}</>)}
                    <br />
                    Joined {formatDate(row.created_at)}
                  </div>

                  <div className="team-card-footer">
                    <select
                      className="panel-select"
                      value={row.role}
                      disabled={busy}
                      onChange={(e) => handleRoleChange(row, e.target.value)}
                      aria-label="Role"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    {row.avatar_url && (
                      <button type="button" className="panel-btn" disabled={busy} onClick={() => handleAvatarRemove(row)}>
                        Remove photo
                      </button>
                    )}
                    {confirmRemoveId === row.user_id ? (
                      <>
                        <button type="button" className="panel-btn team-row-remove" disabled={busy} onClick={() => handleRemove(row)}>
                          Yes, remove
                        </button>
                        <button type="button" className="panel-btn" onClick={() => setConfirmRemoveId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button type="button" className="panel-btn team-row-remove" disabled={busy} onClick={() => setConfirmRemoveId(row.user_id)}>
                        Remove
                      </button>
                    )}
                  </div>
                  {confirmRemoveId === row.user_id && (
                    <p className="team-card-warn">They keep their login but lose all access.</p>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <aside className="team-aside">
          <section className={"team-panel" + (pending.length ? " has-pending" : "")}>
            <div className="team-section-head">
              <h2>
                Pending signups
                {pending.length > 0 && <span className="panel-count">{pending.length}</span>}
              </h2>
            </div>
            {pending.length === 0 ? (
              <p className="team-empty">Nobody is waiting for access.</p>
            ) : (
              <>
                <p className="panel-hint">
                  These people created a login on the Sign Up page but have no access yet. Give each a name, position and role, then
                  grant access.
                </p>
                <ul className="panel-list">
                  {pending.map((signup) => (
                    <PendingRow key={signup.user_id} signup={signup} onGrant={handleGrant} busy={busyId === signup.user_id} />
                  ))}
                </ul>
              </>
            )}
          </section>

          {workload && (
            <section className="team-panel">
              <div className="team-section-head">
                <h2>Workload</h2>
              </div>
              <p className="panel-hint">Families each consultant owns, by where the family is. Active means not placed yet.</p>
              <ul className="team-legend">
                {CLIENT_STAGES.map((s) => (
                  <li key={s.key}>
                    <span className={`team-dot stage-${s.key}`} /> {s.key === "paid_consult" ? "Paid consult" : s.label}
                  </li>
                ))}
              </ul>
              <ul className="team-load-list">
                {workload.map((w) => {
                  const person = staffById.get(w.id);
                  return (
                    <li key={w.id} className={w.id === "none" ? "is-unassigned" : undefined}>
                      <div className="team-load-top">
                        {person ? <StaffAvatar person={person} size={28} /> : <span className="staff-avatar team-load-ghost" style={{ width: 28, height: 28 }}>?</span>}
                        <span className="team-load-name">{w.name}</span>
                        <span className="team-load-total" title="Active families">
                          {w.active}
                        </span>
                      </div>
                      <div className="team-load-bar" style={{ width: `${Math.max(4, (w.active / maxActive) * 100)}%` }}>
                        {CLIENT_STAGES.filter((s) => s.key !== "placed").map((s) =>
                          w.byStage[s.key] ? (
                            <span
                              key={s.key}
                              className={`team-seg stage-${s.key}`}
                              style={{ flexGrow: w.byStage[s.key] }}
                              title={`${s.label}: ${w.byStage[s.key]}`}
                            />
                          ) : null
                        )}
                      </div>
                      {w.byStage.placed ? <div className="team-load-placed">{w.byStage.placed} placed</div> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
