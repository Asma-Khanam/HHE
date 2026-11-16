import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listSchools,
  listShortlistForFamily,
  addToShortlist,
  listSuggestionDecisions,
  setSuggestionDecision,
  clearSuggestionDecision,
  friendlyError,
} from "../lib/staffData";
import { suggestForChild, suggestTogether } from "../lib/schoolSuggestions";
import { displayNameForChild } from "../lib/completeness";
import "./SuggestedSchools.css";

// Suggested schools card (School visits tab). Five schools at a time, ranked from what is
// already on the family's record, with a tab for each child and a Together tab for schools that
// suit every child (for a family that wants them in the same school). Accept adds the school
// to the shortlist, Reject asks for a reason, Hold parks it. Rejects and holds are per tab, so a
// school ruled out for one child still shows for the others.
const SHOW = 5;
const TOGETHER = "together";

export default function SuggestedSchools({ family, familyChildren, currentSchools, onShortlistChanged }) {
  const kids = familyChildren || [];
  const [schools, setSchools] = useState(null);
  const [shortlistIds, setShortlistIds] = useState(new Set());
  const [decisions, setDecisions] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(true);
  const [showHeld, setShowHeld] = useState(false);
  const [tab, setTab] = useState(kids.length > 1 ? TOGETHER : kids[0]?.id || TOGETHER);

  async function load() {
    try {
      const [all, shortlist, dec] = await Promise.all([
        listSchools(),
        listShortlistForFamily(family.id),
        // Addendum 161/162 not run yet: show suggestions without the memory of past decisions.
        listSuggestionDecisions(family.id).catch(() => []),
      ]);
      setSchools(all);
      setShortlistIds(new Set(shortlist.map((r) => r.school_id)));
      setDecisions(dec);
    } catch (err) {
      setError(friendlyError(err, "Couldn't load school suggestions."));
      setSchools([]);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family.id]);

  const currentFor = (child) => (currentSchools || []).find((c) => c.child_id === child.id) || null;

  // Which decisions hide a school on which tab. A whole-family decision (no child) counts everywhere.
  const decidedFor = (schoolId, childId, kind) =>
    decisions.some((d) => d.school_id === schoolId && d.decision === kind && (!d.child_id || d.child_id === childId));
  const decidedAnywhere = (schoolId, kind) => decisions.some((d) => d.school_id === schoolId && d.decision === kind);

  const perChild = useMemo(() => {
    if (!schools) return [];
    return kids.map((child) => {
      const skip = new Set(shortlistIds);
      for (const s of schools) if (decidedFor(s.id, child.id, "rejected")) skip.add(s.id);
      return { child, ...suggestForChild({ family, child, currentSchool: currentFor(child), schools, skipIds: skip }) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools, shortlistIds, decisions, family, familyChildren, currentSchools]);

  const together = useMemo(() => {
    const list = suggestTogether(perChild);
    // Ruled out for any one child means it isn't a "together" school.
    return list.filter((i) => !decidedAnywhere(i.school.id, "rejected"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perChild, decisions]);

  const showTogetherTab = kids.length > 1;
  const activeTab = tab === TOGETHER && !showTogetherTab ? kids[0]?.id : tab;
  const activeChild = kids.find((k) => k.id === activeTab) || null;
  const scopeChildId = activeChild ? activeChild.id : null;
  const items = activeChild ? perChild.find((r) => r.child.id === activeChild.id)?.items || [] : together;
  const missingFamily = perChild[0]?.missingFamily || [];

  const isHeld = (item) => (activeChild ? decidedFor(item.school.id, activeChild.id, "held") : decidedAnywhere(item.school.id, "held"));
  const active = items.filter((i) => !isHeld(i));
  const held = items.filter(isHeld);
  const shown = active.slice(0, SHOW);

  async function run(schoolId, fn) {
    setBusyId(schoolId);
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(friendlyError(err, "That didn't save. Try again."));
    } finally {
      setBusyId(null);
    }
  }
  const accept = (s) =>
    run(s.id, async () => {
      await addToShortlist({ familyId: family.id, schoolId: s.id });
      onShortlistChanged?.();
    });
  const hold = (s) => run(s.id, () => setSuggestionDecision({ familyId: family.id, schoolId: s.id, childId: scopeChildId, decision: "held" }));
  const unhold = (s) => run(s.id, () => clearSuggestionDecision(family.id, s.id, scopeChildId));
  const reject = (s) =>
    run(s.id, async () => {
      await setSuggestionDecision({ familyId: family.id, schoolId: s.id, childId: scopeChildId, decision: "rejected", reason: reason.trim() });
      setRejecting(null);
      setReason("");
    });

  function renderRow(item, heldRow) {
    const s = item.school;
    const busy = busyId === s.id;
    return (
      <li className="sugg-row" key={s.id}>
        <div className="sugg-main">
          <div className="sugg-head">
            <Link to={`/staff/schools/${s.id}`} className="sugg-name">
              {s.name}
            </Link>
            {item.score !== null && (
              <span className="sugg-score" title="Points earned out of what could be checked for this family. Missing school records lower it.">
                {item.score}% fit
              </span>
            )}
            {s.curriculum && <span className="sugg-chip">{s.curriculum}</span>}
            {s.area && <span className="sugg-chip">{s.area}</span>}
          </div>
          {item.reasons.length > 0 && (
            <ul className="sugg-reasons">
              {item.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {item.cautions.length > 0 && (
            <ul className="sugg-cautions">
              {item.cautions.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <div className="sugg-meta">
            {item.basedOn.length > 0 ? `Based on ${item.basedOn.join(", ")}.` : "Nothing to score on yet."}
            {item.missing.length > 0 && ` Missing on the school: ${item.missing.join(", ")}.`}
          </div>
          {rejecting === s.id && (
            <div className="sugg-reject">
              <input
                type="text"
                autoFocus
                placeholder={
                  activeChild
                    ? `Why not for ${displayNameForChild(activeChild, kids.indexOf(activeChild))}?`
                    : "Why not? (e.g. too far, parents ruled it out)"
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button type="button" className="panel-btn panel-btn-primary" disabled={busy} onClick={() => reject(s)}>
                Reject
              </button>
              <button type="button" className="panel-btn" onClick={() => { setRejecting(null); setReason(""); }}>
                Cancel
              </button>
            </div>
          )}
        </div>
        <div className="sugg-actions">
          {heldRow ? (
            <button type="button" className="panel-btn" disabled={busy} onClick={() => unhold(s)}>
              Back to list
            </button>
          ) : (
            <button type="button" className="panel-btn" disabled={busy} onClick={() => hold(s)}>
              Hold
            </button>
          )}
          <button type="button" className="panel-btn" disabled={busy} onClick={() => { setRejecting(s.id); setReason(""); }}>
            Reject
          </button>
          <button type="button" className="panel-btn panel-btn-primary" disabled={busy} onClick={() => accept(s)}>
            Accept
          </button>
        </div>
      </li>
    );
  }

  return (
    <section className="sugg-card">
      <button type="button" className="sugg-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>
          <strong>Suggested schools</strong>
          <span className="sugg-sub">{schools === null ? " · Loading…" : ` · top ${Math.min(SHOW, active.length)} of ${active.length}`}</span>
        </span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="sugg-body">
          {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

          {(showTogetherTab || kids.length > 1) && (
            <div className="sugg-tabs" role="tablist">
              {showTogetherTab && (
                <button type="button" role="tab" aria-selected={activeTab === TOGETHER} className={"sugg-tab" + (activeTab === TOGETHER ? " is-active" : "")} onClick={() => setTab(TOGETHER)}>
                  Together
                </button>
              )}
              {kids.map((k, i) => (
                <button key={k.id} type="button" role="tab" aria-selected={activeTab === k.id} className={"sugg-tab" + (activeTab === k.id ? " is-active" : "")} onClick={() => setTab(k.id)}>
                  {displayNameForChild(k, i)}
                </button>
              ))}
            </div>
          )}

          <p className="sugg-intro">
            {activeChild
              ? "Ranked for this child from the family's fee range, where they plan to live, this child's current curriculum, any SEN answers and the family's top priorities."
              : "Schools that work for every child, for a family that wants them together. If they'd rather split, use each child's tab."}{" "}
            Accept adds the school to the shortlist. Nothing is added until you click.
          </p>
          {missingFamily.length > 0 && <p className="sugg-missing">Add to the family record for better matches: {missingFamily.join(", ")}.</p>}
          {schools !== null && active.length === 0 && <p className="sugg-empty">No new suggestions on this tab right now.</p>}
          <ul className="sugg-list">{shown.map((item) => renderRow(item, false))}</ul>
          {held.length > 0 && (
            <div className="sugg-held">
              <button type="button" className="sugg-more" onClick={() => setShowHeld((v) => !v)}>
                {showHeld ? "Hide" : "Show"} on hold ({held.length})
              </button>
              {showHeld && <ul className="sugg-list">{held.map((item) => renderRow(item, true))}</ul>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
