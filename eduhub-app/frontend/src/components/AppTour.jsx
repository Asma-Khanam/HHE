import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./AppTour.css";

// First-launch tour (app design, board 4). Coach marks that spotlight one thing
// at a time: Next to continue, Skip to leave. Phone width only. Shown once per
// device; Settings > "Replay the app tour" starts it again.
const KEY = "hh-tour-done";

const STEPS = [
  { title: "Welcome", text: "A quick look at where everything is. It takes less than a minute.", target: null },
  { title: "This is you", text: "Tap your photo to see your family, add photos and check how complete things are.", target: ".app-topbar-avatar" },
  { title: "Your alerts", text: "Tours, assessments and school updates land here, with every detail you need on the day.", target: ".app-bell" },
  { title: "Settings", text: "Appearance, your package, help and your account all live behind the gear.", target: ".app-gear" },
  { title: "Your next step", text: "This card always says whose document or detail is next. Tap Continue and you land in the right place.", target: ".dash-hero", home: true },
  { title: "Your schools", text: "Where each school is, from shortlist to place. Tap a stage to see the schools in it.", target: ".sp-card", home: true },
  { title: "Five tabs", text: "Home, Application, Schools, Documents and Billing. Everything you save is kept automatically.", target: ".app-shell-nav" },
];

export function tourDone() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
function markDone() {
  try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
}
export function replayTour() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event("hh-tour-start"));
}

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;

export default function AppTour() {
  const navigate = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  // Start on first launch, or when replayed from Settings.
  useEffect(() => {
    const start = () => {
      if (!isPhone()) return;
      setStep(0);
      setActive(true);
      navigate("/app/dashboard");
    };
    if (!tourDone() && location.pathname.startsWith("/app")) {
      const t = setTimeout(start, 900);
      window.addEventListener("hh-tour-start", start);
      return () => { clearTimeout(t); window.removeEventListener("hh-tour-start", start); };
    }
    window.addEventListener("hh-tour-start", start);
    return () => window.removeEventListener("hh-tour-start", start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(() => {
    markDone();
    setActive(false);
    setRect(null);
  }, []);

  const current = STEPS[step];
  const measure = useCallback(() => {
    if (!active || !current) return;
    if (!current.target) { setRect(null); return; }
    const el = document.querySelector(current.target);
    if (!el) { setRect("missing"); return; }
    el.scrollIntoView({ block: "center", behavior: "auto" });
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [active, current]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // A step whose target isn't on screen (e.g. a family with no schools yet) is skipped.
  useEffect(() => {
    if (rect === "missing") {
      if (step >= STEPS.length - 1) finish();
      else setStep((n) => n + 1);
    }
  }, [rect, step, finish]);

  if (!active || !current || rect === "missing") return null;

  const last = step === STEPS.length - 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(340, vw - 32);
  let cardStyle;
  if (!rect) {
    cardStyle = { top: "50%", left: "50%", width: cardW, transform: "translate(-50%, -50%)" };
  } else {
    const below = rect.top + rect.height + 200 < vh;
    const left = Math.max(16, Math.min(vw - cardW - 16, rect.left + rect.width / 2 - cardW / 2));
    cardStyle = below
      ? { top: rect.top + rect.height + 14, left, width: cardW }
      : { bottom: vh - rect.top + 14, left, width: cardW };
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="App tour">
      {rect ? (
        <div
          className="tour-spot"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" style={cardStyle}>
        <div className="tour-count">{step + 1} of {STEPS.length}</div>
        <h2>{current.title}</h2>
        <p>{current.text}</p>
        <div className="tour-actions">
          {!last ? (
            <button type="button" className="tour-skip" onClick={finish}>Skip</button>
          ) : <span />}
          <button type="button" className="tour-next" onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
