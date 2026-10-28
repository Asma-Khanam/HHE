import { Link } from "react-router-dom";
import { KIND_META } from "../lib/familyCalendar";
import { downloadTourIcs, parseDay } from "../lib/tourDetails";
import "./CalendarParts.css";

// One dated item: a date tile, what it is, when, and the one or two things you
// can do with it (join, add to your phone's calendar, open the page).
export default function EventRow({ e, compact }) {
  const d = parseDay(e.date);
  const meta = KIND_META[e.kind] || KIND_META.event;
  return (
    <li className={`cal-row cal-${meta.tone}` + (e.past ? " is-past" : "")}>
      <span className="cal-tile" aria-hidden="true">
        <span>{d.toLocaleDateString("en-GB", { month: "short" })}</span>
        <strong>{d.getDate()}</strong>
        {!compact && <span>{d.toLocaleDateString("en-GB", { weekday: "short" })}</span>}
      </span>
      <span className="cal-main">
        <span className="cal-top">
          <span className={`cal-chip cal-chip-${meta.tone}`}>{e.done && e.kind === "tour" ? "Tour done" : meta.label}</span>
          {e.timeText && <span className="cal-time">{e.timeText}</span>}
        </span>
        <strong className="cal-title">{e.title}</strong>
        {e.sub && <span className="cal-sub">{e.sub}</span>}
        {!compact && (e.link || e.tour || e.to) && (
          <span className="cal-actions">
            {e.link && <a className="cal-btn" href={e.link} target="_blank" rel="noreferrer">{e.linkLabel || "Open"}</a>}
            {e.tour && !e.past && <button type="button" className="cal-btn cal-btn-ghost" onClick={() => downloadTourIcs(e.tour)}>Add to calendar</button>}
            {e.to && <Link className="cal-btn cal-btn-ghost" to={e.to}>{e.toLabel || "View"}</Link>}
          </span>
        )}
      </span>
    </li>
  );
}
