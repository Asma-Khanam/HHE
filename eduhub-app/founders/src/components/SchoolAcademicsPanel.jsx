import { useState } from "react";
import AutosaveField from "./Autosave";
import { updateSchool, friendlyError } from "../lib/staffData";

// What a school teaches and how it supports different needs. This is the data the
// AI school shortlist matches families against (addendum 160). Lists are typed as
// plain words separated by commas.

const LEVELS = [
  ["", "Not recorded"],
  ["none", "No formal support"],
  ["limited", "Limited (mild needs)"],
  ["moderate", "Moderate"],
  ["extensive", "Extensive (specialist team)"],
];

function toList(text) {
  const seen = new Set();
  return String(text || "")
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter((x) => {
      const k = x.toLowerCase();
      if (!x || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}
const asText = (list) => (Array.isArray(list) ? list.join(", ") : "");

export default function SchoolAcademicsPanel({ school, onSchoolChange }) {
  const [error, setError] = useState("");

  async function save(patch) {
    try {
      await updateSchool(school.id, patch);
      onSchoolChange(patch);
      setError("");
      return true;
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that."));
      return false;
    }
  }

  return (
    <section className="family-detail-card">
      <div className="panel-head">
        <h2>Subjects, exam boards and inclusion</h2>
      </div>
      <p className="family-detail-hint">
        Used to suggest schools for a family. Separate items with commas. Location comes from the school's area ({school.area || "not set"}
        {school.emirate ? `, ${school.emirate}` : ""}).
      </p>
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <AutosaveField
          label="Exam boards"
          value={asText(school.exam_boards)}
          placeholder="e.g. Edexcel, AQA, Cambridge, IB"
          onSave={(v) => save({ exam_boards: toList(v) })}
        />
        <AutosaveField
          label="GCSE / IGCSE subjects offered"
          multiline
          rows={3}
          value={asText(school.gcse_subjects)}
          placeholder="e.g. Maths, English, Physics, Chemistry, Biology, Computer Science, Spanish"
          onSave={(v) => save({ gcse_subjects: toList(v) })}
        />
        <AutosaveField
          label="A-level subjects offered"
          multiline
          rows={3}
          value={asText(school.a_level_subjects)}
          placeholder="Leave empty if there is no sixth form"
          onSave={(v) => save({ a_level_subjects: toList(v) })}
        />
        <div>
          <label className="rec-field-label" htmlFor="school-inclusion-level">
            Inclusion support
          </label>
          <select
            id="school-inclusion-level"
            className="panel-select"
            value={school.inclusion_level || ""}
            onChange={(e) => save({ inclusion_level: e.target.value || null })}
          >
            {LEVELS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <AutosaveField
          label="Needs the school supports"
          value={asText(school.inclusion_needs_supported)}
          placeholder="e.g. Dyslexia, ADHD, Autism, Speech and language, Physical access"
          onSave={(v) => save({ inclusion_needs_supported: toList(v) })}
        />
        <AutosaveField
          label="Inclusion notes"
          multiline
          rows={3}
          collapsible
          value={school.inclusion_notes || ""}
          placeholder="Learning support team, KHDA inclusion rating, extra fees, waiting list for support"
          onSave={(v) => save({ inclusion_notes: v })}
        />
      </div>
    </section>
  );
}
