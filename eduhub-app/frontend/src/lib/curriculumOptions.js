import { supabase } from "./supabaseClient";

// CS-02 (September 2026 change request): "If a parent chooses 'Other', they
// can add the curriculum that is not listed, and it joins the dropdown for
// future families." formOptions.js's CURRICULA list is the fixed starting
// set; this table holds whatever families have typed in beyond that, so the
// dropdown keeps growing instead of asking the next family with the same
// curriculum to type it in all over again.
//
// Deliberately its own tiny table rather than editing CURRICULA in code —
// nobody should need a deploy to add "Reggio Emilia" to a dropdown.

export async function fetchCustomCurricula() {
  const { data, error } = await supabase.from("curriculum_options").select("name").order("name", { ascending: true });
  if (error) {
    // Missing table (addendum not run yet) or any other read failure — the
    // dropdown just falls back to the fixed CURRICULA list, same as before
    // this feature existed. Never worth blocking the form over.
    console.warn(
      "Couldn't load extra curriculum options — run eduhub_schema_addendum_30_curriculum_options.sql in the Supabase SQL editor if this table doesn't exist yet."
    );
    return [];
  }
  return (data || []).map((row) => row.name).filter(Boolean);
}

// Adds a new curriculum name for every family after this one to see in the
// dropdown. Safe to call more than once with the same name (unique
// constraint + onConflict) and safe to call when the table doesn't exist yet
// — this never blocks or interrupts a family's own save.
export async function addCustomCurriculum(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  try {
    const { error } = await supabase.from("curriculum_options").upsert({ name: trimmed }, { onConflict: "name" });
    if (error) throw error;
  } catch (err) {
    console.warn("Couldn't save the new curriculum option for future families:", err?.message || err);
  }
}
