import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isNativeApp } from "../lib/native";
import "./AppTour.css";

// First-visit tour. Coach marks that spotlight one thing at a time: Next to
// continue, Skip to leave. Three versions of the same tour:
//   - iPhone app (native)   -> says "app", points at the top bar and tab bar
//   - website on a phone    -> says "site", same layout as the app
//   - website on a computer -> says "site", points at the left menu
// Shown once per device; Settings > "Replay the tour" starts it again.
const KEY = "hh-tour-done";

export const tourNoun = isNativeApp ? "app" : "website";

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;

function buildSteps(phone) {
  const noun = tourNoun;
  const welcome = {
    title: "Welcome",
    text: `A quick look at where everything is in the ${noun}. It takes less than a minute.`,
    target: null,
  };
  if (phone) {
    return [
      welcome,
      { title: "This is you", text: "Tap your photo to see your family, add photos and check how complete things are.", target: ".app-topbar-avatar" },
      { title: "Your alerts", text: "Tours, assessments and school updates land here, with every detail you need on the day.", target: ".app-bell" },
      { title: "Settings", text: "Appearance, your package, help and your account all live behind the gear.", target: ".app-gear" },
      { title: "Your next step", text: "This card always says whose document or detail is next. Tap Continue and you land in the right place.", target: ".dash-hero" },
      { title: "Your schools", text: "Where each school is, from shortlist to place. Tap a stage to see the schools in it.", target: ".sp-card" },
      { title: "Five tabs", text: "Home, Application, Schools, Documents and Billing. Everything you save is kept automatically.", target: ".app-shell-nav" },
    ];
  }
  return [
    welcome,
    { title: "Your menu", text: "Dashboard, Application, Your schools, Documents and Billing. Everything you save is kept automatically.", target: ".app-shell-nav-list", side: "right" },
    { title: "Your next step", text: "This card always says whose document or detail is next. Click Continue and you land in the right place.", target: ".dash-hero" },
    { title: "Your schools", text: "Where each school is, from shortlist to place. Click a stage to see the schools in it.", target: ".sp-card" },
    { title: "Notifications", text: "Tours, assessments and school updates land here, with every detail you need on the day.", target: 'a.app-shell-nav-link[href="/app/notifications"]', side: "right" },
    { title: "Settings", text: "Appearance, your package, help and your account.", target: 'a.app-shell-nav-link[href="/app/settings"]', side: "right" },
    { title: "Your profile", text: "Your family, photos and how complete your application is. Sign out is here too.", target: ".app-shell-me", side: "right" },
  ];
}

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

export default function AppTour() {
  const navigate = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [steps, setSteps] = useState(() => buildSteps(isPhone()));
  const [rect, setRect] = useState(null);

  // Start on first visit, or when replayed from Settings.
  useEffect(() => {
    const start = () => {
      setSteps(buildSteps(isPhone()));
      setStep(0);
      setRect(null);
      setActive(true);
      navigate("/app/dashboard");
    };
    window.addEventListener("hh-tour-start", start);
    let t;
    if (!tourDone() && location.pathname.startsWith("/app")) t = setTimeout(start, 900);
    return () => { clearTimeout(t); window.removeEventListener("hh-tour-start", start); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(() => {
    markDone();
    setActive(false);
    setRect(null);
  }, []);

  const current = steps[step];
  const measure = useCallback(() => {
    if (!active || !current) return;
    if (!current.target) { setRect(null); return; }
    const el = document.querySelector(current.target);
    const r0 = el ? el.getBoundingClientRect() : null;
    // Not on screen (hidden, or a family with no schools yet): skip the step.
    if (!el || !r0 || r0.width === 0 || r0.height === 0) { setRect("missing"); return; }
    el.scrollIntoView({ block: "center", behavior: "auto" });
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [active, current]);

  useLayoutEffect(() => {
    measure();
    // The dashboard may still be loading when the tour starts: look again shortly.
    const t = setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [measure, location.pathname]);

  // Give a late-loading target a moment to appear before skipping its step.
  useEffect(() => {
    if (rect !== "missing") return undefined;
    const t = setTimeout(() => {
      const el = current?.target ? document.querySelector(current.target) : null;
      const r = el ? el.getBoundingClientRect() : null;
      if (r && r.width > 0 && r.height > 0) measure();
      else if (step >= steps.length - 1) finish();
      else setStep((n) => n + 1);
    }, 1200);
    return () => clearTimeout(t);
  }, [rect, step, steps.length, finish, current, measure]);

  if (!active || !current || rect === "missing") return null;

  const last = step === steps.length - 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(340, vw - 32);
  let cardStyle;
  if (!rect) {
    cardStyle = { top: "50%", left: "50%", width: cardW, transform: "translate(-50%, -50%)" };
  } else if (current.side === "right" && vw > 820) {
    // Left-menu steps: the card sits to the right of the menu item.
    const top = Math.max(16, Math.min(vh - 220, rect.top + rect.height / 2 - 80));
    cardStyle = { top, left: rect.left + rect.width + 20, width: cardW };
  } else {
    const below = rect.top + rect.height + 200 < vh;
    const left = Math.max(16, Math.min(vw - cardW - 16, rect.left + rect.width / 2 - cardW / 2));
    cardStyle = below
      ? { top: rect.top + rect.height + 14, left, width: cardW }
      : { bottom: vh - rect.top + 14, left, width: cardW };
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={`${tourNoun} tour`}>
      {rect ? (
        <div
          className="tour-spot"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" style={cardStyle}>
        <div className="tour-count">{step + 1} of {steps.length}</div>
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
