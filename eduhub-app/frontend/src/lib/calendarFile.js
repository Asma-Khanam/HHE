// One place that writes calendar files (.ics) for tours and assessments.
// Times are saved in Dubai time, so the file says so (TZID Asia/Dubai). A family
// whose phone is set to another timezone then still sees the right moment, instead
// of the same clock time in the wrong place. Each event also gets a reminder an hour before.

const DUBAI = "Asia/Dubai";
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${DUBAI}`,
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:+0400",
  "TZOFFSETTO:+0400",
  "TZNAME:GST",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/[,;]/g, "\\$&");
const pad = (n) => String(n).padStart(2, "0");
const clock = (t) => String(t).replace(/:/g, "").slice(0, 4).padEnd(4, "0") + "00";

// Long lines are folded at 75 characters, as the format asks.
function fold(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(" " + line.slice(i, i + 74));
  return parts.join("\r\n");
}

// "HH:MM" plus minutes, kept within the same day.
function plus(t, minutes) {
  const [h, m] = String(t).split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

// date "YYYY-MM-DD", start / end "HH:MM" (end optional: one hour after the start).
export function buildIcs({ uid, title, date, start, end, location, description, url }) {
  const d = date.replace(/-/g, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Heather Harries//Family app//EN",
    "CALSCALE:GREGORIAN",
    ...(start ? VTIMEZONE : []),
    "BEGIN:VEVENT",
    `UID:${uid}@heatherharries`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    start ? `DTSTART;TZID=${DUBAI}:${d}T${clock(start)}` : `DTSTART;VALUE=DATE:${d}`,
    start ? `DTEND;TZID=${DUBAI}:${d}T${clock(end || plus(start, 60))}` : null,
    `SUMMARY:${esc(title)}`,
    location ? `LOCATION:${esc(location)}` : null,
    url ? `URL:${url}` : null,
    description ? `DESCRIPTION:${esc(description)}` : null,
    ...(start ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(title)}`, "TRIGGER:-PT60M", "END:VALARM"] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(fold).join("\r\n");
}

export function downloadIcs(filename, text) {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const fileSlug = (s) => String(s || "school").replace(/[^a-z0-9]+/gi, "-");

// The notification inbox keeps times as text ("9:30am – 10:30am"): turn them back into HH:MM.
export function timesFromText(text) {
  const out = [];
  String(text || "").replace(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi, (_, h, m, ap) => {
    let hour = Number(h) % 12;
    if (/pm/i.test(ap)) hour += 12;
    out.push(`${pad(hour)}:${m || "00"}`);
    return "";
  });
  return { start: out[0] || null, end: out[1] || null };
}
