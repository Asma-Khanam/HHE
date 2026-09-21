import { useEffect, useRef, useState } from "react";
import "./Autosave.css";

// The standard text field for anything staff type into: it saves itself.
//
//   - a moment after you stop typing (delay, default 0.8s)
//   - when you click away
//   - straight away on Enter (single-line) or Ctrl/Cmd + Enter (multi-line)
//   - if the row is closed or the page is left with something still unsaved
//
// It always says what is happening -- "Saving…", "✓ Saved", or the actual
// error with a Retry -- so nobody is left wondering whether a note landed.
// If the browser tab is closed with something unsaved, the browser asks first.
//
// `onSave(value)` gets the trimmed text (null when empty) and must return a
// promise. Throwing, or resolving to `false`, counts as a failed save; what
// was typed stays in the box so nothing is lost.
export default function AutosaveField({
  label,
  value,
  onSave,
  multiline = false,
  rows = 5,
  placeholder,
  list,
  delay = 800,
  className = "",
}) {
  const [draft, setDraft] = useState(value || "");
  const [state, setState] = useState("idle"); // idle | dirty | saving | saved | error
  const [message, setMessage] = useState("");

  const latest = useRef(value || ""); // what is in the box right now
  const saved = useRef((value || "").trim()); // last value known to be stored
  const dirty = useRef(false);
  const timer = useRef(null);
  const fade = useRef(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Data reloaded from outside (and nothing typed in the meantime).
  useEffect(() => {
    if (dirty.current) return;
    const incoming = value || "";
    if (incoming.trim() !== saved.current) {
      saved.current = incoming.trim();
      latest.current = incoming;
      setDraft(incoming);
    }
  }, [value]);

  async function save() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const next = latest.current.trim();
    if (next === saved.current) {
      dirty.current = false;
      setState((s) => (s === "dirty" ? "idle" : s));
      return;
    }
    setState("saving");
    setMessage("");
    try {
      const result = await onSaveRef.current(next || null);
      if (result === false) throw new Error("Couldn't save that.");
      saved.current = next;
      if (latest.current.trim() !== next) {
        // More was typed while this was saving -- save that too.
        save();
        return;
      }
      dirty.current = false;
      setState("saved");
      clearTimeout(fade.current);
      fade.current = setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 2500);
    } catch (err) {
      setState("error");
      setMessage(err?.message || "Couldn't save.");
    }
  }

  // Row closed / page left with a save still waiting: send it now.
  useEffect(
    () => () => {
      clearTimeout(fade.current);
      if (dirty.current) save();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Closing the tab with something unsaved: ask first.
  const pending = state === "dirty" || state === "saving" || state === "error";
  useEffect(() => {
    if (!pending) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  function handleChange(e) {
    const next = e.target.value;
    setDraft(next);
    latest.current = next;
    dirty.current = true;
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, delay);
  }

  function handleKeyDown(e) {
    if (e.key !== "Enter") return;
    if (multiline && !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    save();
  }

  const statusText =
    state === "dirty"
      ? "Saving soon…"
      : state === "saving"
      ? "Saving…"
      : state === "saved"
      ? "✓ Saved"
      : state === "error"
      ? `Couldn't save: ${message}`
      : multiline
      ? "Saves automatically"
      : "Saves automatically · Enter to save now";

  const Tag = multiline ? "textarea" : "input";
  return (
    <div className={"as " + className}>
      <div className="as-head">
        {label ? <span className="as-label">{label}</span> : <span />}
        <span className={"as-status is-" + state}>
          {statusText}
          {state === "error" && (
            <button type="button" className="as-retry" onClick={save}>
              Retry
            </button>
          )}
        </span>
      </div>
      <Tag
        className={"as-input" + (state === "error" ? " is-error" : "")}
        {...(multiline ? { rows } : { type: "text", list })}
        placeholder={placeholder}
        value={draft}
        onChange={handleChange}
        onBlur={save}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
