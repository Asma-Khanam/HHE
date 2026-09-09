import { useState } from "react";

// Dropdown for fields that have a common, known set of answers (nationality,
// religion, language...) but still need to accept anything — picking
// "Other" reveals a plain text box, and whatever's typed there IS the saved
// value (there's no separate "other" column in the database). Editing a
// record later shows "Other" pre-filled with that same custom value whenever
// it isn't one of the listed options.
//
// "Other" mode is tracked as its own bit of state (`otherMode`), not derived
// purely from `value` — deriving it from value alone was the bug: choosing
// "Other" cleared value to "" so the text box could capture typing, but an
// empty value is indistinguishable from "nothing chosen yet", so the select
// snapped back to the placeholder and the box never actually appeared. That's
// what "Other is present but can't be selected" (nationality, religion,
// curriculum) actually was — this fixes it for every FormSelect at once
// rather than field by field.
//
// `pinned` is optional (Pattern B) — one or more values shown above a
// divider, ahead of the main alphabetical `options` list (e.g. "British"
// pinned above the rest of the nationality list). Leave it off for a plain
// dropdown with just Pattern A's Other.
export default function FormSelect({
  label,
  value,
  onChange,
  options,
  pinned = [],
  required = false,
  hint,
  placeholder = "Select...",
  error = false,
  fieldKey,
  disabled = false,
}) {
  const current = value || "";
  const isKnownOption = pinned.includes(current) || options.includes(current);
  const [otherMode, setOtherMode] = useState(current !== "" && !isKnownOption);
  const showOther = otherMode || (current !== "" && !isKnownOption);

  function handleSelect(e) {
    const next = e.target.value;
    if (next === "__other__") {
      setOtherMode(true);
      onChange("");
    } else {
      setOtherMode(false);
      onChange(next);
    }
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
        {pinned.length > 0 && (
          <>
            {pinned.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            {/* A real, disabled divider row — Pattern B (pin one or more
                options above a divider, alphabetical list below). */}
            <option disabled>──────────</option>
          </>
        )}
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
