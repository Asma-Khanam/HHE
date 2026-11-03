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

// "?tab=visits" in a link -> "visits". On a family's own page the link has to
// switch the tab it is already on, so it is handed up instead of followed.
const tabOf = (path) => (path && new URLSearchParams(path.split("?")[1] || "").get("tab")) || "overview";
const firstName = (n) => String(n || "").split(" ")[0];

// When every old value is "not set" the entry is just something being filled in
// for the first time: show the new values on one line instead of one line each.
function ChangeLines({ changes }) {
  const filling = changes.every((c) => c.old === "not set");
  if (filling) {
    return (
      <div className="activity-detail">
        {changes.map((c, i) => (
          <span key={i} className="activity-pair">
            {c.label && <span className="activity-field">{c.label} </span>}
            <span className="activity-new">{c.new}</span>
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="activity-detail">
      {changes.map((c, i) => (
        <span key={i} className="activity-pair">
          {c.label && <span className="activity-field">{c.label} </span>}
          <span className="activity-old">{c.old}</span>
          <span aria-hidden="true"> → </span>
          <span className="activity-new">{c.new}</span>
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

  const people = useMemo(() => [...new Set((rows || []).map((r) => r.who).filter(Boolean))].sort(), [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (fromFamilies && !r.fromFamily) return false;
      if (kind !== "all" && r.kind !== kind) return false;
      if (person === "__none" ? !!r.who : person !== "all" && r.who !== person) return false;
      if (!q) return true;
      return [r.who, r.title, r.familyName, r.context, ...(r.detail || []), ...(r.changes || []).flatMap((c) => [c.label, c.old, c.new])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, kind, person, search, fromFamilies]);

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

  const place = (r) => r.where || ACTIVITY_KINDS.find((k) => k.key === r.kind)?.label || r.kind;
  const newRows = (rows || []).filter(isNew);
  const newOnMine = me?.user_id ? newRows.filter((r) => r.ownerStaffId === me.user_id).length : 0;
  const familyCount = (rows || []).filter((r) => r.fromFamily).length;

  return (
    <div className={forFamily ? "activity-feed is-family" : "activity-feed"}>
      <div className="activity-range">
        {RANGES.map((r) => (
          <button key={r.key} type="button" className={"activity-chip" + (days === r.key ? " is-on" : "")} onClick={() => setDays(r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      {!forFamily && newRows.length > 0 && (
        <div className="activity-new-banner">
          <strong>{newRows.length} new</strong> since you last looked
          {newOnMine > 0 ? ` — ${newOnMine} on your families` : ""}. They are marked with a dot.
        </div>
      )}

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <div className="activity-filters">
        <input
          type="search"
          className="activity-search"
          placeholder={forFamily ? "Search this family's history" : "Search a name, a family or a school"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          className={"activity-chip" + (fromFamilies ? " is-on" : "")}
          onClick={() => setFromFamilies((v) => !v)}
          title="Only things the family did: their own edits, decisions and emails to us"
        >
          {forFamily ? "From the family" : "From families"}
          {familyCount > 0 ? ` · ${familyCount}` : ""}
        </button>
        <select value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="all">All people</option>
          <option value="__none">Not recorded</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">All types</option>
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
        <p className="activity-hint">{forFamily && rows.length === 0 ? "Nothing recorded for this family yet." : "Nothing here for that."}</p>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="activity-day">
            <h2>{g.label}</h2>
            <ul className="activity-list">
              {g.rows.map((r) => (
                <li key={r.id} className="activity-row">
                  <span className="activity-time">
                    {isNew(r) && <span className="activity-newdot" title="New since you last looked" />}
                    {timeOf(r.at)}
                  </span>
                  <span className="activity-avatar" aria-hidden="true">
                    {(r.who || "?").charAt(0).toUpperCase()}
                  </span>
                  <div className="activity-text">
                    <div className="activity-line">
                      {r.who ? <strong>{forFamily ? firstName(r.who) : r.who}</strong> : <span className="activity-nobody" title="This change happened before we started recording who did it">Not recorded</span>}{" "}
                      {r.title}
                      {r.fromFamily && <span className="activity-pill">Family</span>}
                      {!forFamily && r.familyName ? (
                        <>
                          {" · "}
                          {r.path ? <Link to={r.path}>{r.familyName}</Link> : r.familyName}
                        </>
                      ) : null}
                    </div>
                    {r.context && <div className="activity-detail">{r.context}</div>}
                    {r.kind === "edit" && r.isChange && r.changes ? (
                      <ChangeLines changes={r.changes} />
                    ) : r.kind === "stage" ? (
                      <div className="activity-detail">
                        <span className="activity-old">{r.detail[0]}</span>
                        <span aria-hidden="true"> → </span>
                        <span className="activity-new">{r.detail[1]}</span>
                      </div>
                    ) : (
                      (r.detail || []).filter(Boolean).length > 0 && <div className="activity-detail">{r.detail.filter(Boolean).join(" · ")}</div>
                    )}
                  </div>
                  <span className="activity-kind">
                    {forFamily && r.path && onGoToTab ? (
                      <button type="button" className="activity-open" onClick={() => onGoToTab(tabOf(r.path))}>
                        {place(r)} ›
                      </button>
                    ) : (
                      place(r)
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
