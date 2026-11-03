import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { loadActivity, ACTIVITY_KINDS } from "../lib/activity";
import { friendlyError, getCurrentStaff } from "../lib/staffData";
import "../pages/ActivityPage.css";

// The Activity list, used twice: on the Activity page (everyone's changes) and
// on the History tab of one family (only that family's, all the way back).
// Read-only -- nothing here can be edited, and nothing is ever removed from it.
// Everything is shown in Dubai time, like the rest of the app, so the whole
// team reads the same clock whatever their computer is set to.

const TZ = "Asia/Dubai";
const dayKey = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });

function dayLabel(iso) {
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (dayKey(iso) === dayKey(new Date())) return "Today";
  if (dayKey(iso) === dayKey(yest)) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
}

const timeOf = (iso) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

const SEEN_KEY = "hh-activity-last-seen";
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
};
const writeSeen = (iso) => {
  try {
    localStorage.setItem(SEEN_KEY, iso);
  } catch {
    /* private window: the banner just starts fresh next time */
  }
};

// "?tab=visits&school=abc" in a link -> where it goes. On a family's own page
// the link has to switch the tab it is already on, so it is handed up instead
// of followed.
const linkParts = (path) => {
  const q = new URLSearchParams((path || "").split("?")[1] || "");
  return { tab: q.get("tab") || "overview", school: q.get("school") || null, hl: q.get("hl") || null };
};
const familyHome = (path) => (path || "").split("?")[0];
const firstName = (n) => (n === "The family" ? n : String(n || "").split(" ")[0]);

// ---- Search: whole-word starts, every word must match -------------------------
// "cat" finds CAT4 but not "appliCATion"; "tour hadley" finds Hadley's tours.
const tokensOf = (q) => String(q || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const wordsOf = (parts) => parts.filter(Boolean).join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function Hl({ text, tokens }) {
  if (!tokens.length || !text) return text ?? null;
  const re = new RegExp(`(\\b(?:${tokens.map(escRe).join("|")}))`, "ig");
  return String(text)
    .split(re)
    .map((piece, i) => (i % 2 === 1 ? <mark key={i}>{piece}</mark> : piece));
}

// ---- Icons: one small shape per kind of thing, so a day reads at a glance ------
const ICONS = {
  doc: "M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v4h4",
  tour: "M5 6h14v13H5zM5 10h14M9 4v4M15 4v4",
  fee: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  task: "M5 12l4.5 4.5L19 7",
  note: "M4 20h4L19 9l-4-4L4 16z",
  app: "M6 4v16M6 5h11l-2 4 2 4H6",
  stage: "M5 12h14M13 6l6 6-6 6",
  family: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0",
  edit: "M4 20h4L19 9l-4-4L4 16z",
};
function iconFor(r) {
  if (r.fromFamily) return "family";
  if (r.kind === "email") return "mail";
  if (r.kind === "task") return "task";
  if (r.kind === "stage") return "stage";
  if (r.kind === "application" || r.kind === "placement") return "app";
  if (r.kind === "note" || r.kind === "school") return "note";
  if (r.where === "Documents") return "doc";
  if (r.where === "School visits") return "tour";
  if (r.where === "Applications") return "fee";
  return "edit";
}
function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] || ICONS.edit} />
    </svg>
  );
}

// When every old value is "not set" the entry is just something being filled in
// for the first time: show only the new values, as small chips.
function Changes({ changes, tokens }) {
  const filling = changes.every((c) => c.old === "not set");
  return (
    <div className="act-chips">
      {changes.map((c, i) => (
        <span key={i} className="act-chip">
          {c.label && <span className="act-chip-label">{c.label}</span>}
          {!filling && (
            <>
              <span className="act-chip-old">
                <Hl text={c.old} tokens={tokens} />
              </span>
              <span aria-hidden="true" className="act-chip-arrow">→</span>
            </>
          )}
          <span className="act-chip-new">
            <Hl text={c.new} tokens={tokens} />
          </span>
        </span>
      ))}
    </div>
  );
}

export default function ActivityFeed({ familyId = null, onGoToTab = null }) {
  const forFamily = !!familyId;
  const RANGES = forFamily
    ? [
        { key: 90, label: "Last 3 months" },
        { key: 365, label: "Last year" },
        { key: 3650, label: "All time" },
      ]
    : [
        { key: 7, label: "Last 7 days" },
        { key: 30, label: "Last 30 days" },
        { key: 90, label: "Last 3 months" },
      ];
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [days, setDays] = useState(forFamily ? 3650 : 30);
  const [kind, setKind] = useState("all");
  const [person, setPerson] = useState("all");
  const [search, setSearch] = useState("");
  const [fromFamilies, setFromFamilies] = useState(false);
  const [me, setMe] = useState(null);
  // When this person last opened the Activity page on this computer. Read once
  // at the start so the "new" markers stay on screen for this visit.
  const lastSeen = useRef(forFamily ? null : readSeen());

  useEffect(() => {
    getCurrentStaff().then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    setRows(null);
    loadActivity({ sinceDays: days, familyId })
      .then((r) => {
        if (!alive) return;
        setRows(r);
        if (!forFamily) writeSeen(new Date().toISOString());
      })
      .catch((e) => alive && setError(friendlyError(e, "Couldn't load the activity.")));
    return () => {
      alive = false;
    };
  }, [days, familyId, forFamily]);

  const myName = me?.full_name || me?.email || "";
  const isNew = (r) => !!lastSeen.current && r.at > lastSeen.current && (!myName || r.who !== myName);
  const place = (r) => r.where || ACTIVITY_KINDS.find((k) => k.key === r.kind)?.label || r.kind;

  const people = useMemo(() => [...new Set((rows || []).map((r) => r.who).filter(Boolean))].sort(), [rows]);
  const tokens = useMemo(() => tokensOf(search), [search]);

  const shown = useMemo(() => {
    return (rows || []).filter((r) => {
      if (fromFamilies && !r.fromFamily) return false;
      if (kind !== "all" && r.kind !== kind) return false;
      if (person === "__none" ? !!r.who : person !== "all" && r.who !== person) return false;
      if (!tokens.length) return true;
      const words = wordsOf([r.who, r.title, r.familyName, r.schoolName, r.context, place(r), ...(r.detail || []), ...(r.changes || []).flatMap((c) => [c.label, c.old, c.new])]);
      return tokens.every((t) => words.some((w) => w.startsWith(t)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, kind, person, tokens, fromFamilies]);

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

  const newRows = (rows || []).filter(isNew);
  const newOnMine = me?.user_id ? newRows.filter((r) => r.ownerStaffId === me.user_id).length : 0;
  const familyCount = (rows || []).filter((r) => r.fromFamily).length;

  function openLink(r) {
    if (!r.path) return null;
    const label = (
      <>
        Open {place(r).toLowerCase()} <span aria-hidden="true">›</span>
      </>
    );
    // Inside a family the link switches that page's tab; elsewhere it goes to
    // the family, on the tab and school the change belongs to.
    if (forFamily) {
      const { tab, school, hl } = linkParts(r.path);
      return onGoToTab ? (
        <button type="button" className="act-open" onClick={() => onGoToTab(tab, school, hl)}>
          {label}
        </button>
      ) : null;
    }
    return (
      <Link className="act-open" to={r.path}>
        {label}
      </Link>
    );
  }

  return (
    <div className={forFamily ? "act is-family" : "act"}>
      {!forFamily && newRows.length > 0 && (
        <div className="act-banner">
          <strong>{newRows.length} new</strong> since you last looked
          {newOnMine > 0 ? ` — ${newOnMine} on your families` : ""}. Marked with a dot.
        </div>
      )}

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <div className="act-filters">
        <input
          type="search"
          className="act-search"
          placeholder={forFamily ? "Search this family: a school, a document, a person…" : "Search a family, school, document or person…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="How far back">
          {RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={"act-pill" + (fromFamilies ? " is-on" : "")}
          onClick={() => setFromFamilies((v) => !v)}
          title="Only things the family did: their own edits, decisions and emails to us"
        >
          {forFamily ? "From the family" : "From families"}
          {familyCount > 0 ? ` · ${familyCount}` : ""}
        </button>
        <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person">
          <option value="all">All people</option>
          <option value="__none">Not recorded</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
          <option value="all">All types</option>
          {ACTIVITY_KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      {rows !== null && tokens.length > 0 && (
        <p className="act-count">
          {shown.length} {shown.length === 1 ? "result" : "results"} for “{search.trim()}”
        </p>
      )}

      {rows === null ? (
        <p className="act-empty">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="act-empty">{forFamily && rows.length === 0 ? "Nothing recorded for this family yet." : "Nothing matches that."}</p>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="act-day">
            <h2>{g.label}</h2>
            <ul className="act-list">
              {g.rows.map((r) => (
                <li key={r.id} className={"act-row" + (isNew(r) ? " is-new" : "")}>
                  <span className={"act-icon is-" + iconFor(r)}>
                    <Icon name={iconFor(r)} />
                  </span>
                  <div className="act-main">
                    <div className="act-line">
                      {r.who ? (
                        <span className="act-who">
                          <Hl text={forFamily ? firstName(r.who) : r.who} tokens={tokens} />
                        </span>
                      ) : (
                        <span className="act-who is-none" title="This change happened before we started recording who did it">
                          Not recorded
                        </span>
                      )}{" "}
                      <Hl text={r.title} tokens={tokens} />
                      {r.fromFamily && <span className="act-tag">Family</span>}
                    </div>
                    <div className="act-sub">
                      <span className="act-time">{timeOf(r.at)}</span>
                      {!forFamily && r.familyName && (
                        <>
                          <span aria-hidden="true">·</span>
                          {r.path ? (
                            <Link className="act-family" to={familyHome(r.path)}>
                              <Hl text={r.familyName} tokens={tokens} />
                            </Link>
                          ) : (
                            <span className="act-family">{r.familyName}</span>
                          )}
                        </>
                      )}
                      {r.schoolName && !r.context && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            <Hl text={r.schoolName} tokens={tokens} />
                          </span>
                        </>
                      )}
                      {r.context && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            <Hl text={r.context} tokens={tokens} />
                          </span>
                        </>
                      )}
                    </div>
                    {r.kind === "edit" && r.isChange && r.changes ? (
                      <Changes changes={r.changes} tokens={tokens} />
                    ) : r.kind === "stage" ? (
                      <div className="act-chips">
                        <span className="act-chip">
                          <span className="act-chip-old">{r.detail[0]}</span>
                          <span aria-hidden="true" className="act-chip-arrow">→</span>
                          <span className="act-chip-new">{r.detail[1]}</span>
                        </span>
                      </div>
                    ) : (
                      (r.detail || []).filter(Boolean).length > 0 && (
                        <div className="act-text">
                          <Hl text={r.detail.filter(Boolean).join(" · ")} tokens={tokens} />
                        </div>
                      )
                    )}
                  </div>
                  {openLink(r)}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
