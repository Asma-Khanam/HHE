import { useRef, useState } from "react";
import "./CopyButton.css";

// Small copy icon that sits beside a field's value, for pasting into a
// school's application form. Turns green with a tick once copied.
export default function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  const t = useRef(null);
  if (text === null || text === undefined || String(text).trim() === "") return null;

  async function copy() {
    const value = String(text);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand("copy");
      } catch {
        /* nothing more to try */
      }
      document.body.removeChild(el);
    }
    setDone(true);
    clearTimeout(t.current);
    t.current = setTimeout(() => setDone(false), 1600);
  }

  return (
    <button
      type="button"
      className={"copy-btn" + (done ? " is-done" : "")}
      onClick={copy}
      title={done ? "Copied" : label}
      aria-label={done ? "Copied" : label}
    >
      {done ? (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V6a2 2 0 0 1 2-2h9" />
        </svg>
      )}
    </button>
  );
}
