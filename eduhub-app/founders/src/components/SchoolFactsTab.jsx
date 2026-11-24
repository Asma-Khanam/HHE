import { useState } from "react";
import AutosaveField from "./Autosave";
import { updateSchool, setFactSource, clearFactSource, friendlyError } from "../lib/staffData";
import { YEAR_GROUPS } from "../data/formOptions";
import { STAGE_PRESETS } from "../lib/schoolStages";
import {
  FACTS,
  SOURCE_LABEL,
  INCLUSION_LABEL,
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
  fees: { label: "Fees", tab: "record", id: "sch-tuition-from", edit: true },
  location: { label: "Area", tab: "record", id: "sch-area", edit: true },
  curriculum: { label: "Curriculum", tab: "record", id: "sch-curriculum", edit: true },
  year_groups: { label: "Year groups", tab: "facts", id: "sf-years" },
  inclusion: { label: "Inclusion support", tab: "facts", id: "sf-inclusion" },
  subjects: { label: "Exam boards", tab: "facts", id: "sf-boards" },
};

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
    <li className={"sf-src-row is-" + state} id={`sf-src-${fact.key}`}>
      <div className="sf-src-fact">
        <strong>{fact.label}</strong>
        <span className={state === "empty" ? "sf-muted" : ""}>{state === "empty" ? "Not filled in yet" : fact.show(school)}</span>
      </div>
      <div className="sf-src-state">
        {state === "empty" && (
          <button type="button" className="sf-link" onClick={() => onGo(FILL_TARGET[fact.key])}>
            Fill this in first
          </button>
        )}
        {state === "verified" && (
          <>
            <span className="sf-badge is-ok">✓ {SOURCE_LABEL[row.source]}</span>
            <a className="sf-link" href={row.source_url} target="_blank" rel="noreferrer">
              Open page ↗
            </a>
            <span className="sf-muted">Checked {day(row.checked_at)}</span>
            <button type="button" className="sf-link is-quiet" disabled={busy} onClick={() => onClear(fact)}>
              Remove
            </button>
          </>
        )}
        {state === "changed" && (
          <>
            <span className="sf-badge is-warn">Changed since it was checked</span>
            <a className="sf-link" href={row.source_url} target="_blank" rel="noreferrer">
              {SOURCE_LABEL[row.source]} ↗
            </a>
            <button type="button" className="panel-btn" disabled={busy} onClick={() => save(row.source, row.source_url)}>
              Still matches this page
            </button>
            <button type="button" className="sf-link" onClick={() => setPasting(true)}>
              Different page
            </button>
          </>
        )}
        {state === "none" && !pasting && (
          <>
            <span className="sf-badge is-none">No source yet</span>
            {isLink(page) && (
              <button type="button" className="panel-btn" disabled={busy} onClick={() => save("school_website", page)} title={page}>
                From the school website
              </button>
            )}
            {isLink(school.khda_report_url) && (
              <button type="button" className="panel-btn" disabled={busy} onClick={() => save("khda", school.khda_report_url)}>
                From the KHDA report
              </button>
            )}
            <button type="button" className="sf-link" onClick={() => setPasting(true)}>
              Paste a link
            </button>
          </>
        )}
        {pasting && (
          <form
            className="sf-paste"
            onSubmit={(e) => {
              e.preventDefault();
              if (isLink(url)) save(kind, url.trim());
            }}
          >
            <select className="panel-select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Where it came from">
              <option value="school_website">School website</option>
              <option value="khda">KHDA report</option>
            </select>
            <input
              className="panel-input"
              type="url"
              autoFocus
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button type="submit" className="panel-btn panel-btn-primary" disabled={busy || !isLink(url)}>
              Save
            </button>
            <button type="button" className="sf-link is-quiet" onClick={() => setPasting(false)}>
              Cancel
            </button>
          </form>
        )}
      </div>
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

  const states = FACTS.map((f) => factState(school, sources, f.key));
  const verifiedCount = states.filter((s) => s === "verified").length;
  const filledCount = states.filter((s) => s !== "empty").length;

  return (
    <div className="sf">
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <section className="family-detail-card" id="sf-sources">
        <div className="panel-head">
          <h2>Where these facts come from</h2>
          <span className="sf-count">
            {verifiedCount} of {filledCount} checked
          </span>
        </div>
        <p className="family-detail-hint">
          Suggested schools only uses facts that come from the school's own website or a KHDA inspection report. Check the fact on
          the page, then click where it came from. If a fact is changed later, it needs checking again.
        </p>
        <ul className="sf-src-list">
          {FACTS.map((f, i) => (
            <SourceRow
              key={f.key}
              school={school}
              fact={f}
              row={sources?.[f.key]}
              state={states[i]}
              onSet={setSource}
              onClear={clearSource}
              onGo={onGo}
            />
          ))}
          {dubai && (
            <li className={"sf-src-row " + (khdaVerified(school) ? "is-verified" : school.khda_rating ? "is-none" : "is-empty")}>
              <div className="sf-src-fact">
                <strong>KHDA rating</strong>
                <span className={school.khda_rating ? "" : "sf-muted"}>{khdaText(school) || "Not filled in yet"}</span>
              </div>
              <div className="sf-src-state">
                {khdaVerified(school) ? (
                  <>
                    <span className="sf-badge is-ok">✓ KHDA report</span>
                    <a className="sf-link" href={school.khda_report_url} target="_blank" rel="noreferrer">
                      Open report ↗
                    </a>
                  </>
                ) : (
                  <button type="button" className="sf-link" onClick={() => onGo({ tab: "facts", id: school.khda_rating ? "sf-khda-link" : "sf-khda" })}>
                    {school.khda_rating ? "Add the report link below" : "Fill this in below"}
                  </button>
                )}
              </div>
            </li>
          )}
        </ul>
      </section>

      <section className="family-detail-card" id="sf-years">
        <div className="panel-head">
          <h2>Year groups taken</h2>
        </div>
        <div className="sf-field sf-row">
          <select
            className="panel-select"
            aria-label="Youngest year group"
            value={school.lowest_year_group || ""}
            onChange={(e) => save({ lowest_year_group: e.target.value || null })}
          >
            <option value="">Youngest: not recorded</option>
            {YEAR_GROUPS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <span aria-hidden="true">to</span>
          <select
            className="panel-select"
            aria-label="Oldest year group"
            value={school.highest_year_group || ""}
            onChange={(e) => save({ highest_year_group: e.target.value || null })}
          >
            <option value="">Oldest: not recorded</option>
            {YEAR_GROUPS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="sf-row">
          {STAGE_PRESETS.map(([label, from, to]) => (
            <button key={label} type="button" className="panel-btn" onClick={() => save({ lowest_year_group: from, highest_year_group: to })}>
              {label}
            </button>
          ))}
        </div>
      </section>

      {khdaApplies && (
        <section className="family-detail-card" id="sf-khda">
          <div className="panel-head">
            <h2>KHDA inspection</h2>
          </div>
          <p className="family-detail-hint">
            Copy the overall rating from the school's latest KHDA report and paste the report link. A rating with no link is not used
            by Suggested schools.
            {!school.emirate && " Only Dubai schools have KHDA inspections. Set the emirate on the School record if this isn't a Dubai school."}
          </p>
          <div className="sf-grid">
            <div className="sf-field">
              <label className="rec-field-label" htmlFor="sf-khda-rating">
                Overall rating
              </label>
              <select
                id="sf-khda-rating"
                className="panel-select"
                value={school.khda_rating || ""}
                onChange={(e) => save({ khda_rating: e.target.value || null })}
              >
                <option value="">Not recorded</option>
                {KHDA_RATINGS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="sf-field">
              <AutosaveField
                label="Inspection year"
                value={school.khda_inspection_year || ""}
                placeholder="e.g. 2024-25"
                onSave={(v) => save({ khda_inspection_year: (v || "").trim() || null })}
              />
            </div>
          </div>
          <div className="sf-field" id="sf-khda-link">
            <AutosaveField
              label="Report link"
              value={school.khda_report_url || ""}
              placeholder="https://web.khda.gov.ae/..."
              onSave={(v) => save({ khda_report_url: (v || "").trim() || null })}
            />
            {school.khda_report_url && !isLink(school.khda_report_url) && (
              <p className="sf-warn">This doesn't look like a web link, so the rating won't be used yet.</p>
            )}
          </div>
        </section>
      )}

      <section className="family-detail-card">
        <div className="panel-head">
          <h2>Subjects and exam boards</h2>
        </div>
        <p className="family-detail-hint">Separate items with commas.</p>
        <div className="sf-field" id="sf-boards">
          <AutosaveField
            label="Exam boards"
            value={asText(school.exam_boards)}
            placeholder="e.g. Edexcel, AQA, Cambridge, IB"
            onSave={(v) => save({ exam_boards: toList(v) })}
          />
        </div>
        <AutosaveField
          label="GCSE / IGCSE subjects offered"
          multiline
          rows={3}
          value={asText(school.gcse_subjects)}
          placeholder="e.g. Maths, English, Physics, Chemistry, Biology, Computer Science, Spanish"
          onSave={(v) => save({ gcse_subjects: toList(v) })}
        />
        <AutosaveField
          label="A-level subjects offered"
          multiline
          rows={3}
          value={asText(school.a_level_subjects)}
          placeholder="Leave empty if there is no sixth form"
          onSave={(v) => save({ a_level_subjects: toList(v) })}
        />
      </section>

      <section className="family-detail-card" id="sf-inclusion">
        <div className="panel-head">
          <h2>Inclusion support</h2>
        </div>
        <div className="sf-field">
          <label className="rec-field-label" htmlFor="sf-inclusion-level">
            Level of support
          </label>
          <select
            id="sf-inclusion-level"
            className="panel-select"
            value={school.inclusion_level || ""}
            onChange={(e) => save({ inclusion_level: e.target.value || null })}
          >
            <option value="">Not recorded</option>
            {Object.entries(INCLUSION_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {v === "limited" ? "Limited (mild needs)" : v === "extensive" ? "Extensive (specialist team)" : l}
              </option>
            ))}
          </select>
        </div>
        <AutosaveField
          label="Needs the school supports"
          value={asText(school.inclusion_needs_supported)}
          placeholder="e.g. Dyslexia, ADHD, Autism, Speech and language, Physical access"
          onSave={(v) => save({ inclusion_needs_supported: toList(v) })}
        />
        <AutosaveField
          label="Inclusion notes"
          multiline
          rows={3}
          collapsible
          value={school.inclusion_notes || ""}
          placeholder="Learning support team, extra fees, waiting list for support"
          onSave={(v) => save({ inclusion_notes: v })}
        />
      </section>
    </div>
  );
}
