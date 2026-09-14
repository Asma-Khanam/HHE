import { useState } from "react";
import { updateRecordFields, insertRecordWithFields } from "../lib/staffData";
import "./RecordFieldsEditor.css";

// The editable version of FamilyDetailPage's RecordFields — same `fields` +
// `source` shape (see the field lists at the top of FamilyDetailPage.jsx),
// plus enough to know what to save and log:
//
//   table          the table this record lives in (parents/children/current_schools)
//   recordId       its id — omit when the row doesn't exist yet (a child's
//                  current school that was never started)
//   insertExtra    foreign key(s) for that insert-if-missing case, e.g. { child_id }
//   familyId       for the audit trail
//   currentStaffName  who to attribute the change to, on screen and in the log
//   onSaved(row)   called with the updated/created row so the page can
//                  update its own state without a full refetch
//
// Addendum 33 (September 2026 change request): founders could read a
// family's own answers here but never change them — every correction had to
// go back to the family to re-submit. This is the fix, with a change logged
// for every field actually touched.

const REFERENCE_STATUS_OPTIONS = [
  { value: "not_requested", label: "Not requested" },
  { value: "requested", label: "Requested" },
  { value: "received", label: "Received" },
];

function isFilled(value) {
  return String(value ?? "").trim().length > 0;
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// The value shown/edited in a plain <input>/<textarea>/<select> — arrays
// become a comma-separated string, same convention the read-only view
// already uses for "array_join" fields.
function toInputValue(field, value) {
  if (field.type === "array_join") return Array.isArray(value) ? value.join(", ") : value || "";
  if (field.type === "date") return value ? String(value).slice(0, 10) : "";
  return value ?? "";
}

// The reverse, back into whatever shape the column actually stores.
function fromInputValue(field, raw) {
  if (field.type === "array_join") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (field.type === "date") return raw || null;
  return raw === "" ? null : raw;
}

function valuesEqual(field, a, b) {
  if (field.type === "array_join") {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    return arrA.length === arrB.length && arrA.every((v, i) => v === arrB[i]);
  }
  return (a ?? "") === (b ?? "");
}

// A read-only row — identical markup to FamilyDetailPage's own RecordField,
// so view mode looks exactly as it always has.
function ViewField({ field, value }) {
  let display = value;
  if (field.type === "date") display = formatDate(value);
  if (field.type === "reference_status")
    display = REFERENCE_STATUS_OPTIONS.find((o) => o.value === value)?.label || value;
  if (field.type === "array_join") display = Array.isArray(display) ? display.join(", ") : display;
  const filled = isFilled(display);
  return (
    <div className={"rec-field" + (field.wide ? " rec-field-wide" : "")}>
      <span className="rec-field-label">{field.label}</span>
      <span className={"rec-field-value" + (filled ? "" : " is-empty")}>{filled ? display : "—"}</span>
    </div>
  );
}

// One editable row. Textareas for "wide" free-text fields (that's where the
// long answers live), a date input, a select for the one enum this page
// already knew the options for, plain text otherwise — everything else on
// the family's form uses its own closed option lists (nationality, gender,
// curriculum and so on) that live in the frontend app's data files, not
// here, so for now those save as free text too rather than duplicating
// every list. Good enough to fix a typo or update an answer by hand; a
// locked dropdown to match the family's own form is a fair follow-up.
function EditField({ field, value, onChange }) {
  const commonProps = {
    id: `edit-${field.key}`,
    value,
    onChange: (e) => onChange(e.target.value),
  };
  return (
    <div className={"rec-field rfe-edit-field" + (field.wide ? " rec-field-wide" : "")}>
      <label className="rec-field-label" htmlFor={commonProps.id}>
        {field.label}
      </label>
      {field.type === "date" ? (
        <input {...commonProps} type="date" className="panel-input" />
      ) : field.type === "reference_status" ? (
        <select {...commonProps} className="panel-select">
          <option value="">—</option>
          {REFERENCE_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.wide ? (
        <textarea {...commonProps} className="panel-input" rows={3} />
      ) : (
        <input {...commonProps} type="text" className="panel-input" />
      )}
    </div>
  );
}

export default function RecordFieldsEditor({
  fields,
  source,
  table,
  recordId,
  insertExtra,
  familyId,
  currentStaffName,
  onSaved,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const record = source || {};

  function startEdit() {
    const d = {};
    fields.forEach((f) => {
      d[f.key] = toInputValue(f, record[f.key]);
    });
    setDraft(d);
    setError("");
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft(null);
    setError("");
  }

  // showIf checks look at the real record shape (arrays, not comma
  // strings), so this rebuilds that shape from the live draft — a follow-up
  // field (e.g. SEN diagnoses once "formally diagnosed" is picked) needs to
  // appear or disappear as staff edit, not just once they save.
  function liveRecord() {
    if (!editing) return record;
    const merged = { ...record };
    fields.forEach((f) => {
      merged[f.key] = fromInputValue(f, draft[f.key]);
    });
    return merged;
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const patch = {};
      fields.forEach((f) => {
        const newVal = fromInputValue(f, draft[f.key]);
        const oldVal = record[f.key] ?? null;
        if (!valuesEqual(f, oldVal, newVal)) {
          patch[f.key] = newVal;
        }
      });

      if (!Object.keys(patch).length) {
        setEditing(false);
        setSaving(false);
        return;
      }

      const saved = recordId
        ? await updateRecordFields(table, recordId, patch)
        : await insertRecordWithFields(table, insertExtra || {}, patch);

      onSaved?.(saved);
      setEditing(false);
      setDraft(null);
    } catch (err) {
      setError(err.message || "Couldn't save those changes.");
    } finally {
      setSaving(false);
    }
  }

  const shown = liveRecord();

  return (
    <div className="rfe">
      <div className="rfe-bar">
        {editing ? (
          <>
            <button type="button" className="panel-btn panel-btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" className="panel-btn panel-btn-quiet" onClick={cancel} disabled={saving}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="panel-btn rfe-edit-btn" onClick={startEdit}>
            Edit
          </button>
        )}
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error rfe-error">{error}</div>}

      <div className="rec-grid">
        {fields.map((field) => {
          if (field.showIf && !field.showIf(shown)) return null;
          return editing ? (
            <EditField
              key={field.key}
              field={field}
              value={draft[field.key]}
              onChange={(v) => setDraft((d) => ({ ...d, [field.key]: v }))}
            />
          ) : (
            <ViewField key={field.key} field={field} value={record[field.key]} />
          );
        })}
      </div>
    </div>
  );
}
