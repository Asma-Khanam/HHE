import { parseDay, formatTime } from "./tourDetails";
import { meetingPlatform } from "./meetingLink";

// Assessment details the consultant saved on an application (addendum 64,
// time / meeting ID / passcode from addendum 80), in one shape for the
// Dashboard and Your schools.

export function hasAssessment(app) {
  return !!(app && (app.assessment_date || app.assessment_link || app.assessment_notes));
}

export function assessmentOf(app, { school, childName } = {}) {
  const link = (app.assessment_link || "").trim();
  const isUrl = /^https?:\/\//i.test(link);
  return {
    key: `assess-${app.id}`,
    app,
    school: school || {},
    childName: childName || "",
    date: app.assessment_date || null,
    time: app.assessment_time ? String(app.assessment_time).slice(0, 5) : null,
    link: isUrl ? link : "",
    linkText: !isUrl ? link : "",
    platform: isUrl ? meetingPlatform(link) : "",
    meetingId: (app.assessment_meeting_id || "").trim(),
    passcode: (app.assessment_passcode || "").trim(),
    notes: (app.assessment_notes || "").trim(),
  };
}

export function assessmentWhen(a) {
  if (!a.date) return "Date to be confirmed";
  const day = parseDay(a.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return a.time ? `${day}, ${formatTime(a.time)}` : day;
}

export function assessmentText(a) {
  return [
    `Assessment: ${a.school.name || "School"}${a.childName ? ` (${a.childName})` : ""}`,
    `When: ${assessmentWhen(a)}`,
    a.link && `Join: ${a.link}`,
    a.meetingId && `Meeting ID: ${a.meetingId}`,
    a.passcode && `Passcode: ${a.passcode}`,
    a.notes && `\n${a.notes}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function downloadAssessmentIcs(a) {
  if (!a.date) return;
  const d = a.date.replace(/-/g, "");
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, "\\$&");
  let start = `DTSTART;VALUE=DATE:${d}`;
  let end = null;
  if (a.time) {
    const [h, m] = a.time.split(":").map(Number);
    start = `DTSTART:${d}T${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00`;
    const eh = h + 1;
    end = `DTEND:${d}T${String(eh).padStart(2, "0")}${String(m).padStart(2, "0")}00`;
  }
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Heather Harries//Assessments//EN",
    "BEGIN:VEVENT",
    `UID:${a.key}@heatherharries`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    start,
    end,
    `SUMMARY:${esc(`Assessment: ${a.school.name || "School"}${a.childName ? ` (${a.childName})` : ""}`)}`,
    a.link ? `LOCATION:${esc(a.link)}` : a.school.address ? `LOCATION:${esc(a.school.address)}` : null,
    a.link ? `URL:${a.link}` : null,
    `DESCRIPTION:${esc(assessmentText(a))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const el = document.createElement("a");
  el.href = URL.createObjectURL(blob);
  el.download = `${(a.school.name || "school").replace(/[^a-z0-9]+/gi, "-")}-assessment.ics`;
  el.click();
  URL.revokeObjectURL(el.href);
}
