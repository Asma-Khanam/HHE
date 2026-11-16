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
  getYearGroupCutoff,
} from "../lib/staffData";
import { suggestSchools } from "../lib/schoolSuggestions";
import "./SuggestedSchools.css";

// Suggested schools card (School visits tab). Ranks schools from what is already on the
// family's record and lets the consultant Accept (adds to the shortlist), Reject (with a
// reason) or Hold each one. The consultant stays in control: nothing is added without a click.
const SHOW_FIRST = 5;

export default function SuggestedSchools({ family, familyChildren, currentSchools, onShortlistChanged }) {
  const [schools, setSchools] = useState(null);
  const [shortlistIds, setShortlistIds] = useState(new Set());
  const [decisions, setDecisions] = useState([]);
  const [cutoff, setCutoff] = useState({ month: 8, day: 31 });
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // school id
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showHeld, setShowHeld] = useState(false);

  async function load() {
    try {
      const [all, shortlist, dec, cut] = await Promise.all([
        listSchools(),
        listShortlistForFamily(family.id),
        // Addendum 161 not run yet: show suggestions without the memory of past decisions.
        listSuggestionDecisions(family.id).catch(() => []),
        getYearGroupCutoff().catch(() => null),
      ]);
      setSchools(all);
      setShortlistIds(new Set(shortlist.map((r) => r.school_id)));
      setDecisions(dec);
      if (cut) setCutoff(cut);
    } catch (err) {
      setError(friendlyError(err, "Couldn't load school suggestions."));
      setSchools([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family.id]);

  const byDecision = useMemo(() => {
    const m = {};
    for (const d of decisions) m[d.school_id] = d;
    return m;
  }, [decisions]);

  const { suggestions, yearLabels, familyMissing } = useMemo(() => {
    if (!schools) return { suggestions: [], yearLabels: [], familyMissing: [] };
    const skip = new Set(shortlistIds);
    for (const d of decisions) if (d.decision === "rejected" || d.decision === "accepted") skip.add(d.school_id);
    return suggestSchools({ family, children: familyChildren || [], currentSchools: currentSchools || [], schools, skipIds: skip, cutoff });
  }, [schools, shortlistIds, decisions, family, familyChildren, currentSchools, cutoff]);

  const active = suggestions.filter((s) => byDecision[s.school.id]?.decision !== "held");
  const held = suggestions.filter((s) => byDecision[s.school.id]?.decision === "held");
  const shown = showAll ? active : active.slice(0, SHOW_FIRST);

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
      await setSuggestionDecision({ familyId: family.id, schoolId: s.id, decision: "accepted" }).catch(() => {});
      onShortlistChanged?.();
    });
  const hold = (s) => run(s.id, () => setSuggestionDecision({ familyId: family.id, schoolId: s.id, decision: "held" }));
  const unhold = (s) => run(s.id, () => clearSuggestionDecision(family.id, s.id));
  const reject = (s) =>
    run(s.id, async () => {
      await setSuggestionDecision({ familyId: family.id, schoolId: s.id, decision: "rejected", reason: reason.trim() });
      setRejecting(null);
      setReason("");
    });

  const kidLine = yearLabels.length ? ` · for ${[...new Set(yearLabels)].join(", ")}` : "";

  function renderRow(item, isHeld) {
    const s = item.school;
    const busy = busyId === s.id;
    return (
      <li className="sugg-row" key={s.id}>
        <div className="sugg-main">
          <div className="sugg-head">
            <Link to={`/staff/schools/${s.id}`} className="sugg-name">
              {s.name}
            </Link>
            {item.score !== null && <span className="sugg-score" title="Share of the available signals that fit">{item.score}% fit</span>}
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
            {item.missing.length > 0 && ` Not counted: ${item.missing.join(", ")}.`}
          </div>
          {rejecting === s.id && (
            <div className="sugg-reject">
              <input
                type="text"
                autoFocus
                placeholder="Why not? (e.g. too far, wrong curriculum, parents ruled it out)"
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
          {isHeld ? (
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
          <span className="sugg-sub">
            {schools === null ? " · Loading…" : ` · ${active.length} to look at${kidLine}`}
          </span>
        </span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="sugg-body">
          {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
          <p className="sugg-intro">
            Ranked from this family's fee range, where they plan to live, their child's current curriculum, any SEN answers and
            their top priorities. Accept adds the school to the shortlist. Nothing is added until you click.
          </p>
          {familyMissing.length > 0 && (
            <p className="sugg-missing">Add to the family record for better matches: {familyMissing.join(", ")}.</p>
          )}
          {schools !== null && active.length === 0 && <p className="sugg-empty">No new suggestions right now.</p>}
          <ul className="sugg-list">
            {shown.map((item) => renderRow(item, false))}
          </ul>
          {active.length > SHOW_FIRST && (
            <button type="button" className="sugg-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `Show all ${active.length}`}
            </button>
          )}
          {held.length > 0 && (
            <div className="sugg-held">
              <button type="button" className="sugg-more" onClick={() => setShowHeld((v) => !v)}>
                {showHeld ? "Hide" : "Show"} on hold ({held.length})
              </button>
              {showHeld && (
                <ul className="sugg-list">
                  {held.map((item) => renderRow(item, true))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
