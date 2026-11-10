import { supabase } from "./supabaseClient";

// The WhatsApp tab's data (addendum 157). Messages are added by the server;
// staff can read them, mark them read, and file a number to a family.

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export async function listWhatsAppConversations() {
  return unwrap(await supabase.from("whatsapp_conversations").select("*").order("last_at", { ascending: false }).limit(500));
}

export async function listWhatsAppMessages(phone) {
  return unwrap(
    await supabase.from("whatsapp_messages").select("*").eq("contact_phone", phone).order("sent_at", { ascending: true }).limit(1000)
  );
}

export async function markWhatsAppRead(phone) {
  const { error } = await supabase
    .from("whatsapp_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("contact_phone", phone)
    .eq("direction", "in")
    .is("read_at", null);
  if (error) throw error;
}

export async function countUnreadWhatsApp() {
  const { count, error } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "in")
    .is("read_at", null);
  if (error) throw error;
  return count || 0;
}

// Files a number to a family: remembered for later messages, and applied to the ones already here.
export async function fileWhatsAppNumber(phone, familyId) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("whatsapp_contacts")
    .upsert({ contact_phone: phone, family_id: familyId, created_by: user?.id || null });
  if (error) throw error;
  const { error: e2 } = await supabase.from("whatsapp_messages").update({ family_id: familyId }).eq("contact_phone", phone);
  if (e2) throw e2;
}

// "971509427406" -> "+971 50 942 7406"
export function prettyPhone(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("971") && d.length === 12) return `+971 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return `+${d}`;
}

// Everything filed to one family, oldest first (a family can have two numbers: mother and father).
export async function listWhatsAppForFamily(familyId) {
  return unwrap(
    await supabase.from("whatsapp_messages").select("*").eq("family_id", familyId).order("sent_at", { ascending: true }).limit(1500)
  );
}

export async function markFamilyWhatsAppRead(familyId) {
  const { error } = await supabase
    .from("whatsapp_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("family_id", familyId)
    .eq("direction", "in")
    .is("read_at", null);
  if (error) throw error;
}
