import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useApplicationData } from "../context/ApplicationDataContext";
import { fetchFamilyTimetable, fetchFamilyApplications } from "../lib/timetableData";
import { fetchApplicationFees } from "../lib/applicationFees";
import { toursOfRow, parseDay, timeRange } from "../lib/tourDetails";
import { hasAssessment, assessmentOf, assessmentWhen } from "../lib/assessment";
import { placedByChild, appClosed, currentRoundApps } from "../lib/placement";
import { displayNameForChild } from "../lib/completeness";
import TourDetailsCard from "./TourDetailsCard";
import AssessmentCard from "./AssessmentCard";
import { CardError, CardSkeleton } from "./StatePanels";
import { IconSchool, IconChevronDown, IconCheckCircle, IconFolder, IconDocument, IconWallet, IconClipboard, IconAlertCircle } from "./icons";
import "./SchoolsPipelineCard.css";

// Dashboard: one pipeline across every school on the family's shortlist,
// matching the seven stages from the consultant site exactly (Shortlisted
// / Tours / Apply / Fee / Assessment / Outcome / Placed). Asma asked to
// keep that pipeline shape but flip it: tabs on the family's home screen
// rather than a horizontal track per school. Replaces four cards at once
// (per-school Where you're at, big Needs your attention, Upcoming tours,
// Upcoming assessments) and the old Recently completed side panel.

const APP_ACTIVE = ["draft", "submitted", "under_review", "assessment_booked", "waitlisted"];

function fmtDay(iso) {
  if (!iso) return "";
  const d = parseDay(iso);
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function fmtDayLong(iso) {
  if (!iso) return "";
  const d = parseDay(iso);
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function SchoolsPipelineCard() {
  const { familyId, data } = useApplicationData();
  const children = useMemo(() => data?.children || [], [data]);
  const childKey = children.map((c) => c.id).join(",");

  const [shortlist, setShortlist] = useState([]);
  const [applications, setApplications] = useState([]);
  const [fees, setFees] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  const [activeTab, setActiveTab] = useState("shortlisted");
  const [openKey, setOpenKey] = useState(null);

  useEffect(() => {
    if (!familyId) return undefined;
    let alive = true;
    setFailed(false);
    setLoading(true);
    const childIds = childKey ? childKey.split(",") : [];
    Promise.all([
      fetchFamilyTimetable(familyId),
      fetchFamilyApplications(childIds).catch(() => []),
      fetchApplicationFees().catch(() => []),
      // Addendum 108 lets the family read their own placement rows.
      // Falls back to an empty list if the addendum hasn't been run yet,
      // in which case the Placed tab reads from offer_accepted alone.
      supabase
        .from("family_placements")
        .select("id, family_id, child_id, school_name, start_date")
        .eq("family_id", familyId)
        .then((r) => r.data || [])
        .catch(() => []),
    ])
      .then(([{ shortlist: sl }, apps, fs, pl]) => {
        if (!alive) return;
        setShortlist(sl || []);
        setApplications(apps || []);
        setFees(fs || []);
        setPlacements(pl || []);
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [familyId, childKey, retry]);

  // ------------------------------------------------------- build each tab

  const tabs = useMemo(() => {
    const schoolById = {};
    (shortlist || []).forEach((r) => {
      if (r.school) schoolById[r.school_id] = { id: r.school_id, name: r.school.name, area: r.school.area, address: r.school.address };
    });
    (applications || []).forEach((a) => {
      if (!schoolById[a.school_id]) schoolById[a.school_id] = { id: a.school_id, name: "School" };
    });

    const childIds = children.map((c) => c.id);
    const placed = placedByChild(applications);
    const currentApps = currentRoundApps(applications);

    const feesByApp = {};
    (fees || []).forEach((f) => {
      if (!f.application_id) return;
      (feesByApp[f.application_id] = feesByApp[f.application_id] || []).push(f);
    });

    // ---- 1. Shortlisted: every school on the shortlist, matching the
    // consultant site's School visits panel exactly -- active rows at the
    // top, closed ones (withdrawn, placed elsewhere, placed here) kept
    // visible at the bottom for reference, with a status chip saying why.
    // 14 Oct 2026 (Asma): earlier version filtered closed rows out, so
    // the family only saw 1 of 6 schools -- the two sides read as out of
    // sync. They should always see the same list.
    const appsBySchool = {};
    (applications || []).forEach((a) => {
      (appsBySchool[a.school_id] = appsBySchool[a.school_id] || []).push(a);
    });
    const shortlistStatus = (row) => {
      if (row.family_decision === "declined") return { kind: "declined", label: "Not for us", tone: "muted" };
      const sApps = appsBySchool[row.school_id] || [];
      const placedHere = sApps.find((a) => a.status === "offer_accepted");
      if (placedHere) {
        const idx = children.findIndex((c) => c.id === placedHere.child_id);
        const name = idx === -1 ? "" : displayNameForChild(children[idx], idx) || "";
        return { kind: "placed", label: name ? `${name} placed here` : "Placed here", tone: "good" };
      }
      const anyWithdrawn = sApps.some((a) => a.status === "withdrawn");
      if (anyWithdrawn && sApps.every((a) => a.status === "withdrawn")) return { kind: "withdrawn", label: "Withdrawn", tone: "muted" };
      // Child placed somewhere else — this school is kept for reference
      const anyChildPlacedElsewhere = childIds.some((cid) => placed[cid] && String(placed[cid]) !== String(row.school_id));
      const noAppHere = sApps.length === 0;
      if (anyChildPlacedElsewhere && (noAppHere || sApps.every((a) => a.status !== "offer_accepted"))) {
        return { kind: "elsewhere", label: "Placed elsewhere", tone: "muted" };
      }
      // Active: still in play
      return { kind: "active", label: "On your shortlist", tone: "burgundy" };
    };

    const shortlistedList = (shortlist || [])
      .map((r) => {
        const status = shortlistStatus(r);
        return {
          key: `sl-${r.id}`,
          schoolId: r.school_id,
          school: schoolById[r.school_id] || { name: "School" },
          row: r,
          priority: r.priority,
          interest: r.family_interest,
          status,
        };
      })
      .sort((a, b) => {
        // Active first, then placed, then everything closed; name-order within
        const bucket = (s) => (s.status.kind === "active" ? 0 : s.status.kind === "placed" ? 1 : 2);
        return bucket(a) - bucket(b) || (a.school.name || "").localeCompare(b.school.name || "");
      });

    // ---- 2. Tours: upcoming / completed / cancelled
    const today = new Date().toLocaleDateString("en-CA");
    const allTours = (shortlist || []).flatMap(toursOfRow);
    const cancelledTours = (shortlist || []).flatMap((row) => {
      const list = [];
      if (row.tour_date && row.tour_status === "cancelled")
        list.push({ key: `${row.id}-1`, rowId: row.id, row, date: row.tour_date, start: row.tour_start_time, end: row.tour_end_time, status: "cancelled" });
      if (row.tour2_date && row.tour2_status === "cancelled")
        list.push({ key: `${row.id}-2`, rowId: row.id, row, date: row.tour2_date, start: row.tour2_start_time, end: row.tour2_end_time, status: "cancelled" });
      return list;
    });
    const tourGroups = {
      upcoming: allTours
        .filter((t) => t.date >= today && t.status !== "completed" && t.status !== "cancelled")
        .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || ""))),
      completed: allTours.filter((t) => t.status === "completed").sort((a, b) => (b.date || "").localeCompare(a.date || "")),
      cancelled: cancelledTours.sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    };
    const tourCount = tourGroups.upcoming.length + tourGroups.completed.length + tourGroups.cancelled.length;

    // ---- 3. Apply: every application that's been started (draft or beyond),
    // minus ones closed by a placement elsewhere. Shows the application's
    // status so a family sees Submitted / Under review / Waitlisted etc.
    const applyList = currentApps
      .filter((a) => APP_ACTIVE.includes(a.status))
      .filter((a) => !appClosed(placed, a))
      .map((a) => {
        const idx = children.findIndex((c) => c.id === a.child_id);
        return {
          key: `apply-${a.id}`,
          app: a,
          school: schoolById[a.school_id] || { name: "School" },
          childName: idx === -1 ? "" : displayNameForChild(children[idx], idx) || `Child ${idx + 1}`,
          status: a.status,
          submittedAt: a.submitted_at,
        };
      })
      .sort((a, b) => (a.school.name || "").localeCompare(b.school.name || ""));

    // ---- 4. Fee: every fee the consultant has sent to the family, with
    // paid / due / paid by HHE split out.
    const feeList = (fees || [])
      .filter((f) => f.sent_to_family_at)
      .map((f) => {
        const app = (applications || []).find((a) => a.id === f.application_id);
        const idx = app ? children.findIndex((c) => c.id === app.child_id) : -1;
        return {
          key: `fee-${f.id}`,
          fee: f,
          school: (app && schoolById[app.school_id]) || { name: f.application?.school?.name || "School" },
          childName: idx === -1 ? "" : displayNameForChild(children[idx], idx) || "",
          paid: f.status === "paid" || !!f.paid_at,
          due: f.status !== "paid" && f.status !== "waived" && !f.paid_direct_by_family,
          byHhe: !!f.hhe_paid_school_on_behalf,
        };
      })
      .sort((x, y) => {
        // unpaid first, then paid-by-HHE (settled with HHE), then paid.
        const bucket = (r) => (r.due && !r.byHhe ? 0 : r.byHhe && !r.paid ? 1 : 2);
        return bucket(x) - bucket(y);
      });

    // ---- 5. Assessment: every application with assessment activity (video
    // or in-person / online), still ongoing or complete, before an outcome.
    const assessmentList = currentApps
      .filter((a) => hasAssessment(a))
      .filter((a) => !appClosed(placed, a))
      .map((a) => {
        const idx = children.findIndex((c) => c.id === a.child_id);
        const childName = idx === -1 ? "" : displayNameForChild(children[idx], idx) || "";
        const school = schoolById[a.school_id] || { name: "School" };
        const assess = assessmentOf(a, { school, childName });
        const done = assess.date && assess.date < today;
        return {
          key: `assess-${a.id}`,
          app: a,
          assess,
          school,
          childName,
          upcoming: !done && !!assess.date,
          done,
        };
      })
      .sort((x, y) => {
        // upcoming first (soonest first), then completed (most recent first)
        if (x.upcoming && !y.upcoming) return -1;
        if (!x.upcoming && y.upcoming) return 1;
        if (x.upcoming) return (x.assess.date || "").localeCompare(y.assess.date || "");
        return (y.assess.date || "").localeCompare(x.assess.date || "");
      });

    // ---- 6. Outcome: the school's decision — offer, waitlisted or declined.
    // offer_accepted belongs on the Placed tab, so it's excluded here.
    const outcomeList = currentApps
      .filter((a) => a.status === "offer" || a.status === "waitlisted" || a.status === "rejected")
      .map((a) => {
        const idx = children.findIndex((c) => c.id === a.child_id);
        return {
          key: `out-${a.id}`,
          app: a,
          school: schoolById[a.school_id] || { name: "School" },
          childName: idx === -1 ? "" : displayNameForChild(children[idx], idx) || "",
          status: a.status,
        };
      })
      .sort((a, b) => {
        // offers first (good news), then waitlisted, then declined
        const bucket = (s) => (s === "offer" ? 0 : s === "waitlisted" ? 1 : 2);
        return bucket(a.status) - bucket(b.status) || (a.school.name || "").localeCompare(b.school.name || "");
      });

    // ---- 7. Placed: each child's accepted school + start date (from
    // family_placements, addendum 70 + 108). Falls back to the application's
    // own offer_accepted_on when no placement row exists yet.
    const placementByChildSchool = {};
    (placements || []).forEach((p) => {
      placementByChildSchool[`${p.child_id || ""}|${(p.school_name || "").toLowerCase()}`] = p;
    });
    const placedList = currentApps
      .filter((a) => a.status === "offer_accepted")
      .map((a) => {
        const idx = children.findIndex((c) => c.id === a.child_id);
        const childName = idx === -1 ? "" : displayNameForChild(children[idx], idx) || "";
        const school = schoolById[a.school_id] || { name: "School" };
        const pl = placementByChildSchool[`${a.child_id || ""}|${(school.name || "").toLowerCase()}`];
        return {
          key: `placed-${a.id}`,
          app: a,
          school,
          childName,
          startDate: pl?.start_date || null,
          acceptedOn: a.offer_accepted_on || null,
        };
      })
      .sort((a, b) => (a.childName || "").localeCompare(b.childName || ""));

    return [
      { key: "shortlisted", label: "Shortlisted", Icon: IconFolder, count: shortlistedList.length, items: shortlistedList },
      { key: "tours", label: "Tours", Icon: IconSchool, count: tourCount, items: tourGroups },
      { key: "apply", label: "Apply", Icon: IconDocument, count: applyList.length, items: applyList },
      { key: "fee", label: "Fee", Icon: IconWallet, count: feeList.length, items: feeList },
      { key: "assessment", label: "Assessment", Icon: IconClipboard, count: assessmentList.length, items: assessmentList },
      { key: "outcome", label: "Outcome", Icon: IconAlertCircle, count: outcomeList.length, items: outcomeList },
      { key: "placed", label: "Placed", Icon: IconCheckCircle, count: placedList.length, items: placedList },
    ];
  }, [shortlist, applications, fees, placements, children]);

  // Pick a sensible first tab: the furthest-along one that has rows, so a
  // family who's already placed lands on Placed rather than Shortlisted.
  useEffect(() => {
    const order = ["placed", "outcome", "assessment", "fee", "apply", "tours", "shortlisted"];
    const firstWithRows = order.find((k) => (tabs.find((t) => t.key === k)?.count || 0) > 0);
    if (firstWithRows) setActiveTab(firstWithRows);
  }, [tabs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // On a phone the seven stages scroll sideways; keep the chosen one in view.
  const pipelineRef = useRef(null);
  useEffect(() => {
    const nav = pipelineRef.current;
    const el = nav?.querySelector(".sp-stage.is-active");
    if (!nav || !el) return;
    const left = el.offsetLeft - (nav.clientWidth - el.clientWidth) / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [activeTab, loading]);

  if (failed) return <CardError title="Your schools" onRetry={() => setRetry((n) => n + 1)} />;
  if (loading) return <CardSkeleton title="Your schools" rows={3} />;

  const total = tabs.reduce((n, t) => n + (t.count || 0), 0);
  if (total === 0) {
    return (
      <section className="dash-card sp-card">
        <div className="dash-card-head">
          <h2><span className="dash-card-icon dash-card-icon--burgundy"><IconSchool size={16} /></span>Your schools</h2>
          <Link to="/app/timetable" className="dash-card-link">Full view →</Link>
        </div>
        <p className="sp-empty">Your consultant will add schools to your shortlist here as they come up.</p>
      </section>
    );
  }

  const current = tabs.find((t) => t.key === activeTab) || tabs[0];

  return (
    <section className="dash-card sp-card">
      <div className="dash-card-head">
        <h2><span className="dash-card-icon dash-card-icon--burgundy"><IconSchool size={16} /></span>Your schools</h2>
        <Link to="/app/timetable" className="dash-card-link">Full view →</Link>
      </div>

      <nav className="sp-pipeline" role="tablist" aria-label="Your schools pipeline" ref={pipelineRef}>
        <div className="sp-pipeline-track" aria-hidden="true" />
        {tabs.map((t, i) => {
          const Icon = t.Icon;
          const done = t.count > 0 && i < tabs.findIndex((x) => x.key === activeTab);
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={
                "sp-stage" +
                (active ? " is-active" : "") +
                (done ? " is-done" : "") +
                (t.count === 0 ? " is-empty" : "")
              }
              onClick={() => {
                setActiveTab(t.key);
                setOpenKey(null);
              }}
            >
              <span className="sp-stage-node">
                <span className="sp-stage-step">{i + 1}</span>
                <span className="sp-stage-icon"><Icon size={16} /></span>
                {t.count > 0 && <span className="sp-stage-count" aria-label={`${t.count}`}>{t.count}</span>}
              </span>
              <span className="sp-stage-label">{t.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sp-panel">
        {activeTab === "shortlisted" && <ShortlistedPanel items={current.items} />}
        {activeTab === "tours" && <ToursPanel groups={current.items} openKey={openKey} setOpenKey={setOpenKey} />}
        {activeTab === "apply" && <ApplyPanel items={current.items} />}
        {activeTab === "fee" && <FeePanel items={current.items} />}
        {activeTab === "assessment" && <AssessmentPanel items={current.items} openKey={openKey} setOpenKey={setOpenKey} />}
        {activeTab === "outcome" && <OutcomePanel items={current.items} />}
        {activeTab === "placed" && <PlacedPanel items={current.items} />}
      </div>
    </section>
  );
}

/* ------------------------------------------------------- panel components */

function EmptyPanel({ text }) {
  return <p className="sp-empty">{text}</p>;
}

function ShortlistedPanel({ items }) {
  if (!items.length) return <EmptyPanel text="Nothing on the shortlist yet — your consultant will add schools here." />;
  return (
    <ul className="sp-list">
      {items.map((s) => {
        const toneClass = "sp-row--" + s.status.tone;
        const closed = s.status.kind !== "active";
        return (
          <li key={s.key} className={"sp-row " + toneClass + (closed ? " sp-row--closed" : "")}>
            <span className={"sp-pill sp-pill--" + s.status.tone}>
              {s.status.kind === "placed" && <IconCheckCircle size={13} />} {s.status.label}
            </span>
            <span className="sp-row-main">
              <strong>{s.school.name}</strong>
              <span>
                {s.school.area || "Shortlisted"}
                {s.interest === "keen" ? " · You said: keen" : s.interest === "maybe" ? " · You said: maybe" : ""}
              </span>
            </span>
            {s.priority && !closed && <span className="sp-tag">Priority {s.priority}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function ToursPanel({ groups, openKey, setOpenKey }) {
  const { upcoming, completed, cancelled } = groups;
  if (upcoming.length + completed.length + cancelled.length === 0)
    return <EmptyPanel text="No tours booked yet." />;
  return (
    <div className="sp-tour-groups">
      {upcoming.length > 0 && (
        <div className="sp-group">
          <h3 className="sp-group-title">Upcoming <span>{upcoming.length}</span></h3>
          <ul className="sp-list">
            {upcoming.map((t) => {
              const open = openKey === t.key;
              const d = parseDay(t.date);
              return (
                <li key={t.key} className={"sp-expandable" + (open ? " is-open" : "")}>
                  <button type="button" className="sp-row-btn" onClick={() => setOpenKey(open ? null : t.key)} aria-expanded={open}>
                    <span className="sp-date">
                      <span>{d.toLocaleDateString(undefined, { month: "short" })}</span>
                      <strong>{d.getDate()}</strong>
                    </span>
                    <span className="sp-row-main">
                      <strong>{t.row.school?.name || "School"}</strong>
                      <span>
                        {d.toLocaleDateString(undefined, { weekday: "long" })}
                        {timeRange(t.start, t.end) ? ` · ${timeRange(t.start, t.end)}` : ""}
                      </span>
                    </span>
                    <span className={"sp-caret" + (open ? " is-open" : "")}><IconChevronDown size={18} /></span>
                  </button>
                  {open && (
                    <div className="sp-expand-body">
                      <TourDetailsCard tour={t} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {completed.length > 0 && (
        <div className="sp-group">
          <h3 className="sp-group-title">Completed <span>{completed.length}</span></h3>
          <ul className="sp-list">
            {completed.map((t) => (
              <li key={t.key} className="sp-row">
                <span className="sp-pill sp-pill--good"><IconCheckCircle size={13} /> Done</span>
                <span className="sp-row-main">
                  <strong>{t.row.school?.name || "School"}</strong>
                  <span>
                    Toured {fmtDay(t.date)}
                    {t.row.feedback_rating ? ` · You rated it ${t.row.feedback_rating}/5` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {cancelled.length > 0 && (
        <div className="sp-group">
          <h3 className="sp-group-title">Cancelled <span>{cancelled.length}</span></h3>
          <ul className="sp-list">
            {cancelled.map((t) => (
              <li key={t.key} className="sp-row sp-row--muted">
                <span className="sp-pill sp-pill--muted">Cancelled</span>
                <span className="sp-row-main">
                  <strong>{t.row.school?.name || "School"}</strong>
                  <span>Was {fmtDay(t.date)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const APP_STATUS = {
  draft: { label: "Being prepared", tone: "gold" },
  submitted: { label: "Submitted", tone: "neutral" },
  under_review: { label: "Under review", tone: "neutral" },
  assessment_booked: { label: "Assessment booked", tone: "neutral" },
  waitlisted: { label: "Waitlisted", tone: "gold" },
};

function ApplyPanel({ items }) {
  if (!items.length) return <EmptyPanel text="No applications in progress right now." />;
  return (
    <ul className="sp-list">
      {items.map((a) => {
        const s = APP_STATUS[a.status] || { label: a.status, tone: "neutral" };
        return (
          <li key={a.key} className="sp-row">
            <span className={"sp-pill sp-pill--" + s.tone}>{s.label}</span>
            <span className="sp-row-main">
              <strong>
                {a.school.name}
                {a.childName ? ` · ${a.childName}` : ""}
              </strong>
              <span>{a.submittedAt ? `Sent ${fmtDay(a.submittedAt)}` : "In preparation"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function FeePanel({ items }) {
  if (!items.length) return <EmptyPanel text="No application fees to show yet." />;
  const money = (f) => (f.amount ? `${f.currency || "AED"} ${Number(f.amount).toLocaleString()}` : "");
  return (
    <ul className="sp-list">
      {items.map((row) => {
        let tag;
        let detail;
        if (row.paid) {
          tag = <span className="sp-pill sp-pill--good"><IconCheckCircle size={13} /> Paid</span>;
          detail = `${money(row.fee)}${row.fee.paid_at ? ` · ${fmtDay(row.fee.paid_at)}` : ""}`;
        } else if (row.byHhe) {
          tag = <span className="sp-pill sp-pill--gold">Paid by HHE</span>;
          detail = `${money(row.fee)} · settle in Billing`;
        } else if (row.due) {
          tag = <span className="sp-pill sp-pill--gold">Due</span>;
          detail = `${money(row.fee)}${row.fee.due_date ? ` · due ${fmtDay(row.fee.due_date)}` : ""}`;
        } else {
          tag = <span className="sp-pill sp-pill--neutral">Waived</span>;
          detail = money(row.fee) || "No fee";
        }
        return (
          <li key={row.key} className="sp-row">
            {tag}
            <span className="sp-row-main">
              <strong>
                {row.school.name}
                {row.childName ? ` · ${row.childName}` : ""}
              </strong>
              <span>{detail}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function AssessmentPanel({ items, openKey, setOpenKey }) {
  if (!items.length) return <EmptyPanel text="No assessments yet. They'll appear here as your consultant books them." />;
  return (
    <ul className="sp-list">
      {items.map((row) => {
        const open = openKey === row.key;
        const when = assessmentWhen(row.assess);
        let tag;
        if (row.done) tag = <span className="sp-pill sp-pill--good"><IconCheckCircle size={13} /> Done</span>;
        else if (row.upcoming) tag = <span className="sp-pill sp-pill--neutral">Upcoming</span>;
        else tag = <span className="sp-pill sp-pill--gold">To be booked</span>;
        return (
          <li key={row.key} className={"sp-expandable" + (open ? " is-open" : "")}>
            <button
              type="button"
              className="sp-row-btn"
              onClick={() => setOpenKey(open ? null : row.key)}
              aria-expanded={open}
            >
              {tag}
              <span className="sp-row-main">
                <strong>
                  {row.school.name}
                  {row.childName ? ` · ${row.childName}` : ""}
                </strong>
                <span>{when}</span>
              </span>
              <span className={"sp-caret" + (open ? " is-open" : "")}><IconChevronDown size={18} /></span>
            </button>
            {open && (
              <div className="sp-expand-body">
                <AssessmentCard assessment={row.assess} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const OUTCOME_META = {
  offer: { label: "Offer received", tone: "good" },
  waitlisted: { label: "Waitlisted", tone: "gold" },
  rejected: { label: "Not successful", tone: "bad" },
};

function OutcomePanel({ items }) {
  if (!items.length) return <EmptyPanel text="No outcomes yet. Decisions from the schools will show here." />;
  return (
    <ul className="sp-list">
      {items.map((o) => {
        const meta = OUTCOME_META[o.status] || { label: o.status, tone: "neutral" };
        return (
          <li key={o.key} className="sp-row">
            <span className={"sp-pill sp-pill--" + meta.tone}>{meta.label}</span>
            <span className="sp-row-main">
              <strong>
                {o.school.name}
                {o.childName ? ` · ${o.childName}` : ""}
              </strong>
              <span>
                {o.status === "offer" && "Awaiting your decision"}
                {o.status === "waitlisted" && "On the waitlist"}
                {o.status === "rejected" && (o.app.rejected_reason ? `Reason: ${o.app.rejected_reason}` : "No place available")}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function PlacedPanel({ items }) {
  if (!items.length) return <EmptyPanel text="No place confirmed yet. When one is, it will show here with the start date." />;
  return (
    <ul className="sp-list">
      {items.map((p) => (
        <li key={p.key} className="sp-row sp-row--placed">
          <span className="sp-pill sp-pill--good"><IconCheckCircle size={13} /> Place confirmed</span>
          <span className="sp-row-main">
            <strong>
              {p.childName ? `${p.childName} — ` : ""}{p.school.name}
            </strong>
            <span>
              {p.startDate
                ? `Starting ${fmtDayLong(p.startDate)}`
                : p.acceptedOn
                ? `Accepted ${fmtDay(p.acceptedOn)} · start date to be confirmed`
                : "Start date to be confirmed"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
