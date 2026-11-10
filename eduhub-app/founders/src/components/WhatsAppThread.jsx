import "./WhatsAppThread.css";

// The chat bubbles, shared by the WhatsApp tab and each family's WhatsApp tab.
// Times are shown in Dubai time.

const DUBAI = "Asia/Dubai";
export const TYPE_LABEL = { image: "Photo", document: "Document", audio: "Voice message", video: "Video", sticker: "Sticker", location: "Location", contacts: "Contact" };

export function dayKey(iso) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: DUBAI });
}
export function timeOf(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: DUBAI, hour: "2-digit", minute: "2-digit" });
}
export function dayLabel(iso) {
  const k = dayKey(iso);
  const now = new Date();
  if (k === dayKey(now.toISOString())) return "Today";
  if (k === dayKey(new Date(now.getTime() - 86400000).toISOString())) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: DUBAI, day: "numeric", month: "short", year: "numeric" });
}

function Ticks({ status }) {
  if (!status) return null;
  const two = status === "delivered" || status === "read";
  return (
    <span className={"wap-ticks" + (status === "read" ? " is-read" : "") + (status === "failed" ? " is-failed" : "")} aria-label={status}>
      {status === "failed" ? "!" : two ? "✓✓" : "✓"}
    </span>
  );
}

// senderOf(message) -> a name to show above an incoming message (used when a family has more than one number).
export default function WhatsAppThread({ messages, senderOf, endRef }) {
  let lastDay = "";
  return (
    <div className="wap-thread">
      {messages.map((m) => {
        const d = dayKey(m.sent_at);
        const sep = d !== lastDay;
        lastDay = d;
        const media = m.msg_type && m.msg_type !== "text";
        const who = m.direction === "in" && senderOf ? senderOf(m) : "";
        return (
          <div key={m.id}>
            {sep && (
              <div className="wap-day">
                <span>{dayLabel(m.sent_at)}</span>
              </div>
            )}
            <div className={"wap-msg " + (m.direction === "out" ? "is-out" : "is-in")}>
              {who && <div className="wap-who">{who}</div>}
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
      <div ref={endRef} />
    </div>
  );
}
