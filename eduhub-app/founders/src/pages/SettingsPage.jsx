import { useEffect, useState } from "react";
import { getYearGroupCutoff, updateYearGroupCutoff, friendlyError } from "../lib/staffData";
import "../components/panels.css";
import "./TeamPage.css";
import PartnersSettings from "../components/PartnersSettings";
import PrivacyPolicySettings from "../components/PrivacyPolicySettings";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// CH-06 (September 2026 change request): "please keep the cut-off date
// editable in the admin area. It differs by curriculum and we will need to
// adjust it." Only one setting lives here today — the UK/UAE
// British-curriculum year-group cut-off (31 August by default) that the
// family-facing form uses to suggest a year group from a child's date of
// birth. Same access pattern as the Team page: the sidebar only links here
// for an admin, and the database itself refuses the actual save (via
// app_settings' RLS policy) from anyone who isn't one — so this page
// doesn't need its own gate on top of that.
const SECTIONS = [
  { key: "general", label: "Family form", sub: (m, d) => `Year group cut-off: ${d} ${m}` },
  { key: "privacy", label: "Privacy policy", sub: () => "Public page for the app stores" },
  { key: "partners", label: "Trusted partners", sub: () => "Who gets introduction emails" },
];

export default function SettingsPage() {
  const [section, setSection] = useState(() => {
    try {
      const h = window.location.hash.replace("#", "");
      return SECTIONS.some((x) => x.key === h) ? h : "general";
    } catch {
      return "general";
    }
  });
  useEffect(() => {
    try {
      window.history.replaceState(window.history.state, "", `#${section}`);
    } catch {
      /* ignore */
    }
  }, [section]);
  const [month, setMonth] = useState(8);
  const [day, setDay] = useState(31);
  const [saved, setSaved] = useState({ month: 8, day: 31 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getYearGroupCutoff()
      .then(({ month, day }) => {
        setMonth(month);
        setDay(day);
        setSaved({ month, day });
      })
      .catch((err) => setError(friendlyError(err, "Couldn't load settings.")))
      .finally(() => setLoading(false));
  }, []);

  const dirty = month !== saved.month || day !== saved.day;

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const result = await updateYearGroupCutoff({ month, day });
      setSaved({ month: result.year_group_cutoff_month, day: result.year_group_cutoff_day });
      setSuccess(true);
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that — only a team admin can change this setting."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="team-page">Loading…</div>;

  const monthName = MONTHS[saved.month - 1] || "";

  return (
    <div className="team-page">
      <header>
        <h1 className="team-page-title">Settings</h1>
        <p className="team-page-subtitle">Things the team can change without a developer: how the family form behaves, the public privacy policy and the trusted partners.</p>
      </header>

      <div className="set-layout">
        <nav className="set-nav" aria-label="Settings sections">
          {SECTIONS.map((sec) => (
            <button
              key={sec.key}
              type="button"
              className={"set-nav-item" + (section === sec.key ? " is-active" : "")}
              onClick={() => setSection(sec.key)}
            >
              <span className="set-nav-label">{sec.label}</span>
              <span className="set-nav-sub">{sec.sub(monthName, saved.day)}</span>
            </button>
          ))}
        </nav>

        <div className="set-content">
          {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
          {success && !error && (
            <div className="hh-form-banner hh-form-banner-success">Saved. Families will see the new cut-off next time they open the form.</div>
          )}

          {section === "general" && (
            <section className="set-card">
              <div className="set-card-head">
                <div>
                  <h2>Year group cut-off date</h2>
                  <p className="set-hint">
                    Used to suggest a year group from a child's date of birth. A child's year group is worked out from how old they
                    are on this date, not from their age today. 31 August is the UK/UAE British-curriculum default; other curricula
                    use a different date, which is why this is editable.
                  </p>
                </div>
                <span className="set-pill">
                  Now: {saved.day} {monthName}
                </span>
              </div>
              <div className="set-controls">
                <select className="panel-select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {MONTHS.map((label, i) => (
                    <option key={label} value={i + 1}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  className="panel-input"
                  type="number"
                  min={1}
                  max={31}
                  value={day}
                  onChange={(e) => setDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                  style={{ width: 80 }}
                />
                <button type="button" className="panel-btn panel-btn-primary" disabled={!dirty || saving} onClick={handleSave}>
                  {saving ? "Saving…" : dirty ? "Save change" : "Saved"}
                </button>
              </div>
            </section>
          )}

          {section === "privacy" && <PrivacyPolicySettings />}
          {section === "partners" && <PartnersSettings />}
        </div>
      </div>
    </div>
  );
}
