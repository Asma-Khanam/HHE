import { useEffect, useRef, useState } from "react";
import AutosaveField from "./Autosave";
import { createCaseNote, updateCaseNote, friendlyError } from "../lib/staffData";
import { NOTE_KINDS, noteKindLabel, relativeDay } from "../lib/workflow";
import "./panels.css";

// The case log — the founders' "School conversations · Log a call" panel and
// the Activity feed captioned "Anyone can pick up here", which is the whole
// reason it exists.
//
// Everything the team knows about a family that isn't a form field — what a
// school actually said on the phone, why a school was ruled out, what was
// promised and by when — currently lives in one person's head or their own
// inbox. The moment somebody else covers that family, it's gone. This is
// where it goes instead.
//
// Internal only: `case_notes` has one RLS policy, is_staff(), and no
// family-facing counterpart at all. A family cannot read this table.

function authorInitial(note, staffById) {
  const row = note.author_id ? staffById[note.author_id] : null;
  const name = row?.full_name || row?.email || "";
  return name ? name.charAt(0).toUpperCase() : "—";
}

function authorName(note, staffById) {
  const row = note.author_id ? staffById[note.author_id] : null;
  // A consultant who has left keeps their notes, unattributed — the schema
  // sets author_id to null rather than deleting the history.
  return row?.full_name || row?.email || "Former team member";
}

export default function CaseNotesPanel({ familyId, notes: initialNotes, staff, familyChildren, schoolCatalog }) {
  const [notes, setNotes] = useState(initialNotes || []);
  const [composing, setComposing] = useState(false);
  const [kind, setKind] = useState("call");
  const [body, setBody] = useState("");
  const [childId, setChildId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | dirty | saving | saved | error
  // The note being composed is a real row from the first keystroke on: it is
  // created once, then updated as more is typed, so nothing is ever lost.
  const draftId = useRef(null);
  const timer = useRef(null);
  const latest = useRef({});
  latest.current = { kind, body, childId, schoolId, occurredAt };

  const staffById = Object.fromEntries((staff || []).map((s) => [s.user_id, s]));
  const childNameById = Object.fromEntries(
    (familyChildren || []).map((c) => [c.id, (c.preferred_name || c.first_name || c.full_name || "Child").trim()])
  );
  const schoolNameById = Object.fromEntries((schoolCatalog || []).map((s) => [s.id, s.name]));

  function upsertLocal(row) {
    setNotes((list) =>
      [row, ...list.filter((n) => n.id !== row.id)].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
    );
  }

  async function persist() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const cur = latest.current;
    if (!cur.body.trim()) return;
    setSaveState("saving");
    setError("");
    try {
      let row;
      if (draftId.current) {
        row = await updateCaseNote(draftId.current, cur);
      } else {
        row = await createCaseNote({ familyId, ...cur });
        draftId.current = row.id;
      }
      upsertLocal(row);
      setSaveState(latest.current.body === cur.body ? "saved" : "dirty");
    } catch (err) {
      setSaveState("error");
      setError(friendlyError(err, "Couldn't save that note."));
    }
  }

  function queueSave(delay = 800) {
    setSaveState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(persist, delay);
  }

  // Leaving the page with a note still waiting to save: send it now.
  useEffect(
    () => () => {
      if (timer.current) persist();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    if (saveState !== "dirty" && saveState !== "saving" && saveState !== "error") return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  async function finishComposing() {
    await persist();
    draftId.current = null;
    setBody("");
    setChildId("");
    setSchoolId("");
    setOccurredAt("");
    setKind("call");
    setComposing(false);
    setSaveState("idle");
  }

  // Changing kind / child / school / date on a note already started saves too.
  function changeMeta(setter, value) {
    setter(value);
    latest.current = { ...latest.current };
    if (draftId.current) queueSave(50);
  }

  async function saveNoteBody(noteId, text) {
    if (!text) throw new Error("A note can't be empty.");
    const saved = await updateCaseNote(noteId, { body: text });
    setNotes((list) => list.map((n) => (n.id === noteId ? saved : n)));
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          Case log
          {notes.length > 0 && <span className="panel-count">{notes.length}</span>}
        </h2>
        {!composing && (
          <button type="button" className="panel-btn" onClick={() => setComposing(true)}>
            + Log something
          </button>
        )}
      </div>

      <p className="panel-hint">
        Internal to the team — families never see any of this. Everything saves itself, and nothing here is ever deleted.
      </p>

      {composing && (
        <div className="note-form">
          <div className="note-kind-row">
            {NOTE_KINDS.map((k) => (
              <button
                type="button"
                key={k.key}
                className={"note-kind-btn" + (kind === k.key ? " is-active" : "")}
                onClick={() => changeMeta(setKind, k.key)}
              >
                {k.label}
              </button>
            ))}
          </div>

          <textarea
            className="panel-input"
            rows={4}
            autoFocus
            placeholder="What happened? Who said what, and what did we agree to do next."
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              queueSave();
            }}
            onBlur={() => body.trim() && persist()}
          />

          <div className="note-form-row">
            <label>
              <span>About</span>
              <select className="panel-select" value={childId} onChange={(e) => changeMeta(setChildId, e.target.value)}>
                <option value="">The whole family</option>
                {(familyChildren || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {childNameById[c.id]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>School</span>
              <select className="panel-select" value={schoolId} onChange={(e) => changeMeta(setSchoolId, e.target.value)}>
                <option value="">Not school-specific</option>
                {(schoolCatalog || []).map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              {/* Defaults to now when left blank — a call on Friday written up
                  on Monday should sit on Friday in the timeline. */}
              <span>When</span>
              <input type="date" className="panel-input" value={occurredAt} onChange={(e) => changeMeta(setOccurredAt, e.target.value)} />
            </label>
          </div>

          {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

          <div className="note-form-actions">
            <span className="panel-hint" style={{ margin: 0, marginRight: "auto" }}>
              {saveState === "dirty"
                ? "Saving soon…"
                : saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                ? "✓ Saved to the log"
                : "Saves automatically as you type"}
            </span>
            <button
              type="button"
              className="panel-btn panel-btn-primary"
              onClick={finishComposing}
              disabled={!body.trim() && !draftId.current && false}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {!composing && error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {notes.length === 0 ? (
        <p className="panel-hint">
          Nothing logged yet. Every call, email and decision recorded here is one less thing living in someone's inbox.
        </p>
      ) : (
        <ol className="note-list">
          {notes.map((note) => (
            <li key={note.id} className="note-item">
              <span className="note-avatar" title={authorName(note, staffById)}>
                {authorInitial(note, staffById)}
              </span>
              <div className="note-body">
                <div className="note-meta">
                  <span className={"note-kind note-kind-" + note.kind}>{noteKindLabel(note.kind)}</span>
                  <span className="note-when">{relativeDay(note.occurred_at)}</span>
                  <span className="note-author">{authorName(note, staffById)}</span>
                  {note.child_id && childNameById[note.child_id] && (
                    <span className="note-tag">{childNameById[note.child_id]}</span>
                  )}
                  {note.school_id && schoolNameById[note.school_id] && (
                    <span className="note-tag">{schoolNameById[note.school_id]}</span>
                  )}
                  {note.edited_at && note.created_at && new Date(note.edited_at) - new Date(note.created_at) > 600000 && (
                    <span className="note-edited">edited</span>
                  )}
                </div>
                <AutosaveField
                  collapsible
                  multiline
                  rows={4}
                  className="note-autosave"
                  value={note.body}
                  onSave={(v) => saveNoteBody(note.id, v)}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
