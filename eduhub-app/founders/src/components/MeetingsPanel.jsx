import { useState } from "react";
import { createCaseNote, friendlyError } from "../lib/staffData";
import "./panels.css";

// The Meetings tab (September 2026 change request) -- a dedicated place for
// notes and summaries from calls/Zooms with this family, pulled out of the
// general Case notes log (School visits tab) the same way Emails was, and
// filtered to kind="meeting" case_notes rows.
//
// This is the manual version: staff write up (or paste) what was discussed
// after a call, with when it happened. An automatic version -- Zoom posts a
// meeting's transcript/summary here on its own -- is a real possibility but
// depends on which Zoom plan the founders are on (cloud recording + AI
// Companion summaries are Zoom features gated by plan) and needs a Zoom app
// + webhook wired up, same shape as the application-email webhook. Worth
// doing once that's confirmed; this manual version works today regardless.

function relativeDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} days ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${relativeDay(iso)}, ${time}`;
}

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time, not the ISO string
// occurred_at is stored as.
function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function MeetingRow({ note }) {
  return (
    <li className="meeting-row">
      <div className="meeting-row-top">
        <span className="meeting-subject">{note.subject || "Meeting"}</span>
        <span className="meeting-row-date">{formatWhen(note.occurred_at)}</span>
      </div>
      <p className="meeting-notes-text">{note.body}</p>
    </li>
  );
}

export default function MeetingsPanel({ familyId, notes: allNotes }) {
  const [notes, setNotes] = useState((allNotes || []).filter((n) => n.kind === "meeting"));
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toLocalInputValue(new Date()));
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleLog(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError("");
    try {
      const note = await createCaseNote({
        familyId,
        kind: "meeting",
        subject: subject.trim(),
        body,
        occurredAt,
      });
      setNotes((prev) => [note, ...prev].sort((a, b) => (b.occurred_at || "").localeCompare(a.occurred_at || "")));
      setSubject("");
      setBody("");
      setOccurredAt(toLocalInputValue(new Date()));
      setComposing(false);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="family-detail-card">
      <h2>
        Meetings
        {notes.length > 0 && <span className="family-detail-card-count">{notes.length}</span>}
      </h2>
      <p className="family-detail-hint">
        Notes and summaries from calls and meetings with this family -- write one up here after a Zoom or a call so
        it's on record.
      </p>

      {composing ? (
        <form className="meeting-compose" onSubmit={handleLog}>
          <input
            type="text"
            className="panel-input"
            placeholder="e.g. Intro call, School shortlist review"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <input
            type="datetime-local"
            className="panel-input"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
          <textarea
            className="panel-input"
            placeholder="What was discussed? Paste a transcript or write up a summary."
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
          <div className="meeting-compose-actions">
            <button type="submit" className="panel-btn panel-btn-primary" disabled={saving || !body.trim()}>
              {saving ? "Saving…" : "Save meeting notes"}
            </button>
            <button
              type="button"
              className="panel-btn panel-btn-quiet"
              onClick={() => {
                setComposing(false);
                setError("");
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="panel-btn" onClick={() => setComposing(true)}>
          Add meeting notes
        </button>
      )}

      {notes.length === 0 ? (
        <p className="family-detail-hint meeting-empty-hint">No meetings logged yet.</p>
      ) : (
        <ul className="meeting-list">
          {notes.map((note) => (
            <MeetingRow key={note.id} note={note} />
          ))}
        </ul>
      )}
    </section>
  );
}
