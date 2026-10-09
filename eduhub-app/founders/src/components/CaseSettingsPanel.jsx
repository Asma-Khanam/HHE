import { useEffect, useState } from "react";
import { updateFamily, listFamilyStageHistory, listShortlistForFamily, listChildApplications, getFamilyAllowance, saveFamilyAllowance, createPayment } from "../lib/staffData";
import { allowanceFor, countUsage } from "../lib/packageUsage";
import PackageMeter from "./PackageMeter";
import { PIPELINE_STAGES, CLIENT_STAGES, clientStageLabel, stageIndex } from "../lib/workflow";
import { PACKAGES, packageLabel } from "../data/packages";
import "./panels.css";
import "./CaseSettingsPanel.css";
import { CaseIcon } from "./icons";

// The team's own working columns on a family — stage, who owns it, where
// they're moving from and to, what kind of client they are. None of this is
// the family's data; it's the agency's view of the family, which is why it
// sits in its own bar rather than inside the application record below.
// (Available-in-Dubai dates are the one exception -- the family sets those
// themselves on their own dashboard's "Your move" card; shown and editable
// here too, same as origin/destination already were.)
export default function CaseSettingsPanel({ family, staff, childIds = [], onFamilyChange }) {
  const [values, setValues] = useState({
    pipeline_stage: family.pipeline_stage || "enquiry",
    client_stage: family.client_stage || "",
    owner_staff_id: family.owner_staff_id || "",
    origin: family.origin || "",
    destination: family.destination || "",
    dubai_available_from: family.dubai_available_from || "",
    dubai_available_until: family.dubai_available_until || "",
    planned_move_date: family.planned_move_date || "",
    membership_type: family.membership_type || "",
  });
  // Other parts of the page (the Overview's Dubai dates) edit the same
  // columns -- keep this bar in step with whatever the family row now says.
  useEffect(() => {
    setValues((v) => ({
      ...v,
      origin: family.origin || "",
      destination: family.destination || "",
      dubai_available_from: family.dubai_available_from || "",
      dubai_available_until: family.dubai_available_until || "",
      planned_move_date: family.planned_move_date || "",
    }));
  }, [family.origin, family.destination, family.dubai_available_from, family.dubai_available_until]);
  // Both stages are moved by the database as the family's schools progress
  // (addendum 80) -- follow whatever the family row now says.
  useEffect(() => {
    setValues((v) => ({
      ...v,
      pipeline_stage: family.pipeline_stage || "enquiry",
      client_stage: family.client_stage || "",
    }));
  }, [family.pipeline_stage, family.client_stage]);
  const [history, setHistory] = useState([]);
  useEffect(() => {
    let alive = true;
    listFamilyStageHistory(family.id)
      .then((h) => alive && setHistory(h || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [family.id, family.client_stage]);
  // Package use: tours/applications included vs used, with a per-family
  // override for deals that differ from the package (addendum 91).
  const [usage, setUsage] = useState(null);
  const [override, setOverride] = useState({ tours: "", applications: "" });
  const [rawOverride, setRawOverride] = useState(null);
  const childKey = (childIds || []).join(",");
  useEffect(() => {
    let alive = true;
    Promise.all([
      listShortlistForFamily(family.id).catch(() => []),
      listChildApplications(childKey ? childKey.split(",") : []).catch(() => []),
      getFamilyAllowance(family.id),
    ]).then(([shortlist, applications, ov]) => {
      if (!alive) return;
      setUsage(countUsage({ shortlist, applications }));
      setRawOverride(ov);
      setOverride({ tours: ov?.tours_included ?? "", applications: ov?.applications_included ?? "" });
    });
    return () => {
      alive = false;
    };
  }, [family.id, childKey, values.membership_type]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save(patch) {
    setValues((v) => ({ ...v, ...patch }));
    setError("");
    try {
      const updated = await updateFamily(family.id, patch);
      onFamilyChange?.(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err.message || "Couldn't save that.");
    }
  }

  // Top-up: a family that has used up its included applications can buy more.
  // Adds an unpaid line to the Invoices tab and raises their allowance by the
  // same number, so the meter on their dashboard shows the extra credits.
  const [topUp, setTopUp] = useState({ count: "1", price: "" });
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [topUpDone, setTopUpDone] = useState("");

  async function addTopUp(currentApplications) {
    const count = Math.max(0, parseInt(topUp.count, 10) || 0);
    const price = Number(topUp.price);
    if (!count || !(price > 0)) {
      setError("Enter how many extra applications and the price for each.");
      return;
    }
    setTopUpBusy(true);
    setError("");
    setTopUpDone("");
    try {
      await createPayment({
        familyId: family.id,
        label: `Application top-up: ${count} extra application${count === 1 ? "" : "s"}`,
        amount: count * price,
      });
      const row = await saveFamilyAllowance(family.id, {
        toursIncluded: override.tours,
        applicationsIncluded: (currentApplications || 0) + count,
      });
      setRawOverride(row);
      setOverride((o) => ({ ...o, applications: row.applications_included ?? "" }));
      setTopUp({ count: "1", price: topUp.price });
      setTopUpDone(`Added ${count} extra. It's on the Invoices tab as unpaid.`);
    } catch (err) {
      setError(err.message || "Couldn't add that top-up.");
    } finally {
      setTopUpBusy(false);
    }
  }

  async function saveOverride(next) {
    setOverride(next);
    setError("");
    try {
      const row = await saveFamilyAllowance(family.id, { toursIncluded: next.tours, applicationsIncluded: next.applications });
      setRawOverride(row);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err.message || "Couldn't save that. Has addendum 91 been run?");
    }
  }

  // Free-text fields save when you leave the box, not on every keystroke —
  // no point writing to the database once per letter typed.
  function textProps(key) {
    return {
      className: "panel-input",
      value: values[key],
      onChange: (e) => setValues((v) => ({ ...v, [key]: e.target.value })),
      onBlur: (e) => {
        if ((family[key] || "") !== e.target.value) save({ [key]: e.target.value });
      },
    };
  }

  // Derived once per render.
  const allowance = allowanceFor(values.membership_type, rawOverride);
  const owner = (staff || []).find((m) => m.user_id === values.owner_staff_id);
  const atIndex = stageIndex(values.pipeline_stage);
  const stageCount = PIPELINE_STAGES.length;
  const progressPct = stageCount > 1 ? (atIndex / (stageCount - 1)) * 100 : 0;
  const fmtMonth = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "");
  const fmtDay = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
  const tagRatio = (used, total) => (total > 0 ? `${Math.min(used, total)} / ${total}${used > total ? ` (+${used - total})` : ""}` : null);

  return (
    <CaseCardBody
      saved={saved} error={error}
      atIndex={atIndex} progressPct={progressPct}
      allowance={allowance} usage={usage} owner={owner}
      values={values} save={save}
      override={override} setOverride={setOverride} saveOverride={saveOverride}
      staff={staff}
      topUp={topUp} setTopUp={setTopUp} topUpBusy={topUpBusy} topUpDone={topUpDone} addTopUp={addTopUp}
      history={history}
      fmtMonth={fmtMonth} fmtDay={fmtDay} tagRatio={tagRatio}
    />
  );
}


// Little icon helper — tiny line icons for the field labels.
const ic = (path) => (
  <svg className="cv-field-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);
const CV_ICON = {
  stage: ic(<path d="M3 12l5 5L21 4" />),
  owner: ic(<><circle cx="12" cy="7" r="4"/><path d="M4 21v-1a7 7 0 0 1 16 0v1"/></>),
  pkg: ic(<><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 7l9-5 9 5"/></>),
  moveFrom: ic(<><path d="M20 12H4" /><path d="M10 6l-6 6 6 6" /></>),
  dest: ic(<path d="M4 12h16M14 6l6 6-6 6"/>),
  cal: ic(<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>),
  visit: ic(<><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="3"/></>),
  tours: ic(<path d="M4 7h16M4 12h16M4 17h10"/>),
  apps: ic(<><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></>),
};

// Chip-field: label + value in display mode, with an invisible native
// control sitting over it so clicking opens the picker in place. For
// text fields the input becomes visible on focus; for selects the native
// dropdown appears over the chip.
function FieldSelect({ label, icon, value, display, muted, onChange, children }) {
  return (
    <div className="cv-field has-select">
      <span className="cv-field-label">{icon}{label}</span>
      <select className="cv-field-select" value={value || ""} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {children}
      </select>
      <span className={"cv-field-value" + (muted ? " is-muted" : "")}>{display || "—"}</span>
    </div>
  );
}

function FieldText({ label, icon, value, display, placeholder, muted, onChange, onCommit }) {
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);
  return (
    <div className="cv-field has-text">
      <span className="cv-field-label">{icon}{label}</span>
      <input
        className="cv-field-input"
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (value || "")) onCommit(draft); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        aria-label={label}
      />
      <span className={"cv-field-value" + (muted ? " is-muted" : "")}>{display || "—"}</span>
    </div>
  );
}

function FieldDate({ label, icon, value, display, muted, onChange }) {
  return (
    <div className="cv-field has-date">
      <span className="cv-field-label">{icon}{label}</span>
      <input
        className="cv-field-input"
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label={label}
      />
      <span className={"cv-field-value" + (muted ? " is-muted" : "")}>{display || "—"}</span>
    </div>
  );
}

function FieldStatic({ label, icon, display, extra }) {
  return (
    <div className="cv-field is-readonly">
      <span className="cv-field-label">{icon}{label}</span>
      <span className={"cv-field-value is-static" + (extra ? " has-extra" : "")}>{display || "—"}</span>
    </div>
  );
}

function CaseCardBody({
  saved, error, atIndex, progressPct,
  allowance, usage, owner,
  values, save,
  override, setOverride, saveOverride,
  staff,
  topUp, setTopUp, topUpBusy, topUpDone, addTopUp,
  history,
  fmtMonth, fmtDay, tagRatio,
}) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const toursRatio = usage && allowance?.tours > 0 ? tagRatio(usage.toursUsed, allowance.tours) : null;
  const appsRatio = usage && allowance?.applications > 0 ? tagRatio(usage.applicationsUsed, allowance.applications) : null;

  return (
    <section className="panel case-v2">
      <div className="cv-top">
        <div className="cv-brand">
          <span className="cv-brand-icon" aria-hidden="true"><CaseIcon /></span>
          <div>
            <h2 className="cv-brand-title">Case</h2>
            <small className="cv-brand-sub">Working file</small>
          </div>
        </div>
        <div className="cv-top-spacer" />
        {saved && <span className="cv-saved">Saved</span>}
      </div>

      <div className="cv-progress" title="Worked out from the School visits and Applications tabs">
        <div className="cv-progress-labels">
          {PIPELINE_STAGES.map((s, i) => (
            <span key={s.key} className={"cv-progress-label" + (i < atIndex ? " is-done" : i === atIndex ? " is-current" : "")}>{s.label}</span>
          ))}
        </div>
        <div className="cv-progress-bar">
          <div className="cv-progress-fill" style={{ width: progressPct + "%" }} />
          <div className="cv-progress-dots">
            {PIPELINE_STAGES.map((s, i) => (
              <span key={s.key} className={"cv-progress-dot" + (i < atIndex ? " is-done" : i === atIndex ? " is-current" : "")} />
            ))}
          </div>
        </div>
      </div>

      {error && <div className="cv-error">{error}</div>}

      <div className="cv-grid">
        <FieldSelect
          label="Client stage"
          icon={CV_ICON.stage}
          value={values.client_stage}
          display={values.client_stage ? clientStageLabel(values.client_stage) : "Not set"}
          muted={!values.client_stage}
          onChange={(v) => save({ client_stage: v })}
        >
          {!values.client_stage && <option value="">Not set</option>}
          {CLIENT_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </FieldSelect>

        <FieldSelect
          label="Owner"
          icon={CV_ICON.owner}
          value={values.owner_staff_id}
          display={owner ? owner.full_name || owner.email : "Unassigned"}
          muted={!owner}
          onChange={(v) => save({ owner_staff_id: v })}
        >
          <option value="">Unassigned</option>
          {(staff || []).map((s) => <option key={s.user_id} value={s.user_id}>{s.full_name || s.email}</option>)}
        </FieldSelect>

        <FieldSelect
          label="Package"
          icon={CV_ICON.pkg}
          value={values.membership_type}
          display={values.membership_type ? packageLabel(values.membership_type) : "Not set"}
          muted={!values.membership_type}
          onChange={(v) => save({ membership_type: v })}
        >
          <option value="">Not set</option>
          {PACKAGES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </FieldSelect>

        <FieldText
          label="Moving from"
          icon={CV_ICON.moveFrom}
          value={values.origin}
          display={values.origin}
          placeholder="UK, Lagos, …"
          muted={!values.origin}
          onCommit={(v) => save({ origin: v })}
        />

        <FieldText
          label="Destination"
          icon={CV_ICON.dest}
          value={values.destination}
          display={values.destination}
          placeholder="Dubai"
          muted={!values.destination}
          onCommit={(v) => save({ destination: v })}
        />

        <FieldDate
          label="Moving to Dubai"
          icon={CV_ICON.cal}
          value={values.planned_move_date}
          display={fmtMonth(values.planned_move_date)}
          muted={!values.planned_move_date}
          onChange={(v) => save({ planned_move_date: v })}
        />

        <FieldDate
          label="In Dubai from"
          icon={CV_ICON.visit}
          value={values.dubai_available_from}
          display={fmtDay(values.dubai_available_from)}
          muted={!values.dubai_available_from}
          onChange={(v) => save({ dubai_available_from: v })}
        />

        <FieldDate
          label="In Dubai until"
          icon={CV_ICON.visit}
          value={values.dubai_available_until}
          display={fmtDay(values.dubai_available_until)}
          muted={!values.dubai_available_until}
          onChange={(v) => save({ dubai_available_until: v })}
        />

        {toursRatio && (
          <FieldStatic label="Tours used" icon={CV_ICON.tours} display={toursRatio} extra={usage.toursUsed > allowance.tours} />
        )}
        {appsRatio && (
          <FieldStatic label="Applications used" icon={CV_ICON.apps} display={appsRatio} extra={usage.applicationsUsed > allowance.applications} />
        )}
      </div>

      {usage && (
        <div className="cv-package">
          <div className="cv-package-head">
            <h3 className="cv-package-title">Package use</h3>
            {allowance && (
              <button type="button" className="cv-link" aria-expanded={adjustOpen} onClick={() => setAdjustOpen((v) => !v)}>
                {adjustOpen ? "Done" : "Adjust allowance & top up"}
              </button>
            )}
          </div>
          {allowance ? (
            <div className="cv-package-grid">
              <PackageMeter label="School tours" used={usage.toursUsed} done={usage.toursDone} total={allowance.tours} />
              <PackageMeter label="Applications" used={usage.applicationsUsed} total={allowance.applications} />
            </div>
          ) : (
            <p className="cv-adjust-hint">This package doesn't include set tours or applications.</p>
          )}

          {adjustOpen && allowance && (
            <div className="cv-adjust">
              <div className="cv-adjust-row">
                <div className="cv-adjust-field">
                  <label>Tours included (this family)</label>
                  <input
                    type="number"
                    min="0"
                    className="panel-input"
                    placeholder="Default"
                    value={override.tours}
                    onChange={(e) => setOverride({ ...override, tours: e.target.value })}
                    onBlur={() => saveOverride({ ...override })}
                  />
                </div>
                <div className="cv-adjust-field">
                  <label>Applications included (this family)</label>
                  <input
                    type="number"
                    min="0"
                    className="panel-input"
                    placeholder="Default"
                    value={override.applications}
                    onChange={(e) => setOverride({ ...override, applications: e.target.value })}
                    onBlur={() => saveOverride({ ...override })}
                  />
                </div>
              </div>
              <p className="cv-adjust-hint">Leave empty to use the package's own numbers.</p>

              {allowance?.applications > 0 && (
                <>
                  <div className="cv-adjust-row">
                    <div className="cv-adjust-field">
                      <label>
                        Top up applications
                        {usage.applicationsUsed >= allowance.applications && (
                          <span className="cv-topup-flag">· all included used</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="panel-input"
                        value={topUp.count}
                        onChange={(e) => setTopUp((t) => ({ ...t, count: e.target.value }))}
                        aria-label="Extra applications"
                      />
                    </div>
                    <span className="cv-adjust-sep">extra at AED</span>
                    <div className="cv-adjust-field">
                      <label>Price each</label>
                      <input
                        type="number" min="0" step="0.01" className="panel-input"
                        placeholder="500" aria-label="Price per extra application"
                        value={topUp.price}
                        onChange={(e) => setTopUp((t) => ({ ...t, price: e.target.value }))}
                      />
                    </div>
                    <button type="button" className="panel-btn panel-btn-primary" disabled={topUpBusy} onClick={() => addTopUp(allowance.applications)}>
                      {topUpBusy ? "Adding…" : "Add top-up"}
                    </button>
                  </div>
                  {topUpDone && <p className="cv-adjust-hint">{topUpDone}</p>}
                  <p className="cv-adjust-hint">Adds an unpaid line to the Invoices tab and raises the family's allowance.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="cv-journey">
          <span className="cv-journey-label">Journey</span>
          {history.map((h, i) => (
            <span key={h.id} className={"cv-journey-step" + (i === history.length - 1 ? " is-current" : "")}>
              <strong>{clientStageLabel(h.to_stage)}</strong>
              <span className="cv-journey-date">
                {i === 0 ? "came in " : ""}
                {new Date(h.moved_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

