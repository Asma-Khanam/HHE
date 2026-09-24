import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useApplicationData } from "../context/ApplicationDataContext";
import { IconCheckCircle } from "./icons";
import "./IntroductionsCard.css";

// "Do you need help with...?" (founder request, Sept 2026, addendum 76).
// A small card on the Dashboard; the button pops out a box listing what our
// trusted partners help with. Ticking and sending emails an introduction to
// that partner (see /api/request-introduction). Each one can only be sent
// once, and stays ticked afterwards.
const INTRO_SERVICES = [
  { key: "home", label: "Finding a home" },
  { key: "visa", label: "Visa / Golden Visa" },
  { key: "company_setup", label: "Company set up" },
  { key: "pet", label: "Moving a pet" },
  { key: "insurance", label: "Health & property insurance" },
  { key: "uk_tax", label: "UK expat tax advice" },
  { key: "car_hire", label: "Car hire" },
];

function shortDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function IntroductionsCard() {
  const { familyId } = useApplicationData();
  const [requests, setRequests] = useState([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!familyId) return;
    supabase
      .from("family_service_requests")
      .select("service_key, requested_at, email_status")
      .eq("family_id", familyId)
      .then(({ data }) => setRequests(data || []));
  }, [familyId]);

  const requested = Object.fromEntries(requests.map((r) => [r.service_key, r]));

  function toggle(key) {
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  }

  async function send() {
    setBusy(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/request-introduction", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ services: picked }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't send that — please try again.");
      setRequests((list) => [
        ...list.filter((r) => !picked.includes(r.service_key)),
        ...(body.requests || []).map((r) => ({ service_key: r.service_key, requested_at: r.requested_at, email_status: r.email_status })),
      ]);
      setPicked([]);
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setDone(false);
    setError("");
    setPicked([]);
  }

  const count = requests.length;

  return (
    <>
      <section className="dash-card intro-card">
        <div className="intro-card-body">
          <div>
            <h2>Need a hand with the rest of the move?</h2>
            <p>
              We can also introduce you to trusted people for finding a home, visas, pets, insurance and more.
              {count > 0 && <span className="intro-card-count"> · {count} introduction{count === 1 ? "" : "s"} requested</span>}
            </p>
          </div>
          <button type="button" className="intro-card-btn" onClick={() => setOpen(true)}>
            See who we can introduce
          </button>
        </div>
      </section>

      {open && (
        <div className="intro-overlay" onClick={close} role="presentation">
          <div className="intro-pop" role="dialog" aria-modal="true" aria-label="Trusted introductions" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="intro-close" onClick={close} aria-label="Close">
              ×
            </button>
            {done ? (
              <div className="intro-done">
                <IconCheckCircle size={34} />
                <h3>Introductions on their way</h3>
                <p>We've introduced you by email — they'll be in touch with you directly. You can see what you've asked for any time here.</p>
                <button type="button" className="intro-card-btn" onClick={close}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <h3>Do you need help with…</h3>
                <p className="intro-pop-sub">
                  Tick anything you'd like help with and we'll introduce you to someone we trust. We'll pass on your name and contact
                  details so they can get in touch.
                </p>
                <ul className="intro-list">
                  {INTRO_SERVICES.map((s) => {
                    const r = requested[s.key];
                    const checked = !!r || picked.includes(s.key);
                    return (
                      <li key={s.key}>
                        <label className={"intro-option" + (checked ? " is-on" : "") + (r ? " is-sent" : "")}>
                          <input type="checkbox" checked={checked} disabled={!!r} onChange={() => toggle(s.key)} />
                          <span className="intro-option-label">{s.label}</span>
                          {r && <span className="intro-option-sent">Requested {shortDate(r.requested_at)}</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {error && <p className="intro-error">{error}</p>}
                <button type="button" className="intro-card-btn intro-send" disabled={!picked.length || busy} onClick={send}>
                  {busy ? "Sending…" : picked.length ? `Introduce me (${picked.length})` : "Tick what you need"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
