import { supabase } from "./supabaseClient";

// Every signed-up user needs exactly one row in `families` linking their auth
// account to their data (parents, children, etc all hang off family_id).
// Called right after sign up, and again on login as a safety net in case sign
// up didn't get a session immediately (e.g. email confirmation was pending).
export async function ensureFamilyExists() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in." };

  const { data: existing, error: lookupError } = await supabase
    .from("families")
    .select("id")
    .eq("account_user_id", user.id)
    .maybeSingle();

  if (lookupError) return { error: lookupError.message };
  if (existing) return { data: existing };

  const { data: created, error: insertError } = await supabase
    .from("families")
    .insert({ account_user_id: user.id })
    .select("id")
    .single();

  if (insertError) return { error: insertError.message };
  return { data: created };
}
