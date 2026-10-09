import { useEffect, useState } from "react";
import { updateFamily, listFamilyStageHistory, listShortlistForFamily, listChildApplications, getFamilyAllowance, saveFamilyAllowance, createPayment } from "../lib/staffData";
import { allowanceFor, countUsage } from "../lib/packageUsage";
import PackageMeter from "./PackageMeter";
import { PIPELINE_STAGES, CLIENT_STAGES, clientStageLabel, stageIndex } from "../lib/workflow";
import { PACKAGES, packageLabel } from "../data/packages";
import "./panels.css";
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

  return (
    <section className="panel case-settings">
      <div className="panel-head">
        <h2>
          <CaseIcon />
          Case
        </h2>
        {saved && <span className="panel-saved-note">Saved</span>}
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {open && (
      <div className="case-progress">
        <div className="case-progress-head">
          <label className="panel-field-label">Progress</label>
          <span className="case-auto">updates itself</span>
        </div>
        <div className="case-progress-track" title="Worked out from the School visits and Applications tabs">
          {PIPELINE_STAGES.map((s, i) => {
            const at = stageIndex(values.pipeline_stage);
            return (
              <span
                key={s.key}
                className={"case-progress-step" + (i < at ? " is-done" : i === at ? " is-current" : "")}
              >
                {i < at ? "\u2713 " : ""}
                {s.label}
              </span>
            );
          })}
        </div>
      </div>
      )}

      {(() => {
        const allowance = allowanceFor(values.membership_type, rawOverride);
        const owner = (staff || []).find((m) => m.user_id === values.owner_staff_id);
        const route = [values.origin, values.destination].filter(Boolean).join(" \u2192 ");
        const tag = (used, total) => (total > 0 ? `${Math.min(used, total)}/${total}${used > total ? ` (+${used - total})` : ""}` : null);
        return (
          <button type="button" className={"case-summary" + (open ? " is-open" : "")} onClick={toggleOpen} aria-expanded={open}>
            <span className="case-sum-item">
              <small>Client stage</small>
              {values.client_stage ? clientStageLabel(values.client_stage) : "Not set"}
            </span>
            <span className="case-sum-item">
              <small>Owner</small>
              {owner ? owner.full_name || owner.email : "Unassigned"}
            </span>
            <span className="case-sum-item">
              <small>Package</small>
              {values.membership_type ? packageLabel(values.membership_type) : "Not set"}
            </span>
            {route && (
              <span className="case-sum-item">
                <small>Move</small>
                {route}
              </span>
            )}
            {route && (
              <span className="case-sum-item">
                <small>Moving to Dubai</small>
                {values.planned_move_date
                  ? new Date(values.planned_move_date + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" })
                  : "Not set"}
              </span>
            )}
            {route && (
              <span className="case-sum-item">
                <small>In Dubai from</small>
                {values.dubai_available_from
                  ? new Date(values.dubai_available_from + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                  : "Not set"}
              </span>
            )}
            {usage && allowance?.tours > 0 && (
              <span className="case-sum-item">
                <small>Tours</small>
                {tag(usage.toursUsed, allowance.tours)}
              </span>
            )}
            {usage && allowance?.applications > 0 && (
              <span className="case-sum-item">
                <small>Applications</small>
                {tag(usage.applicationsUsed, allowance.applications)}
              </span>
            )}
            <span className="case-sum-toggle">{open ? "Close" : "Edit"}</span>
          </button>
        );
      })()}

      {open && (
        <>
      <div className="case-group">
        <h3 className="case-group-title">Handling</h3>
        <div className="case-settings-grid case-grid-3">
          <div>
            <label className="panel-field-label">Client stage</label>
            <select
              className="panel-select"
              value={values.client_stage}
              onChange={(e) => save({ client_stage: e.target.value })}
            >
              {!values.client_stage && <option value="">Not set</option>}
              {CLIENT_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="panel-field-hint">
              {values.client_stage === "placed"
                ? "Set to Placed by itself when an offer is accepted or a start date is saved."
                : "Moves to Placed by itself once a child is placed."}
            </p>
          </div>

          <div>
            <label className="panel-field-label">Owner</label>
            <select
              className="panel-select"
              value={values.owner_staff_id}
              onChange={(e) => save({ owner_staff_id: e.target.value })}
            >
              <option value="">Unassigned</option>
              {(staff || []).map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.full_name || s.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="panel-field-label">Package</label>
            <select
              className="panel-select"
              value={values.membership_type}
              onChange={(e) => save({ membership_type: e.target.value })}
            >
              <option value="">Not set</option>
              {PACKAGES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <details className="case-group case-fold">
        <summary className="case-fold-title">
          The move
          <span className="case-fold-hint">
            {[values.origin, values.destination].filter(Boolean).join(" \u2192 ") || "Not filled in"}
          </span>
        </summary>
        <div className="case-settings-grid case-grid-4">
          <div>
            <label className="panel-field-label">Moving from</label>
            <input type="text" placeholder="e.g. UK" {...textProps("origin")} />
          </div>

          <div>
            <label className="panel-field-label">Destination</label>
            <input type="text" placeholder="e.g. Dubai" {...textProps("destination")} />
          </div>

          <div>
            <label className="panel-field-label">Moving to Dubai (planned)</label>
            <input
              type="date"
              {...textProps("planned_move_date")}
              onChange={(e) => save({ planned_move_date: e.target.value })}
            />
          </div>

          <div>
            <label className="panel-field-label">In Dubai from (visit)</label>
            <input
              type="date"
              {...textProps("dubai_available_from")}
              onChange={(e) => save({ dubai_available_from: e.target.value })}
            />
          </div>

          <div>
            <label className="panel-field-label">In Dubai until (visit)</label>
            <input
              type="date"
              {...textProps("dubai_available_until")}
              onChange={(e) => save({ dubai_available_until: e.target.value })}
            />
          </div>
        </div>
      </details>

      {(() => {
        const allowance = allowanceFor(values.membership_type, rawOverride);
        if (!usage) return null;
        return (
          <div className="case-group">
            <h3 className="case-group-title">Package use</h3>
            {allowance ? (
              <div className="case-pkg-meters">
                <PackageMeter label="School tours" used={usage.toursUsed} done={usage.toursDone} total={allowance.tours} />
                <PackageMeter label="Applications" used={usage.applicationsUsed} total={allowance.applications} />
              </div>
            ) : (
              <p className="panel-field-hint">This package doesn&rsquo;t include set tours or applications.</p>
            )}
            <details className="case-fold case-fold-inner">
              <summary className="case-fold-title">Adjust allowance &amp; top up</summary>
            <div className="case-grid-4 case-settings-grid case-pkg-override">
              <div>
                <label className="panel-field-label">Tours included (this family)</label>
                <input
                  type="number"
                  min="0"
                  className="panel-input"
                  placeholder="Package default"
                  value={override.tours}
                  onChange={(e) => setOverride((o) => ({ ...o, tours: e.target.value }))}
                  onBlur={() => saveOverride(override)}
                />
              </div>
              <div>
                <label className="panel-field-label">Applications included (this family)</label>
                <input
                  type="number"
                  min="0"
                  className="panel-input"
                  placeholder="Package default"
                  value={override.applications}
                  onChange={(e) => setOverride((o) => ({ ...o, applications: e.target.value }))}
                  onBlur={() => saveOverride(override)}
                />
              </div>
            </div>
            <p className="panel-field-hint">Leave empty to use the package&rsquo;s own numbers. Families see this on their dashboard.</p>

            {allowance?.applications > 0 && (
              <div className="case-topup">
                <label className="panel-field-label">
                  Top up applications
                  {usage && usage.applicationsUsed >= allowance.applications && (
                    <span className="case-topup-flag"> · all included applications used</span>
                  )}
                </label>
                <div className="case-topup-row">
                  <input
                    type="number"
                    min="1"
                    className="panel-input"
                    aria-label="Extra applications"
                    value={topUp.count}
                    onChange={(e) => setTopUp((t) => ({ ...t, count: e.target.value }))}
                  />
                  <span className="case-topup-x">extra at AED</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="panel-input"
                    placeholder="Price each"
                    aria-label="Price per extra application"
                    value={topUp.price}
                    onChange={(e) => setTopUp((t) => ({ ...t, price: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="panel-btn panel-btn-primary"
                    disabled={topUpBusy}
                    onClick={() => addTopUp(allowance.applications)}
                  >
                    {topUpBusy ? "Adding…" : "Add top-up"}
                  </button>
                </div>
                {topUpDone && <p className="panel-field-hint">{topUpDone}</p>}
                <p className="panel-field-hint">
                  Adds an unpaid line to the Invoices tab and raises their application allowance by the same number.
                </p>
              </div>
            )}
            </details>
          </div>
        );
      })()}

      {open && history.length > 0 && (
        <div className="case-journey">
          <span className="case-journey-label">Journey</span>
          {history.map((h, i) => (
            <span key={h.id} className="case-journey-step">
              {i > 0 && <span className="case-journey-arrow">→</span>}
              <strong>{clientStageLabel(h.to_stage)}</strong>
              <span className="case-journey-date">
                {i === 0 ? "came in " : ""}
                {new Date(h.moved_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </span>
          ))}
        </div>
      )}
        </>
      )}
    </section>
  );
}
