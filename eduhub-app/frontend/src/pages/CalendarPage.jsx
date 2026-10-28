import { useMemo, useState } from "react";
import { useApplicationData } from "../context/ApplicationDataContext";
import { PageError, PageLoading } from "../components/StatePanels";
import { IconChevronDown } from "../components/icons";
import EventRow from "../components/EventRow";
import { KIND_META, todayKey, useFamilyCalendar } from "../lib/familyCalendar";
import { parseDay } from "../lib/tourDetails";
import "./CalendarPage.css";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const keyOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// Calendar: one place to see when things happen. Month grid with a dot per
// kind of item, tap a day to see it, and an Upcoming list underneath.
export default function CalendarPage() {
  const { status, error, reload } = useApplicationData();
  const { events, failed, retry } = useFamilyCalendar();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [picked, setPicked] = useState(null);
  const today = todayKey();

  const byDay = useMemo(() => {
    const map = {};
    (events || []).forEach((e) => (map[e.date] = map[e.date] || []).push(e));
    return map;
  }, [events]);

  if (status === "loading") return <PageLoading label="Loading…" />;
  if (status === "error") return <PageError title="We couldn’t load this page" message={error} onRetry={reload} />;
  if (failed) return <PageError title="Calendar" message="Couldn’t load your calendar." onRetry={retry} />;
  if (!events) return <PageLoading label="Loading your calendar…" />;

  const first = new Date(cursor.y, cursor.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const monthLabel = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const shift = (n) => {
    const d = new Date(cursor.y, cursor.m + n, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setPicked(null);
  };

  const upcoming = events.filter((e) => e.date >= today && !e.done);
  const pickedEvents = picked ? byDay[picked] || [] : null;
  const shown = pickedEvents ?? upcoming;
  const heading = picked
    ? parseDay(picked).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : "Coming up";
  const present = Object.keys(KIND_META).filter((k) => events.some((e) => e.kind === k));

  return (
    <div className="cal-page">
      <header className="cal-head">
        <h1>Calendar</h1>
        <p>Your tours, assessments, calls and payments by date. Times are Dubai time.</p>
      </header>

      <div className="cal-layout">
        <section className="cal-card cal-month">
          <div className="cal-month-bar">
            <button type="button" className="cal-nav" aria-label="Previous month" onClick={() => shift(-1)}>
              <IconChevronDown size={18} style={{ transform: "rotate(90deg)" }} />
            </button>
            <h2>{monthLabel}</h2>
            <button type="button" className="cal-nav" aria-label="Next month" onClick={() => shift(1)}>
              <IconChevronDown size={18} style={{ transform: "rotate(-90deg)" }} />
            </button>
          </div>
          <div className="cal-grid cal-weekdays" aria-hidden="true">
            {WEEK.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="cal-grid">
            {cells.map((d, i) => {
              if (!d) return <span key={`b${i}`} className="cal-cell is-blank" />;
              const k = keyOf(cursor.y, cursor.m, d);
              const list = byDay[k] || [];
              const kinds = [...new Set(list.map((e) => KIND_META[e.kind]?.tone))].slice(0, 4);
              return (
                <button
                  key={k}
                  type="button"
                  className={"cal-cell" + (k === today ? " is-today" : "") + (k === picked ? " is-picked" : "") + (list.length ? " has-events" : "")}
                  onClick={() => setPicked(k === picked ? null : k)}
                  aria-label={`${d} ${monthLabel}${list.length ? `, ${list.length} item${list.length === 1 ? "" : "s"}` : ""}`}
                >
                  <span className="cal-num">{d}</span>
                  <span className="cal-dots">{kinds.map((t) => <i key={t} className={`cal-dot cal-dot-${t}`} />)}</span>
                </button>
              );
            })}
          </div>
          {present.length > 0 && (
            <ul className="cal-legend">
              {present.map((k) => (
                <li key={k}><i className={`cal-dot cal-dot-${KIND_META[k].tone}`} />{KIND_META[k].label}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="cal-card cal-list">
          <div className="cal-list-head">
            <h2>{heading}</h2>
            {picked && <button type="button" className="cal-clear" onClick={() => setPicked(null)}>Show all upcoming</button>}
          </div>
          {shown.length === 0 ? (
            <p className="cal-empty">
              {picked
                ? "Nothing on this day."
                : "Nothing booked yet. Tours, assessments, calls with your consultant and payment dates will appear here as soon as they are set."}
            </p>
          ) : (
            <ul className="cal-rows">{shown.map((e) => <EventRow key={e.id} e={e} />)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
