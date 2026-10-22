import { useState } from "react";

// Type and press Enter (or comma) to add a tag; Backspace removes the last; suggestions are one-click.
export default function ChipInput({ label, value, onChange, suggestions = [], placeholder, max = 12 }) {
  const [draft, setDraft] = useState("");
  function add(raw) {
    const t = raw.trim().replace(/,$/, "").slice(0, 40);
    if (!t || value.length >= max || value.some((v) => v.toLowerCase() === t.toLowerCase())) return setDraft("");
    onChange([...value, t]);
    setDraft("");
  }
  const left = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));
  return (
    <div className="profile-field">
      <span>{label}</span>
      <div className="chip-box" onClick={(e) => e.currentTarget.querySelector("input")?.focus()}>
        {value.map((v) => (
          <span key={v} className="chip">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>×</button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(draft); }
            else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
        />
      </div>
      {left.length > 0 && value.length < max && (
        <div className="chip-suggest">
          {left.slice(0, 7).map((s) => (
            <button type="button" key={s} onClick={() => add(s)}>+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}
