import { Link } from "react-router-dom";
import { IconChevronRight, IconCalendar } from "./icons";
import EventRow from "./EventRow";
import { todayKey, useFamilyCalendar } from "../lib/familyCalendar";
import { CardSkeleton } from "./StatePanels";
import "./CalendarParts.css";

// Home: the next few dated things, with a way into the full Calendar.
export default function ComingUpCard() {
  const { events, failed } = useFamilyCalendar();
  if (failed) return null;
  if (!events) return <CardSkeleton title="Coming up" rows={2} />;
  const next = events.filter((e) => e.date >= todayKey() && !e.done).slice(0, 3);
  return (
    <section className="dash-card cu-card">
      <div className="dash-card-head">
        <h2><span className="dash-card-icon dash-card-icon--neutral"><IconCalendar size={16} /></span>Coming up</h2>
        <Link to="/app/calendar" className="cu-all">Calendar <IconChevronRight size={14} /></Link>
      </div>
      {next.length === 0 ? (
        <p className="cu-empty">Nothing booked yet. Tours, assessments, calls and payment dates will show here.</p>
      ) : (
        <ul className="cal-rows cal-rows-compact">{next.map((e) => <EventRow key={e.id} e={e} compact />)}</ul>
      )}
    </section>
  );
}
