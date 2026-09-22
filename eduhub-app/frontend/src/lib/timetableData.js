import { supabase } from "./supabaseClient";

// Phase 3's family-facing side of the School Visits Tracker: "an automatic
// timetable appears on the family's dashboard within a minute." This reads
// straight off school_shortlist (now readable by the family themselves —
// see the family_read_school_shortlist / family_read_school_shortlist_child_status
// policies in addendum 38) rather than anything the founders' side has to
// push, so a tour a consultant just booked shows up here on next load —
// which is what "within a minute" means in a project with no notification
// service (see addendum 38's own header note on that).
export async function fetchFamilyTimetable(familyId) {
  const { data, error } = await supabase
    .from("school_shortlist")
    .select(
      `id, school_id, availability_status, availability_replied_at,
       tour_date, tour_start_time, tour_end_time, tour_status,
       tour2_date, tour2_start_time, tour2_end_time, tour2_status,
       tour_gate, tour_building, tour_parking, tour_ask_for, tour_bring,
       feedback_text, feedback_rating, feedback_at,
       priority, family_decision, family_decision_note,
       school:schools ( id, name, area, address, fees_url, admissions_contact_phone )`
    )
    .eq("family_id", familyId);

  if (error) throw error;

  const { data: childStatusRows, error: childStatusError } = await supabase
    .from("school_shortlist_child_status")
    .select("id, shortlist_id, child_id, availability_status, availability_replied_at");

  if (childStatusError) throw childStatusError;

  return { shortlist: data || [], childStatus: childStatusRows || [] };
}

// September 2026 redesign: "Your schools" merges the founders' School
// visits AND Applications tabs into one family-facing view, per school —
// so this reads straight off `applications` the same way the tours above
// read off `school_shortlist`. The applications_owner_all policy (base
// schema) already lets a family read/write their own children's rows; this
// only ever reads. childIds scopes the query to the family's own children
// (applications has no family_id column of its own, only child_id).
export async function fetchFamilyApplications(childIds) {
  if (!childIds || childIds.length === 0) return [];
  const { data, error } = await supabase
    .from("applications")
    .select("id, child_id, school_id, status, fit, visit_date, rejected_reason, submitted_at")
    .in("child_id", childIds);

  if (error) throw error;
  return data || [];
}
