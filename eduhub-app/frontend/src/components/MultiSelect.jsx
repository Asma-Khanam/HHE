// CH-04/CH-05 (September 2026 change request): "select one" becoming "select
// all that apply" — a plain toggle grid, no ordering and no max, unlike
// RankingSelect (AH-09), which this deliberately reuses the option-chip
// styling from (.hh-ranking-option / .hh-ranking-options) rather than
// inventing a second near-identical look for "click to pick several".
//
// `exclusiveOption` (added for SEN-02): the name of one option, usually a
// "None of the above", that behaves like a separate radio button living
// inside the same grid — picking it clears every other selection, and
// picking anything else clears it. Optional; a MultiSelect with no such
// option (CH-04/CH-05, the SEN-01 diagnosis list) behaves exactly as before.
//
// `layout` (added for SEN-08): "chips" (default) is the original pill-wrap
// row used everywhere else. "grid" instead renders a compact checkbox-style
// grid — two or three columns wide on desktop, one on mobile (see the
// .hh-multiselect-grid CSS) — for a long list like SEN-08's 20 options,
// where a wall of variable-width pills would be harder to scan than a
// column-aligned checklist.
export default function MultiSelect({
  label,
  value,
  onChange,
  options,
  required = false,
  hint,
  error = false,
  fieldKey,
  exclusiveOption,
  layout = "chips",
}) {
  const selected = value || [];

  function toggle(opt) {
    if (exclusiveOption && opt === exclusiveOption) {
      onChange(selected.includes(opt) ? [] : [exclusiveOption]);
      return;
    }
    if (selected.includes(opt)) {
      onChange(selected.filter((o) => o !== opt));
    } else {
      const next = selected.filter((o) => o !== exclusiveOption);
      onChange([...next, opt]);
    }
  }

  return (
    <div className={"hh-field hh-field-full" + (error ? " hh-field-error" : "")} data-field-key={fieldKey}>
      <label>
        {label}
        {required && " *"}
      </label>
      {layout === "grid" ? (
        <div className="hh-multiselect-grid">
          {options.map((opt) => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                className={"hh-multiselect-grid-item" + (isSelected ? " is-selected" : "")}
                onClick={() => toggle(opt)}
              >
                <span className="hh-multiselect-grid-check" aria-hidden="true">
                  {isSelected ? "✓" : ""}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="hh-ranking-options">
          {options.map((opt) => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                className={"hh-ranking-option" + (isSelected ? " is-selected" : "")}
                onClick={() => toggle(opt)}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
      {error ? (
        <span className="hh-error-text">Please choose at least one.</span>
      ) : (
        hint && <span className="hh-hint-text">{hint}</span>
      )}
    </div>
  );
}
