import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listFamilies, shortId, getCurrentStaff, friendlyError } from "../lib/staffData";
import { PIPELINE_STAGES, stageIndex, stageLabel, isOverdue } from "../lib/workflow";
import { packageLabel } from "../data/packages";
import "./FamiliesListPage.css";

// The six-segment progress bar from the reference's Caseload table — filled
// up to and including the family's current stage.
export function StageDots({ stage }) {
  const current = stageIndex(stage);
  return (
    <span className="stage-dots" title={stageLabel(stage)}>
      {PIPELINE_STAGES.map((s, i) => (
        <span key={s.key} className={"stage-dot" + (i <= current ? " is-filled" : "") + (i === current ? " is-current" : "")} />
      ))}
    </span>
  );
}

// BUD-05 (September 2026 change request): "Any answer other than 'No thank
// you' should flag on the family record so our team follows it up." — kept
// visible on the caseload table itself, not just on the family's own page,
// so nobody has to open every record to find who asked for guidance.
function wantsCostGuidanceFollowup(family) {
  const v = (family.cost_guidance_response || "").trim();
  return v !== "" && v !== "No thank you";
}

export default function FamiliesListPage() {
  const navigate = useNavigate();
  const [families, setFamilies] = useState(null); // null = loading
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  useEffect(() => {
    getCurrentStaff().then(setMe).catch(() => {});
    listFamilies()
      .then(setFamilies)
      .catch((err) => setError(friendlyError(err, "Couldn't load families.")));
  }, []);

  const counts = useMemo(() => {
    const list = families || [];
    return {
      all: list.length,
      mine: list.filter((f) => me && f.owner_staff_id === me.user_id).length,
      placed: list.filter((f) => f.pipeline_stage === "placed").length,
    };
  }, [families, me]);

  const filtered = useMemo(() => {
    if (!families) return [];
    let list = families;
    if (tab === "mine") list = list.filter((f) => me && f.owner_staff_id === me.user_id);
    if (tab === "placed") list = list.filter((f) => f.pipeline_stage === "placed");

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (f) =>
        f.displayName.toLowerCase().includes(q) ||
        shortId(f.id).toLowerCase().includes(q.replace(/\s/g, "")) ||
        f.childLabels.join(" ").toLowerCase().includes(q) ||
        (f.destination || "").toLowerCase().includes(q)
    );
  }, [families, search, tab, me]);

  const TABS = [
    { key: "all", label: `All families (${counts.all})` },
    { key: "mine", label: `Mine (${counts.mine})` },
    { key: "placed", label: `Placed (${counts.placed})` },
  ];

  return (
    <div className="families-page">
      <div className="families-page-header">
        <div>
          <h1>Caseload</h1>
          <p className="families-page-subtitle">
            {families ? `${families.length} famil${families.length === 1 ? "y" : "ies"}` : "Loading…"} · one record
            drives everything
          </p>
        </div>
        <input
          type="text"
          className="families-search"
          placeholder="Search name, ID, child or destination…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <div className="families-toolbar">
        <div className="families-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={"families-tab" + (tab === t.key ? " is-active" : "")}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="families-stage-legend">
          Stage: {PIPELINE_STAGES.map((s) => s.label).join(" → ")}
        </div>
      </div>

      {families && families.length === 0 && !error && (
        <p className="families-empty-hint">No families have signed up yet — this fills in the moment one does.</p>
      )}

      {families && families.length > 0 && filtered.length === 0 && (
        <p className="families-empty-hint">Nothing matches that.</p>
      )}

      {filtered.length > 0 && (
        <div className="families-table-wrap">
          <table className="families-table">
            <thead>
              <tr>
                <th>Family</th>
                <th>Children</th>
                <th>Destination</th>
                <th>Pipeline stage</th>
                <th>Next action</th>
                <th>Owner</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((family) => (
                <tr key={family.id} onClick={() => navigate(`/staff/families/${family.id}`)}>
                  <td>
                    <div className="families-cell-family">
                      <span className="families-avatar">{family.displayName.charAt(0).toUpperCase()}</span>
                      <span className="families-cell-family-text">
                        <span className="families-table-name">{family.displayName}</span>
                        <span className="families-cell-sub">
                          <code>{shortId(family.id)}</code>
                          {family.membership_type ? ` · ${packageLabel(family.membership_type)}` : ""}
                          {family.origin ? ` · ${family.origin} → ${family.destination || "UAE"}` : ""}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="families-cell-children">
                    {family.childLabels.length ? family.childLabels.join(", ") : <span className="is-muted">None yet</span>}
                  </td>
                  <td>{family.destination || <span className="is-muted">—</span>}</td>
                  <td>
                    <StageDots stage={family.pipeline_stage} />
                  </td>
                  <td className="families-cell-action">
                    {family.nextTask ? (
                      <span className={isOverdue(family.nextTask.due_date) ? "is-overdue" : ""}>
                        {family.nextTask.title}
                      </span>
                    ) : (
                      <span className="is-muted">Nothing scheduled</span>
                    )}
                  </td>
                  <td>
                    <span className="families-owner" title={family.ownerName}>
                      {family.ownerInitial}
                    </span>
                  </td>
                  <td>
                    <span className={"families-badge stage-" + (family.pipeline_stage || "enquiry")}>
                      {stageLabel(family.pipeline_stage)}
                    </span>
                    {wantsCostGuidanceFollowup(family) && (
                      <span className="families-flag-badge" title="Wants cost guidance — follow up">
                        Cost guidance
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="families-table-foot">
            Showing {filtered.length} of {families.length} · click a family to open their record
          </p>
        </div>
      )}
    </div>
  );
}
