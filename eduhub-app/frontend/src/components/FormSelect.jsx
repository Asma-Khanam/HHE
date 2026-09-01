// Dropdown for fields that have a common, known set of answers (nationality,
// religion, language...) but still need to accept anything — picking
// "Other" reveals a plain text box, and whatever's typed there IS the saved
// value (there's no separate "other" column in the database). Editing a
// record later shows "Other" pre-filled with that same custom value whenever
// it isn't one of the listed options.
export default function FormSelect({
  label,
  value,
  onChange,
  options,
  required = false,
  hint,
  placeholder = "Select...",
  error = false,
  fieldKey,
  disabled = false,
}) {
  const current = value || "";
  const isKnownOption = options.includes(current);
  const showOther = current !== "" && !isKnownOption;

  function handleSelect(e) {
    const next = e.target.value;
    onChange(next === "__other__" ? "" : next);
  }

  return (
    <div className={"hh-field" + (error ? " hh-field-error" : "")} data-field-key={fieldKey}>
      <label>
        {label}
        {required && " *"}
      </label>
      <select value={showOther ? "__other__" : current} onChange={handleSelect} required={required} disabled={disabled}>
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value="__other__">Other</option>
      </select>
      {showOther && (
        <input
          type="text"
          className="hh-field-other-input"
          placeholder="Please specify"
          value={current}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoFocus
        />
      )}
      {error ? <span className="hh-error-text">This field is required.</span> : hint && <span className="hh-hint-text">{hint}</span>}
    </div>
  );
}
