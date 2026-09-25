import { supabase } from "./supabaseClient";

// Phase 3's family-facing side of the School Visits Tracker: "an automatic
// timetable appears on the family's dashboard within a minute." This reads
// straight off school_shortlist (now readable by the family themselves —
// see the family_read_school_shortlist / family_read_school_shortlist_child_status
// policies in addendum 38) rather than anything the founders' side has to
// push, so a tour a consultant just booked shows up here on next load —
// which is what "within a minute" means in a project with no notification
// service (see addendum 38's own header note on that).
const SHORTLIST_COLUMNS = `id, school_id, availability_status, availability_replied_at,
       tour_date, tour_start_time, tour_end_time, tour_status,
       tour2_date, tour2_start_time, tour2_end_time, tour2_status,
       tour_gate, tour_building, tour_parking, tour_ask_for, tour_bring,
       feedback_text, feedback_rating, feedback_at,
       priority, family_decision, family_decision_note,
       school:schools ( id, name, area, address, fees_url, admissions_contact_phone )`;

export async function fetchFamilyTimetable(familyId) {
  // Addendum 75 adds the family's own Keen / Maybe / Not for us. If that
  // hasn't been run yet, fall back to the old column list so the page
  // still loads.
  // Addendum 79 adds the "School Tour Details" fields (Maps link, on
  // arrival, arrival note + school defaults). Newest column set first,
  // falling back one addendum at a time so the page never breaks while a
  // migration hasn't been run yet.
  const attempts = [
    SHORTLIST_COLUMNS.replace(
      "school:schools ( id, name, area, address, fees_url, admissions_contact_phone )",
      `tour_maps_url, tour_on_arrival, tour_arrival_note,
       school:schools ( id, name, area, address, fees_url, admissions_contact_phone,
         default_tour_gate, default_tour_building, default_tour_parking, default_tour_ask_for,
         default_tour_bring, default_tour_maps_url, default_tour_on_arrival )`
    ) + ", family_interest, family_interest_note, family_interest_at",
    SHORTLIST_COLUMNS + ", family_interest, family_interest_note, family_interest_at",
    SHORTLIST_COLUMNS,
  ];
  let data;
  let error;
  for (const cols of attempts) {
    ({ data, error } = await supabase.from("school_shortlist").select(cols).eq("family_id", familyId));
    if (!error) break;
  }

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
const APPLICATION_COLUMNS = "id, child_id, school_id, status, fit, visit_date, rejected_reason, submitted_at";

export async function fetchFamilyApplications(childIds) {
  if (!childIds || childIds.length === 0) return [];
  // Addendum 80 adds the assessment time / meeting ID / passcode, addendum
  // 64 the date, link and details. Newest first, falling back so the page
  // never breaks while a migration hasn't been run yet.
  const attempts = [
    `${APPLICATION_COLUMNS}, assessment_date, assessment_time, assessment_link, assessment_meeting_id, assessment_passcode, assessment_notes`,
    `${APPLICATION_COLUMNS}, assessment_date, assessment_link, assessment_notes`,
    APPLICATION_COLUMNS,
  ];
  let data;
  let error;
  for (const cols of attempts) {
    ({ data, error } = await supabase.from("applications").select(cols).in("child_id", childIds));
    if (!error) break;
  }

  if (error) throw error;
  return data || [];
}

// Addendum 75: the family's own view of a school. Goes through an RPC
// because families can only read school_shortlist directly.
export async function setSchoolInterest(shortlistId, interest, note) {
  const { error } = await supabase.rpc("family_set_school_interest", {
    p_shortlist_id: shortlistId,
    p_interest: interest,
    p_note: note || null,
  });
  if (error) throw error;
}
