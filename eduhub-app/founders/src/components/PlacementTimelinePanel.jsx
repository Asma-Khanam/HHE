import { useEffect, useMemo, useState } from "react";
import {
  listShortlistForFamily,
  listApplicationEvents,
  listPlacements,
  listSearchRounds,
} from "../lib/staffData";
import { applicationStatus, eventTypeLabel } from "../lib/workflow";
import "./panels.css";
import "./PlacementTimelinePanel.css";

const childLabel = (c) => (c?.preferred_name || c?.first_name || (c?.full_name || "").split(" ")[0] || "Child").trim();

function stamp(d) {
  if (!d) return 0;
  const t = new Date(d.length === 10 ? d + "T09:00:00" : d).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function fmt(d) {
  if (!d) return "";
  return new Date(d.length === 10 ? d + "T09:00:00" : d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const TOUR_WORD = { booked: "booked", confirmed: "confirmed", completed: "done", cancelled: "cancelled" };

// One story per family: every school they shortlisted, toured and applied to,
// in date order, leading up to each placement. Built from data that already
// exists (School visits, Applications, Placement, search rounds), so there is
// nothing extra to fill in.
export default function PlacementTimelinePanel({ familyId, familyChildren = [], applicationsByChild = {}, schoolCatalog = [] }) {
  const [state, setState] = useState({ loading: true, error: "", shortlist: [], events: [], placements: [], rounds: [] });
  const [who, setWho] = useState("all");

  const apps = useMemo(() => Object.values(applicationsByChild).flat(), [applicationsByChild]);
  const appIds = useMemo(() => apps.map((a) => a.id).join(","), [apps]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listShortlistForFamily(familyId),
      listApplicationEvents(apps.map((a) => a.id)),
      listPlacements(familyId),
      listSearchRounds(familyId),
    ])
      .then(([shortlist, events, placements, rounds]) => {
        if (alive) setState({ loading: false, error: "", shortlist: shortlist || [], events: events || [], placements: placements || [], rounds: rounds || [] });
      })
      .catch(() => alive && setState((s) => ({ ...s, loading: false, error: "Couldn't load the timeline." })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, appIds]);

  const items = useMemo(() => {
    const out = [];
    const nameOf = (id) => schoolCatalog.find((s) => s.id === id)?.name || "School";
    const childById = Object.fromEntries(familyChildren.map((c) => [c.id, c]));
    const appById = Object.fromEntries(apps.map((a) => [a.id, a]));

    state.shortlist.forEach((r) => {
      const school = r.school?.name || nameOf(r.school_id);
      if (r.shortlisted_at) out.push({ at: stamp(r.shortlisted_at), kind: "shortlist", school, title: `Shortlisted ${school}`, when: fmt(r.shortlisted_at) });
      ["tour_", "tour2_"].forEach((p) => {
        const date = r[p + "date"];
        const status = r[p + "status"];
        if (!date || status === "cancelled") return;
        out.push({
          at: stamp(date),
          kind: "tour",
          school,
          title: `School tour at ${school}`,
          note: TOUR_WORD[status] ? `Tour ${TOUR_WORD[status]}` : "",
          when: fmt(date),
        });
      });
      if (r.feedback_text || r.feedback_rating) {
        out.push({
          at: stamp(r.feedback_at || r.tour_date || r.shortlisted_at),
          kind: "feedback",
          school,
          title: `Feedback on ${school}`,
          note: [r.feedback_rating ? `${r.feedback_rating}/5` : "", r.feedback_text || ""].filter(Boolean).join(" · "),
          when: fmt(r.feedback_at || r.tour_date),
        });
      }
    });

    apps.forEach((a) => {
      const school = a.schoolName || nameOf(a.school_id);
      const child = childById[a.child_id];
      if (a.created_at)
        out.push({ at: stamp(a.created_at), kind: "application", child: a.child_id, childName: childLabel(child), school, title: `Application started at ${school}`, when: fmt(a.created_at) });
      if ((a.round_number || 1) > 1) {
        /* round shown by its own marker below */
      }
    });

    state.events.forEach((e) => {
      const a = appById[e.application_id];
      if (!a) return;
      const school = a.schoolName || nameOf(a.school_id);
      const label = e.event_type === "status_change" && e.new_status ? applicationStatus(e.new_status).label : eventTypeLabel(e.event_type);
      out.push({
        at: stamp(e.occurred_at),
        kind: e.new_status === "offer_accepted" || e.new_status === "offer" ? "offer" : "application",
        child: a.child_id,
        childName: childLabel(childById[a.child_id]),
        school,
        title: `${label} — ${school}`,
        note: e.description || "",
        when: fmt(e.occurred_at),
      });
    });

    // An accepted offer that has no logged event still belongs on the story.
    apps
      .filter((a) => a.status === "offer_accepted")
      .forEach((a) => {
        const has = state.events.some((e) => e.application_id === a.id && e.new_status === "offer_accepted");
        if (!has)
          out.push({ at: stamp(a.updated_at || a.created_at), kind: "offer", child: a.child_id, childName: childLabel(childById[a.child_id]), school: a.schoolName, title: `Offer accepted — ${a.schoolName}`, when: fmt(a.updated_at || a.created_at) });
      });

    state.rounds.forEach((r) => {
      out.push({
        at: stamp(r.started_at),
        kind: "round",
        child: r.child_id,
        childName: childLabel(childById[r.child_id]),
        title: `Started search round ${r.round_number}`,
        note: [r.from_school_name ? `Leaving ${r.from_school_name}` : "", r.reason || ""].filter(Boolean).join(" · "),
        when: fmt(r.started_at),
      });
    });

    state.placements.forEach((p) => {
      out.push({
        at: stamp(p.start_date),
        kind: "placed",
        child: p.child_id,
        childName: childLabel(childById[p.child_id]),
        school: p.school_name,
        title: `Placed at ${p.school_name}`,
        note: "Start date",
        when: fmt(p.start_date),
      });
    });

    return out.filter((i) => i.at).sort((a, b) => a.at - b.at);
  }, [state, apps, familyChildren, schoolCatalog]);

  const shown = items.filter((i) => who === "all" || !i.child || i.child === who);

  return (
    <section className="panel ptl">
      <div className="panel-head">
        <h2>Placement timeline</h2>
      </div>
      <p className="panel-hint">
        The whole journey in date order: schools shortlisted, tours, applications and offers, leading up to each placement.
      </p>

      {familyChildren.length > 1 && (
        <div className="ptl-filter">
          <button type="button" className={"ptl-chip" + (who === "all" ? " is-on" : "")} onClick={() => setWho("all")}>
            Everyone
          </button>
          {familyChildren.map((c) => (
            <button key={c.id} type="button" className={"ptl-chip" + (who === c.id ? " is-on" : "")} onClick={() => setWho(c.id)}>
              {childLabel(c)}
            </button>
          ))}
        </div>
      )}

      {state.error && <div className="hh-form-banner hh-form-banner-error">{state.error}</div>}
      {state.loading ? (
        <p className="panel-hint">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="panel-hint">Nothing on the timeline yet. It fills in as schools are shortlisted and applications are made.</p>
      ) : (
        <ol className="ptl-list">
          {shown.map((i, n) => (
            <li key={n} className={"ptl-item is-" + i.kind}>
              <span className="ptl-dot" />
              <div className="ptl-body">
                <div className="ptl-title">
                  {i.title}
                  {i.childName && familyChildren.length > 1 && <span className="ptl-child">{i.childName}</span>}
                </div>
                {i.note && <div className="ptl-note">{i.note}</div>}
              </div>
              <span className="ptl-when">{i.when}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
