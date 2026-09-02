import { useEffect, useRef, useState } from "react";

// Three plain dropdowns — Day, Month, Year — instead of the browser's native
// <input type="date">.
//
// Why: the founders couldn't enter a year at all (2026-09-02). The native
// control's year segment takes keystrokes one at a time and re-interprets
// after each one, so typing "2015" reads as 2, then 20, then 201... and on a
// field with a sensible minimum it clamps back to something else entirely
// before the fourth digit lands. Half the families filling this in are on a
// phone, where that control behaves differently again on every OS.
//
// A dropdown per part can't be typed wrong, needs no locale guessing about
// whether 03/04 is March or April, and produces exactly the same "YYYY-MM-DD"
// string the database column already expects — so nothing downstream changed.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function parseValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").slice(0, 10));
  if (!match) return { year: "", month: "", day: "" };
  return { year: match[1], month: match[2], day: match[3] };
}

// Real day count for the chosen month, so 31 February can't be picked and a
// leap-year 29 February can. Falls back to 31 until a month is chosen.
function daysInMonth(year, month) {
  if (!month) return 31;
  const y = Number(year) || 2024; // a leap year, so 29 Feb stays available
  return new Date(y, Number(month), 0).getDate();
}

export default function DateField({
  label,
  value,
  onChange,
  required = false,
  hint,
  error = false,
  fieldKey,
  // Sensible defaults for a child's date of birth; the current-school
  // "date attended last" field passes its own range.
  minYear = new Date().getFullYear() - 25,
  maxYear = new Date().getFullYear(),
}) {
  const [parts, setParts] = useState(() => parseValue(value));
  const lastEmitted = useRef(value);

  // Keep in step with a value that changed from outside this component —
  // the initial data load, or the id-merge right after a save. Only a
  // complete incoming date resyncs: a half-filled selection here is exactly
  // the state that saves as "", so an empty value must not wipe the two
  // dropdowns the family has already set.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    const next = parseValue(value);
    if (!next.year) return;
    setParts(next);
    lastEmitted.current = value;
  }, [value]);

  function update(field, raw) {
    const next = { ...parts, [field]: raw };

    // Shrinking the month (or year, for February) can strand a day that no
    // longer exists — clear it rather than silently saving the wrong date.
    if (next.day && Number(next.day) > daysInMonth(next.year, next.month)) next.day = "";

    setParts(next);
    const complete = next.year && next.month && next.day;
    const out = complete ? `${next.year}-${next.month}-${next.day}` : "";
    lastEmitted.current = out;
    onChange(out);
  }

  const dayCount = daysInMonth(parts.year, parts.month);
  const years = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);

  return (
    <div className={"hh-field" + (error ? " hh-field-error" : "")} data-field-key={fieldKey}>
      <label>
        {label}
        {required && " *"}
      </label>
      <div className="hh-date-row">
        <select value={parts.day} onChange={(e) => update("day", e.target.value)} aria-label={`${label} — day`}>
          <option value="">Day</option>
          {Array.from({ length: dayCount }, (_, i) => pad(i + 1)).map((d) => (
            <option key={d} value={d}>
              {Number(d)}
            </option>
          ))}
        </select>
        <select value={parts.month} onChange={(e) => update("month", e.target.value)} aria-label={`${label} — month`}>
          <option value="">Month</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={pad(i + 1)}>
              {name}
            </option>
          ))}
        </select>
        <select value={parts.year} onChange={(e) => update("year", e.target.value)} aria-label={`${label} — year`}>
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <span className="hh-error-text">This field is required.</span>
      ) : (
        hint && <span className="hh-hint-text">{hint}</span>
      )}
    </div>
  );
}
