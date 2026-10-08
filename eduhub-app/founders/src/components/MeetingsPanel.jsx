import { useEffect, useState } from "react";
import { createCaseNote, listZoomLinks, createZoomLink, friendlyError } from "../lib/staffData";
import { parseMeetingInvite } from "../lib/meetingLink";
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

// 85354568539 -> "853 5456 8539" (how Zoom shows a Meeting ID).
const formatZoomId = (id) => String(id || "").replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1 $2 $3");

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
  const auto = (note.external_ref || "").startsWith("zoom:");
  const long = text.length > 320 || text.split("\n").length > 6;
  const [open, setOpen] = useState(!long);
  const paras = text.split(/\n{2,}/).filter(Boolean);
  const d = note.occurred_at ? new Date(note.occurred_at) : null;
  return (
    <li className={"meeting-card" + (auto ? " is-auto" : "")}>
      <div className="meeting-date-block" aria-hidden="true">
        <strong>{d ? d.getDate() : ""}</strong>
        <span>{d ? d.toLocaleDateString(undefined, { month: "short" }) : ""}</span>
        <small>{d ? d.getFullYear() : ""}</small>
      </div>
      <div className="meeting-card-body">
        <div className="meeting-row-top">
          <span className="meeting-subject">
            {note.subject || "Meeting"}
            {auto && <span className="meeting-badge">Zoom AI summary</span>}
          </span>
          <span className="meeting-row-date">{formatWhen(note.occurred_at)}</span>
        </div>
        {zoomLink && (
          <a className="meeting-zoom-pill" href={zoomLink} target="_blank" rel="noreferrer">
            Join Zoom call
          </a>
        )}
        <div className={"meeting-notes-text" + (open ? "" : " is-clamped")}>
          {paras.map((para, i) => {
            const [first, ...rest] = para.split("\n");
            const heading = rest.length > 0 && first.length < 60 && !/[.!?]$/.test(first);
            return heading ? (
              <div key={i} className="meeting-para">
                <strong>{first}</strong>
                <p>{rest.join("\n")}</p>
              </div>
            ) : (
              <p key={i} className="meeting-para">
                {para}
              </p>
            );
          })}
        </div>
        {long && (
          <button type="button" className="meeting-toggle" onClick={() => setOpen((v) => !v)}>
            {open ? "Show less" : "Read full summary"}
          </button>
        )}
      </div>
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
  // Linking a Zoom call: its summary is saved here by itself when it ends.
  const [links, setLinks] = useState([]);
  const [invite, setInvite] = useState("");
  const [linkTopic, setLinkTopic] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    listZoomLinks(familyId).then(setLinks);
  }, [familyId]);

  async function handleLinkZoom() {
    const text = invite.trim();
    if (!text || linkBusy) return;
    const parsed = parseMeetingInvite(text);
    const url = parsed.link || (/^https?:/i.test(text) ? text : "");
    const id = (url.match(/zoom\.us\/[a-z]\/(\d{8,})/i)?.[1] || String(parsed.meetingId || "").replace(/\D/g, "") || text.replace(/\D/g, "")).trim();
    if (!/^\d{8,12}$/.test(id)) {
      setLinkError("Couldn't find a Zoom Meeting ID. Paste the Zoom link, the whole invite, or just the Meeting ID (9 to 11 digits).");
      return;
    }
    setLinkBusy(true);
    setLinkError("");
    try {
      const row = await createZoomLink({ familyId, zoomMeetingId: id, joinUrl: url, topic: linkTopic });
      setLinks((l) => [row, ...l]);
      setInvite("");
      setLinkTopic("");
      setLinking(false);
    } catch (e) {
      setLinkError(friendlyError(e, "Couldn't link that meeting. Has addendum 89 been run?"));
    } finally {
      setLinkBusy(false);
    }
  }

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
      <div className="meetings-head">
        <h2>
          Meetings
          {notes.length > 0 && <span className="family-detail-card-count">{notes.length}</span>}
        </h2>
        {!composing && (
          <div className="meetings-actions">
            <button type="button" className="panel-btn" onClick={() => setLinking((v) => !v)}>
              {linking ? "Close" : "Link a Zoom call"}
            </button>
            <button type="button" className="panel-btn panel-btn-primary" onClick={() => setComposing(true)}>
              Add meeting notes
            </button>
          </div>
        )}
      </div>
      <p className="family-detail-hint">
        Calls and meetings with this family. Link a Zoom call before it starts and its AI summary lands here by itself.
      </p>

      {(linking || links.length > 0) && (
      <div className="zoom-link-card">
        {linking && (
          <>
            <div className="zoom-link-head">
              <strong>Link a Zoom call</strong>
              <span>
                Before the call, paste the Zoom link, the whole invite, or just the Meeting ID. The Meeting ID is the number
                Zoom shows for the call (it is also the number after <b>/j/</b> in the link). It is how we know which family the
                summary belongs to. When the call ends, Zoom&rsquo;s AI summary is saved here by itself.
              </span>
            </div>
            <div className="zoom-link-row">
              <input
                className="panel-input"
                placeholder="Zoom link, full invite, or Meeting ID"
                value={invite}
                autoFocus
                onChange={(e) => setInvite(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLinkZoom();
                }}
              />
              <input
                className="panel-input zoom-link-topic"
                placeholder="Topic (optional)"
                value={linkTopic}
                onChange={(e) => setLinkTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLinkZoom();
                }}
              />
              <button type="button" className="panel-btn panel-btn-primary" onClick={handleLinkZoom} disabled={linkBusy || !invite.trim()}>
                {linkBusy ? "Linking…" : "Link"}
              </button>
            </div>
          </>
        )}
        {linkError && <div className="hh-form-banner hh-form-banner-error">{linkError}</div>}
        {links.some((l) => !notes.some((n) => (n.external_ref || "").startsWith("zoom:"))) && (
          <p className="zoom-link-hint">
            Zoom sends the summary a few minutes after the call ends, and only for calls hosted on the HHE Zoom account with
            the AI meeting summary switched on.
          </p>
        )}
        {links.length > 0 && (
          <ul className="zoom-link-list">
            {links.map((l) => {
              const done = notes.some(
                (n) =>
                  (n.external_ref || "").startsWith("zoom:") &&
                  (l.join_url ? (n.body || "").includes(l.join_url) : (n.created_at || "") >= (l.created_at || ""))
              );
              return (
                <li key={l.id} className="zoom-link-item">
                  <span className={"zoom-dot" + (done ? " is-done" : "")} aria-hidden="true" />
                  <span className="zoom-link-name">
                    {l.topic || "Zoom call"}
                    <small title="The Zoom Meeting ID we match the summary against">
                      Meeting ID {formatZoomId(l.zoom_meeting_id)} &middot; linked{" "}
                      {new Date(l.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </small>
                  </span>
                  <span className={"zoom-status" + (done ? " is-done" : "")}>{done ? "Summary saved" : "Waiting for Zoom's summary"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      )}

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
      ) : null}

      {notes.length === 0 ? (
        <div className="meeting-empty">No meetings yet. Link a Zoom call or add notes after a call.</div>
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
