import { YES_NO_OPTIONS } from "../data/formOptions";

// A strict Yes/No dropdown — unlike FormSelect, there's no "Other" free-text
// option, because these questions only ever have two real answers (transfer
// certificate, SEN, gifted/talented register, etc).
export default function YesNoSelect({ label, value, onChange, required = false, hint, error = false, fieldKey }) {
  return (
    <div className={"hh-field" + (error ? " hh-field-error" : "")} data-field-key={fieldKey}>
      <label>
        {label}
        {required && " *"}
      </label>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} required={required}>
        <option value="" disabled>
          Select an option
        </option>
        {YES_NO_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {error ? <span className="hh-error-text">This field is required.</span> : hint && <span className="hh-hint-text">{hint}</span>}
    </div>
  );
}
