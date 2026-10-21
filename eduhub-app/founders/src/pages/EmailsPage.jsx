import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  dismissUnmatchedEmail,
  fileUnmatchedEmail,
  friendlyError,
  getCurrentStaff,
  getEmailContext,
  getEmailNote,
  getUnmatchedEmail,
  listAllEmails,
  listFamilyChoices,
  listUnmatchedEmails,
  updateCaseNote,
} from "../lib/staffData";
import {
  Avatar,
  PaperclipIcon,
  ReadingPane,
  SearchIcon,
  filesOf,
  groupLabel,
  isUnread,
  listDate,
  previewLine,
  senderOf,
  splitAddrs,
  replyDraft,
} from "../components/EmailsPanel";
import EmailComposer from "../components/EmailComposer";
import "../components/panels.css";
import "../components/EmailsPanel.css";
import "./EmailsPage.css";

// The Emails page: every email in one place (21 Oct 2026).
//   Tracked   = already on a family's Emails tab
//   Untracked = arrived at an address that matches no family (kept, addendum 124):
//               a consultant files it under the right family, or dismisses it.
// Replying and sending still happen on the family's own Emails tab, so the reply
// always goes out from that family's address and comes back to the right place.

const FOLDERS = [
  { key: "all", label: "All mail" },
  { key: "inbox", label: "Inbox" },
  { key: "sent", label: "Sent" },
  { key: "tracked", label: "Filed to families" },
  { key: "untracked", label: "Not filed" },
];

// "Layla, Year 6 (DOB 3/4/2016)" lines the composer offers for the school intro.
function childLinesOf(children) {
  return (children || []).map((c) => {
    const name = c.preferred_name || c.first_name || (c.full_name || "").split(" ")[0];
    const year = c.year_group_applying_for?.split(" /")[0];
    const base = [name, year].filter(Boolean).join(", ");
    if (!c.date_of_birth) return base;
    const d = new Date(c.date_of_birth);
    if (Number.isNaN(d.getTime())) return base;
    return `${base}${base ? " " : ""}(DOB ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()})`;
  });
}

const haystack = (n) =>
  [n.subject, n.email_from, n.email_from_name, n.email_to, n.familyName, previewLine(n)].join(" ").toLowerCase();

// A conversation = the same subject (without Re:/Fwd:) within the same family (or all the
// not-filed ones together), like Outlook's conversation view.
const normSubject = (t) => String(t || "").replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, "").replace(/\s+/g, " ").trim().toLowerCase();
const threadKey = (n) => `${n.family_id || "u"}|${normSubject(n.subject)}`;

// "Other" = automated mail that is not on a family (codes, security alerts, newsletters).
// Emails on a family and anything we sent are never "Other".
const AUTO_FROM = /(no-?reply|do-?not-?reply|notification|mailer-daemon|postmaster|security@|system@|workflow|newsletter|bounce|alerts?@|@e\.|@mail\.)/i;
const AUTO_SUBJ = /(one-time password|\botp\b|verification code|your code is|security alert|reset password|unsubscribe|webinar|newsletter)/i;
function isOther(n) {
  if (n.isTracked || n.direction === "outbound") return false;
  return AUTO_FROM.test(n.email_from || "") || AUTO_SUBJ.test(n.subject || "");
}

// Families whose surname appears in the email's subject / sender name, to suggest a one-click filing.
function suggestFamilies(email, families) {
  const hay = ` ${[email.subject, email.email_from_name, email.email_to].join(" ").toLowerCase().replace(/['’]s\b/g, "").replace(/[^a-z\s'-]/g, " ")} `;
  const out = [];
  for (const f of families) {
    const parts = String(f.name || "").replace(/\(.*?\)/g, " ").split(/&| and /i);
    const surnames = parts.map((x) => x.trim().split(/\s+/).pop()?.toLowerCase()).filter((x) => x && x.length >= 4);
    if (surnames.some((x) => hay.includes(` ${x} `))) out.push(f);
  }
  return out.slice(0, 3);
}

export default function EmailsPage() {
  const [tracked, setTracked] = useState([]);
  const [untracked, setUntracked] = useState([]);
  const [families, setFamilies] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [focus, setFocus] = useState("focused"); // Focused | Other
  const [expanded, setExpanded] = useState(() => new Set()); // open conversations
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const [mobileReading, setMobileReading] = useState(false);
  const [full, setFull] = useState(null);
  const listRef = useRef(null);
  // Writing: null, or { ctx, initial } -- the composer takes over the right-hand pane.
  const [writing, setWriting] = useState(null);
  const [staffName, setStaffName] = useState("");
  const [starting, setStarting] = useState(false);
  const [newFor, setNewFor] = useState(null); // the "New email" family picker
  useEffect(() => {
    getCurrentStaff()
      .then((st) => setStaffName(st?.full_name || st?.email || ""))
      .catch(() => {});
  }, []);

  async function startWriting(familyId, makeInitial) {
    setStarting(true);
    setError("");
    try {
      const ctx = await getEmailContext(familyId);
      setWriting({ ctx, initial: makeInitial(ctx) });
      setMobileReading(true);
      setNewFor(null);
    } catch (e) {
      setError(friendlyError(e, "Couldn't open the email composer."));
    } finally {
      setStarting(false);
    }
  }
  function onSent(note) {
    setWriting(null);
    setNotice("Sent. It is on the family's Emails tab too.");
    load().then(() => {
      if (note?.id) setSelectedKey(`n:${note.id}`);
    });
  }

  const load = useCallback(async () => {
    try {
      const [t, u] = await Promise.all([listAllEmails(), listUnmatchedEmails()]);
      setTracked(t.map((r) => ({ ...r, key: `n:${r.id}`, isTracked: true })));
      setUntracked(
        u.map((r) => ({
          ...r,
          key: `u:${r.id}`,
          isTracked: false,
          direction: "inbound",
          occurred_at: r.received_at,
          familyName: "",
        }))
      );
      setError("");
    } catch (e) {
      setError(friendlyError(e, "Couldn't load the emails."));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    listFamilyChoices().then(setFamilies).catch(() => {});
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const all = useMemo(
    () => [...tracked, ...untracked].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)),
    [tracked, untracked]
  );

  const inFolder = useCallback(
    (n) => {
      if (tab === "inbox") return n.direction !== "outbound";
      if (tab === "sent") return n.direction === "outbound";
      if (tab === "tracked") return n.isTracked;
      if (tab === "untracked") return !n.isTracked;
      return true;
    },
    [tab]
  );
  const showFocus = tab === "all" || tab === "inbox" || tab === "untracked";
  const inFolderList = useMemo(() => all.filter(inFolder), [all, inFolder]);
  const otherCount = useMemo(() => inFolderList.filter(isOther).length, [inFolderList]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inFolderList.filter((n) => {
      // Searching looks through everything; otherwise Focused / Other splits the list.
      if (showFocus && !q && (focus === "other" ? !isOther(n) : isOther(n))) return false;
      return !q || q.split(/\s+/).every((w) => haystack(n).includes(w));
    });
  }, [inFolderList, focus, query, showFocus]);

  // Conversations, newest first. Each keeps its emails newest first.
  const threads = useMemo(() => {
    const map = new Map();
    for (const n of visible) {
      const k = threadKey(n);
      if (!map.has(k)) map.set(k, { key: k, items: [] });
      map.get(k).items.push(n);
    }
    return [...map.values()].sort((a, b) => new Date(b.items[0].occurred_at) - new Date(a.items[0].occurred_at));
  }, [visible]);

  const groups = useMemo(() => {
    const out = [];
    threads.forEach((t) => {
      const label = groupLabel(t.items[0].occurred_at);
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, threads: [] });
      out[out.length - 1].threads.push(t);
    });
    return out;
  }, [threads]);

  // What is actually on screen, in order (for the arrow keys).
  const displayed = useMemo(
    () => threads.flatMap((t) => (expanded.has(t.key) ? t.items : [t.items[0]])),
    [threads, expanded]
  );

  const selected = visible.find((n) => n.key === selectedKey) || visible[0] || null;
  const selectedThread = selected ? threadKey(selected) : null;
  // The not-filed emails in the selected conversation: filing one files them all.
  const threadUnfiled = useMemo(
    () => (selected && !selected.isTracked ? untracked.filter((n) => threadKey(n) === selectedThread) : []),
    [selected, selectedThread, untracked]
  );

  function toggleThread(k) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  // Fetch the whole email (with its HTML) for the one being read.
  const selectedKeyNow = selected?.key;
  useEffect(() => {
    if (!selected) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const row = selected.isTracked ? await getEmailNote(selected.id) : await getUnmatchedEmail(selected.id);
        if (cancelled) return;
        setFull(
          selected.isTracked
            ? row
            : { ...row, direction: "inbound", occurred_at: row.received_at, body: "", read_at: row.received_at }
        );
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, "Couldn't open that email."));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeyNow]);

  // Opening a received email marks it read, same as on the family's tab.
  const wasUnread = selected?.isTracked && isUnread(selected);
  useEffect(() => {
    if (!selected || !wasUnread) return;
    const readAt = new Date().toISOString();
    setTracked((prev) => prev.map((n) => (n.id === selected.id ? { ...n, read_at: readAt } : n)));
    updateCaseNote(selected.id, { readAt }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeyNow]);

  function select(key) {
    setWriting(null);
    setSelectedKey(key);
    setMobileReading(true);
  }

  function onKeyDown(e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const idx = displayed.findIndex((n) => n.key === selected?.key);
    const next = displayed[Math.min(displayed.length - 1, Math.max(0, idx + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      setSelectedKey(next.key);
      listRef.current?.querySelector(`[data-key="${next.key}"]`)?.scrollIntoView({ block: "nearest" });
    }
  }

  const counts = {
    all: all.length,
    inbox: all.filter((n) => n.direction !== "outbound").length,
    sent: all.filter((n) => n.direction === "outbound").length,
    tracked: tracked.length,
    untracked: untracked.length,
  };
  const unreadCount = tracked.filter(isUnread).length;

  async function afterAction(message) {
    setNotice(message);
    setSelectedKey(null);
    setFull(null);
    await load();
  }
  const [notice, setNotice] = useState("");

  const readingNote = full && selected && full.id === selected.id ? full : null;

  function renderRow(n, t, open, first) {
    const s = senderOf(n);
    const active = selected?.key === n.key;
    const multi = t.items.length > 1;
    const unread = first ? t.items.some((x) => x.isTracked && isUnread(x)) : n.isTracked && isUnread(n);
    return (
      <button
        key={n.key}
        type="button"
        data-key={n.key}
        className={"mx-row" + (active ? " is-active" : "") + (unread ? " is-unread" : "") + (first ? "" : " ep-child")}
        onClick={() => select(n.key)}
      >
        {first && multi ? (
          <span
            className={"ep-chev" + (open ? " is-open" : "")}
            role="button"
            aria-label={open ? "Collapse conversation" : "Expand conversation"}
            onClick={(e) => {
              e.stopPropagation();
              toggleThread(t.key);
            }}
          >
            ›
          </span>
        ) : (
          <span className="ep-chev-gap" />
        )}
        <Avatar name={s.name} email={s.email} size={34} />
        <span className="mx-row-main">
          <span className="mx-row-line1">
            {unread && <span className="mx-unread-dot" title="Unread" />}
            <span className="mx-row-sender">
              {n.direction === "outbound" && n.email_to ? `To: ${splitAddrs(n.email_to)[0] || n.email_to}` : s.name}
            </span>
            {first && multi && (
              <span className="ep-thread-count" title={`${t.items.length} emails in this conversation`}>
                {t.items.length}
              </span>
            )}
            <span className="mx-row-date">{listDate(n.occurred_at)}</span>
          </span>
          <span className="mx-row-line2">
            {n.isTracked ? (
              <span className="ep-chip is-family">{n.familyName || "Family"}</span>
            ) : (
              <span className="ep-chip is-open">Not filed</span>
            )}
            {n.direction === "outbound" && <span className="mx-mini-tag">Sent</span>}
            <span className="mx-row-subject">{n.subject || "(no subject)"}</span>
            {filesOf(n).length > 0 && (
              <span className="mx-row-clip" title="Has attachments">
                <PaperclipIcon />
              </span>
            )}
          </span>
          <span className="mx-row-preview">{previewLine(n) || "(no preview)"}</span>
        </span>
      </button>
    );
  }

  return (
    <div className="ep-page">
      <div className="ep-head">
        <div>
          <h1>Emails</h1>
          <p className="ep-sub">
            Every email, in one place. Emails on a family also sit on that family&apos;s Emails tab. <strong>Not
            filed</strong> ones have not found their family yet: file one and the rest of its conversation, and
            any replies, follow it automatically.
          </p>
        </div>
        <div className="ep-head-actions">
          <button type="button" className="panel-btn panel-btn-primary" onClick={() => setNewFor((v) => (v === null ? "" : null))}>
            ✎ New email
          </button>
          <button type="button" className="panel-btn" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {newFor !== null && (
        <FamilyPicker
          families={families}
          busy={starting}
          onPick={(id) => startWriting(id, () => ({ mode: "new" }))}
          onCancel={() => setNewFor(null)}
        />
      )}

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
      {notice && (
        <div className="ep-notice" role="status">
          {notice}
          <button type="button" className="ep-notice-x" onClick={() => setNotice("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {!loaded ? (
        <p className="family-detail-hint">Loading emails…</p>
      ) : all.length === 0 ? (
        <div className="mx-empty">
          <p>No emails yet.</p>
        </div>
      ) : (
        <div className="ep-layout">
          <nav className="ep-folders" aria-label="Mail folders">
            {FOLDERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-current={tab === f.key ? "true" : undefined}
                className={"ep-folder" + (tab === f.key ? " is-active" : "") + (f.key === "untracked" && counts.untracked ? " is-alert" : "")}
                onClick={() => {
                  setTab(f.key);
                  setFocus("focused");
                  setMobileReading(false);
                }}
              >
                <span className="ep-folder-name">{f.label}</span>
                <span className="ep-folder-count">{counts[f.key]}</span>
              </button>
            ))}
            {unreadCount > 0 && <span className="ep-unread-note">{unreadCount} unread</span>}
          </nav>

          <div className={"mx-shell ep-shell" + (mobileReading ? " is-reading" : "")}>
            <div className="mx-list-col">
              <label className="mx-search">
                <SearchIcon />
                <input
                  type="search"
                  placeholder="Search emails, senders or families"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {showFocus && !query.trim() && (
                <div className="ep-focus" role="tablist" aria-label="Focused or other">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={focus === "focused"}
                    className={"ep-focus-btn" + (focus === "focused" ? " is-active" : "")}
                    onClick={() => setFocus("focused")}
                  >
                    Focused
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={focus === "other"}
                    className={"ep-focus-btn" + (focus === "other" ? " is-active" : "")}
                    onClick={() => setFocus("other")}
                  >
                    Other <span className="ep-focus-count">{otherCount}</span>
                  </button>
                </div>
              )}
              <div className="mx-list" ref={listRef} tabIndex={0} onKeyDown={onKeyDown} aria-label="Emails">
                {visible.length === 0 && (
                  <p className="mx-no-results">
                    {tab === "untracked" && !query && focus === "focused"
                      ? "Nothing waiting here. Check Other for automated mail."
                      : "Nothing matches."}
                  </p>
                )}
                {groups.map((g) => (
                  <div key={g.label} className="mx-group">
                    <div className="mx-group-label">{g.label}</div>
                    {g.threads.map((t) => {
                      const open = expanded.has(t.key);
                      return (open ? t.items : [t.items[0]]).map((n, i) => renderRow(n, t, open, i === 0));
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="ep-right">
              {selected && !selected.isTracked && (
                <FileBar
                  key={selected.id}
                  email={selected}
                  siblings={threadUnfiled}
                  families={families}
                  onFiled={(name, count) =>
                    afterAction(
                      `Filed ${count} email${count === 1 ? "" : "s"} under ${name}. Replies in this conversation will now file themselves.`
                    )
                  }
                  onDismissed={() => afterAction("Dismissed. It will not show here again.")}
                />
              )}
              {selected && selected.isTracked && selected.family_id && (
                <div className="ep-bar">
                  <span>
                    On <strong>{selected.familyName || "this family"}</strong>&apos;s record
                  </span>
                  <Link className="panel-btn panel-btn-quiet" to={`/staff/families/${selected.family_id}?tab=emails`}>
                    Open their record
                  </Link>
                </div>
              )}
              {writing ? (
                <div className="mx-reading mx-writing">
                  <EmailComposer
                    key={JSON.stringify(writing.initial).slice(0, 200) + writing.ctx.familyId}
                    familyId={writing.ctx.familyId}
                    familyName={writing.ctx.familyName}
                    childLines={childLinesOf(writing.ctx.children)}
                    documents={writing.ctx.documents}
                    staffName={staffName}
                    familyAddress={writing.ctx.familyAddress}
                    moveDate={writing.ctx.moveDate}
                    entryPhrase={writing.ctx.entryPhrase}
                    initial={writing.initial}
                    onSent={onSent}
                    onClose={() => {
                      setWriting(null);
                      setMobileReading(false);
                    }}
                  />
                </div>
              ) : readingNote ? (
                <ReadingPane
                  note={readingNote}
                  familyId={selected?.family_id}
                  noInsight={!selected?.isTracked}
                  onBack={() => setMobileReading(false)}
                  onUpdate={(updated) =>
                    setTracked((prev) => prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n)))
                  }
                  onReply={
                    selected?.isTracked && selected.family_id
                      ? (n, mode) => startWriting(selected.family_id, (ctx) => replyDraft(n, mode, ctx.familyAddress))
                      : undefined
                  }
                  onToggleRead={
                    selected?.isTracked
                      ? (n) => {
                          setTracked((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: null } : x)));
                          updateCaseNote(n.id, { readAt: null }).catch(() => {});
                          setMobileReading(false);
                        }
                      : undefined
                  }
                />
              ) : (
                <div className="mx-reading mx-reading-empty">
                  <p>{selected ? "Loading email…" : "Select an email to read it here."}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Above a not-filed email: file it (and the rest of its conversation) under a family in one click,
// or pick another family, or say it is not a family email.
function FileBar({ email, siblings, families, onFiled, onDismissed }) {
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDismiss, setConfirmDismiss] = useState(false);

  const targets = siblings.length ? siblings : [email];
  const many = targets.length > 1;
  const suggestions = useMemo(() => suggestFamilies(email, families), [email, families]);
  const labelFor = (f) => `${f.name} · ${f.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const byLabel = useMemo(() => new Map(families.map((f) => [labelFor(f), f])), [families]);
  const sentTo = splitAddrs(email.email_to)[0] || email.alias || "an address that matches no family";

  async function fileTo(fam) {
    setBusy(true);
    setErr("");
    let done = 0;
    try {
      for (const t of targets) {
        await fileUnmatchedEmail(t.id, fam.id);
        done += 1;
      }
      onFiled(fam.name, done);
    } catch (e) {
      setErr(friendlyError(e, "Couldn't file that email.") + (done ? ` (${done} were filed before the problem.)` : ""));
      setBusy(false);
    }
  }

  function fileChosen() {
    const fam = byLabel.get(choice.trim());
    if (!fam) {
      setErr("Pick a family from the list.");
      return;
    }
    fileTo(fam);
  }

  async function dismiss() {
    setBusy(true);
    setErr("");
    try {
      await dismissUnmatchedEmail(email.id);
      onDismissed();
    } catch (e) {
      setErr(friendlyError(e, "Couldn't dismiss that email."));
      setBusy(false);
    }
  }

  return (
    <div className="ep-bar is-open">
      <div className="ep-bar-text">
        <strong>Not on any family yet.</strong> Sent to <code>{sentTo}</code>.
        {many && <> Filing it files all {targets.length} emails in this conversation.</>}
      </div>
      {suggestions.length > 0 && (
        <div className="ep-bar-actions ep-suggest">
          <span className="ep-suggest-label">Looks like:</span>
          {suggestions.map((f) => (
            <button key={f.id} type="button" className="panel-btn panel-btn-primary" onClick={() => fileTo(f)} disabled={busy}>
              {busy ? "Working…" : `File under ${f.name}`}
            </button>
          ))}
        </div>
      )}
      <div className="ep-bar-actions">
        <input
          className="panel-input ep-family-input"
          list="ep-family-list"
          placeholder="Or type a family name…"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fileChosen()}
          disabled={busy}
        />
        <datalist id="ep-family-list">
          {families.map((f) => (
            <option key={f.id} value={labelFor(f)} />
          ))}
        </datalist>
        <button type="button" className="panel-btn" onClick={fileChosen} disabled={busy || !choice.trim()}>
          {busy ? "Working…" : many ? `File all ${targets.length}` : "File under family"}
        </button>
        {confirmDismiss ? (
          <>
            <button type="button" className="panel-btn" onClick={dismiss} disabled={busy}>
              Yes, dismiss
            </button>
            <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setConfirmDismiss(false)} disabled={busy}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setConfirmDismiss(true)} disabled={busy}>
            Not a family email
          </button>
        )}
      </div>
      {err && <p className="mx-error">{err}</p>}
    </div>
  );
}

// "New email": choose which family it is for (the reply address and the school's
// replies are per family), then the composer opens.
function FamilyPicker({ families, busy, onPick, onCancel }) {
  const [choice, setChoice] = useState("");
  const [err, setErr] = useState("");
  const labelFor = (f) => `${f.name} · ${f.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const byLabel = useMemo(() => new Map(families.map((f) => [labelFor(f), f])), [families]);
  function go() {
    const fam = byLabel.get(choice.trim());
    if (!fam) {
      setErr("Pick a family from the list.");
      return;
    }
    onPick(fam.id);
  }
  return (
    <div className="ep-bar ep-picker">
      <div className="ep-bar-text">
        <strong>Which family is this email for?</strong>
      </div>
      <div className="ep-bar-actions">
        <input
          className="panel-input ep-family-input"
          list="ep-new-family-list"
          placeholder="Type a family name…"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          disabled={busy}
        />
        <datalist id="ep-new-family-list">
          {families.map((f) => (
            <option key={f.id} value={labelFor(f)} />
          ))}
        </datalist>
        <button type="button" className="panel-btn panel-btn-primary" onClick={go} disabled={busy || !choice.trim()}>
          {busy ? "Opening…" : "Write email"}
        </button>
        <button type="button" className="panel-btn panel-btn-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
      {err && <p className="mx-error">{err}</p>}
    </div>
  );
}
