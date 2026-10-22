import { useEffect, useMemo, useState } from "react";
import {
  getCurrentStaff, updateMyProfile, uploadStaffAvatar, removeStaffAvatar,
  countMyFamilies, sendMyPasswordReset, friendlyError,
} from "../lib/staffData";
import StaffAvatar from "../components/StaffAvatar";
import ChipInput from "../components/ChipInput";
import "../components/panels.css";
import "./TeamPage.css";

const BIO_MAX = 400;
const LANGS = ["English", "Arabic", "Hindi", "Urdu", "French", "Spanish", "Mandarin"];
const AREAS = ["UK schools", "UAE schools", "Admissions", "Visas", "Relocation", "Tutoring", "SEN support"];

function emptyForm() {
  return { fullName: "", phone: "", location: "", bio: "", languages: [], specialties: [], timezone: "", linkedin: "" };
}
function fromRow(r) {
  return {
    fullName: r.full_name || "", phone: r.phone || "", location: r.location || "", bio: r.bio || "",
    languages: r.languages || [], specialties: r.specialties || [],
    timezone: r.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "", linkedin: r.linkedin || "",
  };
}
function localTime(tz) {
  try {
    return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date());
  } catch {
    return "";
  }
}

export default function ProfilePage() {
  const [me, setMe] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saved, setSaved] = useState(emptyForm());
  const [state, setState] = useState("idle"); // idle | saving | saved
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const [families, setFamilies] = useState(null);
  const [reset, setReset] = useState("");
  const [, tick] = useState(0);

  useEffect(() => {
    getCurrentStaff().then((row) => {
      if (!row) return;
      setMe(row);
      const f = fromRow(row);
      setForm(f);
      setSaved(f);
      countMyFamilies(row.user_id).then(setFamilies).catch(() => {});
    });
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const zones = useMemo(() => {
    try { return Intl.supportedValuesOf("timeZone"); } catch { return []; }
  }, []);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setState("idle");
  }

  async function save(e) {
    e?.preventDefault();
    setError("");
    setState("saving");
    try {
      await updateMyProfile(form);
      setSaved(form);
      setMe((m) => ({ ...m, full_name: form.fullName || m.full_name }));
      setState("saved");
      window.dispatchEvent(new Event("profile-updated"));
    } catch (err) {
      setState("idle");
      setError(friendlyError(err, "Couldn't save your profile."));
    }
  }

  async function photo(fn, fallback) {
    setError("");
    setPhotoBusy(true);
    try {
      await fn();
      window.dispatchEvent(new Event("profile-updated"));
    } catch (err) {
      setError(friendlyError(err, fallback));
    } finally {
      setPhotoBusy(false);
    }
  }
  const pickPhoto = (file) => file && photo(async () => {
    const url = await uploadStaffAvatar(me.user_id, file);
    setMe((m) => ({ ...m, avatar_url: url }));
  }, "Couldn't upload that photo.");
  const dropPhoto = () => photo(async () => {
    await removeStaffAvatar(me.user_id);
    setMe((m) => ({ ...m, avatar_url: null }));
  }, "Couldn't remove the photo.");

  async function resetPassword() {
    setReset("sending");
    try {
      await sendMyPasswordReset(me.email);
      setReset("sent");
    } catch (err) {
      setReset("");
      setError(friendlyError(err, "Couldn't send the reset email."));
    }
  }

  if (!me) return <div className="team-page"><p className="team-page-subtitle">Loading…</p></div>;

  const name = form.fullName || me.email;
  const checks = [
    ["Add a photo", !!me.avatar_url],
    ["Add your phone number", !!form.phone.trim()],
    ["Add your location", !!form.location.trim()],
    ["Write a short About you", form.bio.trim().length >= 20],
    ["Add a language", form.languages.length > 0],
    ["Add an area you cover", form.specialties.length > 0],
  ];
  const done = checks.filter((c) => c[1]).length;
  const pct = Math.round((done / checks.length) * 100);
  const next = checks.find((c) => !c[1]);
  const clock = localTime(form.timezone);
  const linkedinOk = !form.linkedin || /^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(form.linkedin.trim());

  return (
    <div className="team-page profile-page">
      <header className="team-hero">
        <div>
          <h1 className="team-page-title">My profile</h1>
          <p className="team-page-subtitle">How you appear to the rest of the team. Only you can change these details.</p>
        </div>
      </header>

      {error && <div className="panel-error" role="alert">{error}</div>}

      <div className="profile-layout">
        <aside className="profile-side">
          <div className="profile-card">
            <div
              className="team-card-photo"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); pickPhoto(e.dataTransfer.files?.[0]); }}
            >
              <StaffAvatar person={{ ...me, full_name: name }} size={132} />
              <label className={"team-card-camera profile-camera" + (photoBusy ? " is-busy" : "")} title="Change photo (or drop a picture here)">
                <input type="file" accept="image/*" hidden disabled={photoBusy} onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
                📷
              </label>
            </div>
            <div className="profile-name">{name}</div>
            <span className={"team-role-pill" + (me.role === "admin" ? " is-admin" : "")}>{me.role === "admin" ? "Admin" : "Member"}</span>
            <div className="profile-position">{me.position || "No position set yet"}</div>
            {form.bio && <p className="team-card-bio">{form.bio}</p>}
            {(form.languages.length > 0 || form.specialties.length > 0) && (
              <div className="chip-row">
                {form.specialties.map((c) => <span key={"s" + c} className="chip chip-static">{c}</span>)}
                {form.languages.map((c) => <span key={"l" + c} className="chip chip-static chip-lang">{c}</span>)}
              </div>
            )}
            <div className="team-card-meta">
              {me.email}
              {form.phone && (<><br />{form.phone}</>)}
              {form.location && (<><br />{form.location}</>)}
              {clock && (<><br />Local time {clock}</>)}
            </div>
            {me.avatar_url && (
              <button type="button" className="profile-remove-photo" disabled={photoBusy} onClick={dropPhoto}>Remove photo</button>
            )}
          </div>

          <div className="profile-card profile-progress">
            <div className="profile-progress-head"><strong>Profile {pct}% complete</strong><span>{done}/{checks.length}</span></div>
            <div className="profile-bar"><i style={{ width: pct + "%" }} /></div>
            <p>{next ? `Next: ${next[0].toLowerCase()}.` : "All done. Your teammates can see everything."}</p>
          </div>

          <div className="profile-stats">
            <div><b>{families ?? "–"}</b><span>Families you own</span></div>
            <div><b>{me.created_at ? new Date(me.created_at).toLocaleDateString([], { month: "short", year: "numeric" }) : "–"}</b><span>On the team since</span></div>
          </div>
        </aside>

        <form className="profile-main" onSubmit={save}>
          <section className="profile-form">
            <h2>About you</h2>
            <label className="profile-field">
              <span>Full name</span>
              <input className="panel-input" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Your name" autoComplete="name" />
            </label>
            <label className="profile-field">
              <span>About you</span>
              <textarea className="panel-input" rows={4} maxLength={BIO_MAX} value={form.bio} onChange={(e) => set("bio", e.target.value)}
                placeholder="A line or two the team can see: what you do and what you are best at." />
              <small>{form.bio.length}/{BIO_MAX}</small>
            </label>
          </section>

          <section className="profile-form">
            <h2>Contact and time zone</h2>
            <div className="profile-row">
              <label className="profile-field">
                <span>Phone</span>
                <input className="panel-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+44 …" inputMode="tel" autoComplete="tel" />
              </label>
              <label className="profile-field">
                <span>Location</span>
                <input className="panel-input" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="City, country" />
              </label>
            </div>
            <div className="profile-row">
              <label className="profile-field">
                <span>Time zone {clock && <em className="profile-hint">· it is {clock} for you</em>}</span>
                <select className="panel-select" value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
                  {!zones.includes(form.timezone) && <option value={form.timezone}>{form.timezone || "Choose…"}</option>}
                  {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
                </select>
              </label>
              <label className="profile-field">
                <span>LinkedIn</span>
                <input className={"panel-input" + (linkedinOk ? "" : " is-invalid")} value={form.linkedin} onChange={(e) => set("linkedin", e.target.value)} placeholder="https://linkedin.com/in/…" inputMode="url" />
                {!linkedinOk && <small className="profile-bad">Use a full linkedin.com link.</small>}
              </label>
            </div>
          </section>

          <section className="profile-form">
            <h2>Expertise</h2>
            <ChipInput label="Languages you speak" value={form.languages} onChange={(v) => set("languages", v)} suggestions={LANGS} placeholder="Type a language and press Enter" />
            <ChipInput label="Areas you cover" value={form.specialties} onChange={(v) => set("specialties", v)} suggestions={AREAS} placeholder="e.g. UK schools, visas" />
          </section>

          <section className="profile-form">
            <h2>Account</h2>
            <div className="profile-field">
              <span>Email (your login)</span>
              <div className="profile-readonly">🔒 {me.email}</div>
            </div>
            <div className="profile-field">
              <span>Position and role</span>
              <div className="profile-readonly">🔒 {me.position || "Not set"} · {me.role === "admin" ? "Admin" : "Member"} <em>(an admin changes these)</em></div>
            </div>
            <div className="profile-field">
              <span>Password</span>
              <div className="profile-pw">
                <button type="button" className="panel-btn" disabled={reset === "sending" || reset === "sent"} onClick={resetPassword}>
                  {reset === "sent" ? "Email sent ✓" : reset === "sending" ? "Sending…" : "Email me a reset link"}
                </button>
                {reset === "sent" && <small>Check {me.email}. The link opens a page to set a new password.</small>}
              </div>
            </div>
          </section>

          <div className={"profile-savebar" + (dirty || state === "saved" ? " is-on" : "")}>
            <span>{dirty ? "You have unsaved changes" : state === "saved" ? "All changes saved" : ""}</span>
            <div>
              {dirty && <button type="button" className="panel-btn" onClick={() => { setForm(saved); setState("idle"); }}>Discard</button>}
              <button type="submit" className="panel-btn panel-btn-primary" disabled={!dirty || state === "saving" || !linkedinOk}>
                {state === "saving" ? "Saving…" : state === "saved" && !dirty ? "Saved ✓" : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
