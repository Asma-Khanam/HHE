import { useState } from "react";
import { createCaseNote, friendlyError } from "../lib/staffData";
import "./panels.css";

// The Meetings tab (September 2026 change request) -- a dedicated place for
// notes and summaries from calls/Zooms with this family, pulled out of the
// general Case notes log (School visits tab) the same way Emails was, and
// filtered to kind="meeting" case_notes rows.
//
// This is the manual version: staff write up (or paste) what was discussed
// after a call, with when it happened, and can optionally attach the Zoom
// join link. An automatic version -- Zoom posts a meeting's own AI Companion
// summary here on its own once a call ends -- is confirmed possible on the
// founders' Zoom plan (Pro, with auto-transcription + AI Companion already
// on) but needs its own Zoom app + webhook + a way to match a Zoom meeting
// back to a family, which is a separate, larger piece of work than this UI.
// This manual version, including the Zoom link field, works today regardless
// and doesn't need to change when that automatic version arrives -- it'll
// just mean rows start appearing here without anyone typing them.
//
// The Zoom link isn't its own database column (no schema change needed for
// what's still a manual field) -- it's folded into the note body as its own
// line and split back out for display, same trick EmailsPanel uses for the
// "From:" line on an inbound email.

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

const ZOOM_LINK_MARKER = "\n\nZoom link: ";

function splitZoomLink(body) {
  const idx = body?.lastIndexOf(ZOOM_LINK_MARKER) ?? -1;
  if (idx === -1) return { text: body || "", zoomLink: null };
  return { text: body.slice(0, idx), zoomLink: body.slice(idx + ZOOM_LINK_MARKER.length) };
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
  const { text, zoomLink } = splitZoomLink(note.body);
  return (
    <li className="meeting-row">
      <div className="meeting-row-top">
        <span className="meeting-subject">{note.subject || "Meeting"}</span>
        <span className="meeting-row-date">{formatWhen(note.occurred_at)}</span>
      </div>
      {zoomLink && (
        <a className="meeting-zoom-link" href={zoomLink} target="_blank" rel="noreferrer">
          Join Zoom call
        </a>
      )}
      <p className="meeting-notes-text">{text}</p>
    </li>
  );
}

export default function MeetingsPanel({ familyId, notes: allNotes }) {
  const [notes, setNotes] = useState((allNotes || []).filter((n) => n.kind === "meeting"));
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toLocalInputValue(new Date()));
  const [body, setBody] = useState("");
  const [zoomLink, setZoomLink] = useState("");
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
        body: zoomLink.trim() ? `${body}${ZOOM_LINK_MARKER}${zoomLink.trim()}` : body,
        occurredAt,
      });
      setNotes((prev) => [note, ...prev].sort((a, b) => (b.occurred_at || "").localeCompare(a.occurred_at || "")));
      setSubject("");
      setBody("");
      setZoomLink("");
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
          <input
            type="url"
            className="panel-input"
            placeholder="Zoom link (optional)"
            value={zoomLink}
            onChange={(e) => setZoomLink(e.target.value)}
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
