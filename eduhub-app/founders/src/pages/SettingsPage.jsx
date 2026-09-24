import { useEffect, useState } from "react";
import { getYearGroupCutoff, updateYearGroupCutoff, friendlyError } from "../lib/staffData";
import "../components/panels.css";
import "./TeamPage.css";
import PartnersSettings from "../components/PartnersSettings";

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
export default function SettingsPage() {
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

  return (
    <div className="team-page">
      <h1 className="team-page-title">Settings</h1>
      <p className="team-page-subtitle">
        Numbers that shape how the family-facing form behaves, kept here so they never need a SQL change to adjust.
      </p>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
      {success && !error && (
        <div className="hh-form-banner hh-form-banner-success">Saved. Families will see the new cut-off next time they open the form.</div>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Year group cut-off date</h2>
        </div>
        <p className="panel-hint">
          Used to suggest a year group from a child's date of birth — a child's year group is worked out from
          how old they are on this date, not from their age today. 31 August is the UK/UAE British-curriculum
          default; other curricula use a different date, which is exactly why this needed to be editable rather than
          fixed in the code.
        </p>
        <div className="team-row-controls" style={{ marginTop: 12 }}>
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
            style={{ width: 70 }}
          />
          <button type="button" className="panel-btn panel-btn-primary" disabled={!dirty || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      <PartnersSettings />
    </div>
  );
}
