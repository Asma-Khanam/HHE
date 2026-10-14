import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useApplicationData } from "../context/ApplicationDataContext";
import { fetchFamilyApplications, fetchFamilyTimetable } from "../lib/timetableData";
import { fetchApplicationFees } from "../lib/applicationFees";
import { IconChevronDown } from "./icons";
import { CardError, CardSkeleton } from "./StatePanels";
import "./SchoolUpdatesCard.css";

// School updates (September 2026) -- what the consultant has told the
// family, per school, as a horizontal timeline. Each step lights up only
// when the consultant presses "Update family" for it on their side (see
// addendum 74); anything not updated yet stays grey.
// Realigned 14 Oct 2026 (Miss Lyndsay / Asma): the client-side stage names
// now match the consultant side exactly -- Apply, Fee, Assessment, Outcome,
// Placed -- so staff and families use the same words. Pre-application
// stages (shortlisted, toured) still live on "Your schools"; this timeline
// is the application's own journey, which is what the family cares about.
const STEPS = [
  { key: "applied", label: "Apply" },
  { key: "fee", label: "Fee" },
  { key: "assessment", label: "Assessment" },
  { key: "outcome", label: "Outcome" },
  { key: "placed", label: "Placed" },
];

const OUTCOMES = {
  offer: { label: "Offer received", tone: "good" },
  placed: { label: "Place confirmed", tone: "good" },
  waitlisted: { label: "Waitlisted", tone: "wait" },
  declined: { label: "Not successful", tone: "bad" },
  no_place: { label: "No place available", tone: "bad" },
};

const STAGE_LABEL = {
  applied: "Apply",
  fee: "Fee",
  assessment: "Assessment",
  outcome: "Outcome",
  placed: "Placed",
  // Legacy stage keys still in the database from before the realignment;
  // mapped so old updates still render with a sensible label.
  shortlisted: "Shortlisted",
  toured: "Toured",
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

// Addendum (14 Oct 2026): once a fee on an application is paid, light up
// the Fee step on that application's timeline automatically -- no staff
// click needed.
function fromFees(fees, apps, schoolById) {
  const appById = Object.fromEntries(apps.map((a) => [a.id, a]));
  return fees
    .filter((f) => f.status === "paid" || !!f.paid_at)
    .map((f) => {
      const app = appById[f.application_id];
      if (!app) return null;
      const school = schoolById[app.school_id];
      if (!school) return null;
      return {
        id: `fee-${f.id}`,
        school_id: app.school_id,
        child_id: app.child_id,
        stage: "fee",
        note: null,
        created_at: f.paid_at || null,
        school,
        fromApplication: true,
      };
    })
    .filter(Boolean);
}

export default function SchoolUpdatesCard() {
  const { familyId, data } = useApplicationData();
  const [rows, setRows] = useState(null);
  // Closed by default so it isn't always in the family's face (Sept 2026).
  const [open, setOpen] = useState(false);
  // Which school is expanded to show its full update history (Miss Lyndsay,
  // 12 Oct 2026): one tap on the school opens or closes it. Parents still
  // never see case notes — those are staff-only (addendum 5), nothing on
  // this card leaks any of that; only updates staff explicitly pushed with
  // Update family or application outcomes show here.
  const [openSchoolId, setOpenSchoolId] = useState(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  const childKey = (data?.children || []).map((c) => c.id).join(",");

  useEffect(() => {
    if (!familyId) return;
    let alive = true;
    setFailed(false);
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
        const [{ shortlist }, apps, fees] = await Promise.all([
          fetchFamilyTimetable(familyId),
          fetchFamilyApplications(childIds),
          fetchApplicationFees().catch(() => []),
        ]);
        const schoolById = {};
        (shortlist || []).forEach((row) => {
          if (row.school) schoolById[row.school_id] = { id: row.school_id, name: row.school.name };
        });
        fromApps = [...fromApplications(apps, schoolById), ...fromFees(fees, apps, schoolById)];
      } catch {
        fromApps = [];
      }

      // Keep a staff-pushed update when there is one for the same school,
      // child and step; otherwise the application's own status fills in.
      const seen = new Set(manual.map((u) => `${u.school_id}|${u.child_id || ""}|${u.stage}`));
      const extra = fromApps.filter((u) => !seen.has(`${u.school_id}|${u.child_id || ""}|${u.stage}`));
      if (alive) {
        if (error && !extra.length) setFailed(true);
        else setRows([...manual, ...extra]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [familyId, childKey, retry]);

  if (failed) return <CardError title="School updates" onRetry={() => setRetry((n) => n + 1)} />;
  if (!rows) return <CardSkeleton title="School updates" rows={2} />;

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
            const sid = school?.id || latest.id;
            const schoolOpen = openSchoolId === sid;
            return (
              <li className={"su-school" + (schoolOpen ? " is-open" : "")} key={sid}>
                <button
                  type="button"
                  className="su-school-head su-school-head-btn"
                  onClick={() => setOpenSchoolId(schoolOpen ? null : sid)}
                  aria-expanded={schoolOpen}
                >
                  <strong>{school?.name || "School"}</strong>
                  {latest.created_at && <span className="su-school-when">Updated {shortDate(latest.created_at)}</span>}
                  <span className="su-school-caret"><IconChevronDown size={16} /></span>
                </button>

                <ol className="su-track">
                  {STEPS.map((step) => {
                    const hit =
                      step.key === "outcome"
                        ? outcome && outcome.stage !== "placed"
                          ? outcome
                          : null
                        : step.key === "placed"
                        ? latestOf("placed")
                        : latestOf(step.key);
                    const meta =
                      step.key === "outcome" && hit
                        ? OUTCOMES[hit.stage]
                        : step.key === "placed" && hit
                        ? OUTCOMES.placed
                        : null;
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

                {schoolOpen && (
                  <ol className="su-history">
                    {[...updates].reverse().map((u) => (
                      <li className="su-history-item" key={u.id}>
                        <span className="su-history-date">{u.created_at ? shortDate(u.created_at) : ""}</span>
                        <span className="su-history-stage">{STAGE_LABEL[u.stage] || u.stage}</span>
                        {u.child_id && childName(u.child_id) && (
                          <span className="su-history-child">{childName(u.child_id)}</span>
                        )}
                        {u.note && <span className="su-history-note">{u.note}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
