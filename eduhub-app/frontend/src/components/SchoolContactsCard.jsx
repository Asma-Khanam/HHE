import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useApplicationData } from "../context/ApplicationDataContext";
import { fetchFamilyApplications, fetchFamilyTimetable } from "../lib/timetableData";
import { IconChevronDown } from "./icons";
import { CardError, CardSkeleton } from "./StatePanels";
import "./SchoolContactsCard.css";

// Who to contact at each school (Miss Lyndsay, 12 Oct 2026): the consultant
// adds contacts on the school and ticks "Parents see"; they appear here for
// every school on the family's shortlist or applications. Database policy
// (addendum 103) only lets a family read shared, current contacts at their
// own schools. Case notes are never involved.
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
        (shortlist || []).forEach((r) => {
          if (r.school) names[r.school_id] = r.school.name;
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
          (by[c.school_id] = by[c.school_id] || { id: c.school_id, name: names[c.school_id] || c.school?.name || "School", contacts: [] }).contacts.push(c);
        });
        if (alive) setGroups(Object.values(by).sort((a, b) => a.name.localeCompare(b.name)));
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
  if (groups.length === 0) return null;

  return (
    <section className={"dash-card sc-card" + (open ? " is-open" : "")}>
      <div className="dash-card-head">
        <button type="button" className="su-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <h2>School contacts</h2>
          <span className="dash-count">{groups.length}</span>
          <span className="su-caret"><IconChevronDown size={18} /></span>
        </button>
      </div>
      {open && (
        <ul className="scc-list">
          {groups.map((g) => (
            <li key={g.id} className="scc-school">
              <strong>{g.name}</strong>
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
