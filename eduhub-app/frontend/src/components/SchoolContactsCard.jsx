import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useApplicationData } from "../context/ApplicationDataContext";
import { fetchFamilyApplications, fetchFamilyTimetable } from "../lib/timetableData";
import { IconChevronDown, IconUser } from "./icons";
import { CardError, CardSkeleton } from "./StatePanels";
import "./SchoolContactsCard.css";

// Who to contact at each school (Miss Lyndsay, 12 Oct 2026): the consultant
// adds contacts on the school and ticks "Parents see"; they appear here for
// every school the family has shortlisted, toured, applied to or been placed at. Database policy
// (addendum 103) only lets a family read shared, current contacts at their
// own schools. Case notes are never involved.
const STAGE_LABEL = { placed: "Place confirmed", applied: "Applied", toured: "Toured", shortlisted: "Shortlisted" };

export default function SchoolContactsCard() {
  const { familyId, data } = useApplicationData();
  const [groups, setGroups] = useState(null);
  const [open, setOpen] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const childKey = (data?.children || []).map((c) => c.id).join(",");

  useEffect(() => {
    if (!familyId) return;
    let alive = true;
    setFailed(false);
    (async () => {
      try {
        const childIds = childKey ? childKey.split(",") : [];
        const [{ shortlist }, apps] = await Promise.all([
          fetchFamilyTimetable(familyId),
          fetchFamilyApplications(childIds),
        ]);
        const names = {};
        const stages = {};
        // Where each school is for this family, best stage wins.
        const RANK = { shortlisted: 0, toured: 1, applied: 2, placed: 3 };
        const mark = (id, stage) => {
          if (!id) return;
          if (stages[id] === undefined || RANK[stage] > RANK[stages[id]]) stages[id] = stage;
        };
        (shortlist || []).forEach((r) => {
          if (r.school) names[r.school_id] = r.school.name;
          mark(r.school_id, r.tour_date || r.tour2_date ? "toured" : "shortlisted");
        });
        apps.forEach((a) => {
          if (a.status === "withdrawn") return mark(a.school_id, "shortlisted");
          mark(a.school_id, a.status === "offer_accepted" ? "placed" : "applied");
        });
        const ids = [...new Set([...(shortlist || []).map((r) => r.school_id), ...apps.map((a) => a.school_id)])].filter(Boolean);
        if (!ids.length) return alive && setGroups([]);
        const { data: rows, error } = await supabase
          .from("school_contacts")
          .select("id, school_id, full_name, job_title, email, phone, is_main, school:schools ( name )")
          .in("school_id", ids)
          .eq("share_with_family", true)
          .is("archived_at", null)
          .order("is_main", { ascending: false })
          .order("created_at");
        if (error) throw error;
        const by = {};
        (rows || []).forEach((c) => {
          (by[c.school_id] = by[c.school_id] || { id: c.school_id, name: names[c.school_id] || c.school?.name || "School", stage: stages[c.school_id] || "shortlisted", contacts: [] }).contacts.push(c);
        });
        const ORDER = { placed: 0, applied: 1, toured: 2, shortlisted: 3 };
        if (alive) setGroups(Object.values(by).sort((a, b) => ORDER[a.stage] - ORDER[b.stage] || a.name.localeCompare(b.name)));
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [familyId, childKey, retry]);

  if (failed) return <CardError title="School contacts" onRetry={() => setRetry((n) => n + 1)} />;
  if (!groups) return <CardSkeleton title="School contacts" rows={2} />;

  return (
    <section className={"dash-card sc-card" + (open ? " is-open" : "")}>
      <div className="dash-card-head">
        <button type="button" className="su-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <h2><span className="dash-card-icon dash-card-icon--neutral"><IconUser size={16} /></span>School contacts</h2>
          {groups.length > 0 && <span className="dash-count">{groups.length}</span>}
          <span className="su-caret"><IconChevronDown size={18} /></span>
        </button>
      </div>
      {open && groups.length === 0 && (
        <p className="scc-empty">
          Your consultant adds the admissions contacts for your schools here: every school you have shortlisted, toured or applied to.
        </p>
      )}
      {open && groups.length > 0 && (
        <ul className="scc-list">
          {groups.map((g) => (
            <li key={g.id} className="scc-school">
              <div className="scc-school-head">
                <strong>{g.name}</strong>
                <span className={"scc-stage scc-stage--" + g.stage}>{STAGE_LABEL[g.stage]}</span>
              </div>
              <ul className="scc-people">
                {g.contacts.map((c) => (
                  <li key={c.id}>
                    <span className="scc-name">{c.full_name || "Admissions"}</span>
                    {c.job_title && <span className="scc-title">{c.job_title}</span>}
                    <span className="scc-links">
                      {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                      {c.phone && <a href={`tel:${c.phone.replace(/\s+/g, "")}`}>{c.phone}</a>}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
