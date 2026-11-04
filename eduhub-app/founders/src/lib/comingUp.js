// "Coming up" on Today: what is happening in the next 7 days, from the same dates the
// Calendar page shows (tours, assessments, consultations, first days at school). Read only:
// nothing here is saved, and it clears itself once the day has passed.

const dayName = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

const isFirstDay = (e) => e.category === "other" && /^first day at/i.test(e.title || "");

// fromIso (optional) lets the "Your week" strip also show days earlier this week.
export function comingUpItems(events, shortlistRows, fromIso) {
  const today = fromIso || new Date().toLocaleDateString("en-CA");
  const rowById = Object.fromEntries((shortlistRows || []).map((r) => [r.id, r]));
  const out = [];
  for (const e of events || []) {
    if (!e.date || e.date < today) continue;
    const time = e.start ? e.start + (e.end ? `–${e.end}` : "") : "All day";
    const base = { at: e.starts_at || e.date, id: "up:" + e.key, date: e.date, when: `${dayName(e.date)} · ${time}`, familyName: e.familyName || "", family_id: e.family_id };
    const fam = e.family_id ? `/staff/families/${e.family_id}` : null;

    if (e.category === "tour" && e.source === "shortlist_tour") {
      const row = rowById[e.id];
      const sharedAt = row?.[e.slot === 2 ? "tour2_shared_at" : "tour_shared_at"];
      const state =
        (e.status || "offered") === "offered"
          ? "Offered by the school. Accept it with the family, or ask for another time."
          : e.status === "completed"
            ? "Done."
            : row && sharedAt === null
              ? "Confirmed. The schedule has not been sent to the parent yet."
              : "Confirmed.";
      out.push({ ...base, kind: "Tour", title: e.title, state, path: fam && `${fam}?tab=visits&school=${e.school_id}` });
    } else if (e.category === "tour") {
      out.push({ ...base, kind: "Visit", title: e.title, state: e.childName ? `For ${e.childName}.` : "", path: fam && `${fam}?tab=visits&school=${e.school_id}` });
    } else if (e.category === "assessment") {
      out.push({ ...base, kind: "Assessment", title: e.title, state: e.childName ? `For ${e.childName}.` : "", path: fam && `${fam}?tab=applications&school=${e.school_id}` });
    } else if (e.category === "consultation") {
      out.push({ ...base, kind: "Consultation", title: e.title, state: e.hostName ? `With ${e.hostName}.` : "", path: fam || "/staff/consultations" });
    } else if (isFirstDay(e)) {
      out.push({ ...base, kind: "Start date", title: e.title, state: "Send a good-luck message on the first day.", path: fam });
    }
  }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
