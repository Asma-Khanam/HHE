import { useState } from "react";
import AutosaveField from "./Autosave";
import { updateSchool, friendlyError } from "../lib/staffData";
import { YEAR_GROUPS } from "../data/formOptions";
import { STAGE_PRESETS, stageOf } from "../lib/schoolStages";
import "./SchoolFacts.css";

// The Academics tab on a school: who it takes, how it supports children with SEN and what it
// teaches. Suggested schools matches families against these (addenda 160 and 164). For Dubai
// schools the year groups were filled from KHDA where they were empty (addendum 167).

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

const INCLUSION_CHOICES = [
  ["none", "No formal support"],
  ["limited", "Limited", "Mild needs"],
  ["moderate", "Moderate"],
  ["extensive", "Extensive", "Specialist team"],
];

function Card({ id, eyebrow, title, children, className = "" }) {
  return (
    <section className={"sf-card " + className} id={id}>
      <header className="sf-card-head">
        <div>
          <span className="sf-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
        </div>
      </header>
      {children}
    </section>
  );
}

// One button per choice. Clicking the chosen one again clears it.
function Pills({ choices, value, onPick, label }) {
  return (
    <div className="sf-pills" role="group" aria-label={label}>
      {choices.map(([v, l, sub]) => (
        <button
          key={v}
          type="button"
          className={"sf-pill" + (value === v ? " is-on" : "")}
          aria-pressed={value === v}
          onClick={() => onPick(value === v ? null : v)}
        >
          {l}
          {sub && <small>{sub}</small>}
        </button>
      ))}
    </div>
  );
}

export default function SchoolAcademicsTab({ school, onSchoolChange }) {
  const [error, setError] = useState("");
  const stage = stageOf(school);

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
    <div className="sf">
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <div className="sf-grid">
        <Card eyebrow="Who the school takes" title="Year groups">
          <div className="sf-field" id="sf-years">
            <span className="sf-label">Type of school</span>
            <Pills
              label="Type of school"
              choices={STAGE_PRESETS.map(([l]) => [l, l])}
              value={stage}
              onPick={(v) => {
                const hit = STAGE_PRESETS.find(([l]) => l === v);
                save(hit ? { lowest_year_group: hit[1], highest_year_group: hit[2] } : { lowest_year_group: null, highest_year_group: null });
              }}
            />
          </div>
          <div className="sf-field">
            <span className="sf-label">Or set exactly</span>
            <div className="sf-range">
              <select
                className="sf-input"
                aria-label="Youngest year group"
                value={school.lowest_year_group || ""}
                onChange={(e) => save({ lowest_year_group: e.target.value || null })}
              >
                <option value="">Youngest</option>
                {YEAR_GROUPS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span aria-hidden="true">to</span>
              <select
                className="sf-input"
                aria-label="Oldest year group"
                value={school.highest_year_group || ""}
                onChange={(e) => save({ highest_year_group: e.target.value || null })}
              >
                <option value="">Oldest</option>
                {YEAR_GROUPS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card eyebrow="Support for children with SEN" title="Inclusion">
          <div className="sf-field" id="sf-inclusion">
            <span className="sf-label">Level of support</span>
            <Pills label="Level of support" choices={INCLUSION_CHOICES} value={school.inclusion_level || null} onPick={(v) => save({ inclusion_level: v })} />
          </div>
          <div className="sf-field">
            <AutosaveField
              label="Needs the school supports"
              value={asText(school.inclusion_needs_supported)}
              placeholder="e.g. Dyslexia, ADHD, Autism, Speech and language"
              onSave={(v) => save({ inclusion_needs_supported: toList(v) })}
            />
          </div>
          <AutosaveField
            label="Notes"
            multiline
            rows={2}
            collapsible
            value={school.inclusion_notes || ""}
            placeholder="Learning support team, extra fees, waiting list for support"
            onSave={(v) => save({ inclusion_notes: v })}
          />
        </Card>

        <Card eyebrow="What the school teaches" title="Subjects and exam boards" className="sf-wide">
          <div className="sf-three">
            <div className="sf-field" id="sf-boards">
              <AutosaveField
                label="Exam boards"
                multiline
                rows={2}
                value={asText(school.exam_boards)}
                placeholder="e.g. Edexcel, AQA, Cambridge, IB"
                onSave={(v) => save({ exam_boards: toList(v) })}
              />
            </div>
            <AutosaveField
              label="GCSE / IGCSE subjects"
              multiline
              rows={2}
              value={asText(school.gcse_subjects)}
              placeholder="e.g. Maths, English, Physics, Biology, Spanish"
              onSave={(v) => save({ gcse_subjects: toList(v) })}
            />
            <AutosaveField
              label="A-level subjects"
              multiline
              rows={2}
              value={asText(school.a_level_subjects)}
              placeholder="Leave empty if there is no sixth form"
              onSave={(v) => save({ a_level_subjects: toList(v) })}
            />
          </div>
          <p className="sf-hint is-small">Separate items with commas.</p>
        </Card>
      </div>
    </div>
  );
}
