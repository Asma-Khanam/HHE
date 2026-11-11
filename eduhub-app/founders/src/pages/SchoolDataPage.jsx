import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { friendlyError } from "../lib/staffData";
import {
  FIELD_LABEL,
  applySuggestion,
  dismissSuggestion,
  listSchoolDataOverview,
  requestSchoolCheck,
} from "../lib/schoolData";
import "./SchoolDataPage.css";

// School data keeper: Claude reads each school's own website and suggests
// fixes to the school record. The team reviews and applies them here.

const FILTERS = [
  { key: "review", label: "To review" },
  { key: "never", label: "Never checked" },
  { key: "nosite", label: "No website" },
  { key: "all", label: "All schools" },
];
const STATUS_TEXT = { ok: "Checked", no_website: "No website saved", unreadable: "Couldn't read site", error: "Error" };

function ago(iso) {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

export default function SchoolDataPage() {
  const [data, setData] = useState({ schools: [], checks: [], suggestions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("review");
  const [busy, setBusy] = useState({}); // schoolId -> true while checking
  const [notes, setNotes] = useState({}); // schoolId -> last check message
  const [bulk, setBulk] = useState(null); // { done, total }
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await listSchoolDataOverview());
      setError("");
    } catch (e) {
      setError(friendlyError(e, "Couldn't load school data."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const checkOf = useMemo(() => Object.fromEntries(data.checks.map((c) => [c.school_id, c])), [data.checks]);
  const sugBySchool = useMemo(() => {
    const m = {};
    data.suggestions.forEach((s) => (m[s.school_id] ||= []).push(s));
    return m;
  }, [data.suggestions]);

  const shown = useMemo(() => {
    return data.schools.filter((s) => {
      if (filter === "review") return (sugBySchool[s.id] || []).length > 0;
      if (filter === "never") return !checkOf[s.id] && s.website_url;
      if (filter === "nosite") return !s.website_url;
      return true;
    });
  }, [data.schools, filter, sugBySchool, checkOf]);

  const counts = {
    review: data.schools.filter((s) => (sugBySchool[s.id] || []).length).length,
    never: data.schools.filter((s) => !checkOf[s.id] && s.website_url).length,
    nosite: data.schools.filter((s) => !s.website_url).length,
    all: data.schools.length,
  };

  async function checkOne(school) {
    setBusy((b) => ({ ...b, [school.id]: true }));
    try {
      const r = await requestSchoolCheck(school.id);
      setNotes((n) => ({ ...n, [school.id]: r.suggestions ? `${r.suggestions} suggestion${r.suggestions === 1 ? "" : "s"} found` : r.note || "Nothing new found" }));
    } catch (e) {
      setNotes((n) => ({ ...n, [school.id]: e.message }));
    } finally {
      setBusy((b) => ({ ...b, [school.id]: false }));
    }
  }

  async function checkAll() {
    const todo = data.schools.filter((s) => s.website_url && !checkOf[s.id]);
    const list = todo.length ? todo : data.schools.filter((s) => s.website_url);
    if (!list.length) return;
    stopRef.current = false;
    setBulk({ done: 0, total: list.length });
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (!stopRef.current && next < list.length) {
        const school = list[next++];
        await checkOne(school);
        done += 1;
        setBulk({ done, total: list.length });
      }
    };
    await Promise.all([worker(), worker()]);
    setBulk(null);
    await load();
  }

  async function act(fn, s) {
    try {
      await fn(s);
      setData((d) => ({ ...d, suggestions: d.suggestions.filter((x) => x.id !== s.id) }));
    } catch (e) {
      setError(friendlyError(e, "Couldn't save that change."));
    }
  }
  async function applyAll(school) {
    for (const s of sugBySchool[school.id] || []) {
      // eslint-disable-next-line no-await-in-loop
      await act(applySuggestion, s);
    }
    load();
  }

  return (
    <div className="sdp">
      <div className="sdp-head">
        <div>
          <h1>School data</h1>
          <p className="sdp-sub">
            Claude reads each school's own website and suggests fixes for phone numbers, emails, fees and links. Nothing changes until you press Apply.
          </p>
        </div>
        <div className="sdp-head-actions">
          {bulk ? (
            <button type="button" className="panel-btn" onClick={() => (stopRef.current = true)}>
              Stop ({bulk.done}/{bulk.total})
            </button>
          ) : (
            <button type="button" className="panel-btn panel-btn-primary" onClick={checkAll} disabled={loading}>
              {counts.never ? `Check ${counts.never} unchecked schools` : "Re-check all schools"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="panel-error">{error}</p>}

      <div className="sdp-filters">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={"wap-chip" + (filter === f.key ? " is-on" : "")} onClick={() => setFilter(f.key)}>
            {f.label} <span className="wap-chip-n">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="sdp-empty">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="sdp-empty">
          {filter === "review"
            ? "No suggestions waiting. Use “Check unchecked schools” to have Claude read the websites."
            : "No schools in this view."}
        </p>
      ) : (
        <div className="sdp-list">
          {shown.map((school) => {
            const sugs = sugBySchool[school.id] || [];
            const check = checkOf[school.id];
            return (
              <section key={school.id} className="sdp-card">
                <header className="sdp-card-head">
                  <div className="sdp-card-who">
                    <Link to={`/staff/schools/${school.id}`} className="sdp-name">
                      {school.name}
                    </Link>
                    <span className="sdp-meta">
                      {[school.area, school.emirate].filter(Boolean).join(", ") || "—"} ·{" "}
                      {check ? `${STATUS_TEXT[check.status] || check.status} ${ago(check.checked_at)}` : "Not checked yet"}
                      {notes[school.id] ? ` · ${notes[school.id]}` : ""}
                    </span>
                  </div>
                  <div className="sdp-card-actions">
                    {sugs.length > 1 && (
                      <button type="button" className="panel-btn panel-btn-primary" onClick={() => applyAll(school)}>
                        Apply all
                      </button>
                    )}
                    <button type="button" className="panel-btn" disabled={!!busy[school.id] || !school.website_url} onClick={() => checkOne(school).then(load)}>
                      {busy[school.id] ? "Reading website…" : "Check now"}
                    </button>
                  </div>
                </header>
                {sugs.map((s) => (
                  <div key={s.id} className="sdp-sug">
                    <div className="sdp-sug-main">
                      <strong>{FIELD_LABEL[s.field] || s.field}</strong>
                      <div className="sdp-change">
                        <span className="sdp-old">{s.current_value || "empty"}</span>
                        <span aria-hidden="true">→</span>
                        <span className="sdp-new">{s.suggested_value}</span>
                      </div>
                      {s.evidence && <q className="sdp-evidence">{s.evidence}</q>}
                      {s.source_url && (
                        <a className="sdp-src" href={s.source_url} target="_blank" rel="noreferrer">
                          View source page
                        </a>
                      )}
                    </div>
                    <div className="sdp-sug-actions">
                      <button type="button" className="panel-btn panel-btn-primary" onClick={() => act(applySuggestion, s)}>
                        Apply
                      </button>
                      <button type="button" className="panel-btn panel-btn-quiet" onClick={() => act(dismissSuggestion, s)}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
