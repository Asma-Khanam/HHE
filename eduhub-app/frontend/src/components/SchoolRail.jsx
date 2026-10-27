import { Link } from "react-router-dom";
import { IconChevronRight } from "./icons";
import { parseDay, timeRange } from "../lib/tourDetails";
import "./SchoolRail.css";

// Phone version of "Your schools" on the Home screen (27 Oct 2026).
// One swipeable card per school, each showing how far along that school is
// (7 steps: Shortlisted -> Tours -> Apply -> Fee -> Assessment -> Outcome ->
// Placed) and the one thing worth knowing right now. Under it, "Coming up":
// upcoming tours and assessments as date tiles. Built from the same lists the
// desktop pipeline uses, so both always agree.

const STEPS = ["Shortlisted", "Tours", "Apply", "Fee", "Assessment", "Outcome", "Placed"];

const APPLY_LABEL = {
  draft: "Application started",
  submitted: "Application sent",
  under_review: "Under review",
  assessment_booked: "Assessment booked",
  waitlisted: "Waitlisted",
};
const OUTCOME_LABEL = { offer: "Offer received", waitlisted: "Waitlisted", rejected: "Not successful" };

function day(iso) {
  const d = iso ? parseDay(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}
const shortDate = (iso) => day(iso)?.toLocaleDateString(undefined, { day: "numeric", month: "short" }) || "";
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

function buildCards(tabs) {
  const items = (k) => tabs.find((t) => t.key === k)?.items || [];
  const tours = items("tours");
  const upcomingTours = tours.upcoming || [];
  const doneTours = tours.completed || [];
  const apply = items("apply");
  const fee = items("fee");
  const assess = items("assessment");
  const outcome = items("outcome");
  const placed = items("placed");

  const cards = items("shortlisted").map((s) => {
    const sid = s.schoolId;
    const closed = ["declined", "withdrawn", "elsewhere"].includes(s.status.kind);
    const my = (list) => list.filter((x) => sameId(x.school?.id, sid));
    const myTourUp = upcomingTours.find((t) => sameId(t.row?.school_id, sid));
    const myTourDone = doneTours.find((t) => sameId(t.row?.school_id, sid));
    const myApply = my(apply);
    const myFee = my(fee);
    const myAssess = my(assess);
    const myOut = my(outcome);
    const myPlaced = my(placed);
    const feeDue = myFee.find((f) => f.due && !f.byHhe);
    const assessUp = myAssess.find((a) => a.upcoming);

    let step = 0;
    let line = "On your shortlist";
    let tone = "neutral";
    if (myPlaced.length || s.status.kind === "placed") {
      step = 6;
      const when = myPlaced[0]?.startDate ? `Starts ${shortDate(myPlaced[0].startDate)}` : "Place confirmed";
      line = when;
      tone = "good";
    } else if (myOut.length) {
      step = 5;
      line = OUTCOME_LABEL[myOut[0].status] || "Decision in";
      tone = myOut[0].status === "offer" ? "good" : "neutral";
    } else if (myAssess.length) {
      step = 4;
      line = assessUp ? `Assessment · ${shortDate(assessUp.assess.date)}` : "Assessment done";
      tone = assessUp ? "gold" : "neutral";
    } else if (myFee.length) {
      step = 3;
      line = feeDue ? "Fee to pay" : "Fee settled";
      tone = feeDue ? "gold" : "good";
    } else if (myApply.length) {
      step = 2;
      line = APPLY_LABEL[myApply[0].status] || "Application in progress";
    } else if (myTourUp || myTourDone) {
      step = 1;
      line = myTourUp ? `Tour · ${shortDate(myTourUp.date)}` : "Tour done";
      tone = myTourUp ? "gold" : "neutral";
    }
    if (closed) {
      line = s.status.label;
      tone = "muted";
    }
    return { key: s.key, name: s.school.name || "School", area: s.school.area || "", step, line, tone, closed };
  });

  cards.sort((a, b) => Number(a.closed) - Number(b.closed) || b.step - a.step || a.name.localeCompare(b.name));

  const upcoming = [
    ...upcomingTours.map((t) => ({
      key: `t-${t.key}`,
      date: t.date,
      title: t.row?.school?.name || "School tour",
      sub: ["School tour", timeRange(t.start, t.end)].filter(Boolean).join(" · "),
    })),
    ...assess
      .filter((a) => a.upcoming)
      .map((a) => ({
        key: `a-${a.key}`,
        date: a.assess.date,
        title: a.school.name || "Assessment",
        sub: ["Assessment", a.childName].filter(Boolean).join(" · "),
      })),
  ]
    .filter((u) => day(u.date))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 4);

  return { cards, upcoming };
}

function Segments({ step, closed }) {
  return (
    <span className="rail-steps" aria-hidden="true">
      {STEPS.map((_, i) => (
        <span key={i} className={"rail-step" + (i < step ? " is-done" : i === step ? " is-now" : "") + (closed ? " is-closed" : "")} />
      ))}
    </span>
  );
}

export default function SchoolRail({ tabs }) {
  const { cards, upcoming } = buildCards(tabs);
  return (
    <section className="rail">
      <div className="rail-head">
        <h2>Your schools</h2>
        <Link to="/app/timetable" className="rail-link">
          See all <IconChevronRight size={14} />
        </Link>
      </div>

      <div className="rail-scroll">
        {cards.map((c) => (
          <Link to="/app/timetable" key={c.key} className={"rail-card" + (c.closed ? " is-closed" : "")}>
            <span className="rail-card-top">
              <span className="rail-initial" aria-hidden="true">{c.name.charAt(0).toUpperCase()}</span>
              <span className="rail-card-title">
                <strong>{c.name}</strong>
                {c.area && <small>{c.area}</small>}
              </span>
            </span>
            <span className="rail-card-bottom">
              <Segments step={c.step} closed={c.closed} />
              <span className="rail-card-step">
                {c.closed ? "Closed" : `Step ${c.step + 1} of 7 · ${STEPS[c.step]}`}
              </span>
              <span className={"rail-chip rail-chip--" + c.tone}>{c.line}</span>
            </span>
          </Link>
        ))}
      </div>

      {upcoming.length > 0 && (
        <>
          <div className="rail-head rail-head--sub">
            <h2>Coming up</h2>
          </div>
          <ul className="rail-up">
            {upcoming.map((u) => {
              const d = day(u.date);
              return (
                <li key={u.key} className="rail-up-row">
                  <span className="rail-date">
                    <small>{d.toLocaleDateString(undefined, { month: "short" })}</small>
                    <strong>{d.getDate()}</strong>
                  </span>
                  <span className="rail-up-text">
                    <strong>{u.title}</strong>
                    <span>{u.sub}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
