// School Visits workflow (21 Oct 2026): every tour slot a school offers is
// checked against the times the parent can't do and the family's other tours.
// Same rule as the family_tour_conflict() database function (addendum 142),
// worked out here from rows the page already has so the Check column is
// instant and needs no extra round trip.

const t = (v) => (v ? String(v).slice(0, 5) : "");
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

// "10:15" -> "10:15 AM"
export function clock12(v) {
  const s = t(v);
  if (!s) return "";
  const [h, m] = s.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
}

// Every offered or confirmed slot on a family's shortlist, flattened so each
// slot is one entry (a row can hold two: tour_ and tour2_).
export function slotsFromShortlist(rows) {
  const out = [];
  for (const r of rows || []) {
    for (const p of ["tour_", "tour2_"]) {
      const date = r[p + "date"];
      const status = r[p + "status"] || "offered";
      if (!date || status === "cancelled" || status === "completed") continue;
      out.push({
        key: r.id + p,
        rowId: r.id,
        prefix: p,
        date,
        start: t(r[p + "start_time"]),
        end: t(r[p + "end_time"]),
        status,
        school: r.school?.name || "School",
      });
    }
  }
  return out;
}

// Returns a short human reason, or "" when the slot is clear.
export function conflictFor(slot, blocked, allSlots) {
  for (const b of blocked || []) {
    if (b.blocks_date !== slot.date) continue;
    if (!b.blocks_start && !b.blocks_end) return `Parent unavailable all day${b.reason ? ` (${b.reason})` : ""}`;
    if (slot.start && slot.end && overlaps(slot.start, slot.end, t(b.blocks_start), t(b.blocks_end))) {
      return `Parent unavailable ${clock12(b.blocks_start)}–${clock12(b.blocks_end)}${b.reason ? ` (${b.reason})` : ""}`;
    }
  }
  for (const o of allSlots || []) {
    if (o.key === slot.key || o.date !== slot.date) continue;
    if (slot.start && slot.end && o.start && o.end && overlaps(slot.start, slot.end, o.start, o.end)) {
      return `Clashes with the tour at ${o.school}`;
    }
  }
  return "";
}
