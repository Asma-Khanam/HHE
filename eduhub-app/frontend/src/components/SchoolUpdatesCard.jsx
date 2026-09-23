import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useApplicationData } from "../context/ApplicationDataContext";
import "./SchoolUpdatesCard.css";

// School updates (September 2026) -- what the consultant has told the
// family, per school, as a horizontal timeline. Each step lights up only
// when the consultant presses "Update family" for it on their side (see
// addendum 74); anything not updated yet stays grey.
const STEPS = [
  { key: "shortlisted", label: "Shortlisted" },
  { key: "toured", label: "Toured" },
  { key: "applied", label: "Application sent" },
  { key: "assessment", label: "Assessment" },
  { key: "outcome", label: "Outcome" },
];

const OUTCOMES = {
  offer: { label: "Offer received", tone: "good" },
  placed: { label: "Place confirmed", tone: "good" },
  waitlisted: { label: "Waitlisted", tone: "wait" },
  declined: { label: "Not successful", tone: "bad" },
  no_place: { label: "No place available", tone: "bad" },
};

const STAGE_LABEL = {
  shortlisted: "Shortlisted",
  toured: "Toured",
  applied: "Application sent",
  assessment: "Assessment",
  ...Object.fromEntries(Object.entries(OUTCOMES).map(([k, v]) => [k, v.label])),
};

function shortDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function SchoolUpdatesCard() {
  const { familyId, data } = useApplicationData();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!familyId) return;
    let alive = true;
    supabase
      .from("family_school_updates")
      .select("id, school_id, child_id, stage, note, created_at, school:schools ( id, name )")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true })
      .then(({ data: r, error }) => alive && setRows(error ? [] : r || []));
    return () => {
      alive = false;
    };
  }, [familyId]);

  if (!rows) return null;

  const childName = (id) => (data?.children || []).find((c) => c.id === id)?.first_name || "";

  // Group by school, newest activity first.
  const bySchool = {};
  rows.forEach((u) => {
    (bySchool[u.school_id] = bySchool[u.school_id] || { school: u.school, updates: [] }).updates.push(u);
  });
  const schools = Object.values(bySchool).sort(
    (a, b) => new Date(b.updates.at(-1).created_at) - new Date(a.updates.at(-1).created_at)
  );

  return (
    <section className="dash-card su-card">
      <div className="dash-card-head">
        <h2>School updates</h2>
        {schools.length > 0 && <span className="dash-count">{schools.length}</span>}
      </div>

      {schools.length === 0 ? (
        <p className="su-empty">Your consultant will post updates here as each school moves along.</p>
      ) : (
        <ul className="su-list">
          {schools.map(({ school, updates }) => {
            const latestOf = (stage) => [...updates].reverse().find((u) => u.stage === stage);
            const outcome = [...updates].reverse().find((u) => OUTCOMES[u.stage]);
            const latest = updates.at(-1);
            return (
              <li className="su-school" key={school?.id || latest.id}>
                <div className="su-school-head">
                  <strong>{school?.name || "School"}</strong>
                  <span className="su-school-when">Updated {shortDate(latest.created_at)}</span>
                </div>

                <ol className="su-track">
                  {STEPS.map((step) => {
                    const hit = step.key === "outcome" ? outcome : latestOf(step.key);
                    const meta = step.key === "outcome" && outcome ? OUTCOMES[outcome.stage] : null;
                    const tone = hit ? meta?.tone || "good" : "off";
                    return (
                      <li key={step.key} className={"su-step is-" + tone}>
                        <span className="su-dot" aria-hidden="true">
                          {hit ? (tone === "bad" ? "✕" : "✓") : ""}
                        </span>
                        <span className="su-step-label">{meta ? meta.label : step.label}</span>
                        <span className="su-step-date">{hit ? shortDate(hit.created_at) : ""}</span>
                      </li>
                    );
                  })}
                </ol>

                <p className="su-latest">
                  <span className="su-latest-tag">{STAGE_LABEL[latest.stage]}</span>
                  {latest.child_id && childName(latest.child_id) && (
                    <span className="su-latest-child">{childName(latest.child_id)}</span>
                  )}
                  {latest.note}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
