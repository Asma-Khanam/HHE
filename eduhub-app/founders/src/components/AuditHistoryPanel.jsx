import { useEffect, useState } from "react";
import { listAuditLog, friendlyError } from "../lib/staffData";
import "./panels.css";
import "./AuditHistoryPanel.css";

const TABLE_LABELS = {
  parents: "Parent",
  children: "Child",
  current_schools: "Current school",
  families: "Family",
};

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function shortValue(v) {
  if (v === null || v === undefined || v === "") return "—";
  return v.length > 80 ? `${v.slice(0, 80)}…` : v;
}

// The "version history typpa thing" from Heather's September 2026 change
// request — every edit a founder makes to a family's own answers
// (RecordFieldsEditor, addendum 33), newest first, who made it and what
// changed. Read-only: there is deliberately no way to revert from here —
// see the correction itself in RecordFieldsEditor if a change needs undoing.
export default function AuditHistoryPanel({ familyId, version }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAuditLog(familyId)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyError(err, "Couldn't load the change history."));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, version]);

  const visible = expanded ? entries : (entries || []).slice(0, 6);

  return (
    <section className="panel family-detail-card">
      <div className="panel-head">
        <h2>Change history</h2>
        {entries && entries.length > 0 && <span className="panel-count">{entries.length}</span>}
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {!error && entries === null && <p className="family-detail-hint">Loading…</p>}

      {!error && entries && entries.length === 0 && (
        <p className="family-detail-hint">No edits have been made to this family's answers yet.</p>
      )}

      {!error && entries && entries.length > 0 && (
        <>
          <ul className="audit-list">
            {visible.map((row) => (
              <li key={row.id} className="audit-row">
                <div className="audit-row-line">
                  <strong>{row.changed_by_name || "Someone"}</strong>
                  <span className="audit-row-what">
                    changed {TABLE_LABELS[row.table_name] || row.table_name}
                    {row.field_label ? ` · ${row.field_label}` : ""}
                  </span>
                  <span className="audit-row-when">{timeAgo(row.changed_at)}</span>
                </div>
                <div className="audit-row-diff">
                  <span className="audit-row-old">{shortValue(row.old_value)}</span>
                  <span className="audit-row-arrow">→</span>
                  <span className="audit-row-new">{shortValue(row.new_value)}</span>
                </div>
              </li>
            ))}
          </ul>
          {entries.length > 6 && (
            <button type="button" className="panel-btn panel-btn-quiet audit-toggle" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show less" : `Show all ${entries.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
