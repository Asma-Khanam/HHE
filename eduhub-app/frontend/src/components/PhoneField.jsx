import { useState } from "react";
import { COMMON_CALLING_OPTIONS, OTHER_CALLING_OPTIONS } from "../data/formOptions";

// Where a brand-new, never-touched phone field starts — nearly every family
// using this form is dialling a UAE number.
const DEFAULT_CODE = "+971";

// Splits a stored phone string like "+971 50 123 4567" into a country code
// and the rest of the number.
//
// `hasCode` is the important part: it says whether the STORED value actually
// carries a country code, as opposed to the field simply being empty. The
// old version returned "+971" in both cases, which is what caused the bug
// the founders reported — pick "+44", and because the number box was still
// empty the whole field saved as "", which read straight back as "+971" and
// snapped the dropdown home again. Now an empty field keeps whatever the
// person picked (see `chosenCode` below) until they type a number to go
// with it.
function splitPhone(phone) {
  const raw = (phone || "").trimStart();
  const match = /^(\+\d{1,4})[\s]?([\s\S]*)$/.exec(raw);
  if (match) return { code: match[1], number: match[2], hasCode: true };
  return { code: null, number: raw, hasCode: false };
}

export default function PhoneField({ label, value, onChange, required = false, hint, error = false, fieldKey }) {
  const parsed = splitPhone(value);

  // The code the person picked while the number box was still empty. Once
  // there's a real number, the saved value carries the code itself and that
  // always wins — this only covers the in-between state.
  const [chosenCode, setChosenCode] = useState(parsed.code || DEFAULT_CODE);

  const code = parsed.hasCode ? parsed.code : chosenCode;
  const number = parsed.number;

  function updateCode(nextCode) {
    setChosenCode(nextCode);
    onChange(number.trim() ? `${nextCode} ${number}` : "");
  }

  function updateNumber(nextNumber) {
    onChange(nextNumber.trim() ? `${code} ${nextNumber}` : "");
  }

  return (
    <div className={"hh-field" + (error ? " hh-field-error" : "")} data-field-key={fieldKey}>
      <label>
        {label}
        {required && " *"}
      </label>
      <div className="hh-phone-row">
        <select
          className="hh-phone-code"
          value={code}
          onChange={(e) => updateCode(e.target.value)}
          aria-label="Country code"
        >
          {/* The countries these families actually dial from, first. */}
          <optgroup label="Common">
            {COMMON_CALLING_OPTIONS.map((c) => (
              <option key={c.dial} value={c.dial}>
                {c.dial} {c.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="All countries">
            {OTHER_CALLING_OPTIONS.map((c) => (
              <option key={c.dial} value={c.dial}>
                {c.dial} {c.label}
              </option>
            ))}
          </optgroup>
        </select>
        <input
          className="hh-phone-number"
          type="tel"
          inputMode="tel"
          placeholder="50 123 4567"
          value={number}
          onChange={(e) => updateNumber(e.target.value)}
          required={required}
        />
      </div>
      {error ? <span className="hh-error-text">This field is required.</span> : hint && <span className="hh-hint-text">{hint}</span>}
    </div>
  );
}
