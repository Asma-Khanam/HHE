import { supabase } from "./supabaseClient";
import { updateSchool } from "./staffData";

// School data keeper (addendum 158). Claude reads each school's website on the
// server and files suggestions; nothing changes on a school until Apply.

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export const FIELD_LABEL = {
  general_phone: "Main phone",
  admissions_contact_email: "Admissions email",
  admissions_contact_phone: "Admissions phone",
  fees_url: "Fees page",
  tour_booking_url: "Tour booking page",
  application_url: "Application page",
  address: "Address",
  application_fee: "Application fee (AED)",
  deposit_amount: "Deposit (AED)",
  curriculum: "Curriculum",
};
const NUMERIC = new Set(["application_fee", "deposit_amount"]);

export async function listSchoolDataOverview() {
  const [schools, checks, pending] = await Promise.all([
    supabase.from("schools").select("id, name, area, emirate, website_url").order("name"),
    supabase.from("school_data_checks").select("*"),
    supabase.from("school_update_suggestions").select("*").eq("status", "pending").order("created_at", { ascending: true }),
  ]);
  return { schools: unwrap(schools) || [], checks: unwrap(checks) || [], suggestions: unwrap(pending) || [] };
}

export async function requestSchoolCheck(schoolId) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch("/api/email-insight", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify({ schoolId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Couldn't check that school");
  return body;
}

async function resolve(id, status) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  unwrap(
    await supabase
      .from("school_update_suggestions")
      .update({ status, resolved_at: new Date().toISOString(), resolved_by: user?.id || null })
      .eq("id", id)
      .select()
  );
}

export async function applySuggestion(s) {
  const value = NUMERIC.has(s.field) ? Number(s.suggested_value) : s.suggested_value;
  await updateSchool(s.school_id, { [s.field]: value });
  await resolve(s.id, "applied");
}

export async function dismissSuggestion(s) {
  await resolve(s.id, "dismissed");
}
