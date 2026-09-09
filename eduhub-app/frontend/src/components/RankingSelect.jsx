import { useState } from "react";

// AH-09 (September 2026 change request): "rank your top five" — the parent
// picks exactly 5 of the listed options and puts them in order, position 0
// being their first priority. Two things happen at once: the ranked list at
// the top (drag to reorder on desktop, ▲/▼ buttons always available so
// reordering works the same on a phone with no mouse), and the full option
// grid below it, where picking an option adds it to the end of the ranked
// list and the remaining, unpicked options grey out once 5 are already
// chosen — exactly the document's spec, rather than hiding options once
// picked (which would make it harder to see what's still on the table).
export default function RankingSelect({
  label,
  value,
  onChange,
  options,
  max = 5,
  required = false,
  hint,
  error = false,
  fieldKey,
}) {
  const ranked = value || [];
  const [dragIndex, setDragIndex] = useState(null);

  function toggleOption(opt) {
    if (ranked.includes(opt)) {
      onChange(ranked.filter((o) => o !== opt));
    } else if (ranked.length < max) {
      onChange([...ranked, opt]);
    }
  }

  function move(index, delta) {
    const next = ranked.slice();
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function handleDrop(index) {
    if (dragIndex === null || dragIndex === index) return;
    const next = ranked.slice();
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    onChange(next);
    setDragIndex(null);
  }

  return (
    <div className={"hh-field hh-field-full" + (error ? " hh-field-error" : "")} data-field-key={fieldKey}>
      <label>
        {label}
        {required && " *"}
      </label>

      {ranked.length > 0 && (
        <ol className="hh-ranking-list">
          {ranked.map((opt, i) => (
            <li
              key={opt}
              className="hh-ranking-item"
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(i)}
            >
              <span className="hh-ranking-index">{i + 1}</span>
              <span className="hh-ranking-label">{opt}</span>
              <span className="hh-ranking-actions">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  ▲
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === ranked.length - 1} aria-label="Move down">
                  ▼
                </button>
                <button type="button" onClick={() => toggleOption(opt)} aria-label={`Remove ${opt}`}>
                  ×
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="hh-ranking-options">
        {options.map((opt) => {
          const selected = ranked.includes(opt);
          const disabled = !selected && ranked.length >= max;
          return (
            <button
              key={opt}
              type="button"
              className={"hh-ranking-option" + (selected ? " is-selected" : "") + (disabled ? " is-disabled" : "")}
              onClick={() => toggleOption(opt)}
              disabled={disabled}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {error ? (
        <span className="hh-error-text">Please choose and order exactly {max}.</span>
      ) : (
        hint && <span className="hh-hint-text">{hint}</span>
      )}
    </div>
  );
}
