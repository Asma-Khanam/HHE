import { useEffect, useState } from "react";
import { updateFamily } from "../lib/staffData";
import { PIPELINE_STAGES } from "../lib/workflow";
import { PACKAGES } from "../data/packages";
import "./panels.css";
import { CaseIcon } from "./icons";

// The team's own working columns on a family — stage, who owns it, where
// they're moving from and to, what kind of client they are. None of this is
// the family's data; it's the agency's view of the family, which is why it
// sits in its own bar rather than inside the application record below.
// (Available-in-Dubai dates are the one exception -- the family sets those
// themselves on their own dashboard's "Your move" card; shown and editable
// here too, same as origin/destination already were.)
export default function CaseSettingsPanel({ family, staff, onFamilyChange }) {
  const [values, setValues] = useState({
    pipeline_stage: family.pipeline_stage || "enquiry",
    owner_staff_id: family.owner_staff_id || "",
    origin: family.origin || "",
    destination: family.destination || "",
    dubai_available_from: family.dubai_available_from || "",
    dubai_available_until: family.dubai_available_until || "",
    membership_type: family.membership_type || "",
  });
  // Other parts of the page (the Overview's Dubai dates) edit the same
  // columns -- keep this bar in step with whatever the family row now says.
  useEffect(() => {
    setValues((v) => ({
      ...v,
      origin: family.origin || "",
      destination: family.destination || "",
      dubai_available_from: family.dubai_available_from || "",
      dubai_available_until: family.dubai_available_until || "",
    }));
  }, [family.origin, family.destination, family.dubai_available_from, family.dubai_available_until]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save(patch) {
    setValues((v) => ({ ...v, ...patch }));
    setError("");
    try {
      const updated = await updateFamily(family.id, patch);
      onFamilyChange?.(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err.message || "Couldn't save that.");
    }
  }

  // Free-text fields save when you leave the box, not on every keystroke —
  // no point writing to the database once per letter typed.
  function textProps(key) {
    return {
      className: "panel-input",
      value: values[key],
      onChange: (e) => setValues((v) => ({ ...v, [key]: e.target.value })),
      onBlur: (e) => {
        if ((family[key] || "") !== e.target.value) save({ [key]: e.target.value });
      },
    };
  }

  return (
    <section className="panel case-settings">
      <div className="panel-head">
        <h2>
          <CaseIcon />
          Case
        </h2>
        {saved && <span className="panel-saved-note">Saved</span>}
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <div className="case-settings-grid">
        <div>
          <label className="panel-field-label">Pipeline stage</label>
          <select
            className="panel-select"
            value={values.pipeline_stage}
            onChange={(e) => save({ pipeline_stage: e.target.value })}
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          {/* Addendum 48 (September 2026 change request): this now moves
              itself forward as an application progresses or the family
              submits their form, so staff mostly won't need to touch it —
              except to mark Placed, which stays a manual call since nothing
              in the schema can tell us a family actually accepted. */}
        </div>

        <div>
          <label className="panel-field-label">Owner</label>
          <select
            className="panel-select"
            value={values.owner_staff_id}
            onChange={(e) => save({ owner_staff_id: e.target.value })}
          >
            <option value="">Unassigned</option>
            {(staff || []).map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name || s.email}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="panel-field-label">Moving from</label>
          <input type="text" placeholder="e.g. UK" {...textProps("origin")} />
        </div>

        <div>
          <label className="panel-field-label">Destination</label>
          <input type="text" placeholder="e.g. Dubai" {...textProps("destination")} />
        </div>

        <div>
          <label className="panel-field-label">Available in Dubai from</label>
          <input
            type="date"
            {...textProps("dubai_available_from")}
            onChange={(e) => save({ dubai_available_from: e.target.value })}
          />
        </div>

        <div>
          <label className="panel-field-label">Available in Dubai until</label>
          <input
            type="date"
            {...textProps("dubai_available_until")}
            onChange={(e) => save({ dubai_available_until: e.target.value })}
          />
        </div>

        <div>
          <label className="panel-field-label">Package</label>
          <select
            className="panel-select"
            value={values.membership_type}
            onChange={(e) => save({ membership_type: e.target.value })}
          >
            <option value="">Not set</option>
            {PACKAGES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
