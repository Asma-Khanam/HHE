import { useEffect, useRef, useState } from "react";

// The normal browser date field — back to the format it had before, with the
// actual cause of "I can't type the year" fixed underneath.
//
// What was wrong: this was a controlled input wired straight to form state.
// A browser reports a half-typed year as a complete date string — type "2" of
// "2015" and it hands back "0002-03-04". That went into state, state came back
// down as a new `value`, React rewrote the input's value mid-typing, and the
// year segment reset. Every digit started over, which is exactly what the
// founders saw.
//
// The fix is to keep a local draft of what's actually in the box and only tell
// the rest of the form about a date once the year is a real four-digit one.
// While someone is part-way through typing, React writes back the identical
// string the input already holds, so it never touches the DOM and the caret
// stays put. Nothing else changed — same control, same format, same value.
export default function DateField({
  label,
  value,
  onChange,
  required = false,
  hint,
  error = false,
  fieldKey,
}) {
  const [draft, setDraft] = useState(value || "");
  const editing = useRef(false);

  // Take updates from outside (the initial load, or the id-merge after a save)
  // — but never while someone is actively typing in this box, which is the
  // whole point of the draft.
  useEffect(() => {
    if (editing.current) return;
    setDraft(value || "");
  }, [value]);

  function isRealDate(str) {
    return /^\d{4}-\d{2}-\d{2}$/.test(str) && Number(str.slice(0, 4)) >= 1000;
  }

  function handleChange(e) {
    const next = e.target.value;
    setDraft(next);
    if (next === "") {
      if (value) onChange("");
      return;
    }
    if (isRealDate(next)) onChange(next);
  }

  // A year still stuck at two or three digits when they click away was never a
  // date anyone meant — clear it rather than leaving "0020" sitting there
  // looking saved.
  function handleBlur() {
    editing.current = false;
    if (draft && !isRealDate(draft)) {
      setDraft("");
      if (value) onChange("");
    }
  }

  return (
    <div className={"hh-field" + (error ? " hh-field-error" : "")} data-field-key={fieldKey}>
      <label>
        {label}
        {required && " *"}
      </label>
      <input
        type="date"
        value={draft}
        onFocus={() => {
          editing.current = true;
        }}
        onBlur={handleBlur}
        onChange={handleChange}
        required={required}
      />
      {error ? (
        <span className="hh-error-text">This field is required.</span>
      ) : (
        hint && <span className="hh-hint-text">{hint}</span>
      )}
    </div>
  );
}
