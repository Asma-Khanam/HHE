import { useState } from "react";
import AutosaveField from "./Autosave";
import { updateSchool, setFactSource, clearFactSource, friendlyError } from "../lib/staffData";
import { YEAR_GROUPS } from "../data/formOptions";
import { STAGE_PRESETS, stageOf } from "../lib/schoolStages";
import {
  FACTS,
  SOURCE_LABEL,
  KHDA_RATINGS,
  factState,
  isDubai,
  isLink,
  khdaVerified,
  khdaText,
} from "../lib/schoolFacts";
import "./SchoolFacts.css";

// The "Facts and sources" tab on a school. Everything Suggested schools matches a family
// against, and where each fact came from. Agreed 19/11/2026: suggestions only use facts from
// the school's own website or a KHDA inspection report (addenda 160, 164, 165, 166).

function toList(text) {
  const seen = new Set();
  return String(text || "")
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter((x) => {
      const k = x.toLowerCase();
      if (!x || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}
const asText = (list) => (Array.isArray(list) ? list.join(", ") : "");
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB") : "");

// Where to send someone to fill in a fact that's still empty.
const FILL_TARGET = {
  fees: { tab: "record", id: "sch-tuition-from", edit: true },
  location: { tab: "record", id: "sch-area", edit: true },
  curriculum: { tab: "record", id: "sch-curriculum", edit: true },
  year_groups: { tab: "facts", id: "sf-years" },
  inclusion: { tab: "facts", id: "sf-inclusion" },
  subjects: { tab: "facts", id: "sf-boards" },
};

const INCLUSION_CHOICES = [
  ["none", "No formal support"],
  ["limited", "Limited", "Mild needs"],
  ["moderate", "Moderate"],
  ["extensive", "Extensive", "Specialist team"],
];

const STATUS_ICON = { verified: "✓", changed: "!", none: "?", empty: "" };

// Small badge in each card's corner: is this fact checked?
function SourceBadge({ state, row, onClick }) {
  if (state === "empty") return null;
  const text = state === "verified" ? `✓ ${SOURCE_LABEL[row.source]}` : state === "changed" ? "Changed since checked" : "No source yet";
  return (
    <button type="button" className={"sf-badge is-" + state} onClick={onClick} title="See where this came from">
      {text}
    </button>
  );
}

function Card({ eyebrow, title, badge, children, className = "" }) {
  return (
    <section className={"sf-card " + className}>
      <header className="sf-card-head">
        <div>
          <span className="sf-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
        </div>
        {badge}
      </header>
      {children}
    </section>
  );
}

// One button per choice. Clicking the chosen one again clears it.
function Pills({ choices, value, onPick, label }) {
  return (
    <div className="sf-pills" role="group" aria-label={label}>
      {choices.map(([v, l, sub]) => (
        <button
          key={v}
          type="button"
          className={"sf-pill" + (value === v ? " is-on" : "")}
          aria-pressed={value === v}
          onClick={() => onPick(value === v ? null : v)}
        >
          {l}
          {sub && <small>{sub}</small>}
        </button>
      ))}
    </div>
  );
}

function SourceRow({ school, fact, row, state, onSet, onClear, onGo }) {
  const [pasting, setPasting] = useState(false);
  const [kind, setKind] = useState("school_website");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const page = fact.page(school);

  async function save(source, link) {
    setBusy(true);
    const ok = await onSet(fact, source, link);
    setBusy(false);
    if (ok) {
      setPasting(false);
      setUrl("");
    }
  }

  return (
    <li className={"sf-src is-" + state} id={`sf-src-${fact.key}`}>
      <span className="sf-src-icon" aria-hidden="true">
        {STATUS_ICON[state]}
      </span>
      <div className="sf-src-fact">
        <strong>{fact.label}</strong>
        <span>{state === "empty" ? "Not filled in yet" : fact.show(school)}</span>
        {state === "verified" && (
          <span className="sf-src-meta">
            {SOURCE_LABEL[row.source]} · checked {day(row.checked_at)} ·{" "}
            <a href={row.source_url} target="_blank" rel="noreferrer">
              open page ↗
            </a>
          </span>
        )}
        {state === "changed" && (
          <span className="sf-src-meta is-warn">
            Changed after it was checked on the{" "}
            <a href={row.source_url} target="_blank" rel="noreferrer">
              {SOURCE_LABEL[row.source].toLowerCase()} ↗
            </a>
          </span>
        )}
      </div>

      <div className="sf-src-act">
        {state === "empty" && (
          <button type="button" className="sf-btn is-quiet" onClick={() => onGo(FILL_TARGET[fact.key])}>
            Fill this in
          </button>
        )}
        {state === "verified" && (
          <button type="button" className="sf-text-btn" disabled={busy} onClick={() => onClear(fact)}>
            Remove source
          </button>
        )}
        {state === "changed" && !pasting && (
          <>
            <button type="button" className="sf-btn is-main" disabled={busy} onClick={() => save(row.source, row.source_url)}>
              Still matches that page
            </button>
            <button type="button" className="sf-text-btn" onClick={() => setPasting(true)}>
              Different page
            </button>
          </>
        )}
        {state === "none" && !pasting && (
          <>
            {isLink(page) && (
              <button type="button" className="sf-btn is-main" disabled={busy} onClick={() => save("school_website", page)} title={page}>
                From the school website
              </button>
            )}
            {isLink(school.khda_report_url) && (
              <button type="button" className="sf-btn" disabled={busy} onClick={() => save("khda", school.khda_report_url)}>
                From the KHDA report
              </button>
            )}
            <button type="button" className="sf-text-btn" onClick={() => setPasting(true)}>
              Paste a link
            </button>
          </>
        )}
      </div>

      {pasting && (
        <form
          className="sf-paste"
          onSubmit={(e) => {
            e.preventDefault();
            if (isLink(url)) save(kind, url.trim());
          }}
        >
          <select className="sf-input sf-paste-kind" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Where it came from">
            <option value="school_website">School website</option>
            <option value="khda">KHDA report</option>
          </select>
          <input className="sf-input" type="url" autoFocus placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="submit" className="sf-btn is-main" disabled={busy || !isLink(url)}>
            Save
          </button>
          <button type="button" className="sf-text-btn" onClick={() => setPasting(false)}>
            Cancel
          </button>
        </form>
      )}
    </li>
  );
}

export default function SchoolFactsTab({ school, sources, onSchoolChange, onSourcesChange, onGo }) {
  const [error, setError] = useState("");
  const dubai = isDubai(school);
  const khdaApplies = dubai || !school.emirate;

  async function save(patch) {
    try {
      await updateSchool(school.id, patch);
      onSchoolChange(patch);
      setError("");
      return true;
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that."));
      return false;
    }
  }

  async function setSource(fact, source, sourceUrl) {
    try {
      const row = await setFactSource({ schoolId: school.id, fact: fact.key, source, sourceUrl, checkedValue: fact.snap(school) });
      onSourcesChange((all) => [...all.filter((r) => !(r.school_id === school.id && r.fact === fact.key)), row]);
      setError("");
      return true;
    } catch (err) {
      setError(friendlyError(err, "Couldn't save the source. Has addendum 166 been run?"));
      return false;
    }
  }

  async function clearSource(fact) {
    try {
      await clearFactSource(school.id, fact.key);
      onSourcesChange((all) => all.filter((r) => !(r.school_id === school.id && r.fact === fact.key)));
    } catch (err) {
      setError(friendlyError(err, "Couldn't remove the source."));
    }
  }

  const state = Object.fromEntries(FACTS.map((f) => [f.key, factState(school, sources, f.key)]));
  const total = FACTS.length + (dubai ? 1 : 0);
  const checked = FACTS.filter((f) => state[f.key] === "verified").length + (dubai && khdaVerified(school) ? 1 : 0);
  const pct = Math.round((checked / total) * 100);
  const badge = (key) => <SourceBadge state={state[key]} row={sources?.[key]} onClick={() => onGo({ tab: "facts", id: `sf-src-${key}` })} />;
  const stage = stageOf(school);

  return (
    <div className="sf">
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <section className="sf-hero">
        <div className="sf-hero-text">
          <span className="sf-eyebrow">Used for suggested schools</span>
          <h2>Facts and where they come from</h2>
          <p>Suggestions only count a fact once it has been checked on the school's own website or its KHDA report.</p>
        </div>
        <div className="sf-meter" aria-label={`${checked} of ${total} facts checked`}>
          <div className="sf-meter-num">
            <strong>{checked}</strong>
            <span>of {total} checked</span>
          </div>
          <div className="sf-meter-bar">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      </section>

      <section className="sf-card sf-sources">
        <header className="sf-card-head">
          <div>
            <span className="sf-eyebrow">Sources</span>
            <h3>Where these facts come from</h3>
          </div>
        </header>
        <p className="sf-hint">Open the page, check the fact matches, then click where it came from.</p>
        <ul className="sf-src-list">
          {FACTS.map((f) => (
            <SourceRow
              key={f.key}
              school={school}
              fact={f}
              row={sources?.[f.key]}
              state={state[f.key]}
              onSet={setSource}
              onClear={clearSource}
              onGo={onGo}
            />
          ))}
          {dubai && (
            <li className={"sf-src " + (khdaVerified(school) ? "is-verified" : school.khda_rating ? "is-none" : "is-empty")} id="sf-src-khda">
              <span className="sf-src-icon" aria-hidden="true">
                {khdaVerified(school) ? "✓" : school.khda_rating ? "?" : ""}
              </span>
              <div className="sf-src-fact">
                <strong>KHDA rating</strong>
                <span>{khdaText(school).replace(/^KHDA /, "") || "Not filled in yet"}</span>
                {khdaVerified(school) && (
                  <span className="sf-src-meta">
                    KHDA report ·{" "}
                    <a href={school.khda_report_url} target="_blank" rel="noreferrer">
                      open report ↗
                    </a>
                  </span>
                )}
              </div>
              <div className="sf-src-act">
                {!khdaVerified(school) && (
                  <button type="button" className="sf-btn is-quiet" onClick={() => onGo({ tab: "facts", id: school.khda_rating ? "sf-khda-link" : "sf-khda" })}>
                    {school.khda_rating ? "Add the report link" : "Fill this in"}
                  </button>
                )}
              </div>
            </li>
          )}
        </ul>
      </section>

      <div className="sf-grid">
        <Card eyebrow="Who the school takes" title="Year groups" badge={badge("year_groups")}>
          <div className="sf-field" id="sf-years">
            <span className="sf-label">Type of school</span>
            <Pills
              label="Type of school"
              choices={STAGE_PRESETS.map(([l]) => [l, l])}
              value={stage}
              onPick={(v) => {
                const hit = STAGE_PRESETS.find(([l]) => l === v);
                save(hit ? { lowest_year_group: hit[1], highest_year_group: hit[2] } : { lowest_year_group: null, highest_year_group: null });
              }}
            />
          </div>
          <div className="sf-field">
            <span className="sf-label">Or set exactly</span>
            <div className="sf-range">
              <select
                className="sf-input"
                aria-label="Youngest year group"
                value={school.lowest_year_group || ""}
                onChange={(e) => save({ lowest_year_group: e.target.value || null })}
              >
                <option value="">Youngest</option>
                {YEAR_GROUPS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span aria-hidden="true">to</span>
              <select
                className="sf-input"
                aria-label="Oldest year group"
                value={school.highest_year_group || ""}
                onChange={(e) => save({ highest_year_group: e.target.value || null })}
              >
                <option value="">Oldest</option>
                {YEAR_GROUPS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {khdaApplies ? (
          <Card
            eyebrow="Dubai inspection"
            title="KHDA rating"
            badge={
              school.khda_rating ? (
                <span className={"sf-badge " + (khdaVerified(school) ? "is-verified" : "is-none")}>
                  {khdaVerified(school) ? "✓ KHDA report" : "Needs the report link"}
                </span>
              ) : null
            }
          >
            <div className="sf-field" id="sf-khda">
              <span className="sf-label">Overall rating</span>
              <Pills label="KHDA overall rating" choices={KHDA_RATINGS} value={school.khda_rating || null} onPick={(v) => save({ khda_rating: v })} />
            </div>
            <div className="sf-two">
              <div className="sf-field">
                <AutosaveField
                  label="Inspection year"
                  value={school.khda_inspection_year || ""}
                  placeholder="e.g. 2024-25"
                  onSave={(v) => save({ khda_inspection_year: (v || "").trim() || null })}
                />
              </div>
              <div className="sf-field sf-grow" id="sf-khda-link">
                <AutosaveField
                  label="Report link"
                  value={school.khda_report_url || ""}
                  placeholder="https://web.khda.gov.ae/..."
                  onSave={(v) => save({ khda_report_url: (v || "").trim() || null })}
                />
              </div>
            </div>
            {school.khda_report_url && !isLink(school.khda_report_url) && (
              <p className="sf-warn">This doesn't look like a web link, so the rating isn't used yet.</p>
            )}
            {!school.emirate && <p className="sf-hint">Only Dubai schools have KHDA inspections. Set the emirate on the School record if this isn't one.</p>}
          </Card>
        ) : (
          <Card eyebrow="Dubai inspection" title="KHDA rating" className="is-muted">
            <p className="sf-hint">KHDA only inspects Dubai schools. This school is in {school.emirate}, so there's nothing to add here.</p>
          </Card>
        )}

        <Card eyebrow="Support for children with SEN" title="Inclusion" badge={badge("inclusion")}>
          <div className="sf-field" id="sf-inclusion">
            <span className="sf-label">Level of support</span>
            <Pills label="Level of support" choices={INCLUSION_CHOICES} value={school.inclusion_level || null} onPick={(v) => save({ inclusion_level: v })} />
          </div>
          <div className="sf-field">
            <AutosaveField
              label="Needs the school supports"
              value={asText(school.inclusion_needs_supported)}
              placeholder="e.g. Dyslexia, ADHD, Autism, Speech and language"
              onSave={(v) => save({ inclusion_needs_supported: toList(v) })}
            />
          </div>
          <AutosaveField
            label="Notes"
            multiline
            rows={2}
            collapsible
            value={school.inclusion_notes || ""}
            placeholder="Learning support team, extra fees, waiting list for support"
            onSave={(v) => save({ inclusion_notes: v })}
          />
        </Card>

        <Card eyebrow="What the school teaches" title="Subjects and exam boards" badge={badge("subjects")}>
          <div className="sf-field" id="sf-boards">
            <AutosaveField
              label="Exam boards"
              value={asText(school.exam_boards)}
              placeholder="e.g. Edexcel, AQA, Cambridge, IB"
              onSave={(v) => save({ exam_boards: toList(v) })}
            />
          </div>
          <div className="sf-field">
            <AutosaveField
              label="GCSE / IGCSE subjects"
              multiline
              rows={2}
              value={asText(school.gcse_subjects)}
              placeholder="e.g. Maths, English, Physics, Biology, Spanish"
              onSave={(v) => save({ gcse_subjects: toList(v) })}
            />
          </div>
          <AutosaveField
            label="A-level subjects"
            multiline
            rows={2}
            value={asText(school.a_level_subjects)}
            placeholder="Leave empty if there is no sixth form"
            onSave={(v) => save({ a_level_subjects: toList(v) })}
          />
          <p className="sf-hint is-small">Separate items with commas.</p>
        </Card>
      </div>
    </div>
  );
}
