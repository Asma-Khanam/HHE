import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useApplicationData } from "../context/ApplicationDataContext";
import { fetchFamilyApplications, fetchFamilyTimetable } from "../lib/timetableData";
import { IconChevronDown } from "./icons";
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
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
}

// Oct 2026 (Heather, Kate Hadley's Ranches offers): the card used to show
// only what staff pushed with "Update family", so an offer saved on the
// application never appeared here. These map each application's own status
// onto the same steps, so the family sees it as soon as staff save it.
const APP_STAGE = {
  submitted: ["applied"],
  assessment_booked: ["applied", "assessment"],
  under_review: ["applied"],
  waitlisted: ["applied", "waitlisted"],
  offer: ["applied", "offer"],
  offer_accepted: ["applied", "placed"],
  rejected: ["applied", "declined"],
};

function fromApplications(apps, schoolById) {
  const out = [];
  apps.forEach((a) => {
    const school = schoolById[a.school_id];
    if (!school) return;
    (APP_STAGE[a.status] || []).forEach((stage) =>
      out.push({
        id: `app-${a.id}-${stage}`,
        school_id: a.school_id,
        child_id: a.child_id,
        stage,
        note: null,
        created_at: stage === "applied" ? a.submitted_at || null : null,
        school,
        fromApplication: true,
      })
    );
  });
  return out;
}

export default function SchoolUpdatesCard() {
  const { familyId, data } = useApplicationData();
  const [rows, setRows] = useState(null);
  // Closed by default so it isn't always in the family's face (Sept 2026).
  const [open, setOpen] = useState(false);

  const childKey = (data?.children || []).map((c) => c.id).join(",");

  useEffect(() => {
    if (!familyId) return;
    let alive = true;
    (async () => {
      const { data: r, error } = await supabase
        .from("family_school_updates")
        .select("id, school_id, child_id, stage, note, created_at, school:schools ( id, name )")
        .eq("family_id", familyId)
        .order("created_at", { ascending: true });
      const manual = error ? [] : r || [];

      let fromApps = [];
      try {
        const childIds = childKey ? childKey.split(",") : [];
        const [{ shortlist }, apps] = await Promise.all([
          fetchFamilyTimetable(familyId),
          fetchFamilyApplications(childIds),
        ]);
        const schoolById = {};
        (shortlist || []).forEach((row) => {
          if (row.school) schoolById[row.school_id] = { id: row.school_id, name: row.school.name };
        });
        fromApps = fromApplications(apps, schoolById);
      } catch {
        fromApps = [];
      }

      // Keep a staff-pushed update when there is one for the same school,
      // child and step; otherwise the application's own status fills in.
      const seen = new Set(manual.map((u) => `${u.school_id}|${u.child_id || ""}|${u.stage}`));
      const extra = fromApps.filter((u) => !seen.has(`${u.school_id}|${u.child_id || ""}|${u.stage}`));
      if (alive) setRows([...manual, ...extra]);
    })();
    return () => {
      alive = false;
    };
  }, [familyId, childKey]);

  if (!rows) return null;

  const childName = (id) => (data?.children || []).find((c) => c.id === id)?.first_name || "";

  // Group by school, newest activity first.
  const bySchool = {};
  rows.forEach((u) => {
    (bySchool[u.school_id] = bySchool[u.school_id] || { school: u.school, updates: [] }).updates.push(u);
  });
  const stamp = (u) => (u.created_at ? new Date(u.created_at).getTime() : 0);
  const schools = Object.values(bySchool).sort(
    (a, b) => Math.max(...b.updates.map(stamp)) - Math.max(...a.updates.map(stamp))
  );

  const newest = schools[0];

  return (
    <section className={"dash-card su-card" + (open ? " is-open" : "")}>
      <div className="dash-card-head">
        <button type="button" className="su-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <h2>School updates</h2>
          {schools.length > 0 && <span className="dash-count">{schools.length}</span>}
          {!open && newest && (
            <span className="su-peek">
              Latest: {newest.school?.name || "School"} — {STAGE_LABEL[newest.updates.at(-1).stage]}
            </span>
          )}
          <span className="su-caret">
            <IconChevronDown size={18} />
          </span>
        </button>
      </div>

      {!open ? null : schools.length === 0 ? (
        <p className="su-empty">Your consultant will post updates here as each school moves along.</p>
      ) : (
        <ul className="su-list">
          {schools.map(({ school, updates }) => {
            const latestOf = (stage) => [...updates].reverse().find((u) => u.stage === stage);
            const outcome = [...updates].reverse().find((u) => OUTCOMES[u.stage]);
            const dated = updates.filter((u) => u.created_at);
            const latest = dated.length ? dated.at(-1) : updates.at(-1);
            // Per-child lines for outcomes that came from the application
            // itself (e.g. "Amaya — Offer received").
            const childLines = updates.filter((u) => u.fromApplication && OUTCOMES[u.stage]);
            return (
              <li className="su-school" key={school?.id || latest.id}>
                <div className="su-school-head">
                  <strong>{school?.name || "School"}</strong>
                  {latest.created_at && <span className="su-school-when">Updated {shortDate(latest.created_at)}</span>}
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

                {childLines.length > 0 && (
                  <p className="su-latest">
                    {childLines.map((u, i) => (
                      <span key={u.id}>
                        {i > 0 && " · "}
                        {childName(u.child_id) ? `${childName(u.child_id)} — ` : ""}
                        {OUTCOMES[u.stage].label}
                      </span>
                    ))}
                  </p>
                )}

                {latest.note && (
                <p className="su-latest">
                  <span className="su-latest-tag">{STAGE_LABEL[latest.stage]}</span>
                  {latest.child_id && childName(latest.child_id) && (
                    <span className="su-latest-child">{childName(latest.child_id)}</span>
                  )}
                  {latest.note}
                </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
