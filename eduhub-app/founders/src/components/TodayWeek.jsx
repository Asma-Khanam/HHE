import { useState } from "react";
import { Link } from "react-router-dom";
import "./TodayWeek.css";

// "Your week" on Today, laid out like a timeline: one column per day (Monday to Sunday),
// today's column tinted with a dot, weekends hatched, and each tour, visit, assessment,
// consultation, offer or first day as a card in its day. Hover (or focus) a card for the
// full detail. Read only: same dates as the "Coming up" list and the Calendar page.

const iso = (d) => d.toLocaleDateString("en-CA");

// The seven dates (YYYY-MM-DD) of the current week, Monday first.
export function weekDates(base = new Date()) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return iso(x);
  });
}

const GROUP_OF = {
  Tour: "tours",
  Visit: "tours",
  Assessment: "assessments",
  Consultation: "consultations",
  Offer: "offers",
  "Start date": "starts",
};
const FILTERS = [
  { key: "all", label: "Everything" },
  { key: "tours", label: "Tours" },
  { key: "assessments", label: "Assessments" },
  { key: "consultations", label: "Consultations" },
  { key: "offers", label: "Offers" },
  { key: "starts", label: "First days" },
];

function timeOf(when) {
  const parts = String(when || "").split(" · ");
  const t = parts[parts.length - 1];
  return /\d/.test(t) || /all day/i.test(t) ? t : "";
}

export default function TodayWeek({ days, items, overdue = 0, paymentsOverdue = 0 }) {
  const [filter, setFilter] = useState("all");
  const today = iso(new Date());
  const countOf = (key) => (key === "all" ? items.length : items.filter((i) => GROUP_OF[i.kind] === key).length);
  const shown = filter === "all" ? items : items.filter((i) => GROUP_OF[i.kind] === filter);
  const first = new Date(days[0] + "T00:00:00");
  const last = new Date(days[6] + "T00:00:00");
  const fmt = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <section className="tw-card" aria-label="Your week">
      <div className="tw-head">
        <div>
          <h2>Your week</h2>
          <p className="tw-sub">
            {fmt(first)} to {fmt(last)}
          </p>
        </div>
        <div className="tw-flags">
          {overdue > 0 && <span className="tw-pill is-bad">{overdue} overdue task{overdue === 1 ? "" : "s"}</span>}
          {paymentsOverdue > 0 && <span className="tw-pill is-bad">{paymentsOverdue} overdue payment{paymentsOverdue === 1 ? "" : "s"}</span>}
        </div>
      </div>

      <div className="tw-filters" role="tablist" aria-label="What to show">
        {FILTERS.filter((f) => f.key === "all" || countOf(f.key) > 0).map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={"tw-filter" + (filter === f.key ? " is-on" : "")}
            onClick={() => setFilter(f.key)}
          >
            {f.label} <span className="tw-filter-n">{countOf(f.key)}</span>
          </button>
        ))}
      </div>

      <div className="tw-board">
        {days.map((d, idx) => {
          const dt = new Date(d + "T00:00:00");
          const weekend = dt.getDay() === 0 || dt.getDay() === 6;
          const list = shown.filter((i) => i.date === d);
          const cls = "tw-col" + (d === today ? " is-today" : d < today ? " is-past" : "") + (weekend ? " is-weekend" : "");
          return (
            <div key={d} className={cls}>
              <div className="tw-col-head">
                <span className="tw-num">{dt.getDate()}</span>
                <span className="tw-wd">{dt.toLocaleDateString(undefined, { weekday: "short" })}</span>
                {d === today && <span className="tw-dot" aria-label="Today" />}
              </div>
              <ul className="tw-list">
                {list.map((it) => {
                  const kindClass = "tw-k-" + String(it.kind).toLowerCase().replace(/\s+/g, "-");
                  const time = timeOf(it.when);
                  const card = (
                    <>
                      <span className="tw-title">{it.title}</span>
                      <span className="tw-meta">
                        {time || it.kind}
                        {it.familyName ? ` · ${it.familyName}` : ""}
                      </span>
                    </>
                  );
                  return (
                    <li key={it.id} className={"tw-item " + kindClass}>
                      {it.path ? (
                        <Link to={it.path} className="tw-link">
                          {card}
                        </Link>
                      ) : (
                        <div className="tw-link is-plain" tabIndex={0}>
                          {card}
                        </div>
                      )}
                      <div className={"tw-pop" + (idx >= 4 ? " is-right" : "")} role="tooltip">
                        <div className="tw-pop-tags">
                          <span className={"tw-tag " + kindClass}>{it.kind}</span>
                        </div>
                        <div className="tw-pop-title">{it.title}</div>
                        {it.familyName && <div className="tw-pop-fam">{it.familyName}</div>}
                        {it.state && <div className="tw-pop-state">{it.state}</div>}
                        <div className="tw-pop-when">{it.when}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      {shown.length === 0 && <p className="tw-empty">Nothing {filter === "all" ? "booked" : "of this kind"} this week.</p>}
    </section>
  );
}
