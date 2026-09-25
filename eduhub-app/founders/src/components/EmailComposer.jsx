import { useEffect, useMemo, useRef, useState } from "react";
import { sendFamilyEmail, listSchoolRecipients, friendlyError } from "../lib/staffData";
import "./EmailComposer.css";

// New email / Reply / Forward, Outlook-style (26 Sept 2026). Sends through
// /api/send-email; replies from the school come back to the family's own
// application address, so they land in this tab by themselves.
// The draft saves itself in this browser until it's sent or discarded.

const MAX_BYTES = 3_000_000;

const fileSize = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s).trim());

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function loadDraft(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
function saveDraft(key, value) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // Private window etc. -- the draft just won't survive a reload.
  }
}

// To / Cc box: chips, with suggestions from the family's schools.
function RecipientInput({ label, value, onChange, suggestions, autoFocus }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    return suggestions
      .filter((s) => !value.includes(s.email))
      .filter((s) => !q || [s.email, s.name, s.school, s.title].join(" ").toLowerCase().includes(q))
      .slice(0, 8);
  }, [text, suggestions, value]);

  function add(email) {
    const e = String(email).trim().replace(/[,;]$/, "");
    if (!isEmail(e) || value.includes(e)) return;
    onChange([...value, e]);
    setText("");
    setOpen(false);
  }

  return (
    <div className="ec-row ec-recips" ref={ref}>
      <span className="ec-label">{label}</span>
      <div className="ec-chips" onClick={() => ref.current?.querySelector("input")?.focus()}>
        {value.map((e) => {
          const s = suggestions.find((x) => x.email === e);
          return (
            <span key={e} className="ec-chip" title={e}>
              {s?.name ? `${s.name}${s.school ? ` · ${s.school}` : ""}` : e}
              <button type="button" aria-label={`Remove ${e}`} onClick={() => onChange(value.filter((x) => x !== e))}>
                ×
              </button>
            </span>
          );
        })}
        <input
          autoFocus={autoFocus}
          value={text}
          placeholder={value.length ? "" : "Type a name, school or email"}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (["Enter", ",", ";", "Tab"].includes(e.key) && text.trim()) {
              if (isEmail(text)) {
                e.preventDefault();
                add(text);
              } else if (matches[0] && e.key !== "Tab") {
                e.preventDefault();
                add(matches[0].email);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
        />
      </div>
      {open && matches.length > 0 && (
        <ul className="ec-suggest">
          {matches.map((s) => (
            <li key={s.email}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s.email)}>
                <strong>{s.name || s.email}</strong>
                {s.title && <span> · {s.title}</span>}
                <em>
                  {s.school} · {s.email}
                </em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EmailComposer({
  familyId,
  familyName,
  childLines = [], // e.g. ["Layla, Year 6"]
  documents = [], // [{ id, label }]
  staffName,
  familyAddress,
  initial = {},
  onSent,
  onClose,
}) {
  const isNew = !initial.mode || initial.mode === "new";
  const draftKey = `hhe-email-draft-${familyId}`;
  const start = isNew ? loadDraft(draftKey) || {} : {};
  const [to, setTo] = useState(initial.to || start.to || []);
  const [cc, setCc] = useState(initial.cc || start.cc || []);
  const [showCc, setShowCc] = useState(!!(initial.cc?.length || start.cc?.length));
  const [ccMe, setCcMe] = useState(start.ccMe ?? false);
  const [subject, setSubject] = useState(initial.subject ?? start.subject ?? "");
  const [text, setText] = useState(initial.text ?? start.text ?? "");
  const [files, setFiles] = useState([]); // { name, type, size, content }
  const [docIds, setDocIds] = useState([]);
  const [showDocs, setShowDocs] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bodyRef = useRef(null);

  useEffect(() => {
    listSchoolRecipients(familyId)
      .then(setSuggestions)
      .catch(() => {});
  }, [familyId]);

  // New emails keep a draft in this browser while you type.
  useEffect(() => {
    if (!isNew) return;
    const t = setTimeout(() => saveDraft(draftKey, to.length || cc.length || subject || text ? { to, cc, ccMe, subject, text } : null), 400);
    return () => clearTimeout(t);
  }, [isNew, draftKey, to, cc, ccMe, subject, text]);

  async function addFiles(list) {
    setError("");
    const next = [...files];
    for (const f of list) {
      if (next.reduce((t, x) => t + x.size, 0) + f.size > MAX_BYTES) {
        setError("That's more than 3 MB of files. For bigger ones, pick them from the family's documents instead.");
        break;
      }
      next.push({ name: f.name, type: f.type, size: f.size, content: await readBase64(f) });
    }
    setFiles(next);
  }

  function applyTemplate(key) {
    const kids = childLines.length ? childLines.map((l) => `- ${l}`).join("\n") : "- (child's name and year group)";
    const names = childLines.map((l) => l.split(",")[0]).join(" and ") || "the children";
    const surname = String(familyName || "").trim().split(/\s+/).pop();
    const fam = surname ? `the ${surname} family` : "our family";
    const T = {
      places: {
        subject: `Place availability${childLines.length ? ` for ${names}` : ""}`,
        text: `Dear Admissions team,\n\nI'm writing on behalf of ${fam}, who are relocating to Dubai. Could you let us know whether you have places available for:\n${kids}\n\nIf there are, we'd love to arrange a tour.\n\nKind regards,`,
      },
      tour: {
        subject: `Tour request${childLines.length ? ` for ${names}` : ""}`,
        text: `Dear Admissions team,\n\n${fam.charAt(0).toUpperCase() + fam.slice(1)} would like to visit the school. Could you share the dates and times you have available for a tour?\n\nThe family is looking at places for:\n${kids}\n\nKind regards,`,
      },
      docs: {
        subject: `Application documents${childLines.length ? ` for ${names}` : ""}`,
        text: `Dear Admissions team,\n\nPlease find attached the documents for ${names}'s application.\n\nDo let us know if anything else is needed.\n\nKind regards,`,
      },
    }[key];
    if (!subject.trim()) setSubject(T.subject);
    setText(T.text + (text.trim() ? `\n\n${text}` : ""));
    if (key === "docs") setShowDocs(true);
    requestAnimationFrame(() => bodyRef.current?.focus());
  }

  async function send() {
    setBusy(true);
    setError("");
    try {
      const note = await sendFamilyEmail({
        familyId,
        to,
        cc,
        ccMe,
        subject,
        text,
        inReplyTo: initial.inReplyTo || null,
        references: initial.references || initial.inReplyTo || null,
        attachments: files.map(({ name, type, content }) => ({ name, type, content })),
        documentIds: docIds,
      });
      if (isNew) saveDraft(draftKey, null);
      onSent(note);
    } catch (e) {
      setError(friendlyError(e, "Couldn't send that email."));
      setBusy(false);
    }
  }

  function discard() {
    if (isNew) saveDraft(draftKey, null);
    onClose();
  }

  const canSend = to.length > 0 && text.trim() && !busy;

  return (
    <div className="ec" onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && canSend && send()}>
      <div className="ec-head">
        <strong>{initial.mode === "reply" ? "Reply" : initial.mode === "forward" ? "Forward" : "New email"}</strong>
        <button type="button" className="ec-x" onClick={discard} aria-label="Discard">
          ×
        </button>
      </div>

      <div className="ec-row ec-from">
        <span className="ec-label">From</span>
        <span>
          Heather Harries Education
          {familyAddress && (
            <em>
              {" "}
              · replies come back to {familyAddress} and land here
            </em>
          )}
        </span>
      </div>
      <RecipientInput label="To" value={to} onChange={setTo} suggestions={suggestions} autoFocus={isNew && !to.length} />
      {showCc ? (
        <RecipientInput label="Cc" value={cc} onChange={setCc} suggestions={suggestions} />
      ) : null}
      <div className="ec-row ec-options">
        {!showCc && (
          <button type="button" className="ec-link" onClick={() => setShowCc(true)}>
            + Cc
          </button>
        )}
        <label className="ec-check">
          <input type="checkbox" checked={ccMe} onChange={(e) => setCcMe(e.target.checked)} />
          Send me a copy
        </label>
      </div>
      <div className="ec-row">
        <span className="ec-label">Subject</span>
        <input className="ec-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
      </div>

      {isNew && (
        <div className="ec-templates">
          <span>Start from:</span>
          <button type="button" onClick={() => applyTemplate("places")}>
            Ask about places
          </button>
          <button type="button" onClick={() => applyTemplate("tour")}>
            Request a tour
          </button>
          <button type="button" onClick={() => applyTemplate("docs")}>
            Send documents
          </button>
        </div>
      )}

      <textarea
        ref={bodyRef}
        className="ec-body"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write your email…"
        rows={12}
        autoFocus={!isNew}
      />
      <p className="ec-sig">
        Signed as: {staffName || "you"}, Heather Harries Education
      </p>

      {(files.length > 0 || docIds.length > 0) && (
        <ul className="ec-files">
          {files.map((f, i) => (
            <li key={`f${i}`}>
              📎 {f.name} <span>{fileSize(f.size)}</span>
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                ×
              </button>
            </li>
          ))}
          {docIds.map((id) => (
            <li key={id}>
              📄 {documents.find((d) => d.id === id)?.label || "Document"}
              <button type="button" onClick={() => setDocIds(docIds.filter((x) => x !== id))} aria-label="Remove">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {showDocs && (
        <div className="ec-docs">
          <p>Attach from the family&apos;s documents:</p>
          {documents.length === 0 ? (
            <p className="ec-muted">No documents uploaded yet.</p>
          ) : (
            <div className="ec-docs-list">
              {documents.map((d) => (
                <label key={d.id}>
                  <input
                    type="checkbox"
                    checked={docIds.includes(d.id)}
                    onChange={(e) => setDocIds(e.target.checked ? [...docIds, d.id] : docIds.filter((x) => x !== d.id))}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <div className="ec-actions">
        <button type="button" className="panel-btn panel-btn-primary ec-send" onClick={send} disabled={!canSend}>
          {busy ? "Sending…" : "Send"}
        </button>
        <label className="panel-btn ec-attach">
          Attach files
          <input
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles([...e.target.files]);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" className="panel-btn" onClick={() => setShowDocs((v) => !v)}>
          {showDocs ? "Hide documents" : "From family documents"}
        </button>
        <span className="ec-hint">Ctrl/⌘ + Enter to send</span>
        <button type="button" className="ec-link ec-discard" onClick={discard} disabled={busy}>
          Discard
        </button>
      </div>
    </div>
  );
}
