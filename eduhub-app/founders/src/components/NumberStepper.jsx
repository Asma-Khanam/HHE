import { useRef } from "react";
import "./NumberStepper.css";

// Compact number stepper used in the Case card and anywhere a small
// numeric control is wanted. Keyboard: arrow keys step by 1 (or by `step`),
// Shift+arrow steps by 10. Buttons are 36px tall for comfortable hit targets
// on both desktop and mobile. (UX note from Miss Lyndsay, 10 Oct 2026.)
export default function NumberStepper({
  value,
  onChange,
  onCommit,
  min = 0,
  max = Infinity,
  step = 1,
  width = 92,
  placeholder = "",
  ariaLabel,
}) {
  const ref = useRef(null);
  const num = value === "" || value === null || value === undefined ? null : Number(value);

  function set(next) {
    if (next === "" || next === null) {
      onChange("");
      return;
    }
    let n = Number(next);
    if (Number.isNaN(n)) return;
    if (n < min) n = min;
    if (n > max) n = max;
    onChange(String(n));
  }

  function bump(delta) {
    const base = num == null || Number.isNaN(num) ? 0 : num;
    set(base + delta);
    requestAnimationFrame(() => ref.current?.focus());
  }

  return (
    <div className="num-stepper" style={{ width }}>
      <button
        type="button"
        className="num-stepper-btn"
        aria-label="Decrease"
        onClick={() => bump(-step)}
        disabled={num != null && num <= min}
      >
        −
      </button>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className="num-stepper-input"
        value={value ?? ""}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => set(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={() => onCommit?.()}
        onKeyDown={(e) => {
          const d = e.shiftKey ? step * 10 : step;
          if (e.key === "ArrowUp") {
            e.preventDefault();
            bump(d);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            bump(-d);
          }
        }}
      />
      <button
        type="button"
        className="num-stepper-btn"
        aria-label="Increase"
        onClick={() => bump(step)}
        disabled={num != null && num >= max}
      >
        +
      </button>
    </div>
  );
}
