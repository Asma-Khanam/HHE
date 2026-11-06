import { parseDay, formatTime } from "./tourDetails";
import { meetingPlatform } from "./meetingLink";
import { buildIcs, downloadIcs, fileSlug } from "./calendarFile";

// Assessment details the consultant saved on an application (addendum 64,
// time / meeting ID / passcode from addendum 80), in one shape for the
// Dashboard and Your schools.

export function hasAssessment(app) {
  return !!(app && (app.assessment_date || app.assessment_link || app.assessment_notes || app.assessment_video_requested));
}

export function assessmentOf(app, { school, childName } = {}) {
  const link = (app.assessment_link || "").trim();
  const isUrl = /^https?:\/\//i.test(link);
  const mode = app.assessment_video_requested ? "video" : app.assessment_in_person ? "in_person" : "online";
  return {
    key: `assess-${app.id}`,
    app,
    school: school || {},
    childName: childName || "",
    mode,
    date: app.assessment_date || null,
    time: app.assessment_time ? String(app.assessment_time).slice(0, 5) : null,
    link: isUrl ? link : "",
    linkText: !isUrl ? link : "",
    platform: isUrl ? meetingPlatform(link) : "",
    meetingId: (app.assessment_meeting_id || "").trim(),
    passcode: (app.assessment_passcode || "").trim(),
    notes: (app.assessment_notes || "").trim(),
    videoSentAt: app.assessment_video_sent_at || null,
  };
}

export function assessmentWhen(a) {
  if (a.mode === "video" && !a.date) return a.videoSentAt ? "Video sent" : "Video needed";
  if (!a.date) return "Date to be confirmed";
  const day = parseDay(a.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return a.time ? `${day}, ${formatTime(a.time)}` : day;
}

export function assessmentText(a) {
  return [
    `Assessment: ${a.school.name || "School"}${a.childName ? ` (${a.childName})` : ""}`,
    a.mode === "video"
      ? `Video: ${a.videoSentAt ? "sent " + a.videoSentAt : "requested, not sent yet"}`
      : `When: ${assessmentWhen(a)}`,
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
  const school = a.school.name || "School";
  downloadIcs(
    `${fileSlug(school)}-assessment.ics`,
    buildIcs({
      uid: a.key,
      title: `Assessment: ${school}${a.childName ? ` (${a.childName})` : ""}`,
      date: a.date,
      start: a.time,
      location: a.link || a.school.address,
      url: a.link || null,
      description: assessmentText(a),
    })
  );
}
