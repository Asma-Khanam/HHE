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
       tour_gate, tour_building, tour_parking, tour_ask_for, tour_bring,
       feedback_text, feedback_rating, feedback_at,
       school:schools ( id, name, area, address )`
    )
    .eq("family_id", familyId);

  if (error) throw error;

  const { data: childStatusRows, error: childStatusError } = await supabase
    .from("school_shortlist_child_status")
    .select("id, shortlist_id, child_id, availability_status, availability_replied_at");

  if (childStatusError) throw childStatusError;

  return { shortlist: data || [], childStatus: childStatusRows || [] };
}
