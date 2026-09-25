import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApplicationData } from "../context/ApplicationDataContext";
import { fetchFamilyTimetable, fetchFamilyApplications } from "../lib/timetableData";
import { placedByChild, schoolClosed } from "../lib/placement";
import { parseDay, timeRange, toursOfRow } from "../lib/tourDetails";
import TourDetailsCard from "./TourDetailsCard";
import { IconChevronDown } from "./icons";
import "./UpcomingToursCard.css";

// Dashboard: "Your next school tour" -- the founders' School Tour Details
// for the soonest booked tour, with any other upcoming tours listed below it
// (tap one to see its details). Hidden entirely when nothing is booked.
export default function UpcomingToursCard() {
  const { familyId, data } = useApplicationData();
  const childKey = (data?.children || []).map((c) => c.id).join(",");
  const [tours, setTours] = useState([]);
  const [openKey, setOpenKey] = useState(null);

  useEffect(() => {
    if (!familyId) return undefined;
    let cancelled = false;
    const childIds = childKey ? childKey.split(",") : [];
    Promise.all([fetchFamilyTimetable(familyId), fetchFamilyApplications(childIds).catch(() => [])])
      .then(([{ shortlist }, apps]) => {
        if (cancelled) return;
        const today = new Date().toLocaleDateString("en-CA");
        // No tour reminders for a school that's closed because every child
        // has been placed somewhere else.
        const placed = placedByChild(apps);
        const upcoming = shortlist
          .filter((r) => !schoolClosed(placed, childIds, r.school_id))
          .flatMap(toursOfRow)
          .filter((t) => t.date >= today && t.status !== "completed")
          .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));
        setTours(upcoming);
        setOpenKey(upcoming[0]?.key || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [familyId, childKey]);

  if (!tours.length) return null;

  return (
    <section className="dash-card utc">
      <div className="dash-card-head">
        <h2>{tours.length === 1 ? "Your next school tour" : `Your upcoming school tours (${tours.length})`}</h2>
        <Link to="/app/timetable" className="dash-card-link">
          All your schools →
        </Link>
      </div>
      <div className="utc-list">
        {tours.map((t) => {
          const open = openKey === t.key;
          const d = parseDay(t.date);
          return (
            <div key={t.key} className={"utc-item" + (open ? " is-open" : "")}>
              <button type="button" className="utc-row" onClick={() => setOpenKey(open ? null : t.key)} aria-expanded={open}>
                <span className="utc-date">
                  <span>{d.toLocaleDateString(undefined, { month: "short" })}</span>
                  <strong>{d.getDate()}</strong>
                </span>
                <span className="utc-row-main">
                  <strong>{t.row.school?.name || "School"}</strong>
                  <span>
                    {d.toLocaleDateString(undefined, { weekday: "long" })}
                    {timeRange(t.start, t.end) ? ` · ${timeRange(t.start, t.end)}` : ""}
                  </span>
                </span>
                <span className={"utc-caret" + (open ? " is-open" : "")}>
                  <IconChevronDown size={18} />
                </span>
              </button>
              {open && (
                <div className="utc-body">
                  <TourDetailsCard tour={t} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
