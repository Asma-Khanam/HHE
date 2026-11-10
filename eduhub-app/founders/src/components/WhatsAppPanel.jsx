import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { friendlyError } from "../lib/staffData";
import { listWhatsAppForFamily, markFamilyWhatsAppRead, prettyPhone } from "../lib/whatsapp";
import WhatsAppThread from "./WhatsAppThread";
import "./WhatsAppPanel.css";

// A family's WhatsApp tab: every chat filed to this family (mother and father
// can each have a number), laid out like WhatsApp. Chats are filed by phone
// number from the main WhatsApp tab, or automatically when a parent's number
// on Family details matches.

export default function WhatsAppPanel({ familyId }) {
  const [msgs, setMsgs] = useState(null);
  const [error, setError] = useState("");
  const end = useRef(null);

  const load = useCallback(async () => {
    try {
      setMsgs(await listWhatsAppForFamily(familyId));
      setError("");
    } catch (e) {
      setError(friendlyError(e, "Couldn't load the WhatsApp chat."));
    }
  }, [familyId]);

  useEffect(() => {
    load();
    markFamilyWhatsAppRead(familyId)
      .then(() => window.dispatchEvent(new Event("whatsapp-read")))
      .catch(() => {});
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [familyId, load]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs?.length]);

  const numbers = [...new Set((msgs || []).map((m) => m.contact_phone))];
  const nameFor = (phone) => (msgs || []).findLast((m) => m.contact_phone === phone && m.contact_name)?.contact_name;

  return (
    <section className="panel wapl">
      <div className="panel-head">
        <h2>
          WhatsApp
          {numbers.length > 0 && <span className="panel-count">{msgs.length}</span>}
        </h2>
        <Link className="panel-btn" to="/staff/whatsapp">
          Open WhatsApp tab
        </Link>
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {msgs === null ? (
        <p className="panel-hint">Loading…</p>
      ) : msgs.length === 0 ? (
        <p className="panel-hint">
          No WhatsApp chats are filed to this family yet. A chat files itself when the sender&rsquo;s number matches a parent&rsquo;s phone number on Family
          details; otherwise file it from the WhatsApp tab.
        </p>
      ) : (
        <>
          <p className="panel-hint wapl-nums">
            Chats with {numbers.map((n) => [nameFor(n), prettyPhone(n)].filter(Boolean).join(" ")).join(" · ")}. Read-only: reply from the WhatsApp Business app and
            it appears here.
          </p>
          <div className="wapl-box">
            <WhatsAppThread messages={msgs} endRef={end} senderOf={numbers.length > 1 ? (m) => nameFor(m.contact_phone) || prettyPhone(m.contact_phone) : null} />
          </div>
        </>
      )}
    </section>
  );
}
