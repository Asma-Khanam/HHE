import { useEffect, useState } from "react";
import { listFamilyActionRows } from "../lib/staffData";
import { computeFamilyActions } from "../lib/familyActions";
import { isOverdue } from "../lib/workflow";
import "./panels.css";
import "./OverviewPanel.css";

function shortDate(iso) {
  return new Date(String(iso).slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// Everything for us to do on this family, in one list: what the schools and parent
// are waiting on us for (from the School visits tab) plus the family's open tasks.
// Things we are only waiting on (a school or the parent) are not listed.
export default function NeedsAttentionPanel({ familyId, tasks, onGoToVisits }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let alive = true;
    listFamilyActionRows(familyId)
      .then(({ rows, suggestions }) => {
        if (alive) setItems(computeFamilyActions(rows, suggestions)[familyId] || []);
      })
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [familyId]);

  const openTasks = (tasks || []).filter((t) => !t.done_at);
  const total = (items?.length || 0) + openTasks.length;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          Needs attention
          {total > 0 && <span className="ov-attn-count">{total}</span>}
        </h2>
      </div>
      {items === null ? (
        <p className="panel-hint">Loading…</p>
      ) : total === 0 ? (
        <p className="panel-hint">Nothing needs doing right now.</p>
      ) : (
        <ul className="ov-attn">
          {items.map((a) => (
            <li key={a.key}>
              <button type="button" className="ov-attn-row" onClick={onGoToVisits}>
                <span className="ov-attn-tag">School visits</span>
                <span>{a.label}</span>
              </button>
            </li>
          ))}
          {openTasks.map((t) => (
            <li key={t.id}>
              <div className="ov-attn-row is-static">
                <span className="ov-attn-tag">Task</span>
                <span>{t.title}</span>
                {t.due_date && (
                  <span className={"ov-attn-due" + (isOverdue(t.due_date) ? " is-overdue" : "")}>
                    {isOverdue(t.due_date) ? "Overdue · " : "Due "}
                    {shortDate(t.due_date)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
