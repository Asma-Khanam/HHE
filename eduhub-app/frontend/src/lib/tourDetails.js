// "School Tour Details" (founders' template, 25 Sept 2026) -- everything a
// parent needs for one booked tour, resolved from the tour itself first and
// the school's own defaults second. Used by the Dashboard's "Your next
// school tour" card and by Your schools.

export const DEFAULT_ARRIVAL = "Please arrive 10 minutes early";
export const DEFAULT_BRING = "Passport/Emirates ID";

const pick = (...vals) => vals.find((v) => typeof v === "string" && v.trim())?.trim() || "";

export function parseDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = Number(h);
  return `${((hour + 11) % 12) + 1}${m && m !== "00" ? ":" + m : ""}${hour >= 12 ? "pm" : "am"}`;
}

export function timeRange(start, end) {
  if (!start) return "";
  return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
}

export function mapsSearchUrl(school) {
  const q = [school?.name, school?.address || school?.area, "Dubai"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

// Every tour (primary and secondary) on a shortlist row, cancelled ones left out.
export function toursOfRow(row) {
  const list = [];
  if (row.tour_date && row.tour_status !== "cancelled")
    list.push({ key: `${row.id}-1`, rowId: row.id, row, date: row.tour_date, start: row.tour_start_time, end: row.tour_end_time, status: row.tour_status });
  if (row.tour2_date && row.tour2_status !== "cancelled")
    list.push({ key: `${row.id}-2`, rowId: row.id, row, date: row.tour2_date, start: row.tour2_start_time, end: row.tour2_end_time, status: row.tour2_status });
  return list;
}

export function tourDetails(tour) {
  const row = tour.row || {};
  const school = row.school || {};
  const gate = pick(row.tour_gate, school.default_tour_gate);
  const building = pick(row.tour_building, school.default_tour_building);
  const mapsUrl = pick(row.tour_maps_url, school.default_tour_maps_url);
  return {
    school: school.name || "School",
    date: tour.date ? parseDay(tour.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "",
    time: timeRange(tour.start, tour.end),
    arrival: pick(row.tour_arrival_note) || DEFAULT_ARRIVAL,
    entrance: [gate, building].filter(Boolean).join(" · "),
    parking: pick(row.tour_parking, school.default_tour_parking),
    mapsUrl: mapsUrl || mapsSearchUrl(school),
    hasOwnMapsLink: Boolean(mapsUrl),
    address: pick(school.address, school.area),
    contact: pick(row.tour_ask_for, school.default_tour_ask_for),
    onArrival: pick(row.tour_on_arrival, school.default_tour_on_arrival),
    bring: pick(row.tour_bring, school.default_tour_bring) || DEFAULT_BRING,
  };
}

export function tourDetailsText(tour) {
  const d = tourDetails(tour);
  return [
    "School Tour Details",
    `School: ${d.school}`,
    d.date && `Date: ${d.date}`,
    d.time && `Time: ${d.time}`,
    `Arrival: ${d.arrival}`,
    d.entrance && `Entrance/Gate: ${d.entrance}`,
    d.parking && `Parking: ${d.parking}`,
    `Location: ${d.mapsUrl}`,
    (d.contact || d.onArrival) && "",
    (d.contact || d.onArrival) && "Who to ask for",
    d.contact && `Contact: ${d.contact}`,
    d.onArrival && `On arrival: ${d.onArrival}`,
    "",
    "What to bring",
    d.bring,
  ]
    .filter((l) => l !== false && l !== null && l !== undefined)
    .join("\n");
}

// A real .ics file, so "Add to calendar" works with Apple, Google and
// Outlook calendars alike -- with the full tour details in the event notes.
export function downloadTourIcs(tour) {
  const school = tour.row?.school || {};
  const d = tour.date.replace(/-/g, "");
  const t = (x) => x.replace(/:/g, "").slice(0, 6).padEnd(6, "0");
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, "\\$&");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Heather Harries//School tours//EN",
    "BEGIN:VEVENT",
    `UID:${tour.key}@heatherharries`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    tour.start ? `DTSTART:${d}T${t(tour.start)}` : `DTSTART;VALUE=DATE:${d}`,
    tour.start && tour.end ? `DTEND:${d}T${t(tour.end)}` : null,
    `SUMMARY:${esc(`School tour: ${school.name || "School"}`)}`,
    school.address ? `LOCATION:${esc(school.address)}` : null,
    `DESCRIPTION:${esc(tourDetailsText(tour))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(school.name || "school").replace(/[^a-z0-9]+/gi, "-")}-tour.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}
