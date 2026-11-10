import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { friendlyError, listFamilyChoices } from "../lib/staffData";
import {
  fileWhatsAppNumber,
  listWhatsAppConversations,
  listWhatsAppMessages,
  markWhatsAppRead,
  prettyPhone,
} from "../lib/whatsapp";
import "./WhatsAppPage.css";

// The WhatsApp tab: the team's WhatsApp Business conversations with families,
// laid out like WhatsApp (conversation list on the left, the chat on the
// right) and kept up to date by the server, the way the Emails tab is.

const DUBAI = "Asia/Dubai";
const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "reply", label: "Needs reply" },
  { key: "unfiled", label: "Not filed" },
];

const TYPE_LABEL = { image: "Photo", document: "Document", audio: "Voice message", video: "Video", sticker: "Sticker", location: "Location", contacts: "Contact" };

function dayKey(iso) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: DUBAI });
}
function timeOf(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: DUBAI, hour: "2-digit", minute: "2-digit" });
}
function dayLabel(iso) {
  const k = dayKey(iso);
  const now = new Date();
  if (k === dayKey(now.toISOString())) return "Today";
  if (k === dayKey(new Date(now.getTime() - 86400000).toISOString())) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: DUBAI, day: "numeric", month: "short", year: "numeric" });
}
function listTime(iso) {
  const k = dayKey(iso);
  const now = new Date();
  if (k === dayKey(now.toISOString())) return timeOf(iso);
  if (k === dayKey(new Date(now.getTime() - 86400000).toISOString())) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: DUBAI, day: "2-digit", month: "2-digit", year: "numeric" });
}
function previewOf(c) {
  const t = c.last_type && c.last_type !== "text" ? TYPE_LABEL[c.last_type] || "Attachment" : "";
  const text = [t, c.last_body].filter(Boolean).join(": ");
  return (c.last_direction === "out" ? "You: " : "") + (text || "Message");
}
function Ticks({ status }) {
  if (!status) return null;
  const two = status === "delivered" || status === "read";
  return (
    <span className={"wa-ticks" + (status === "read" ? " is-read" : "") + (status === "failed" ? " is-failed" : "")} aria-label={status}>
      {status === "failed" ? "!" : two ? "✓✓" : "✓"}
    </span>
  );
}

export default function WhatsAppPage() {
  const [convs, setConvs] = useState([]);
  const [families, setFamilies] = useState([]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [phone, setPhone] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pick, setPick] = useState("");
  const [filing, setFiling] = useState(false);
  const bottom = useRef(null);

  const famName = useMemo(() => Object.fromEntries(families.map((f) => [f.id, f.name])), [families]);

  const loadConvs = useCallback(async () => {
    try {
      setConvs(await listWhatsAppConversations());
      setError("");
    } catch (e) {
      setError(friendlyError(e, "Couldn't load WhatsApp."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConvs();
    listFamilyChoices().then(setFamilies).catch(() => {});
    const t = setInterval(loadConvs, 20000);
    return () => clearInterval(t);
  }, [loadConvs]);

  const loadMsgs = useCallback(async (p) => {
    try {
      setMsgs(await listWhatsAppMessages(p));
    } catch (e) {
      setError(friendlyError(e, "Couldn't open that chat."));
    }
  }, []);

  useEffect(() => {
    if (!phone) return undefined;
    setMsgs([]);
    loadMsgs(phone);
    markWhatsAppRead(phone)
      .then(() => {
        window.dispatchEvent(new Event("whatsapp-read"));
        loadConvs();
      })
      .catch(() => {});
    const t = setInterval(() => loadMsgs(phone), 20000);
    return () => clearInterval(t);
  }, [phone, loadMsgs, loadConvs]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [msgs.length, phone]);

  const nameOf = (c) => (c.family_id && famName[c.family_id]) || c.contact_name || prettyPhone(c.contact_phone);

  const shown = convs.filter((c) => {
    if (filter === "unread" && !(c.unread > 0)) return false;
    if (filter === "reply" && c.last_direction !== "in") return false;
    if (filter === "unfiled" && c.family_id) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [nameOf(c), c.contact_phone, c.last_body].filter(Boolean).join(" ").toLowerCase().includes(s);
  });

  const counts = {
    unread: convs.filter((c) => c.unread > 0).length,
    reply: convs.filter((c) => c.last_direction === "in").length,
    unfiled: convs.filter((c) => !c.family_id).length,
  };

  const current = convs.find((c) => c.contact_phone === phone);

  async function file() {
    if (!pick || !phone) return;
    setFiling(true);
    try {
      await fileWhatsAppNumber(phone, pick);
      setPick("");
      await loadConvs();
    } catch (e) {
      setError(friendlyError(e, "Couldn't file that chat."));
    } finally {
      setFiling(false);
    }
  }

  let lastDay = "";

  return (
    <div className="wap">
      <div className="wap-head">
        <h1>WhatsApp</h1>
        <p className="wap-sub">The team&rsquo;s WhatsApp Business chats with families, filed to each family by phone number.</p>
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <div className="wap-shell">
        <aside className="wap-list">
          <div className="wap-search">
            <input className="panel-input" placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="wap-filters">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={"wap-chip" + (filter === f.key ? " is-on" : "")} onClick={() => setFilter(f.key)}>
                {f.label}
                {f.key !== "all" && counts[f.key] > 0 && <span className="wap-chip-n">{counts[f.key]}</span>}
              </button>
            ))}
          </div>
          <div className="wap-rows">
            {loading ? (
              <p className="wap-empty">Loading…</p>
            ) : convs.length === 0 ? (
              <p className="wap-empty">No WhatsApp chats yet. Once the business number is connected, conversations appear here by themselves.</p>
            ) : shown.length === 0 ? (
              <p className="wap-empty">No chats match.</p>
            ) : (
              shown.map((c) => (
                <button
                  key={c.contact_phone}
                  type="button"
                  className={"wap-row" + (phone === c.contact_phone ? " is-open" : "")}
                  onClick={() => setPhone(c.contact_phone)}
                >
                  <span className="wap-avatar">{nameOf(c).replace(/^\+/, "#").charAt(0).toUpperCase()}</span>
                  <span className="wap-row-main">
                    <span className="wap-row-top">
                      <span className="wap-row-name">{nameOf(c)}</span>
                      <span className={"wap-row-time" + (c.unread > 0 ? " is-unread" : "")}>{listTime(c.last_at)}</span>
                    </span>
                    <span className="wap-row-bottom">
                      <span className="wap-row-preview">{previewOf(c)}</span>
                      {!c.family_id && <span className="wap-tag">Not filed</span>}
                      {c.unread > 0 && <span className="wap-badge">{c.unread}</span>}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="wap-chat">
          {!current ? (
            <div className="wap-blank">
              <strong>Pick a chat</strong>
              <span>Messages are read-only here. Reply from the WhatsApp Business app on the business phone and your reply appears in this chat.</span>
            </div>
          ) : (
            <>
              <header className="wap-chat-head">
                <span className="wap-avatar">{nameOf(current).replace(/^\+/, "#").charAt(0).toUpperCase()}</span>
                <span className="wap-chat-who">
                  <strong>{nameOf(current)}</strong>
                  <span>{prettyPhone(current.contact_phone)}</span>
                </span>
                {current.family_id ? (
                  <Link className="panel-btn" to={`/staff/families/${current.family_id}`}>
                    Open family
                  </Link>
                ) : (
                  <span className="wap-file">
                    <select className="panel-select" value={pick} onChange={(e) => setPick(e.target.value)}>
                      <option value="">File to a family…</option>
                      {families.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="panel-btn panel-btn-primary" onClick={file} disabled={!pick || filing}>
                      {filing ? "Filing…" : "File"}
                    </button>
                  </span>
                )}
              </header>

              <div className="wap-thread">
                {msgs.map((m) => {
                  const d = dayKey(m.sent_at);
                  const sep = d !== lastDay;
                  lastDay = d;
                  const media = m.msg_type && m.msg_type !== "text";
                  return (
                    <div key={m.id}>
                      {sep && (
                        <div className="wap-day">
                          <span>{dayLabel(m.sent_at)}</span>
                        </div>
                      )}
                      <div className={"wap-msg " + (m.direction === "out" ? "is-out" : "is-in")}>
                        {media && (
                          <div className="wap-media">
                            {TYPE_LABEL[m.msg_type] || "Attachment"}
                            {m.media_name ? `: ${m.media_name}` : ""}
                          </div>
                        )}
                        {m.body && <div className="wap-text">{m.body}</div>}
                        <div className="wap-meta">
                          {timeOf(m.sent_at)}
                          {m.direction === "out" && <Ticks status={m.status} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottom} />
              </div>

              <footer className="wap-foot">To reply, use the WhatsApp Business app. Your reply shows up here automatically.</footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
