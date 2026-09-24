import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCaseNote,
  createTask,
  friendlyError,
  getEmailAttachmentUrl,
  requestEmailInsight,
  saveEmailInsight,
} from "../lib/staffData";
import "./panels.css";
import "./EmailsPanel.css";

// The Emails tab -- an Outlook-style mailbox for ONE family.
//
// Left: a searchable list grouped by Today / Yesterday / This week / month,
// each row showing sender, subject, a one-line preview, date and a paperclip
// when there are attachments. Right: the reading pane, showing the email
// exactly as it was sent (addendum 77 keeps the full HTML) inside a sandboxed
// iframe -- no scripts can run, links open in a new tab.
//
// Rows logged before addendum 77 only have a 400-character plain-text
// preview; those are cleaned up (the "![](https://...)" junk removed, links
// made clickable) so they still read tidily.
//
// Data is still just case_notes rows with kind="email" -- inbound ones come
// from the ImprovMX webhook, outbound ones from "Log an email" below.

// ------------------------------------------------------------------ helpers

function splitInboundBody(body) {
  const marker = "\n\nFrom: ";
  const idx = body?.lastIndexOf(marker) ?? -1;
  if (idx === -1) return { snippet: body || "", from: null };
  return { snippet: body.slice(0, idx), from: body.slice(idx + marker.length) };
}

// Plain-text versions of HTML emails come with markdown-ish leftovers.
function cleanText(text) {
  return (text || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // image references
    .replace(/\[([^\]]*)\]\((https?:[^)\s]+)\)/g, (_, label, url) => (label.trim() ? `${label} (${url})` : url))
    .replace(/\[\s*\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function previewLine(note) {
  const raw = note.email_text || splitInboundBody(note.body).snippet;
  return cleanText(raw)
    .replace(/\(?https?:\/\/[^\s)]+\)?/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function senderOf(note) {
  if (note.direction === "outbound") return { name: "Heather Harries team", email: "" };
  const email = note.email_from || splitInboundBody(note.body).from || "";
  const name = note.email_from_name || (email ? email.split("@")[0] : "Unknown sender");
  return { name, email };
}

function initials(name) {
  const parts = String(name || "?")
    .replace(/[^A-Za-z\s]/g, " ")
    .trim()
    .split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

const AVATAR_TONES = ["#7a1743", "#2f6b4f", "#8a6a22", "#3d5a80", "#6b4f7a", "#9a4a2f"];
function toneFor(key) {
  let h = 0;
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function groupLabel(iso) {
  const d = new Date(iso);
  const today = startOfDay(new Date());
  const days = Math.round((today - startOfDay(d)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  if (days < 14) return "Last week";
  const now = new Date();
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return "Earlier this month";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function listDate(iso) {
  const d = new Date(iso);
  const today = startOfDay(new Date());
  const days = Math.round((today - startOfDay(d)) / 86400000);
  if (days <= 0) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function fullDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Real attachments only -- images pasted into the body (inline) are shown
// in place, not as chips.
const filesOf = (note) => (note.email_attachments || []).filter((a) => !a.inline);

// "a@b.com <a@b.com>" -> "a@b.com"
const tidyAddresses = (s) => (s || "").replace(/([^\s,<>]+@[^\s,<>]+)\s*<\1>/gi, "$1");

const MISSING_IMAGE =
  '<span style="display:inline-block;padding:6px 10px;border:1px dashed #d8c9ce;border-radius:6px;color:#8a7a80;font-size:12px">Image not available</span>';

// Swap cid: references for private links to the stored image; anything
// still unresolved becomes a small placeholder instead of a huge empty box.
function useResolvedHtml(note) {
  const [state, setState] = useState({ id: null, html: null });
  useEffect(() => {
    if (!note?.email_html) return undefined;
    let cancelled = false;
    const inlines = (note.email_attachments || []).filter((a) => a.inline && a.cid && a.path);
    (async () => {
      let html = note.email_html;
      for (const a of inlines) {
        try {
          const url = await getEmailAttachmentUrl(a.path, 3600);
          html = html.split(`cid:${a.cid}`).join(url);
        } catch {
          /* leave it -- becomes the placeholder below */
        }
      }
      html = html.replace(/<img\b[^>]*\bsrc\s*=\s*(["'])cid:[^"']*\1[^>]*>/gi, MISSING_IMAGE);
      if (!cancelled) setState({ id: note.id, html });
    })();
    return () => {
      cancelled = true;
    };
  }, [note]);
  return state.id === note?.id ? state.html : null;
}

function fileSize(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const CATEGORY_LABELS = {
  assessment_invite: "Assessment",
  offer: "Offer",
  waitlist: "Waitlist",
  rejection: "Not offered",
  documents_requested: "Documents needed",
  fees_payment: "Fees",
  tour_or_visit: "Tour / visit",
  interview: "Interview",
  application_received: "Application received",
  general_info: "Info",
  other: "Other",
};

function prettyDate(ymd, time) {
  if (!ymd) return "";
  const d = new Date(`${ymd}T${time || "00:00"}`);
  if (Number.isNaN(d.getTime())) return ymd;
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return time ? `${day}, ${time}` : day;
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.8 5.6L19.5 9l-5.7 1.6L12 16l-1.8-5.4L4.5 9l5.7-1.4zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" />
    </svg>
  );
}

// Claude's reading of the email -- summary, dates, suggested to-dos. Only
// suggestions: nothing happens until a consultant clicks "Add as task".
function InsightBox({ note, familyId, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(null);
  const ins = note.ai_insight;

  async function run() {
    setBusy(true);
    setErr("");
    try {
      onUpdate(await requestEmailInsight(note.id));
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function addTask(i) {
    const t = ins.suggested_tasks[i];
    setAdding(i);
    setErr("");
    try {
      await createTask({ familyId, title: t.title, dueDate: t.due_date || null });
      const next = { ...ins, suggested_tasks: ins.suggested_tasks.map((x, j) => (j === i ? { ...x, added: true } : x)) };
      onUpdate(await saveEmailInsight(note.id, next));
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setAdding(null);
    }
  }

  if (!ins) {
    return (
      <div className="mx-ai mx-ai-empty">
        <span className="mx-ai-title">
          <SparkIcon /> Claude can summarise this email and suggest next steps
        </span>
        <button type="button" className="panel-btn" onClick={run} disabled={busy}>
          {busy ? "Reading…" : "Summarise"}
        </button>
        {(err || note.ai_insight_error) && <p className="mx-error">{err || note.ai_insight_error}</p>}
      </div>
    );
  }

  return (
    <div className={"mx-ai" + (ins.urgency === "high" ? " is-urgent" : "")}>
      <div className="mx-ai-head">
        <span className="mx-ai-title">
          <SparkIcon /> Claude&apos;s summary
        </span>
        <span className="mx-ai-cat">{CATEGORY_LABELS[ins.category] || "Other"}</span>
        {ins.urgency === "high" && <span className="mx-ai-urgent">Needs action soon</span>}
        <button type="button" className="mx-link-btn mx-ai-refresh" onClick={run} disabled={busy}>
          {busy ? "Reading…" : "Refresh"}
        </button>
      </div>
      <p className="mx-ai-summary">{ins.summary}</p>
      {ins.key_dates?.length > 0 && (
        <div className="mx-ai-dates">
          {ins.key_dates.map((d, i) => (
            <span key={i} className="mx-ai-date">
              <strong>{d.label}</strong> {prettyDate(d.date, d.time)}
            </span>
          ))}
        </div>
      )}
      {ins.suggested_tasks?.length > 0 && (
        <ul className="mx-ai-tasks">
          {ins.suggested_tasks.map((t, i) => (
            <li key={i}>
              <span className="mx-ai-task-title">
                {t.title}
                {t.due_date && <span className="mx-ai-task-due"> · by {prettyDate(t.due_date)}</span>}
              </span>
              {t.added ? (
                <span className="mx-ai-added">Added ✓</span>
              ) : (
                <button type="button" className="panel-btn" onClick={() => addTask(i)} disabled={adding !== null}>
                  {adding === i ? "Adding…" : "Add as task"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {err && <p className="mx-error">{err}</p>}
      <p className="mx-ai-foot">AI-generated from the email above — check before acting.</p>
    </div>
  );
}

function searchHaystack(note) {
  const s = senderOf(note);
  return [note.subject, note.ai_insight?.summary, CATEGORY_LABELS[note.ai_insight?.category], s.name, s.email, note.email_to, note.email_cc, note.email_text, note.body,
    ...filesOf(note).map((a) => a.name)]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
}

// Turn bare URLs in plain text into links (display shortened to the domain).
function Linkified({ text }) {
  const parts = [];
  const re = /(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    let host = m[1];
    try {
      host = new URL(m[1]).hostname.replace(/^www\./, "");
    } catch {
      /* keep raw */
    }
    parts.push(
      <a key={m.index} href={m[1]} target="_blank" rel="noopener noreferrer" title={m[1]}>
        {host}
      </a>
    );
    last = m.index + m[1].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <div className="mx-text-body">{parts}</div>;
}

// ------------------------------------------------------------ HTML renderer

const FRAME_HEAD = `<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline' https:; font-src https: data:;">
<base target="_blank">
<style>
  html,body{margin:0;background:#fff}
  body{padding:4px 2px 24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;font-size:14px;line-height:1.5;color:#2a1119;overflow-wrap:anywhere}
  img{max-width:100%;height:auto}
  table{max-width:100%!important}
  a{color:#7a1743}
  blockquote{margin:0 0 0 8px;padding-left:10px;border-left:3px solid #ece3e6;color:#6b5a60}
  pre{white-space:pre-wrap}
</style>`;

function EmailFrame({ html }) {
  const ref = useRef(null);
  const [height, setHeight] = useState(240);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return undefined;
    let ro;
    const measure = () => {
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;
      setHeight(Math.max(120, doc.documentElement.scrollHeight + 4));
    };
    const onLoad = () => {
      measure();
      const doc = frame.contentDocument;
      doc?.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
      if (doc?.body && "ResizeObserver" in window) {
        ro = new ResizeObserver(measure);
        ro.observe(doc.body);
      }
    };
    frame.addEventListener("load", onLoad);
    return () => {
      frame.removeEventListener("load", onLoad);
      ro?.disconnect();
    };
  }, [html]);

  return (
    <iframe
      ref={ref}
      title="Email"
      className="mx-frame"
      style={{ height }}
      // No allow-scripts: nothing in the email can run. allow-same-origin is
      // only so we can measure the content height from here.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={`<!doctype html><html><head>${FRAME_HEAD}</head><body>${html}</body></html>`}
    />
  );
}

// ------------------------------------------------------------------ pieces

function Avatar({ name, email, size = 38 }) {
  return (
    <span
      className="mx-avatar"
      style={{ width: size, height: size, background: toneFor(email || name), fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 11.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l9.2-9.2a3.7 3.7 0 015.2 5.2l-9.2 9.2a1.8 1.8 0 01-2.6-2.6l8.5-8.5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function Attachments({ items }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  if (!items?.length) return null;
  async function open(a) {
    if (!a.path) return;
    setBusy(a.path);
    setErr("");
    try {
      window.open(await getEmailAttachmentUrl(a.path), "_blank", "noopener");
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="mx-attachments">
      {items.map((a, i) => (
        <button
          key={a.path || `${a.name}-${i}`}
          type="button"
          className={"mx-attachment" + (a.path ? "" : " is-missing")}
          onClick={() => open(a)}
          disabled={!a.path || busy === a.path}
          title={a.path ? `Open ${a.name}` : "This file couldn't be saved -- it's still in relocate@heatherharries.com"}
        >
          <PaperclipIcon />
          <span className="mx-attachment-name">{a.name}</span>
          <span className="mx-attachment-size">
            {!a.path ? "couldn't be saved" : busy === a.path ? "Opening…" : fileSize(a.size)}
          </span>
        </button>
      ))}
      {err && <p className="mx-error">{err}</p>}
    </div>
  );
}

function ReadingPane({ note, onBack, familyId, onUpdate }) {
  const resolvedHtml = useResolvedHtml(note);
  if (!note) {
    return (
      <div className="mx-reading mx-reading-empty">
        <p>Select an email to read it here.</p>
      </div>
    );
  }
  const sender = senderOf(note);
  const outbound = note.direction === "outbound";
  const legacySnippet = splitInboundBody(note.body).snippet;
  const plain = cleanText(note.email_text || legacySnippet);
  const isLegacy = !outbound && !note.email_html && !note.email_text;

  return (
    <article className="mx-reading">
      <button type="button" className="mx-back" onClick={onBack}>
        ‹ All emails
      </button>
      <h3 className="mx-read-subject">{note.subject || "(no subject)"}</h3>
      <header className="mx-read-head">
        <Avatar name={sender.name} email={sender.email} size={44} />
        <div className="mx-read-meta">
          <div className="mx-read-from">
            <strong>{sender.name}</strong>
            {sender.email && <span className="mx-read-addr">&lt;{sender.email}&gt;</span>}
          </div>
          {note.email_to && (
            <div className="mx-read-line">
              <span>To:</span> {tidyAddresses(note.email_to)}
            </div>
          )}
          {note.email_cc && (
            <div className="mx-read-line">
              <span>Cc:</span> {tidyAddresses(note.email_cc)}
            </div>
          )}
        </div>
        <div className="mx-read-side">
          <span className={"mx-tag" + (outbound ? " is-sent" : " is-received")}>{outbound ? "Sent" : "Received"}</span>
          <time dateTime={note.occurred_at}>{fullDate(note.occurred_at)}</time>
        </div>
      </header>

      {!outbound && <InsightBox key={note.id} note={note} familyId={familyId} onUpdate={onUpdate} />}

      <Attachments items={filesOf(note)} />

      <div className="mx-read-body">
        {note.email_html ? (
          resolvedHtml !== null ? (
            <EmailFrame html={resolvedHtml} />
          ) : (
            <p className="mx-loading">Loading email…</p>
          )
        ) : (
          <Linkified text={plain} />
        )}
        {isLegacy && (
          <p className="mx-legacy-note">
            This email arrived before full emails were being saved, so only the first few lines were kept. The full
            message is in relocate@heatherharries.com.
          </p>
        )}
      </div>
    </article>
  );
}

function ComposeForm({ familyId, onDone, onCancel }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError("");
    try {
      const note = await createCaseNote({ familyId, kind: "email", subject: subject.trim(), body, direction: "outbound" });
      onDone(note);
    } catch (err) {
      setError(friendlyError(err));
      setSaving(false);
    }
  }

  return (
    <form className="mx-compose" onSubmit={submit}>
      <p className="mx-compose-title">Log an email you sent or received outside the family&apos;s addresses</p>
      <input className="panel-input" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea
        className="panel-input"
        placeholder="What did the email say?"
        rows={5}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
      <div className="email-compose-actions">
        <button type="submit" className="panel-btn panel-btn-primary" disabled={saving || !body.trim()}>
          {saving ? "Logging…" : "Log email"}
        </button>
        <button type="button" className="panel-btn panel-btn-quiet" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// -------------------------------------------------------------------- main

const FILTERS = [
  { key: "all", label: "All" },
  { key: "inbound", label: "Received" },
  { key: "outbound", label: "Sent" },
  { key: "files", label: "Attachments" },
];

export default function EmailsPanel({ familyId, notes: allNotes }) {
  const [notes, setNotes] = useState(() =>
    (allNotes || [])
      .filter((n) => n.kind === "email")
      .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [mobileReading, setMobileReading] = useState(false);
  const [composing, setComposing] = useState(false);
  const listRef = useRef(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => {
      if (filter === "inbound" && n.direction !== "inbound") return false;
      if (filter === "outbound" && n.direction !== "outbound") return false;
      if (filter === "files" && !filesOf(n).length) return false;
      return !q || q.split(/\s+/).every((word) => searchHaystack(n).includes(word));
    });
  }, [notes, query, filter]);

  const groups = useMemo(() => {
    const out = [];
    visible.forEach((n) => {
      const label = groupLabel(n.occurred_at);
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(n);
    });
    return out;
  }, [visible]);

  const selected = visible.find((n) => n.id === selectedId) || visible[0] || null;

  function select(id) {
    setSelectedId(id);
    setMobileReading(true);
  }

  function onKeyDown(e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const idx = visible.findIndex((n) => n.id === selected?.id);
    const next = visible[Math.min(visible.length - 1, Math.max(0, idx + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      setSelectedId(next.id);
      listRef.current?.querySelector(`[data-id="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
    }
  }

  const counts = {
    all: notes.length,
    inbound: notes.filter((n) => n.direction === "inbound").length,
    outbound: notes.filter((n) => n.direction === "outbound").length,
    files: notes.filter((n) => filesOf(n).length).length,
  };

  return (
    <section className="family-detail-card mx-card">
      <div className="mx-top">
        <h2>
          Emails
          {notes.length > 0 && <span className="family-detail-card-count">{notes.length}</span>}
        </h2>
        <button type="button" className="panel-btn" onClick={() => setComposing((v) => !v)}>
          {composing ? "Close" : "Log an email"}
        </button>
      </div>
      <p className="family-detail-hint">
        Every reply to this family&apos;s application addresses lands here on its own, exactly as it was sent.
      </p>

      {composing && (
        <ComposeForm
          familyId={familyId}
          onCancel={() => setComposing(false)}
          onDone={(note) => {
            setNotes((prev) => [note, ...prev]);
            setComposing(false);
            setSelectedId(note.id);
            setFilter("all");
            setQuery("");
          }}
        />
      )}

      {notes.length === 0 ? (
        <div className="mx-empty">
          <p>No emails yet.</p>
          <p className="family-detail-hint">
            When a school writes to one of this family&apos;s @applications.heatherharries.com addresses it will
            appear here automatically.
          </p>
        </div>
      ) : (
        <div className={"mx-shell" + (mobileReading ? " is-reading" : "")}>
          <div className="mx-list-col">
            <label className="mx-search">
              <SearchIcon />
              <input
                type="search"
                placeholder="Search emails"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="mx-filters" role="tablist" aria-label="Filter emails">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  className={"mx-filter" + (filter === f.key ? " is-active" : "")}
                  onClick={() => setFilter(f.key)}
                  disabled={f.key !== "all" && counts[f.key] === 0}
                >
                  {f.label}
                  <span className="mx-filter-count">{counts[f.key]}</span>
                </button>
              ))}
            </div>

            <div className="mx-list" ref={listRef} tabIndex={0} onKeyDown={onKeyDown} aria-label="Emails">
              {visible.length === 0 && (
                <p className="mx-no-results">
                  Nothing matches{query ? ` “${query}”` : ""}.{" "}
                  <button
                    type="button"
                    className="mx-link-btn"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    Clear search
                  </button>
                </p>
              )}
              {groups.map((g) => (
                <div key={g.label} className="mx-group">
                  <div className="mx-group-label">{g.label}</div>
                  {g.items.map((n) => {
                    const s = senderOf(n);
                    const active = selected?.id === n.id;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        data-id={n.id}
                        className={"mx-row" + (active ? " is-active" : "")}
                        onClick={() => select(n.id)}
                      >
                        <Avatar name={s.name} email={s.email} size={34} />
                        <span className="mx-row-main">
                          <span className="mx-row-line1">
                            <span className="mx-row-sender">{s.name}</span>
                            <span className="mx-row-date">{listDate(n.occurred_at)}</span>
                          </span>
                          <span className="mx-row-line2">
                            {n.direction === "outbound" && <span className="mx-mini-tag">Sent</span>}
                            {n.ai_insight?.category && n.ai_insight.category !== "other" && (
                              <span className={"mx-mini-tag is-ai" + (n.ai_insight.urgency === "high" ? " is-urgent" : "")}>
                                {CATEGORY_LABELS[n.ai_insight.category]}
                              </span>
                            )}
                            <span className="mx-row-subject">{n.subject || "(no subject)"}</span>
                            {filesOf(n).length > 0 && (
                              <span className="mx-row-clip" title="Has attachments">
                                <PaperclipIcon />
                              </span>
                            )}
                          </span>
                          <span className="mx-row-preview">{n.ai_insight?.summary || previewLine(n) || "(no preview)"}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <ReadingPane
            note={selected}
            familyId={familyId}
            onBack={() => setMobileReading(false)}
            onUpdate={(updated) => setNotes((prev) => prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n)))}
          />
        </div>
      )}
    </section>
  );
}
