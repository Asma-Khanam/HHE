import { useRef, useState } from "react";
import "./CopyButton.css";

// Small "copy" control next to any field value, for pasting into a school's
// application form. Shows "Copied" briefly so it's obvious it worked.
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
    t.current = setTimeout(() => setDone(false), 1500);
  }

  return (
    <button type="button" className={"copy-btn" + (done ? " is-done" : "")} onClick={copy} title="Copy to clipboard">
      {done ? "Copied" : label}
    </button>
  );
}
