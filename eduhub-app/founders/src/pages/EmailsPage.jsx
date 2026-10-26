import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  dismissUnmatchedEmail,
  moveEmailNote,
  moveEmailTo,
  flagEmail,
  listIntakeFailures,
  resolveIntakeFailures,
  reopenUnmatchedEmail,
  fileUnmatchedEmail,
  friendlyError,
  getCurrentStaff,
  getEmailContext,
  getEmailNote,
  getUnmatchedEmail,
  markUnmatchedRead,
  listAllEmails,
  syncEmailsNow,
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
  { key: "needs", label: "Needs reply" },
  { key: "waiting", label: "Waiting on school" },
  { key: "tracked", label: "On a family" },
  { key: "untracked", label: "Not filed" },
  { key: "flagged", label: "Flagged" },
  // Mirrors the Titan mailbox folders (kept up to date by the Titan email sync).
  { key: "spam", label: "Spam", sep: true },
  { key: "archive", label: "Archive" },
  { key: "trash", label: "Trash" },
];
const boxOf = (n) => n.mailbox_folder || "inbox";

// Needs reply / Waiting on school only look at conversations that moved in the last 30 days,
// so months of backfilled history do not flood them.
const RECENT_MS = 30 * 24 * 3600 * 1000;
const isRecent = (n) => Date.now() - new Date(n.occurred_at).getTime() < RECENT_MS;

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

function FolderIcon({ k }) {
  const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", className: "ep-folder-icon" };
  if (k === "inbox")
    return (
      <svg {...common}>
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" />
      </svg>
    );
  if (k === "sent")
    return (
      <svg {...common}>
        <path d="M22 2 11 13" />
        <path d="M22 2 15 22l-4-9-9-4z" />
      </svg>
    );
  if (k === "spam")
    return (
      <svg {...common}>
        <path d="M12 3 2.5 20h19z" />
        <path d="M12 10v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  if (k === "archive")
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="4" rx="1" />
        <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
        <path d="M10 12h4" />
      </svg>
    );
  if (k === "trash")
    return (
      <svg {...common}>
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="M6 7l1 13h10l1-13" />
      </svg>
    );
  if (k === "needs")
    return (
      <svg {...common}>
        <path d="M9 14 4 9l5-5" />
        <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
      </svg>
    );
  if (k === "waiting")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  if (k === "tracked")
    return (
      <svg {...common}>
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    );
  if (k === "untracked")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4.5" />
        <path d="M12 16h.01" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

const SIZE_KEY = "ep-pane-sizes";
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Drag handle between panes, like Outlook. Double-click puts the width back.
function ResizeHandle({ value, onChange, min, max, label }) {
  function down(e) {
    e.preventDefault();
    const startX = e.clientX;
    const start = value;
    const move = (ev) => onChange(clamp(start + ev.clientX - startX, min, max));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("ep-resizing");
    };
    document.body.classList.add("ep-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  return (
    <div
      className="ep-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title="Drag to resize. Double-click to reset."
      onPointerDown={down}
      onDoubleClick={() => onChange(null)}
    />
  );
}

export default function EmailsPage() {
  const [sizes, setSizes] = useState(() => {
    try {
      return { folders: 228, list: 360, ...JSON.parse(localStorage.getItem(SIZE_KEY) || "{}") };
    } catch {
      return { folders: 228, list: 360 };
    }
  });
  const setSize = (key, v) =>
    setSizes((prev) => {
      const next = { ...prev, [key]: v ?? (key === "folders" ? 228 : 360) };
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify(next));
      } catch {
        /* sizes just will not be remembered */
      }
      return next;
    });
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
    } catch (e) {
      setError(friendlyError(e, "Couldn't open the email composer."));
    } finally {
      setStarting(false);
    }
  }
  // While a brand-new email is open, the bars about the email selected in the list stay hidden.
  const composingNew = !!writing && writing.initial?.mode === "new";
  // "New email" opens the composer straight away; the family is picked inside it.
  function startBlankEmail() {
    setWriting({
      ctx: { familyId: "", familyName: "", children: [], documents: [], familyAddress: "", moveDate: "", entryPhrase: "", dubaiFrom: "", dubaiUntil: "" },
      initial: { mode: "new" },
    });
    setMobileReading(true);
  }
  async function pickFamilyForNew(id, snapshot) {
    setError("");
    try {
      const ctx = await getEmailContext(id);
      setWriting({ ctx, initial: snapshot });
    } catch (e) {
      setError(friendlyError(e, "Couldn't open that family."));
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
      const [t, u, fl] = await Promise.all([listAllEmails(), listUnmatchedEmails(), listIntakeFailures()]);
      setFailures(fl);
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

  // New mail appears by itself, like any mail app: a quiet check every minute while the tab is open.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60000);
    return () => clearInterval(t);
  }, [load]);
  const [failures, setFailures] = useState([]);
  const [showFailures, setShowFailures] = useState(false);
  const [syncState, setSyncState] = useState("");
  const [syncSecs, setSyncSecs] = useState(0);
  async function runSync() {
    setError("");
    setSyncSecs(0);
    const started = Date.now();
    // While it runs, show the clock and pull in whatever it has filed so far.
    const tick = setInterval(() => setSyncSecs(Math.floor((Date.now() - started) / 1000)), 1000);
    const refresher = setInterval(() => load(), 20000);
    try {
      const result = await syncEmailsNow(setSyncState);
      await load();
      setNotice(
        result === "done"
          ? "Synced with Titan. Anything new is in the list."
          : "The sync is still running in the background. New mail appears here as it finishes; the list also refreshes itself."
      );
    } catch (e) {
      setError(friendlyError(e, "Couldn't sync."));
    } finally {
      clearInterval(tick);
      clearInterval(refresher);
      setSyncState("");
    }
  }

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

  // Family names come from the family list, so the email list itself can stay light.
  const nameById = useMemo(() => new Map(families.map((f) => [f.id, f.name])), [families]);
  const all = useMemo(
    () =>
      [...tracked.map((r) => (r.familyName ? r : { ...r, familyName: nameById.get(r.family_id) || "" })), ...untracked].sort(
        (a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)
      ),
    [tracked, untracked, nameById]
  );

  // The newest email of each family conversation: who spoke last decides Needs reply / Waiting.
  const latestByThread = useMemo(() => {
    const m = new Map();
    for (const n of all) {
      if (!n.isTracked || boxOf(n) !== "inbox") continue;
      const k = threadKey(n);
      if (!m.has(k)) m.set(k, n);
    }
    return m;
  }, [all]);

  const inFolder = useCallback(
    (n) => {
      if (tab === "spam" || tab === "archive" || tab === "trash") return boxOf(n) === tab;
      if (boxOf(n) !== "inbox") return false;
      if (tab === "needs")
        return n.isTracked && latestByThread.get(threadKey(n)) === n && n.direction !== "outbound" && isRecent(n);
      if (tab === "waiting")
        return n.isTracked && latestByThread.get(threadKey(n)) === n && n.direction === "outbound" && isRecent(n);
      if (tab === "inbox") return n.direction !== "outbound";
      if (tab === "sent") return n.direction === "outbound";
      if (tab === "flagged") return !!n.flagged;
      if (tab === "tracked") return n.isTracked;
      if (tab === "untracked") return !n.isTracked;
      return true;
    },
    [tab, latestByThread]
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

  const selected =
    visible.find((n) => n.key === selectedKey) || (selectedKey && all.find((n) => n.key === selectedKey)) || visible[0] || null;
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
  const wasUnread = selected && boxOf(selected) === "inbox" && isUnread(selected);
  useEffect(() => {
    if (!selected || !wasUnread) return;
    const readAt = new Date().toISOString();
    if (!selected.isTracked) {
      setUntracked((prev) => prev.map((n) => (n.id === selected.id ? { ...n, read_at: readAt } : n)));
      markUnmatchedRead(selected.id).catch(() => {});
      return;
    }
    setTracked((prev) => prev.map((n) => (n.id === selected.id ? { ...n, read_at: readAt } : n)));
    updateCaseNote(selected.id, { readAt })
      .then(() => window.dispatchEvent(new Event("emails-read")))
      .catch(() => {});
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

  const mail = all.filter((n) => boxOf(n) === "inbox");
  const counts = {
    all: mail.length,
    inbox: mail.filter((n) => n.direction !== "outbound").length,
    sent: mail.filter((n) => n.direction === "outbound").length,
    tracked: mail.filter((n) => n.isTracked).length,
    untracked: mail.filter((n) => !n.isTracked).length,
    flagged: mail.filter((n) => n.flagged).length,
    spam: all.filter((n) => boxOf(n) === "spam").length,
    archive: all.filter((n) => boxOf(n) === "archive").length,
    trash: all.filter((n) => boxOf(n) === "trash").length,
    needs: all.filter((n) => n.isTracked && latestByThread.get(threadKey(n)) === n && n.direction !== "outbound" && isRecent(n)).length,
    waiting: all.filter((n) => n.isTracked && latestByThread.get(threadKey(n)) === n && n.direction === "outbound" && isRecent(n)).length,
  };
  const unreadCount = tracked.filter((n) => boxOf(n) === "inbox" && isUnread(n)).length;

  const [mailBusy, setMailBusy] = useState(false);
  async function moveMail(to) {
    const n = selected;
    if (!n || mailBusy) return;
    const kind = n.isTracked ? "note" : "unmatched";
    const from = boxOf(n);
    const label = { trash: "Trash", archive: "Archive", spam: "Spam", inbox: "the Inbox" }[to];
    setMailBusy(true);
    const patch = (folder) => {
      const fix = (rows) => rows.map((x) => (x.id === n.id ? { ...x, mailbox_folder: folder, read_at: x.read_at || (folder === "inbox" ? x.read_at : new Date().toISOString()) } : x));
      if (n.isTracked) setTracked(fix);
      else setUntracked(fix);
    };
    try {
      const r = await moveEmailTo(kind, n.id, to);
      // Update the list on the spot and open the next email, like any mail app; refresh quietly behind.
      const idx = displayed.findIndex((x) => x.key === n.key);
      const next = displayed[idx + 1] || displayed[idx - 1] || null;
      patch(to);
      setSelectedKey(next && next.key !== n.key ? next.key : null);
      setFull(null);
      setNotice(`Moved to ${label}${r.inTitan === false ? ". It was not in Titan, so only the website copy moved." : " here and in Titan."}`);
      setUndoFn(() => async () => {
        await moveEmailTo(kind, n.id, from);
        patch(from);
      });
      load();
    } catch (e) {
      setError(friendlyError(e, "Couldn't move that email."));
    } finally {
      setMailBusy(false);
    }
  }
  async function toggleFlag() {
    const n = selected;
    if (!n || mailBusy) return;
    const kind = n.isTracked ? "note" : "unmatched";
    const on = !n.flagged;
    const set = (v) => {
      const fix = (rows) => rows.map((x) => (x.id === n.id ? { ...x, flagged: v } : x));
      if (n.isTracked) setTracked(fix);
      else setUntracked(fix);
    };
    set(on);
    try {
      await flagEmail(kind, n.id, on);
    } catch (e) {
      set(!on);
      setError(friendlyError(e, "Couldn't flag that email."));
    }
  }
  async function afterAction(message, undo) {
    setNotice(message);
    setUndoFn(undo ? () => undo : null);
    setSelectedKey(null);
    setFull(null);
    await load();
  }
  const [notice, setNotice] = useState("");
  const [undoFn, setUndoFn] = useState(null);
  const [moving, setMoving] = useState(false);

  // Show the list's copy straight away; the full email (with its formatting) replaces it a moment later.
  const readingNote = full && selected && full.id === selected.id ? full : selected || null;

  function renderRow(n, t, open, first) {
    const s = senderOf(n);
    const active = selected?.key === n.key;
    const multi = t.items.length > 1;
    const unread = boxOf(n) === "inbox" && isUnread(n);
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
            {n.flagged && (
              <span className="ep-flag-mark" title="Flagged">
                ⚑
              </span>
            )}
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
          <button type="button" className="panel-btn panel-btn-primary" onClick={startBlankEmail}>
            ✎ New email
          </button>
          <button type="button" className="panel-btn" onClick={load}>
            Refresh
          </button>
          <button type="button" className="panel-btn" onClick={runSync} disabled={!!syncState}>
            {syncState === "starting"
              ? "Starting…"
              : syncState === "running"
              ? `Syncing… ${Math.floor(syncSecs / 60)}:${String(syncSecs % 60).padStart(2, "0")}`
              : "⟳ Sync"}
          </button>
        </div>
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
      {notice && (
        <div className="ep-notice" role="status">
          {notice}
          {undoFn && (
            <button
              type="button"
              className="panel-btn panel-btn-quiet"
              onClick={async () => {
                const fn = undoFn;
                setUndoFn(null);
                try {
                  await fn();
                  await afterAction("Undone.");
                } catch (e) {
                  setNotice(friendlyError(e, "Couldn't undo that."));
                }
              }}
            >
              Undo
            </button>
          )}
          <button type="button" className="ep-notice-x" onClick={() => setNotice("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {failures.length > 0 && (
        <div className="ep-failures" role="alert">
          <div className="ep-failures-head">
            <strong>
              {failures.length} email{failures.length === 1 ? "" : "s"} could not be filed automatically.
            </strong>{" "}
            The Titan sync picks them up from the mailbox within 30 minutes (or press Sync). Check, then dismiss.
            <button type="button" className="panel-btn" onClick={() => setShowFailures((v) => !v)}>
              {showFailures ? "Hide" : "Details"}
            </button>
            <button
              type="button"
              className="panel-btn"
              onClick={async () => {
                try {
                  await resolveIntakeFailures(failures.map((f) => f.id));
                  setFailures([]);
                } catch (e) {
                  setError(friendlyError(e, "Couldn't dismiss those."));
                }
              }}
            >
              Dismiss all
            </button>
          </div>
          {showFailures && (
            <ul className="ep-failures-list">
              {failures.map((f) => (
                <li key={f.id}>
                  {new Date(f.created_at).toLocaleString()} · {f.email_from || "unknown sender"} · {f.subject || "(no subject)"} ·{" "}
                  <span>{f.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!loaded ? (
        <p className="family-detail-hint">Loading emails…</p>
      ) : all.length === 0 ? (
        <div className="mx-empty">
          <p>No emails yet.</p>
        </div>
      ) : (
        <div className="ep-layout" data-folder={tab} style={{ "--ep-folders": `${sizes.folders}px`, "--ep-list": `${sizes.list}px` }}>
          <nav className="ep-folders" aria-label="Mail folders">
            {FOLDERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-current={tab === f.key ? "true" : undefined}
                data-sep={f.sep ? "1" : undefined}
                className={"ep-folder" + (tab === f.key ? " is-active" : "") + (f.key === "untracked" && counts.untracked ? " is-alert" : "")}
                onClick={() => {
                  setTab(f.key);
                  setFocus("focused");
                  setMobileReading(false);
                }}
              >
                <FolderIcon k={f.key} />
                <span className="ep-folder-name">{f.label}</span>
                <span className="ep-folder-count">{counts[f.key]}</span>
              </button>
            ))}
            {unreadCount > 0 && (
              <div className="ep-unread-card">
                <strong>{unreadCount}</strong> unread
              </div>
            )}
            <ResizeHandle value={sizes.folders} onChange={(v) => setSize("folders", v)} min={150} max={360} label="Resize folders" />
          </nav>

          <div className={"mx-shell ep-shell" + (mobileReading ? " is-reading" : "")}>
            <div className="mx-list-col">
              <ResizeHandle value={sizes.list} onChange={(v) => setSize("list", v)} min={260} max={680} label="Resize email list" />
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
              {selected && !composingNew && !selected.isTracked && (
                <FileBar
                  key={selected.id}
                  email={selected}
                  siblings={threadUnfiled}
                  sameSender={untracked.filter(
                    (x) => boxOf(x) === "inbox" && addrOnly(x.email_from) && addrOnly(x.email_from) === addrOnly(selected.email_from)
                  )}
                  onDismissedAll={async (list) => {
                    for (let i = 0; i < list.length; i += 8) {
                      await Promise.all(list.slice(i, i + 8).map((x) => dismissUnmatchedEmail(x.id)));
                    }
                    await afterAction(`Dismissed ${list.length} emails from ${addrOnly(selected.email_from)}.`, async () => {
                      for (let i = 0; i < list.length; i += 8) {
                        await Promise.all(list.slice(i, i + 8).map((x) => reopenUnmatchedEmail(x.id)));
                      }
                    });
                  }}
                  families={families}
                  onFiled={(name, count) =>
                    afterAction(
                      `Filed ${count} email${count === 1 ? "" : "s"} under ${name}. Replies in this conversation will now file themselves.`
                    )
                  }
                  onDismissed={() =>
                    afterAction("Dismissed. It will not show here again.", () => reopenUnmatchedEmail(selected.id))
                  }
                />
              )}
              {selected && !composingNew && selected.isTracked && selected.family_id && (
                <div className="ep-bar">
                  <span>
                    On <strong>{selected.familyName || "this family"}</strong>&apos;s record
                  </span>
                  <Link className="panel-btn" to={`/staff/families/${selected.family_id}?tab=emails`}>
                    Open their record
                  </Link>
                  <button type="button" className="panel-btn" onClick={() => setMoving((v) => !v)}>
                    Move to another family
                  </button>
                  {moving && (
                    <MoveBar
                      key={selected.id}
                      families={families}
                      currentId={selected.family_id}
                      onCancel={() => setMoving(false)}
                      onMove={async (fam) => {
                        const from = selected.family_id;
                        const id = selected.id;
                        await moveEmailNote(id, fam.id);
                        setMoving(false);
                        await afterAction(`Moved to ${fam.name}.`, () => moveEmailNote(id, from));
                      }}
                    />
                  )}
                </div>
              )}
              {selected && !writing && (
                <div className="ep-mailbar">
                  {boxOf(selected) === "inbox" ? (
                    <>
                      <button type="button" className="panel-btn" onClick={() => moveMail("trash")} disabled={mailBusy}>
                        🗑 Delete
                      </button>
                      <button type="button" className="panel-btn" onClick={() => moveMail("archive")} disabled={mailBusy}>
                        Archive
                      </button>
                      <button type="button" className="panel-btn" onClick={() => moveMail("spam")} disabled={mailBusy}>
                        Report spam
                      </button>
                    </>
                  ) : (
                    <button type="button" className="panel-btn" onClick={() => moveMail("inbox")} disabled={mailBusy}>
                      Move back to Inbox
                    </button>
                  )}
                  <button type="button" className="panel-btn" onClick={toggleFlag} disabled={mailBusy}>
                    {selected.flagged ? "⚑ Remove flag" : "⚐ Flag"}
                  </button>
                  {mailBusy && <span className="ep-mailbar-busy">Moving in Titan…</span>}
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
                    childRows={writing.ctx.children}
                    dubaiFrom={writing.ctx.dubaiFrom}
                    dubaiUntil={writing.ctx.dubaiUntil}
                    initial={writing.initial}
                    families={writing.initial.mode === "new" ? families : null}
                    onPickFamily={writing.initial.mode === "new" ? pickFamilyForNew : null}
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
function MoveBar({ families, currentId, onMove, onCancel }) {
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const labelFor = (f) => `${f.name} · ${f.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const byLabel = useMemo(() => new Map(families.map((f) => [labelFor(f), f])), [families]);
  async function go() {
    const fam = byLabel.get(choice.trim());
    if (!fam || fam.id === currentId) {
      setErr("Pick a different family from the list.");
      return;
    }
    setBusy(true);
    try {
      await onMove(fam);
    } catch (e) {
      setErr(friendlyError(e, "Couldn't move that email."));
      setBusy(false);
    }
  }
  return (
    <div className="ep-bar-actions">
      <input
        className="panel-input ep-family-input"
        list="ep-move-list"
        placeholder="Type a family name…"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && go()}
        disabled={busy}
      />
      <datalist id="ep-move-list">
        {families.map((f) => (
          <option key={f.id} value={labelFor(f)} />
        ))}
      </datalist>
      <button type="button" className="panel-btn" onClick={go} disabled={busy || !choice.trim()}>
        {busy ? "Moving…" : "Move"}
      </button>
      <button type="button" className="panel-btn panel-btn-quiet" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      {err && <p className="mx-error">{err}</p>}
    </div>
  );
}

const addrOnly = (v) => (String(v || "").match(/<([^>]+)>/)?.[1] || String(v || "")).trim().toLowerCase();

function FileBar({ email, siblings, sameSender = [], families, onFiled, onDismissed, onDismissedAll }) {
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

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

  async function dismissAll() {
    setBusy(true);
    setErr("");
    try {
      await onDismissedAll(sameSender);
    } catch (e) {
      setErr(friendlyError(e, "Couldn't dismiss those."));
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
        {sameSender.length > 1 &&
          (confirmAll ? (
            <>
              <button type="button" className="panel-btn" onClick={dismissAll} disabled={busy}>
                {busy ? "Dismissing…" : `Yes, dismiss all ${sameSender.length}`}
              </button>
              <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setConfirmAll(false)} disabled={busy}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setConfirmAll(true)} disabled={busy}>
              {`Dismiss all ${sameSender.length} from ${addrOnly(email.email_from)}`}
            </button>
          ))}
      </div>
      {err && <p className="mx-error">{err}</p>}
    </div>
  );
}
