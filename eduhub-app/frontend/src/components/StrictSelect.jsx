// A dropdown for questions with a fixed, closed set of answers — unlike
// FormSelect, this never adds its own "Other" option, because for these
// questions there genuinely isn't a third answer (Gender, and the new
// single-select questions from the September 2026 change request that must
// not offer "Other" — comfortable fee range, gaps in education, repeated a
// year, refused a place, Transfer Certificate understanding, etc).
//
// YesNoSelect is really a special case of this (a fixed Yes/No list) — this
// is the general version for any fixed option list.
export default function StrictSelect({
  label,
  value,
  onChange,
  options,
  required = false,
  hint,
  placeholder = "Select an option",
  error = false,
  fieldKey,
  disabled = false,
}) {
  return (
    <div className={"hh-field" + (error ? " hh-field-error" : "")} data-field-key={fieldKey}>
      <label>
        {label}
        {required && " *"}
      </label>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} required={required} disabled={disabled}>
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {error ? <span className="hh-error-text">This field is required.</span> : hint && <span className="hh-hint-text">{hint}</span>}
    </div>
  );
}
