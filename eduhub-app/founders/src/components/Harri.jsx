import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { familyDisplayName } from "../lib/staffData";
import { runHarriTool, TOOL_LABELS } from "../lib/harriTools";
import HarriRobot from "./HarriRobot";
import "./Harri.css";

// Harri -- the consultant site's robot sidekick (Claude behind the scenes).
// Lives in the bottom-right corner of every /staff page. Ask it about the
// caseload in plain English; it looks things up with read-only tools that
// run in this browser (see lib/harriTools.js) and can draft emails. It can
// read its answers out loud (browser speech, free) and listen via the mic in
// Chrome/Edge/Safari.

const MAX_TOOL_ROUNDS = 6;

const readPref = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
};
const writePref = (k, v) => {
  try {
    localStorage.setItem(k, v ? "1" : "0");
  } catch {
    /* private mode -- fine */
  }
};

// ---------------------------------------------------------- tiny markdown

function renderInline(text, onFamily, keyBase) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1]) out.push(<strong key={k}>{m[1]}</strong>);
    else if (m[4]) out.push(<code key={k}>{m[4]}</code>);
    else {
      const label = m[2];
      const href = m[3];
      if (href.startsWith("family:")) {
        const id = href.slice(7);
        out.push(
          <button key={k} type="button" className="harri-family-link" onClick={() => onFamily(id)}>
            {label}
          </button>
        );
      } else if (href.startsWith("/staff/")) {
        out.push(
          <button key={k} type="button" className="harri-family-link" onClick={() => onFamily(null, href)}>
            {label}
          </button>
        );
      } else if (/^https?:\/\//.test(href)) {
        out.push(
          <a key={k} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        );
      } else out.push(label);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Markdown({ text, onFamily }) {
  const lines = String(text || "").split("\n");
  const blocks = [];
  let list = null;
  const flush = () => {
    if (list) blocks.push(list);
    list = null;
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const ordered = /^\s*\d/.test(line);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { type: "list", ordered, items: [] };
      }
      list.items.push(bullet[1]);
      return;
    }
    flush();
    if (!line.trim()) return;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push({ type: heading ? "h" : "p", text: heading ? heading[1] : line, idx });
  });
  flush();
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "list") {
          const Tag = b.ordered ? "ol" : "ul";
          return (
            <Tag key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it, onFamily, `${i}-${j}`)}</li>
              ))}
            </Tag>
          );
        }
        if (b.type === "h") return <p key={i} className="harri-h">{renderInline(b.text, onFamily, `h${i}`)}</p>;
        return <p key={i}>{renderInline(b.text, onFamily, `p${i}`)}</p>;
      })}
    </>
  );
}

// ------------------------------------------------------------------ voice

function speakable(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*`#>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const prefs = ["Google UK English Male", "Daniel", "Arthur", "Google UK English Female", "Serena"];
  for (const name of prefs) {
    const v = voices.find((x) => x.name === name);
    if (v) return v;
  }
  return voices.find((v) => v.lang === "en-GB") || voices.find((v) => v.lang?.startsWith("en")) || null;
}

const SpeechRec = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

// ------------------------------------------------------------------ icons

const Icon = {
  send: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M3.4 20.4l17.5-7.5a1 1 0 000-1.8L3.4 3.6a.9.9 0 00-1.2 1.1L4.5 11 13 12l-8.5 1-2.3 6.3a.9.9 0 001.2 1.1z" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" strokeLinecap="round" />
    </svg>
  ),
  soundOn: (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
      <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" strokeLinecap="round" />
    </svg>
  ),
  soundOff: (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
      <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  ),
  reset: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

// ------------------------------------------------------------------- main

export default function Harri({ staffName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [greet, setGreet] = useState(() => {
    try {
      return !sessionStorage.getItem("harri-greeted");
    } catch {
      return true;
    }
  });
  const [chat, setChat] = useState([]); // what's shown
  const history = useRef([]); // what Claude sees (incl. tool calls)
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [voiceOn, setVoiceOn] = useState(() => readPref("harri-voice", true));
  const [talking, setTalking] = useState(false);
  const [happy, setHappy] = useState(false);
  const [listening, setListening] = useState(false);
  const [familyName, setFamilyName] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const recRef = useRef(null);

  const familyId = (location.pathname.match(/\/staff\/families\/([0-9a-f-]{36})/i) || [])[1] || null;

  useEffect(() => {
    let cancelled = false;
    if (!familyId) {
      setFamilyName("");
      return undefined;
    }
    Promise.all([
      supabase.from("families").select("*").eq("id", familyId).maybeSingle(),
      supabase.from("parents").select("family_id, relationship, full_name").eq("family_id", familyId),
    ]).then(([{ data: fam }, { data: parents }]) => {
      if (!cancelled && fam) setFamilyName(familyDisplayName(fam, parents || []));
    });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, status]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function dismissGreeting() {
    setGreet(false);
    try {
      sessionStorage.setItem("harri-greeted", "1");
    } catch {
      /* fine */
    }
  }

  function speak(text) {
    if (!voiceOn || !window.speechSynthesis) {
      setTalking(true);
      setTimeout(() => setTalking(false), 1400);
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(speakable(text));
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || "en-GB";
    u.pitch = 1.25;
    u.rate = 1.05;
    u.onstart = () => setTalking(true);
    u.onend = () => setTalking(false);
    u.onerror = () => setTalking(false);
    window.speechSynthesis.speak(u);
  }

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    writePref("harri-voice", next);
    if (!next) {
      window.speechSynthesis?.cancel();
      setTalking(false);
    }
  }

  function goTo(id, path) {
    navigate(path || `/staff/families/${id}`);
    if (window.innerWidth < 700) setOpen(false);
  }

  async function callHarri() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch("/api/harri", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
      body: JSON.stringify({
        messages: history.current,
        context: { path: location.pathname, familyId, familyName, staffName },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Harri couldn't answer that.");
    return body;
  }

  async function send(textArg) {
    const text = (textArg ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setHappy(false);
    window.speechSynthesis?.cancel();
    setChat((c) => [...c, { role: "user", text }]);
    const before = history.current.length;
    history.current = [...history.current, { role: "user", content: text }];
    const used = new Set();

    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        setStatus(round === 0 ? "Thinking" : "Putting it together");
        const reply = await callHarri();
        const content = reply.content || [];
        history.current = [...history.current, { role: "assistant", content }];

        const toolCalls = content.filter((b) => b.type === "tool_use");
        if (reply.stop_reason === "tool_use" && toolCalls.length && round < MAX_TOOL_ROUNDS) {
          toolCalls.forEach((t) => used.add(TOOL_LABELS[t.name] || t.name));
          setStatus(TOOL_LABELS[toolCalls[0].name] || "Looking that up");
          const results = await Promise.all(
            toolCalls.map(async (t) => ({
              type: "tool_result",
              tool_use_id: t.id,
              content: JSON.stringify(await runHarriTool(t.name, t.input)),
            }))
          );
          history.current = [...history.current, { role: "user", content: results }];
          continue;
        }

        const answer = content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        const final = answer || "Hmm, my circuits came up empty on that one. Could you ask it another way?";
        setChat((c) => [...c, { role: "harri", text: final, sources: [...used] }]);
        setHappy(true);
        setTimeout(() => setHappy(false), 2500);
        speak(final);
        break;
      }
    } catch (e) {
      // Roll back this turn so a retry starts clean.
      history.current = history.current.slice(0, before);
      setChat((c) => [...c, { role: "harri", error: true, text: e.message || "Something went wrong.", retry: text }]);
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  function toggleMic() {
    if (!SpeechRec) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    window.speechSynthesis?.cancel();
    const rec = new SpeechRec();
    rec.lang = "en-GB";
    rec.interimResults = true;
    rec.onresult = (e) => {
      const t = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setInput(t);
      if (e.results[e.results.length - 1].isFinal) {
        rec.stop();
        send(t);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  function reset() {
    window.speechSynthesis?.cancel();
    history.current = [];
    setChat([]);
    setInput("");
  }

  const suggestions = familyId
    ? ["Brief me on this family", "What's outstanding for this family?", "Draft a friendly update email to this family"]
    : ["What's on my plate today?", "Who needs chasing this week?", "Any new school emails?", "Which families arrive next month?"];

  const mood = busy ? "thinking" : talking ? "talking" : happy ? "happy" : "idle";
  const firstName = (staffName || "").split(" ")[0];

  return (
    <>
      {!open && greet && (
        <div className="harri-greet" role="status">
          <button type="button" className="harri-greet-x" onClick={dismissGreeting} aria-label="Dismiss">
            {Icon.close}
          </button>
          <strong>Beep boop! I&apos;m Harri.</strong> Ask me anything about your families, tasks or school emails.
        </div>
      )}

      {!open && (
        <button
          type="button"
          className="harri-launcher"
          onClick={() => {
            setOpen(true);
            dismissGreeting();
          }}
          aria-label="Open Harri, your robot helper"
        >
          <HarriRobot mood={mood} size={64} waving />
        </button>
      )}

      {open && (
        <section className="harri-panel" aria-label="Harri chat">
          <header className="harri-head">
            <div className="harri-head-bot">
              <HarriRobot mood={mood} size={46} />
            </div>
            <div className="harri-head-text">
              <div className="harri-name">Harri</div>
              <div className="harri-sub">{busy ? `${status}…` : talking ? "Talking…" : "Your HHE robot sidekick"}</div>
            </div>
            <div className="harri-head-actions">
              {chat.length > 0 && (
                <button type="button" onClick={reset} title="New chat" aria-label="New chat">
                  {Icon.reset}
                </button>
              )}
              {"speechSynthesis" in window && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  title={voiceOn ? "Mute Harri" : "Let Harri speak"}
                  aria-label={voiceOn ? "Mute Harri" : "Let Harri speak"}
                >
                  {voiceOn ? Icon.soundOn : Icon.soundOff}
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} title="Close" aria-label="Close Harri">
                {Icon.close}
              </button>
            </div>
          </header>

          <div className="harri-body" ref={scrollRef}>
            <div className="harri-msg is-harri">
              <div className="harri-bubble">
                <p>
                  <strong>Beep boop{firstName ? `, ${firstName}` : ""}!</strong> I&apos;m Harri. I can look up
                  families, tasks, the calendar and school emails, and draft emails for you.
                  {familyName ? (
                    <>
                      {" "}
                      I can see you&apos;re on <strong>{familyName}</strong>.
                    </>
                  ) : null}
                </p>
                <p className="harri-small">I can only read things, never change them.</p>
              </div>
            </div>

            {chat.map((m, i) => (
              <div key={i} className={`harri-msg is-${m.role}${m.error ? " is-error" : ""}`}>
                <div className="harri-bubble">
                  {m.role === "user" ? <p>{m.text}</p> : <Markdown text={m.text} onFamily={goTo} />}
                  {m.error && m.retry && (
                    <button type="button" className="harri-retry" onClick={() => send(m.retry)} disabled={busy}>
                      Try again
                    </button>
                  )}
                </div>
                {m.sources?.length > 0 && <div className="harri-sources">{m.sources.join(" · ")}</div>}
                {m.role === "harri" && !m.error && (
                  <button
                    type="button"
                    className="harri-copy"
                    onClick={() => navigator.clipboard?.writeText(m.text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"))}
                  >
                    Copy
                  </button>
                )}
              </div>
            ))}

            {busy && (
              <div className="harri-msg is-harri">
                <div className="harri-bubble harri-typing">
                  <span />
                  <span />
                  <span />
                  <em>{status}…</em>
                </div>
              </div>
            )}

            {chat.length === 0 && !busy && (
              <div className="harri-suggest">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            className="harri-input"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              placeholder={listening ? "Listening…" : "Ask Harri…"}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {SpeechRec && (
              <button
                type="button"
                className={"harri-mic" + (listening ? " is-on" : "")}
                onClick={toggleMic}
                aria-label={listening ? "Stop listening" : "Speak to Harri"}
                title={listening ? "Stop listening" : "Speak to Harri"}
              >
                {Icon.mic}
              </button>
            )}
            <button type="submit" className="harri-send" disabled={busy || !input.trim()} aria-label="Send">
              {Icon.send}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
