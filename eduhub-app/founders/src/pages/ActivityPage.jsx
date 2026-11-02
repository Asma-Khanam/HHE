import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadActivity, ACTIVITY_KINDS } from "../lib/activity";
import { friendlyError } from "../lib/staffData";
import "./ActivityPage.css";

// Everything the team has done, newest first (2 Nov 2026): who changed what,
// who added what, who marked what. Read-only -- nothing here can be edited,
// and nothing is ever removed from it.

const RANGES = [
  { key: 7, label: "Last 7 days" },
  { key: 30, label: "Last 30 days" },
  { key: 90, label: "Last 3 months" },
];

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export default function ActivityPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);
  const [kind, setKind] = useState("all");
  const [person, setPerson] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    setRows(null);
    loadActivity({ sinceDays: days })
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(friendlyError(e, "Couldn't load the activity.")));
    return () => {
      alive = false;
    };
  }, [days]);

  const people = useMemo(() => [...new Set((rows || []).map((r) => r.who).filter(Boolean))].sort(), [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (person === "__none" ? !!r.who : person !== "all" && r.who !== person) return false;
      if (!q) return true;
      return [r.who, r.title, r.familyName, ...(r.detail || [])].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [rows, kind, person, search]);

  const groups = useMemo(() => {
    const out = [];
    shown.forEach((r) => {
      const label = dayLabel(r.at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(r);
      else out.push({ label, rows: [r] });
    });
    return out;
  }, [shown]);

  return (
    <div className="activity-page">
      <div className="activity-header">
        <div>
          <h1>Activity</h1>
          <p className="activity-sub">Everything the team has changed, added or marked, newest first.</p>
          {(rows || []).some((r) => !r.who) && (
            <p className="activity-note">
              Who did it is only recorded from 2 November 2026, when this trail was added. Anything finished before that says “Not recorded”.
            </p>
          )}
        </div>
        <div className="activity-range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" className={"activity-chip" + (days === r.key ? " is-on" : "")} onClick={() => setDays(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <div className="activity-filters">
        <input
          type="search"
          className="activity-search"
          placeholder="Search a name, a family or a school"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="all">Everyone</option>
          <option value="__none">Not recorded</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">Everything</option>
          {ACTIVITY_KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      {rows === null ? (
        <p className="activity-hint">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="activity-hint">Nothing here for that.</p>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="activity-day">
            <h2>{g.label}</h2>
            <ul className="activity-list">
              {g.rows.map((r) => (
                <li key={r.id} className="activity-row">
                  <span className="activity-time">{timeOf(r.at)}</span>
                  <span className="activity-avatar" aria-hidden="true">
                    {(r.who || "?").charAt(0).toUpperCase()}
                  </span>
                  <div className="activity-text">
                    <div className="activity-line">
                      {r.who ? <strong>{r.who}</strong> : <span className="activity-nobody" title="This change happened before we started recording who did it">Not recorded</span>}{" "}
                      {r.title}
                      {r.familyName ? (
                        <>
                          {" · "}
                          {r.path ? <Link to={r.path}>{r.familyName}</Link> : r.familyName}
                        </>
                      ) : null}
                    </div>
                    {(r.kind === "edit" && r.isChange) || r.kind === "stage" ? (
                      <div className="activity-detail">
                        <span className="activity-old">{r.detail[0]}</span>
                        <span aria-hidden="true"> → </span>
                        <span className="activity-new">{r.detail[1]}</span>
                      </div>
                    ) : (
                      (r.detail || []).filter(Boolean).length > 0 && <div className="activity-detail">{r.detail.filter(Boolean).join(" · ")}</div>
                    )}
                  </div>
                  <span className="activity-kind">{ACTIVITY_KINDS.find((k) => k.key === r.kind)?.label || r.kind}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
