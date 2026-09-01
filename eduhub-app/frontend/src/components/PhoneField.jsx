import { COUNTRY_CALLING_CODES } from "../data/formOptions";

// Splits a stored phone string like "+971 50 123 4567" into a country code
// and the rest of the number. Defaults to +971 (UAE) for a brand-new field,
// since that's where nearly every family using this form is based.
function splitPhone(phone) {
  const match = /^(\+\d{1,4})\s*(.*)$/.exec((phone || "").trim());
  if (match) return { code: match[1], number: match[2] };
  return { code: "+971", number: (phone || "").trim() };
}

export default function PhoneField({ label, value, onChange, required = false, hint, error = false, fieldKey }) {
  const { code, number } = splitPhone(value);

  function update(nextCode, nextNumber) {
    const trimmed = nextNumber.trim();
    onChange(trimmed ? `${nextCode} ${trimmed}` : "");
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
          onChange={(e) => update(e.target.value, number)}
          aria-label="Country code"
        >
          {COUNTRY_CALLING_CODES.map((c) => (
            <option key={c.name} value={c.dial}>
              {c.dial} {c.name}
            </option>
          ))}
        </select>
        <input
          className="hh-phone-number"
          type="tel"
          inputMode="tel"
          placeholder="50 123 4567"
          value={number}
          onChange={(e) => update(code, e.target.value)}
          required={required}
        />
      </div>
      {error ? <span className="hh-error-text">This field is required.</span> : hint && <span className="hh-hint-text">{hint}</span>}
    </div>
  );
}
