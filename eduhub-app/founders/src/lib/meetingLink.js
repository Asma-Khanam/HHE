// Reads a pasted Teams / Zoom / Google Meet invite and pulls out the join
// link, meeting ID and passcode, so the family sees each one on its own
// line instead of one block of text (Heather, 25 Sept 2026).

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

function cleanUrl(u) {
  return u.replace(/[.,;:]+$/, "");
}

export function meetingPlatform(url) {
  const u = String(url || "").toLowerCase();
  if (u.includes("teams.microsoft") || u.includes("teams.live")) return "Microsoft Teams";
  if (u.includes("zoom.us")) return "Zoom";
  if (u.includes("meet.google")) return "Google Meet";
  if (u.includes("webex")) return "Webex";
  return u ? "Online meeting" : "";
}

export function parseMeetingInvite(text) {
  const raw = String(text || "");
  const urls = (raw.match(URL_RE) || []).map(cleanUrl);
  const link =
    urls.find((u) => /teams\.(microsoft|live)|zoom\.us|meet\.google|webex/i.test(u) && !/help|support|learn/i.test(u)) ||
    urls[0] ||
    "";

  let meetingId = "";
  let passcode = "";
  const id = raw.match(/meeting\s*id\s*[:#]?\s*([0-9][0-9 ]{5,}[0-9])/i);
  if (id) meetingId = id[1].replace(/\s+/g, " ").trim();
  const pass = raw.match(/(?:passcode|password|pass code|pin)\s*[:#]?\s*([^\s]+)/i);
  if (pass) passcode = pass[1].trim();

  // New-style Teams links carry both: teams.microsoft.com/meet/123456?p=abc
  const teamsMeet = link.match(/teams\.microsoft\.com\/meet\/(\d+)(?:\?p=([^&\s]+))?/i);
  if (teamsMeet) {
    if (!meetingId) meetingId = teamsMeet[1].replace(/(\d{3})(?=\d)/g, "$1 ").trim();
    if (!passcode && teamsMeet[2]) passcode = decodeURIComponent(teamsMeet[2]);
  }
  // Zoom: zoom.us/j/81234567890?pwd=...
  const zoom = link.match(/zoom\.us\/j\/(\d+)/i);
  if (zoom && !meetingId) meetingId = zoom[1];

  return { link, meetingId, passcode, platform: meetingPlatform(link) };
}

// True when the text is more than a bare link -- worth splitting.
export function looksLikeInvite(text) {
  const t = String(text || "").trim();
  return /meeting\s*id|passcode|password/i.test(t) || /\s/.test(t);
}
