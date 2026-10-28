import { useMemo, useState } from "react";
import { useApplicationData } from "../context/ApplicationDataContext";
import { PageError, PageLoading } from "../components/StatePanels";
import { IconChevronRight } from "../components/icons";
import EventRow from "../components/EventRow";
import { KIND_META, todayKey, useFamilyCalendar } from "../lib/familyCalendar";
import { parseDay } from "../lib/tourDetails";
import "./CalendarPage.css";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;
const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
const startTime = (e) => (e.timeText ? e.timeText.split(" – ")[0] : "");

// Calendar: a big month (or week) grid with the day's items as small chips, and
// a details panel beside it. Pick a day or a chip to read everything about it.
export default function CalendarPage() {
  const { status, error, reload } = useApplicationData();
  const { events, failed, retry } = useFamilyCalendar();
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [picked, setPicked] = useState(null);
  const [hidden, setHidden] = useState([]);
  const today = todayKey();

  const visible = useMemo(() => (events || []).filter((e) => !hidden.includes(e.kind)), [events, hidden]);
  const byDay = useMemo(() => {
    const map = {};
    visible.forEach((e) => (map[e.date] = map[e.date] || []).push(e));
    return map;
  }, [visible]);

  if (status === "loading") return <PageLoading label="Loading…" />;
  if (status === "error") return <PageError title="We couldn’t load this page" message={error} onRetry={reload} />;
  if (failed) return <PageError title="Calendar" message="Couldn’t load your calendar." onRetry={retry} />;
  if (!events) return <PageLoading label="Loading your calendar…" />;

  // The days on screen: whole weeks, Monday first.
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const gridStart = view === "month" ? mondayOf(monthStart) : mondayOf(cursor);
  const weeks = view === "month" ? Math.ceil(((monthEnd - gridStart) / 86400000 + 1) / 7) : 1;
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));

  const title =
    view === "month"
      ? cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
      : `${days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const move = (dir) => {
    setPicked(null);
    setCursor(view === "month" ? new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1) : addDays(cursor, 7 * dir));
  };
  const goToday = () => { setCursor(new Date()); setPicked(null); };
  const toggleKind = (k) => setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]));

  // Counts in the range on screen, for the filter chips.
  const inRange = (events || []).filter((e) => e.date >= keyOf(days[0]) && e.date <= keyOf(days[days.length - 1]));
  const kinds = Object.keys(KIND_META).filter((k) => (events || []).some((e) => e.kind === k));

  const upcoming = visible.filter((e) => e.date >= today && !e.done);
  const shown = picked ? byDay[picked] || [] : upcoming;
  const heading = picked
    ? parseDay(picked).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : "Coming up";

  return (
    <div className="cal-page">
      <header className="cal-top-bar">
        <div className="cal-title-wrap">
          <h1>{title}</h1>
          <div className="cal-pager" role="group" aria-label="Change period">
            <button type="button" onClick={() => move(-1)} aria-label="Previous">
              <IconChevronRight size={16} style={{ transform: "rotate(180deg)" }} />
            </button>
            <button type="button" className="cal-pager-today" onClick={goToday}>Today</button>
            <button type="button" onClick={() => move(1)} aria-label="Next"><IconChevronRight size={16} /></button>
          </div>
        </div>
        <div className="cal-seg" role="tablist" aria-label="View">
          {["month", "week"].map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "is-on" : ""} onClick={() => setView(v)}>
              {v === "month" ? "Month" : "Week"}
            </button>
          ))}
        </div>
      </header>

      {kinds.length > 0 && (
        <div className="cal-filters" role="group" aria-label="Show">
          {kinds.map((k) => {
            const off = hidden.includes(k);
            return (
              <button key={k} type="button" className={`cal-filter cal-filter-${KIND_META[k].tone}` + (off ? " is-off" : "")} aria-pressed={!off} onClick={() => toggleKind(k)}>
                <i className={`cal-dot cal-dot-${KIND_META[k].tone}`} />
                {KIND_META[k].label}
                <span>{inRange.filter((e) => e.kind === k).length}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="cal-layout">
        <section className={"cal-board cal-view-" + view} aria-label="Calendar">
          <div className="cal-weekdays" aria-hidden="true">
            {WEEK.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="cal-days">
            {days.map((d) => {
              const k = keyOf(d);
              const list = byDay[k] || [];
              const out = view === "month" && d.getMonth() !== cursor.getMonth();
              const tones = [...new Set(list.map((e) => KIND_META[e.kind]?.tone))].slice(0, 4);
              const limit = view === "week" ? 99 : MAX_CHIPS;
              return (
                <div
                  key={k}
                  className={"cal-day" + (out ? " is-out" : "") + (k === today ? " is-today" : "") + (k === picked ? " is-picked" : "") + (list.length ? " has-events" : "")}
                >
                  <button type="button" className="cal-day-head" onClick={() => setPicked(k === picked ? null : k)} aria-label={`${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${list.length ? `, ${list.length} item${list.length === 1 ? "" : "s"}` : ""}`}>
                    <span className="cal-wd">{d.toLocaleDateString("en-GB", { weekday: "short" })}</span>
                    <span className="cal-num">{d.getDate() === 1 && view === "month" ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : d.getDate()}</span>
                    <span className="cal-dots">{tones.map((t) => <i key={t} className={`cal-dot cal-dot-${t}`} />)}</span>
                  </button>
                  <div className="cal-chips">
                    {list.slice(0, limit).map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className={`cal-ev cal-ev-${KIND_META[e.kind]?.tone}` + (e.past ? " is-past" : "")}
                        onClick={() => setPicked(k)}
                        title={`${e.title}${e.timeText ? " · " + e.timeText : ""}`}
                      >
                        {startTime(e) && <b>{startTime(e)}</b>}
                        <span>{e.title}</span>
                      </button>
                    ))}
                    {list.length > limit && (
                      <button type="button" className="cal-more" onClick={() => setPicked(k)}>+{list.length - limit} more</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="cal-side" aria-label="Details">
          <div className="cal-side-head">
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
          <p className="cal-note">Times are Dubai time.</p>
        </aside>
      </div>
    </div>
  );
}
