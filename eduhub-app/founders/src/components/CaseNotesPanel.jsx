import { useState } from "react";
import { createCaseNote, updateCaseNote, deleteCaseNote, friendlyError } from "../lib/staffData";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  // Which note is open for editing, and the working copy of its text. A typo
  // in a logged call is worth fixing in place rather than deleting and
  // retyping — the trigger keeps the original author either way.
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState("");

  const staffById = Object.fromEntries((staff || []).map((s) => [s.user_id, s]));
  const childNameById = Object.fromEntries(
    (familyChildren || []).map((c) => [c.id, (c.preferred_name || c.first_name || c.full_name || "Child").trim()])
  );
  const schoolNameById = Object.fromEntries((schoolCatalog || []).map((s) => [s.id, s.name]));

  function resetForm() {
    setBody("");
    setChildId("");
    setSchoolId("");
    setOccurredAt("");
    setKind("call");
    setComposing(false);
    setError("");
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    try {
      const created = await createCaseNote({ familyId, childId, schoolId, kind, body, occurredAt });
      // Newest first, same order the fetch uses — but inserted by date rather
      // than just unshifted, since a call logged late belongs on its own day.
      setNotes((list) =>
        [created, ...list].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
      );
      resetForm();
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that note."));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(note) {
    setEditingId(note.id);
    setEditBody(note.body);
    setConfirmingDelete(null);
    setError("");
  }

  async function handleSaveEdit(noteId) {
    if (!editBody.trim()) return;
    setBusy(true);
    setError("");
    try {
      const saved = await updateCaseNote(noteId, { body: editBody });
      setNotes((list) => list.map((n) => (n.id === noteId ? saved : n)));
      setEditingId(null);
      setEditBody("");
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that change."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(noteId) {
    setBusy(true);
    setError("");
    try {
      await deleteCaseNote(noteId);
      setNotes((list) => list.filter((n) => n.id !== noteId));
      setConfirmingDelete(null);
    } catch (err) {
      setError(friendlyError(err, "Couldn't delete that note."));
    } finally {
      setBusy(false);
    }
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
        Internal to the team — families never see any of this. Anyone covering this family can pick it up from here.
      </p>

      {composing && (
        <form className="note-form" onSubmit={handleAdd}>
          <div className="note-kind-row">
            {NOTE_KINDS.map((k) => (
              <button
                type="button"
                key={k.key}
                className={"note-kind-btn" + (kind === k.key ? " is-active" : "")}
                onClick={() => setKind(k.key)}
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
            onChange={(e) => setBody(e.target.value)}
          />

          <div className="note-form-row">
            <label>
              <span>About</span>
              <select className="panel-select" value={childId} onChange={(e) => setChildId(e.target.value)}>
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
              <select className="panel-select" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
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
              <input type="date" className="panel-input" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </label>
          </div>

          {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

          <div className="note-form-actions">
            <button type="button" className="panel-btn panel-btn-quiet" onClick={resetForm} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="panel-btn panel-btn-primary" disabled={busy || !body.trim()}>
              {busy ? "Saving..." : "Save to the log"}
            </button>
          </div>
        </form>
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
                  {note.edited_at && <span className="note-edited">edited</span>}
                </div>
                {editingId === note.id ? (
                  <div className="note-edit">
                    <textarea
                      className="panel-input"
                      rows={4}
                      autoFocus
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                    />
                    <div className="note-form-actions">
                      <button
                        type="button"
                        className="panel-btn panel-btn-quiet"
                        onClick={() => setEditingId(null)}
                        disabled={busy}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="panel-btn panel-btn-primary"
                        onClick={() => handleSaveEdit(note.id)}
                        disabled={busy || !editBody.trim()}
                      >
                        {busy ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="note-text">{note.body}</p>
                    {confirmingDelete === note.id ? (
                      <div className="note-confirm">
                        <span>Delete this note? It won't be recoverable.</span>
                        <button type="button" onClick={() => setConfirmingDelete(null)} disabled={busy}>
                          Cancel
                        </button>
                        <button type="button" className="is-danger" onClick={() => handleDelete(note.id)} disabled={busy}>
                          Delete
                        </button>
                      </div>
                    ) : (
                      <div className="note-actions">
                        <button type="button" className="note-delete" onClick={() => startEdit(note)}>
                          Edit
                        </button>
                        <button type="button" className="note-delete" onClick={() => setConfirmingDelete(note.id)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
