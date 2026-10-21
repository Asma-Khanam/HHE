import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  dismissUnmatchedEmail,
  fileUnmatchedEmail,
  friendlyError,
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
} from "../components/EmailsPanel";
import "../components/panels.css";
import "../components/EmailsPanel.css";
import "./EmailsPage.css";

// The Emails page: every email in one place (21 Oct 2026).
//   Tracked   = already on a family's Emails tab
//   Untracked = arrived at an address that matches no family (kept, addendum 124):
//               a consultant files it under the right family, or dismisses it.
// Replying and sending still happen on the family's own Emails tab, so the reply
// always goes out from that family's address and comes back to the right place.

const TABS = [
  { key: "all", label: "All" },
  { key: "tracked", label: "Tracked" },
  { key: "untracked", label: "Untracked" },
  { key: "sent", label: "Sent" },
];

const haystack = (n) =>
  [n.subject, n.email_from, n.email_from_name, n.email_to, n.familyName, previewLine(n)].join(" ").toLowerCase();

export default function EmailsPage() {
  const [tracked, setTracked] = useState([]);
  const [untracked, setUntracked] = useState([]);
  const [families, setFamilies] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const [mobileReading, setMobileReading] = useState(false);
  const [full, setFull] = useState(null);
  const listRef = useRef(null);

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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((n) => {
      if (tab === "tracked" && !n.isTracked) return false;
      if (tab === "untracked" && n.isTracked) return false;
      if (tab === "sent" && n.direction !== "outbound") return false;
      return !q || q.split(/\s+/).every((w) => haystack(n).includes(w));
    });
  }, [all, tab, query]);

  const groups = useMemo(() => {
    const out = [];
    visible.forEach((n) => {
      const label = groupLabel(n.occurred_at);
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(n);
    });
    return out;
  }, [visible]);

  const selected = visible.find((n) => n.key === selectedKey) || visible[0] || null;

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
    setSelectedKey(key);
    setMobileReading(true);
  }

  function onKeyDown(e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const idx = visible.findIndex((n) => n.key === selected?.key);
    const next = visible[Math.min(visible.length - 1, Math.max(0, idx + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      setSelectedKey(next.key);
      listRef.current?.querySelector(`[data-key="${next.key}"]`)?.scrollIntoView({ block: "nearest" });
    }
  }

  const counts = {
    all: all.length,
    tracked: tracked.length,
    untracked: untracked.length,
    sent: all.filter((n) => n.direction === "outbound").length,
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

  return (
    <div className="ep-page">
      <div className="ep-head">
        <div>
          <h1>Emails</h1>
          <p className="ep-sub">
            Every email in one place. <strong>Untracked</strong> emails reached us at an address that matches no family
            yet, so someone needs to file them. To reply, open the family&apos;s Emails tab.
          </p>
        </div>
        <button type="button" className="panel-btn" onClick={load}>
          Refresh
        </button>
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
      {notice && (
        <div className="ep-notice" role="status">
          {notice}
          <button type="button" className="ep-notice-x" onClick={() => setNotice("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <div className="ep-tabs" role="tablist" aria-label="Email views">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={"ep-tab" + (tab === t.key ? " is-active" : "") + (t.key === "untracked" && counts.untracked ? " is-alert" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="ep-tab-count">{counts[t.key]}</span>
          </button>
        ))}
        {unreadCount > 0 && <span className="ep-unread-note">{unreadCount} unread</span>}
      </div>

      {!loaded ? (
        <p className="family-detail-hint">Loading emails…</p>
      ) : all.length === 0 ? (
        <div className="mx-empty">
          <p>No emails yet.</p>
        </div>
      ) : (
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
            <div className="mx-list" ref={listRef} tabIndex={0} onKeyDown={onKeyDown} aria-label="Emails">
              {visible.length === 0 && (
                <p className="mx-no-results">
                  {tab === "untracked" && !query ? "Nothing waiting. Every email has found its family." : "Nothing matches."}
                </p>
              )}
              {groups.map((g) => (
                <div key={g.label} className="mx-group">
                  <div className="mx-group-label">{g.label}</div>
                  {g.items.map((n) => {
                    const s = senderOf(n);
                    const active = selected?.key === n.key;
                    return (
                      <button
                        key={n.key}
                        type="button"
                        data-key={n.key}
                        className={"mx-row" + (active ? " is-active" : "") + (n.isTracked && isUnread(n) ? " is-unread" : "")}
                        onClick={() => select(n.key)}
                      >
                        <Avatar name={s.name} email={s.email} size={34} />
                        <span className="mx-row-main">
                          <span className="mx-row-line1">
                            {n.isTracked && isUnread(n) && <span className="mx-unread-dot" title="Unread" />}
                            <span className="mx-row-sender">
                              {n.direction === "outbound" && n.email_to ? `To: ${splitAddrs(n.email_to)[0] || n.email_to}` : s.name}
                            </span>
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
                families={families}
                onFiled={(name) => afterAction(`Filed under ${name}. It is now on their Emails tab.`)}
                onDismissed={() => afterAction("Dismissed. It will not show here again.")}
              />
            )}
            {selected && selected.isTracked && selected.family_id && (
              <div className="ep-bar">
                <span>
                  On <strong>{selected.familyName || "this family"}</strong>&apos;s record
                </span>
                <Link className="panel-btn" to={`/staff/families/${selected.family_id}?tab=emails`}>
                  Open their Emails tab to reply
                </Link>
              </div>
            )}
            {readingNote ? (
              <ReadingPane
                note={readingNote}
                familyId={selected?.family_id}
                noInsight={!selected?.isTracked}
                onBack={() => setMobileReading(false)}
                onUpdate={(updated) =>
                  setTracked((prev) => prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n)))
                }
              />
            ) : (
              <div className="mx-reading mx-reading-empty">
                <p>{selected ? "Loading email…" : "Select an email to read it here."}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Above an untracked email: choose the family it belongs to, or dismiss it.
function FileBar({ email, families, onFiled, onDismissed }) {
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDismiss, setConfirmDismiss] = useState(false);

  const labelFor = (f) => `${f.name} · ${f.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const byLabel = useMemo(() => new Map(families.map((f) => [labelFor(f), f])), [families]);

  async function file() {
    const fam = byLabel.get(choice.trim());
    if (!fam) {
      setErr("Pick a family from the list.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await fileUnmatchedEmail(email.id, fam.id);
      onFiled(fam.name);
    } catch (e) {
      setErr(friendlyError(e, "Couldn't file that email."));
      setBusy(false);
    }
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
        <strong>Not on any family yet.</strong> It was sent to <code>{email.alias || "an unknown address"}</code>.
      </div>
      <div className="ep-bar-actions">
        <input
          className="panel-input ep-family-input"
          list="ep-family-list"
          placeholder="Type a family name…"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          disabled={busy}
        />
        <datalist id="ep-family-list">
          {families.map((f) => (
            <option key={f.id} value={labelFor(f)} />
          ))}
        </datalist>
        <button type="button" className="panel-btn panel-btn-primary" onClick={file} disabled={busy || !choice.trim()}>
          {busy ? "Working…" : "File under family"}
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
