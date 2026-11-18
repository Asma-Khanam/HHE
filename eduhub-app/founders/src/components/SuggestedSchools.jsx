import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listSchools,
  listShortlistForFamily,
  listSuggestionDecisions,
  listStaff,
  getYearGroupCutoff,
  setSuggestionDecision,
  clearSuggestionDecision,
  friendlyError,
} from "../lib/staffData";
import { suggestForChild, suggestTogether } from "../lib/schoolSuggestions";
import { displayNameForChild } from "../lib/completeness";
import "./SuggestedSchools.css";

// Suggested schools, shown inside the "Shortlist a school" window. Five at a time, ranked from
// what is already on the family's record, with a tab per child and a Together tab for schools that
// suit every child. Add puts the school on the shortlist (the window's onAccept does that), Reject
// asks for a reason, Hold parks it. Rejects and holds are per tab.
const SHOW = 5;
const TOGETHER = "together";

export default function SuggestedSchools({ family, familyChildren, currentSchools, onAccept, busy: parentBusy }) {
  const kids = familyChildren || [];
  const [schools, setSchools] = useState(null);
  const [shortlistIds, setShortlistIds] = useState(new Set());
  const [decisions, setDecisions] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [tab, setTab] = useState(kids.length > 1 ? TOGETHER : kids[0]?.id || TOGETHER);
  const [staffByUser, setStaffByUser] = useState({});
  const [cutoff, setCutoff] = useState({ month: 8, day: 31 });

  useEffect(() => {
    let live = true;
    Promise.all([
      listSchools(),
      listShortlistForFamily(family.id),
      // Addendum 161/162 not run yet: show suggestions without the memory of past decisions.
      listSuggestionDecisions(family.id).catch(() => []),
      listStaff().catch(() => []),
      getYearGroupCutoff().catch(() => null),
    ])
      .then(([all, shortlist, dec, staff, cut]) => {
        if (!live) return;
        setSchools(all);
        if (cut) setCutoff(cut);
        setShortlistIds(new Set(shortlist.map((r) => r.school_id)));
        setDecisions(dec);
        setStaffByUser(Object.fromEntries((staff || []).map((s) => [s.user_id, s.full_name || s.email])));
      })
      .catch((err) => {
        if (!live) return;
        setError(friendlyError(err, "Couldn't load school suggestions."));
        setSchools([]);
      });
    return () => {
      live = false;
    };
  }, [family.id]);

  const currentFor = (child) => (currentSchools || []).find((c) => c.child_id === child.id) || null;
  const decidedFor = (schoolId, childId, kind) =>
    decisions.some((d) => d.school_id === schoolId && d.decision === kind && (!d.child_id || d.child_id === childId));
  const decidedAnywhere = (schoolId, kind) => decisions.some((d) => d.school_id === schoolId && d.decision === kind);

  const perChild = useMemo(() => {
    if (!schools) return [];
    return kids.map((child) => {
      const skip = new Set(shortlistIds);
      for (const s of schools) if (decidedFor(s.id, child.id, "rejected")) skip.add(s.id);
      return { child, ...suggestForChild({ family, child, currentSchool: currentFor(child), schools, skipIds: skip, cutoff }) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools, shortlistIds, decisions, family, familyChildren, currentSchools, cutoff]);

  const together = useMemo(
    () => suggestTogether(perChild).filter((i) => !decidedAnywhere(i.school.id, "rejected")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [perChild, decisions]
  );

  const showTogetherTab = kids.length > 1;
  const activeTab = tab === TOGETHER && !showTogetherTab ? kids[0]?.id : tab;
  const activeChild = kids.find((k) => k.id === activeTab) || null;
  const scopeChildId = activeChild ? activeChild.id : null;
  const items = activeChild ? perChild.find((r) => r.child.id === activeChild.id)?.items || [] : together;
  const missingFamily = perChild[0]?.missingFamily || [];
  const ranked = activeChild ? !!perChild.find((r) => r.child.id === activeChild.id)?.ranked : perChild.some((r) => r.ranked);

  const isHeld = (item) => (activeChild ? decidedFor(item.school.id, activeChild.id, "held") : decidedAnywhere(item.school.id, "held"));
  const active = items.filter((i) => !isHeld(i));
  const held = items.filter(isHeld);
  const shown = active.slice(0, SHOW);

  const sameScope = (d, schoolId) => d.school_id === schoolId && (d.child_id || null) === (scopeChildId || null);
  async function run(schoolId, fn) {
    setBusyId(schoolId);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(friendlyError(err, "That didn't save. Try again."));
    } finally {
      setBusyId(null);
    }
  }
  const putDecision = (row) => setDecisions((ds) => [...ds.filter((d) => !sameScope(d, row.school_id)), row]);
  const hold = (item) =>
    run(item.school.id, async () => {
      putDecision(await setSuggestionDecision({ familyId: family.id, schoolId: item.school.id, childId: scopeChildId, decision: "held" }));
    });
  const unhold = (item) =>
    run(item.school.id, async () => {
      await clearSuggestionDecision(family.id, item.school.id, scopeChildId);
      setDecisions((ds) => ds.filter((d) => !sameScope(d, item.school.id)));
    });
  const reject = (item) =>
    run(item.school.id, async () => {
      putDecision(
        await setSuggestionDecision({ familyId: family.id, schoolId: item.school.id, childId: scopeChildId, decision: "rejected", reason: reason.trim() })
      );
      setRejecting(null);
      setReason("");
    });

  const heldInfo = (item) => {
    const d = decisions.find((x) => x.school_id === item.school.id && x.decision === "held" && (!activeChild || !x.child_id || x.child_id === activeChild.id));
    if (!d) return "";
    const who = staffByUser[d.decided_by];
    const when = d.decided_at ? new Date(d.decided_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
    return `Held${who ? ` by ${who}` : ""}${when ? ` · ${when}` : ""}`;
  };

  function renderRow(item, heldRow, index) {
    const s = item.school;
    const isBusy = busyId === s.id || parentBusy;
    const score = item.score;
    return (
      <li className={"sg-row" + (heldRow ? " is-held" : "")} key={s.id}>
        <div
          className={"sg-fit" + (score === null ? " is-none" : score >= 70 ? " is-high" : score >= 40 ? " is-mid" : " is-low")}
          style={{ "--p": score === null ? 0 : score }}
          title={score === null ? "Not ranked yet" : "Points earned out of what could be checked for this family. Missing school records lower it."}
        >
          <span>{score === null ? "–" : `${score}%`}</span>
        </div>

        <div className="sg-info">
          <div className="sg-line1">
            <Link to={`/staff/schools/${s.id}`} className="sg-name" target="_blank" rel="noreferrer">
              {s.name}
            </Link>
            {!heldRow && index === 0 && score !== null && <span className="sg-best">Best match</span>}
          </div>
          <div className="sg-chips">
            {s.curriculum && <span className="sg-chip">{s.curriculum}</span>}
            {s.area && <span className="sg-chip">{s.area}</span>}
            {item.missing.length > 0 && <span className="sg-chip is-missing">Missing: {item.missing.join(", ")}</span>}
          </div>
          {(item.reasons.length > 0 || item.cautions.length > 0) && (
            <ul className="sg-why">
              {item.reasons.map((r) => (
                <li key={r} className="is-good">
                  {r}
                </li>
              ))}
              {item.cautions.map((r) => (
                <li key={r} className="is-warn">
                  {r}
                </li>
              ))}
            </ul>
          )}
          {heldRow && <div className="sg-heldmeta">{heldInfo(item)}</div>}
          {rejecting === s.id && (
            <div className="sg-reject">
              <input
                type="text"
                autoFocus
                placeholder={activeChild ? `Why not for ${displayNameForChild(activeChild, kids.indexOf(activeChild))}?` : "Why not? (e.g. too far, parents ruled it out)"}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    reject(item);
                  }
                }}
              />
              <button type="button" className="sv-btn is-sm is-primary" disabled={isBusy} onClick={() => reject(item)}>
                Reject
              </button>
              <button type="button" className="sv-btn is-sm is-quiet" onClick={() => { setRejecting(null); setReason(""); }}>
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="sg-act">
          <button type="button" className="sv-btn is-sm is-primary" disabled={isBusy} onClick={() => onAccept(item)}>
            Add
          </button>
          <div className="sg-act-sub">
            {heldRow ? (
              <button type="button" className="sg-link" disabled={isBusy} onClick={() => unhold(item)}>
                Back to list
              </button>
            ) : (
              <button type="button" className="sg-link" disabled={isBusy} onClick={() => hold(item)}>
                Hold
              </button>
            )}
            <span aria-hidden="true">·</span>
            <button type="button" className="sg-link is-danger" disabled={isBusy} onClick={() => { setRejecting(s.id); setReason(""); }}>
              Reject
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <section className="sg">
      <div className="sg-head">
        <div>
          <h4>Suggested for this family</h4>
          <p className="sg-sub">{schools === null ? "Loading…" : `Top ${Math.min(SHOW, active.length)} of ${active.length}${ranked ? ", best fit first" : ""}`}</p>
        </div>
        {kids.length > 1 && (
          <div className="sg-seg" role="tablist" aria-label="Suggestions for">
            {showTogetherTab && (
              <button type="button" role="tab" aria-selected={activeTab === TOGETHER} className={activeTab === TOGETHER ? "is-on" : ""} onClick={() => setTab(TOGETHER)}>
                Together
              </button>
            )}
            {kids.map((k, i) => (
              <button key={k.id} type="button" role="tab" aria-selected={activeTab === k.id} className={activeTab === k.id ? "is-on" : ""} onClick={() => setTab(k.id)}>
                {displayNameForChild(k, i)}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {(missingFamily.length > 0 || !ranked) && schools !== null && (
        <div className="sg-note">
          {ranked ? "Better matches if the family record has" : "Not ranked yet. These are the schools with the most complete records. Add to the family record to rank them:"}{" "}
          <strong>{missingFamily.join(", ")}</strong>
        </div>
      )}
      {schools !== null && active.length === 0 && <p className="sg-empty">No new suggestions on this tab right now.</p>}

      <ul className="sg-list">{shown.map((item, i) => renderRow(item, false, i))}</ul>

      {held.length > 0 && (
        <div className="sg-held">
          <div className="sg-held-head">On hold · {held.length}</div>
          <ul className="sg-list">{held.map((item) => renderRow(item, true, 0))}</ul>
        </div>
      )}
    </section>
  );
}
