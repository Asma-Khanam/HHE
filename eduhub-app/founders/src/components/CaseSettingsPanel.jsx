import { useEffect, useState } from "react";
import { updateFamily, listFamilyStageHistory, listShortlistForFamily, listChildApplications, getFamilyAllowance, saveFamilyAllowance, createPayment } from "../lib/staffData";
import { allowanceFor, countUsage } from "../lib/packageUsage";
import PackageMeter from "./PackageMeter";
import { PIPELINE_STAGES, CLIENT_STAGES, clientStageLabel, stageIndex } from "../lib/workflow";
import { PACKAGES, packageLabel } from "../data/packages";
import "./panels.css";
import "./CaseSettingsPanel.css";
import { CaseIcon } from "./icons";
import NumberStepper from "./NumberStepper";

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
  // The card is a one-line summary by default; "Edit details" opens the lot.
  // The choice is remembered so it doesn't keep re-opening.
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("hh_case_open") === "1";
    } catch {
      return false;
    }
  });
  function toggleOpen() {
    setOpen((o) => {
      try {
        localStorage.setItem("hh_case_open", o ? "0" : "1");
      } catch {
        /* storage unavailable -- fine */
      }
      return !o;
    });
  }
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
  const route = [values.origin, values.destination].filter(Boolean).join(" → ");
  const atIndex = stageIndex(values.pipeline_stage);
  const stageCount = PIPELINE_STAGES.length;
  const progressPct = stageCount > 1 ? (atIndex / (stageCount - 1)) * 100 : 0;
  const tag = (used, total) => (total > 0 ? `${Math.min(used, total)} / ${total}${used > total ? ` (+${used - total})` : ""}` : null);
  const fmtMonth = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "");
  const fmtDay = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

  const ic = (path) => (
    <svg className="cv-chip-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
  const iconFor = {
    stage: ic(<path d="M3 12l5 5L21 4" />),
    owner: ic(<><circle cx="12" cy="7" r="4"/><path d="M4 21v-1a7 7 0 0 1 16 0v1"/></>),
    pkg: ic(<><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 7l9-5 9 5"/></>),
    move: ic(<path d="M4 12h16M14 6l6 6-6 6"/>),
    cal: ic(<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>),
    visit: ic(<><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="3"/></>),
    tours: ic(<path d="M4 7h16M4 12h16M4 17h10"/>),
    apps: ic(<><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></>),
  };

  const chips = [
    { label: "Client stage", value: values.client_stage ? clientStageLabel(values.client_stage) : "Not set", muted: !values.client_stage, icon: iconFor.stage },
    { label: "Owner", value: owner ? owner.full_name || owner.email : "Unassigned", muted: !owner, icon: iconFor.owner },
    { label: "Package", value: values.membership_type ? packageLabel(values.membership_type) : "Not set", muted: !values.membership_type, icon: iconFor.pkg },
  ];
  if (route) {
    chips.push({ label: "Move", value: route, icon: iconFor.move });
    chips.push({ label: "Moving to Dubai", value: values.planned_move_date ? fmtMonth(values.planned_move_date) : "Not set", muted: !values.planned_move_date, icon: iconFor.cal });
    chips.push({ label: "In Dubai from", value: values.dubai_available_from ? fmtDay(values.dubai_available_from) : "Not set", muted: !values.dubai_available_from, icon: iconFor.visit });
  }
  if (usage && allowance?.tours > 0) {
    chips.push({ label: "Tours", value: tag(usage.toursUsed, allowance.tours), extra: usage.toursUsed > allowance.tours, icon: iconFor.tours });
  }
  if (usage && allowance?.applications > 0) {
    chips.push({ label: "Applications", value: tag(usage.applicationsUsed, allowance.applications), extra: usage.applicationsUsed > allowance.applications, icon: iconFor.apps });
  }

  return (
    <CaseCardBody
      saved={saved} error={error} open={open} toggleOpen={toggleOpen}
      atIndex={atIndex} progressPct={progressPct} chips={chips}
      allowance={allowance} usage={usage} override={override} rawOverride={rawOverride}
      saveOverride={saveOverride}
      values={values} save={save} staff={staff} textProps={textProps}
      topUp={topUp} setTopUp={setTopUp} topUpBusy={topUpBusy} topUpDone={topUpDone} addTopUp={addTopUp}
      history={history} setOverride={setOverride}
    />
  );
}


function CaseCardBody({
  saved, error, open, toggleOpen, atIndex, progressPct,
  chips, allowance, usage, override, setOverride, rawOverride, saveOverride,
  values, save, staff, textProps,
  topUp, setTopUp, topUpBusy, topUpDone, addTopUp, history,
}) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  return (
    <section className="panel case-v2">
      <header className="cv-head">
        <div className="cv-brand">
          <span className="cv-brand-icon" aria-hidden="true"><CaseIcon /></span>
          <div>
            <h2 className="cv-brand-title">Case</h2>
            <small className="cv-brand-sub">Working file</small>
          </div>
        </div>

        <div className="cv-progress" title="Worked out from the School visits and Applications tabs">
          <div className="cv-progress-bar">
            <div className="cv-progress-fill" style={{ width: progressPct + "%" }} />
            <div className="cv-progress-dots">
              {PIPELINE_STAGES.map((s, i) => (
                <span key={s.key} className={"cv-progress-dot" + (i < atIndex ? " is-done" : i === atIndex ? " is-current" : "")} />
              ))}
            </div>
          </div>
          <div className="cv-progress-labels">
            {PIPELINE_STAGES.map((s, i) => (
              <span key={s.key} className={"cv-progress-label" + (i < atIndex ? " is-done" : i === atIndex ? " is-current" : "")}>{s.label}</span>
            ))}
          </div>
        </div>

        <div className="cv-head-right">
          {saved && <span className="cv-saved">Saved</span>}
          <button type="button" className="cv-edit" onClick={toggleOpen} aria-expanded={open}>
            {open ? "Close" : "Edit"}
          </button>
        </div>
      </header>

      {error && <div className="cv-error">{error}</div>}

      <div className="cv-summary">
        {chips.map((c) => (
          <div className="cv-chip" key={c.label}>
            <span className="cv-chip-label">{c.icon}{c.label}</span>
            <span className={"cv-chip-value" + (c.muted ? " is-muted" : "") + (c.extra ? " has-extra" : "")}>{c.value || "—"}</span>
          </div>
        ))}
      </div>

      {open && (
        <div className="cv-body">
          <section className="cv-section">
            <h3 className="cv-section-title">Handling</h3>
            <div className="cv-grid">
              <div className="cv-field">
                <label>Client stage</label>
                <select value={values.client_stage} onChange={(e) => save({ client_stage: e.target.value })}>
                  {!values.client_stage && <option value="">Not set</option>}
                  {CLIENT_STAGES.map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}
                </select>
                <p className="cv-field-hint">Moves to Placed by itself once a child is placed.</p>
              </div>
              <div className="cv-field">
                <label>Owner</label>
                <select value={values.owner_staff_id} onChange={(e) => save({ owner_staff_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {(staff || []).map((s) => (<option key={s.user_id} value={s.user_id}>{s.full_name || s.email}</option>))}
                </select>
              </div>
              <div className="cv-field">
                <label>Package</label>
                <select value={values.membership_type} onChange={(e) => save({ membership_type: e.target.value })}>
                  <option value="">Not set</option>
                  {PACKAGES.map((p) => (<option key={p.key} value={p.key}>{p.label}</option>))}
                </select>
              </div>
            </div>
          </section>

          <section className="cv-section">
            <h3 className="cv-section-title">The move</h3>
            <div className="cv-grid cv-grid-4">
              <div className="cv-field">
                <label>Moving from</label>
                <input type="text" placeholder="e.g. UK" {...textProps("origin")} />
              </div>
              <div className="cv-field">
                <label>Destination</label>
                <input type="text" placeholder="e.g. Dubai" {...textProps("destination")} />
              </div>
              <div className="cv-field">
                <label>Moving to Dubai (planned)</label>
                <input type="date" {...textProps("planned_move_date")} onChange={(e) => save({ planned_move_date: e.target.value })} />
              </div>
              <div className="cv-field">
                <label>In Dubai from (visit)</label>
                <input type="date" {...textProps("dubai_available_from")} onChange={(e) => save({ dubai_available_from: e.target.value })} />
              </div>
              <div className="cv-field">
                <label>In Dubai until (visit)</label>
                <input type="date" {...textProps("dubai_available_until")} onChange={(e) => save({ dubai_available_until: e.target.value })} />
              </div>
            </div>
          </section>

          {usage && (
            <section className="cv-section">
              <h3 className="cv-section-title">Package use</h3>
              {allowance ? (
                <>
                  <div className="cv-package-grid">
                    <PackageMeter label="School tours" used={usage.toursUsed} done={usage.toursDone} total={allowance.tours} />
                    <PackageMeter label="Applications" used={usage.applicationsUsed} total={allowance.applications} />
                  </div>
                  <div className="cv-package-foot">
                    <button type="button" className="cv-ghost-btn" aria-expanded={adjustOpen} onClick={() => setAdjustOpen((v) => !v)}>
                      {adjustOpen ? "Hide allowance & top-up" : "Adjust allowance & top up"}
                    </button>
                  </div>
                  {adjustOpen && (
                    <div className="cv-adjust">
                      <div className="cv-adjust-row">
                        <div className="cv-field">
                          <label>Tours included (this family)</label>
                          <NumberStepper
                            value={override.tours}
                            onChange={(v) => setOverride({ ...override, tours: v })}
                            onCommit={() => saveOverride({ ...override })}
                            width={110}
                            ariaLabel="Tours included"
                          />
                        </div>
                        <div className="cv-field">
                          <label>Applications included (this family)</label>
                          <NumberStepper
                            value={override.applications}
                            onChange={(v) => setOverride({ ...override, applications: v })}
                            onCommit={() => saveOverride({ ...override })}
                            width={110}
                            ariaLabel="Applications included"
                          />
                        </div>
                      </div>
                      <p className="cv-field-hint">Leave empty to use the package's own numbers. Families see this on their dashboard.</p>

                      {allowance?.applications > 0 && (
                        <>
                          <div className="cv-adjust-row">
                            <div className="cv-field">
                              <label>
                                Top up applications
                                {usage.applicationsUsed >= allowance.applications && (
                                  <span className="cv-topup-flag">· all included used</span>
                                )}
                              </label>
                              <NumberStepper
                                value={topUp.count}
                                onChange={(v) => setTopUp((t) => ({ ...t, count: v }))}
                                min={1}
                                width={110}
                                ariaLabel="Extra applications"
                              />
                            </div>
                            <span className="cv-adjust-sep">extra at AED</span>
                            <div className="cv-field">
                              <label>Price each</label>
                              <input
                                type="number" min="0" step="0.01" className="panel-input"
                                placeholder="e.g. 500" aria-label="Price per extra application"
                                value={topUp.price}
                                onChange={(e) => setTopUp((t) => ({ ...t, price: e.target.value }))}
                              />
                            </div>
                            <button type="button" className="panel-btn panel-btn-primary" disabled={topUpBusy} onClick={() => addTopUp(allowance.applications)}>
                              {topUpBusy ? "Adding…" : "Add top-up"}
                            </button>
                          </div>
                          {topUpDone && <p className="cv-field-hint">{topUpDone}</p>}
                          <p className="cv-field-hint">Adds an unpaid line to the Invoices tab and raises the family's application allowance by the same number.</p>
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="cv-field-hint">This package doesn't include set tours or applications.</p>
              )}
            </section>
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
        </div>
      )}
    </section>
  );
}

