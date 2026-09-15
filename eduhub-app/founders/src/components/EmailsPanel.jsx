import { useState } from "react";
import { createCaseNote, friendlyError } from "../lib/staffData";
import "./panels.css";

// The Emails tab (September 2026 change request) -- every school reply that
// lands on this family's application alias(es) shows up here automatically,
// logged by the Cloudflare Email Worker via log_application_email (addendum
// 7) whenever a school writes back to <alias>@applications.heatherharries.com.
// Staff can also log an email they sent by hand (a reply that didn't go
// through an alias, or a call summarised as an email) -- that's the compose
// box below, which just writes a normal kind="email" case_notes row with
// direction="outbound".
//
// This only reads/writes case_notes -- it's the same table School visits'
// Case notes panel uses, filtered down to kind="email" and given its own
// inbox-style look instead of the general activity-log one.

function relativeDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Inbound rows (logged by the Worker) store the body as "<snippet>\n\nFrom:
// <address>" -- split that back apart so the sender shows as its own line
// instead of trailing the message text.
function splitInboundBody(body) {
  const marker = "\n\nFrom: ";
  const idx = body?.lastIndexOf(marker) ?? -1;
  if (idx === -1) return { snippet: body || "", from: null };
  return { snippet: body.slice(0, idx), from: body.slice(idx + marker.length) };
}

function EmailRow({ note }) {
  const { snippet, from } = splitInboundBody(note.body);
  const inbound = note.direction === "inbound";
  return (
    <li className={"email-row" + (inbound ? " is-inbound" : " is-outbound")}>
      <div className="email-row-top">
        <span className={"email-direction-badge" + (inbound ? " is-inbound" : " is-outbound")}>
          {inbound ? "Received" : "Sent"}
        </span>
        <span className="email-subject">{note.subject || "(no subject)"}</span>
        <span className="email-row-date">{relativeDay(note.occurred_at)}</span>
      </div>
      {from && <p className="email-from">From: {from}</p>}
      <p className="email-snippet">{snippet}</p>
    </li>
  );
}

export default function EmailsPanel({ familyId, notes: allNotes }) {
  const [notes, setNotes] = useState((allNotes || []).filter((n) => n.kind === "email"));
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
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
        kind: "email",
        subject: subject.trim(),
        body,
        direction: "outbound",
      });
      setNotes((prev) => [note, ...prev]);
      setSubject("");
      setBody("");
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
        Emails
        {notes.length > 0 && <span className="family-detail-card-count">{notes.length}</span>}
      </h2>
      <p className="family-detail-hint">
        School replies to any of this family&apos;s application addresses land here on their own. Log one by hand
        below if you sent or received something outside that.
      </p>

      {composing ? (
        <form className="email-compose" onSubmit={handleLog}>
          <input
            type="text"
            className="panel-input"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <textarea
            className="panel-input"
            placeholder="What did the email say?"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
          <div className="email-compose-actions">
            <button type="submit" className="panel-btn panel-btn-primary" disabled={saving || !body.trim()}>
              {saving ? "Logging…" : "Log email"}
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
          Log an email
        </button>
      )}

      {notes.length === 0 ? (
        <p className="family-detail-hint email-empty-hint">No emails logged yet.</p>
      ) : (
        <ul className="email-list">
          {notes.map((note) => (
            <EmailRow key={note.id} note={note} />
          ))}
        </ul>
      )}
    </section>
  );
}
