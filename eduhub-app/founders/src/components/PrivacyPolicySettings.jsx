import { useEffect, useRef, useState } from "react";
import PolicyText from "./PolicyText";
import { getSitePage, saveSitePage, friendlyError } from "../lib/staffData";
import "./panels.css";

// The wording of the public Privacy policy (addendum 93). Saves itself a moment after you
// stop typing. The Client website shows it at /privacy, with no login, so the same link can
// go on the App Store and Google Play listings. The right-hand side shows it as the public
// will see it, updating as you type.
export default function PrivacyPolicySettings() {
  const [page, setPage] = useState(undefined); // undefined = loading, null = table missing
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [state, setState] = useState("idle"); // idle | saving | saved | error
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const timer = useRef(null);
  const latest = useRef({ title: "", body: "" });

  useEffect(() => {
    getSitePage("privacy").then((p) => {
      setPage(p);
      if (p) {
        setTitle(p.title || "Privacy policy");
        setBody(p.body || "");
        latest.current = { title: p.title || "Privacy policy", body: p.body || "" };
        setSavedAt(p.updated_at || null);
      }
    });
    return () => clearTimeout(timer.current);
  }, []);

  async function flush() {
    setState("saving");
    setError("");
    try {
      const saved = await saveSitePage("privacy", {
        title: latest.current.title || "Privacy policy",
        body: latest.current.body || "",
      });
      setSavedAt(saved?.updated_at || new Date().toISOString());
      setState("saved");
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that. Only a team admin can edit the privacy policy."));
      setState("error");
    }
  }

  function change(next) {
    latest.current = { ...latest.current, ...next };
    if ("title" in next) setTitle(next.title);
    if ("body" in next) setBody(next.body);
    setState("typing");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 900);
  }

  const status =
    state === "typing" ? "Unsaved changes…" : state === "saving" ? "Saving…" : state === "error" ? "Not saved" : state === "saved" ? "Saved" : "";

  return (
    <section className="set-card">
      <div className="set-card-head">
        <div>
          <h2>Privacy policy</h2>
          <p className="set-hint">
            The public page the App Store and Google Play ask for. It saves as you type and the Client website updates
            straight away. Have it checked before the apps go live, and fill in anything specific to the company.
          </p>
        </div>
        {page && (
          <span className={"set-status is-" + state}>
            {status}
            {savedAt && state !== "typing" && state !== "saving" && (
              <small> · last saved {new Date(savedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
            )}
          </span>
        )}
      </div>

      {page === undefined && <p className="set-hint">Loading…</p>}
      {page === null && <p className="set-hint">The privacy policy page isn't set up yet. Ask Asma to run addendum 93 in Supabase.</p>}
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {page && (
        <div className="set-editor">
          <div className="set-editor-col">
            <label className="set-label" htmlFor="pp-title">
              Title
            </label>
            <input id="pp-title" className="panel-input" value={title} onChange={(e) => change({ title: e.target.value })} />
            <label className="set-label" htmlFor="pp-body">
              Wording
            </label>
            <textarea id="pp-body" className="panel-input set-textarea" rows={28} value={body} onChange={(e) => change({ body: e.target.value })} />
            <p className="set-hint">
              Start a line with <strong>## </strong> for a heading, <strong>- </strong> for a bullet, and leave a blank line between
              paragraphs. Public link for the app stores: <strong>your Client website address</strong>/privacy
            </p>
          </div>
          <div className="set-editor-col set-preview-col">
            <div className="set-label">Preview · how the public sees it</div>
            <div className="set-preview">
              <h1>{title || "Privacy policy"}</h1>
              <PolicyText text={body} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
