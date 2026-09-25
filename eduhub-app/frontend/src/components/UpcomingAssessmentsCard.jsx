import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApplicationData } from "../context/ApplicationDataContext";
import { fetchFamilyTimetable, fetchFamilyApplications } from "../lib/timetableData";
import { displayNameForChild } from "../lib/completeness";
import { parseDay } from "../lib/tourDetails";
import { hasAssessment, assessmentOf, assessmentWhen } from "../lib/assessment";
import { placedByChild, appClosed } from "../lib/placement";
import AssessmentCard from "./AssessmentCard";
import { IconChevronDown } from "./icons";
import "./UpcomingToursCard.css";

// Dashboard: upcoming assessments, with the join link, meeting ID and
// passcode (Heather, 25 Sept 2026). Shows up as soon as the consultant saves
// them -- nothing else to press. Hidden when there's nothing coming up.
const ACTIVE = ["submitted", "assessment_booked", "under_review", "waitlisted", "draft"];

export default function UpcomingAssessmentsCard() {
  const { familyId, data } = useApplicationData();
  const children = data?.children || [];
  const childKey = children.map((c) => c.id).join(",");
  const [items, setItems] = useState([]);
  const [openKey, setOpenKey] = useState(null);

  useEffect(() => {
    if (!familyId || !childKey) return undefined;
    let cancelled = false;
    Promise.all([fetchFamilyTimetable(familyId), fetchFamilyApplications(childKey.split(","))])
      .then(([{ shortlist }, apps]) => {
        if (cancelled) return;
        const today = new Date().toLocaleDateString("en-CA");
        const placed = placedByChild(apps);
        const schoolById = Object.fromEntries(shortlist.map((r) => [r.school_id, r.school || {}]));
        const list = apps
          .filter((a) => ACTIVE.includes(a.status) && hasAssessment(a) && !appClosed(placed, a))
          .filter((a) => !a.assessment_date || a.assessment_date >= today)
          .map((a) => {
            const idx = children.findIndex((c) => c.id === a.child_id);
            return assessmentOf(a, {
              school: schoolById[a.school_id],
              childName: idx === -1 ? "" : displayNameForChild(children[idx], idx),
            });
          })
          .sort((x, y) => (x.date || "9999").localeCompare(y.date || "9999") || (x.time || "").localeCompare(y.time || ""));
        setItems(list);
        setOpenKey(list[0]?.key || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, childKey]);

  if (!items.length) return null;

  return (
    <section className="dash-card utc">
      <div className="dash-card-head">
        <h2>{items.length === 1 ? "Your next assessment" : `Your upcoming assessments (${items.length})`}</h2>
        <Link to="/app/timetable" className="dash-card-link">
          All your schools →
        </Link>
      </div>
      <div className="utc-list">
        {items.map((a) => {
          const open = openKey === a.key;
          const d = a.date ? parseDay(a.date) : null;
          return (
            <div key={a.key} className={"utc-item" + (open ? " is-open" : "")}>
              <button type="button" className="utc-row" onClick={() => setOpenKey(open ? null : a.key)} aria-expanded={open}>
                <span className="utc-date">
                  <span>{d ? d.toLocaleDateString(undefined, { month: "short" }) : "TBC"}</span>
                  <strong>{d ? d.getDate() : "–"}</strong>
                </span>
                <span className="utc-row-main">
                  <strong>
                    {a.school.name || "School"}
                    {a.childName ? ` · ${a.childName}` : ""}
                  </strong>
                  <span>
                    {assessmentWhen(a)}
                    {a.link ? ` · ${a.platform}` : ""}
                  </span>
                </span>
                <span className={"utc-caret" + (open ? " is-open" : "")}>
                  <IconChevronDown size={18} />
                </span>
              </button>
              {open && (
                <div className="utc-body">
                  <AssessmentCard assessment={a} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
