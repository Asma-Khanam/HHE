import { useEffect, useState } from "react";
import { getCurrentStaff, updateMyProfile, uploadStaffAvatar, removeStaffAvatar, friendlyError } from "../lib/staffData";
import StaffAvatar from "../components/StaffAvatar";
import "../components/panels.css";
import "./TeamPage.css";

const BIO_MAX = 400;

// Every teammate's own page: change your photo, name, phone, location and bio.
// Position and role are set by an admin, so they show here but can't be edited.
export default function ProfilePage() {
  const [me, setMe] = useState(null);
  const [form, setForm] = useState({ fullName: "", phone: "", location: "", bio: "" });
  const [state, setState] = useState("idle"); // idle | saving | saved
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getCurrentStaff().then((row) => {
      if (!row) return;
      setMe(row);
      setForm({ fullName: row.full_name || "", phone: row.phone || "", location: row.location || "", bio: row.bio || "" });
    });
  }, []);

  function change(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setState("idle");
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    setState("saving");
    try {
      await updateMyProfile(form);
      setMe((m) => ({ ...m, full_name: form.fullName || m.full_name, phone: form.phone, location: form.location, bio: form.bio }));
      setState("saved");
      window.dispatchEvent(new Event("profile-updated"));
    } catch (err) {
      setState("idle");
      setError(friendlyError(err, "Couldn't save your profile."));
    }
  }

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !me) return;
    setError("");
    setPhotoBusy(true);
    try {
      const url = await uploadStaffAvatar(me.user_id, file);
      setMe((m) => ({ ...m, avatar_url: url }));
      window.dispatchEvent(new Event("profile-updated"));
    } catch (err) {
      setError(friendlyError(err, "Couldn't upload that photo."));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function dropPhoto() {
    setPhotoBusy(true);
    setError("");
    try {
      await removeStaffAvatar(me.user_id);
      setMe((m) => ({ ...m, avatar_url: null }));
      window.dispatchEvent(new Event("profile-updated"));
    } catch (err) {
      setError(friendlyError(err, "Couldn't remove the photo."));
    } finally {
      setPhotoBusy(false);
    }
  }

  if (!me) return <div className="team-page"><p className="team-page-subtitle">Loading…</p></div>;

  const shownName = form.fullName || me.email;

  return (
    <div className="team-page profile-page">
      <header className="team-hero">
        <div>
          <h1 className="team-page-title">My profile</h1>
          <p className="team-page-subtitle">This is how you appear to the rest of the team. Only you can change these details.</p>
        </div>
      </header>

      {error && <div className="panel-error" role="alert">{error}</div>}

      <div className="profile-layout">
        <aside className="profile-card">
          <div className="team-card-photo">
            <StaffAvatar person={{ ...me, full_name: shownName }} size={132} />
            <label className={"team-card-camera profile-camera" + (photoBusy ? " is-busy" : "")} title="Change photo">
              <input type="file" accept="image/*" hidden disabled={photoBusy} onChange={pickPhoto} />
              📷
            </label>
          </div>
          <div className="profile-name">{shownName}</div>
          <span className={"team-role-pill" + (me.role === "admin" ? " is-admin" : "")}>{me.role === "admin" ? "Admin" : "Member"}</span>
          <div className="team-card-position profile-position">{me.position || "No position set yet"}</div>
          {form.bio && <p className="team-card-bio">{form.bio}</p>}
          <div className="team-card-meta">
            {me.email}
            {form.phone && (<><br />{form.phone}</>)}
            {form.location && (<><br />{form.location}</>)}
          </div>
          {me.avatar_url && (
            <button type="button" className="profile-remove-photo" disabled={photoBusy} onClick={dropPhoto}>
              Remove photo
            </button>
          )}
        </aside>

        <form className="profile-form" onSubmit={save}>
          <label className="profile-field">
            <span>Full name</span>
            <input className="panel-input" value={form.fullName} onChange={(e) => change("fullName", e.target.value)} placeholder="Your name" />
          </label>
          <div className="profile-row">
            <label className="profile-field">
              <span>Phone</span>
              <input className="panel-input" value={form.phone} onChange={(e) => change("phone", e.target.value)} placeholder="+44 …" inputMode="tel" />
            </label>
            <label className="profile-field">
              <span>Location</span>
              <input className="panel-input" value={form.location} onChange={(e) => change("location", e.target.value)} placeholder="City, country" />
            </label>
          </div>
          <label className="profile-field">
            <span>About you</span>
            <textarea
              className="panel-input"
              rows={5}
              maxLength={BIO_MAX}
              value={form.bio}
              onChange={(e) => change("bio", e.target.value)}
              placeholder="A line or two the team can see: what you do, languages, areas you know best."
            />
            <small>{form.bio.length}/{BIO_MAX}</small>
          </label>
          <div className="profile-field">
            <span>Email (your login)</span>
            <div className="profile-readonly">{me.email}</div>
          </div>
          <div className="profile-field">
            <span>Position and role</span>
            <div className="profile-readonly">{me.position || "Not set"} · {me.role === "admin" ? "Admin" : "Member"} <em>(an admin changes these)</em></div>
          </div>
          <div className="profile-actions">
            <button type="submit" className="panel-btn panel-btn-primary" disabled={state === "saving"}>
              {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
