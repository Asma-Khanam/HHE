// School Visits workflow (21 Oct 2026 spec): the wording of every email the
// system drafts. Nothing here sends -- a consultant reviews and clicks Send.

const surnameOf = (name) => String(name || "").trim().split(/\s+/).pop() || "";
const firstName = (full) => String(full || "").trim().split(/\s+/)[0] || "";

export function longDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
function weekdayDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}
function clock(v) {
  const s = String(v || "").slice(0, 5);
  if (!s) return "";
  const [h, m] = s.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? ":" + String(m).padStart(2, "0") : ""} ${h >= 12 ? "pm" : "am"}`;
}

// "Term 1 2027-2028", or the planned move month, or "" when nothing is known.
export function entryLabel(child, plannedMoveDate) {
  const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
  const terms = list(child?.terms).filter((x) => !/flexible/i.test(x));
  const years = list(child?.academic_years_of_entry).sort();
  if (terms.length || years.length) return [terms.join(" or "), years.join(" or ")].filter(Boolean).join(" ");
  if (plannedMoveDate) {
    const d = new Date(plannedMoveDate);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  return "";
}

// "Monday 2 November, and Tuesday 3 November between 10 am and 12 pm"
export function blockedPhrase(blocked) {
  const parts = (blocked || []).map((b) =>
    b.blocks_start ? `${weekdayDate(b.blocks_date)} between ${clock(b.blocks_start)} and ${clock(b.blocks_end)}` : weekdayDate(b.blocks_date)
  );
  if (parts.length <= 1) return parts[0] || "";
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

const sign = (consultant) => `Warm regards,\n${consultant || ""}\nHeather Harries Relocate`.replace(/\n\n/g, "\n");

// Stage 2. Option 1 = the family's visit dates are known, so ask for spaces
// AND tour slots. Option 2 = no dates yet, ask about spaces only.
export function enquiryEmail({ option, familyName, children, from, to, blocked, contactName, schoolName, consultant, plannedMoveDate }) {
  const surname = surnameOf(familyName);
  const kids = (children || []).map((c) => ({
    name: c.name,
    year: c.year || "year group to confirm",
    entry: entryLabel(c.record, plannedMoveDate),
  }));
  const years = [...new Set(kids.map((k) => k.year))].join(" and ");
  const entries = [...new Set(kids.map((k) => k.entry).filter(Boolean))].join(" and ");
  const dear = `Dear ${contactName || "Admissions team"},`;
  const lines = kids
    .map((k) => `Could you please let me know whether you ${option === "option_1" ? "have" : "currently have"} ${option === "option_1" ? "availability" : "spaces"} for ${k.name} in ${k.year}${k.entry ? ` for ${k.entry}` : ""}?`)
    .join("\n");

  if (option === "option_1") {
    const bp = blockedPhrase(blocked);
    return {
      subject: `Availability and tour request: ${years}${entries ? `, ${entries}` : ""}, visiting ${longDate(from)} to ${longDate(to)}`,
      text:
        `${dear}\n\n` +
        `I am writing on behalf of the ${surname} family, who are relocating to the UAE and are very keen to learn more about ${schoolName}.\n\n` +
        `${lines}\n\n` +
        `The family will be in Dubai between ${longDate(from)} and ${longDate(to)} and would love to tour the school during that window. Could you share the dates and times you have available for a tour within those dates?` +
        (bp ? ` They are unfortunately not available on ${bp}.` : "") +
        `\n\nThank you so much for your help. I look forward to hearing from you.\n\n${sign(consultant)}`,
    };
  }
  return {
    subject: `Availability enquiry: ${years}${entries ? `, ${entries}` : ""}`,
    text:
      `${dear}\n\n` +
      `I am writing on behalf of the ${surname} family, who are relocating to the UAE and are very interested in ${schoolName}.\n\n` +
      `${lines}\n\n` +
      `Thank you so much for your help.\n\n${sign(consultant)}`,
  };
}

// Stage 1. Sent to the parent when visit dates are known, before the schools.
export function parentAvailabilityEmail({ parentName, from, to, consultant }) {
  return {
    subject: "When are you not available during your visit?",
    text:
      `Hi ${firstName(parentName) || "there"},\n\n` +
      `We're so looking forward to helping you see your shortlisted schools while you're in Dubai from ${longDate(from)} to ${longDate(to)}.\n\n` +
      `So we can plan tours around you, are there any days or times in that window when you're not available? Flights, meetings or anything else we should work around.\n\n` +
      `Warm regards,\n${consultant || ""}`,
  };
}

// Stage 5. Sent to the parent once every tour is confirmed and nothing clashes.
// tours: [{ date, start, end, school, kids: ["Jaxon", ...], label, details: ["Gate 3", ...] }]
export function tourScheduleEmail({ parentName, tours, consultant }) {
  const lines = (tours || []).map((t) => {
    const when = `${weekdayDate(t.date)}${t.start ? ", " + clock(t.start) + (t.end ? " to " + clock(t.end) : "") : ""}`;
    const kids = (t.kids || []).length ? ` (${t.kids.join(", ")})` : "";
    const extra = (t.details || []).filter(Boolean).join(" · ");
    return `${when}: ${t.school}${kids}${extra ? "\n   " + extra : ""}`;
  });
  return {
    subject: "Your school tour schedule",
    text:
      `Hi ${firstName(parentName) || "there"},\n\n` +
      `Every tour is now confirmed. Here is your schedule while you're in Dubai:\n\n` +
      `${lines.join("\n\n")}\n\n` +
      `Please let us know if anything changes on your side and we'll rearrange it with the school.\n\n` +
      `${sign(consultant)}`,
  };
}

const slotPhrase = (t) =>
  `${weekdayDate(t.date)}${t.start ? ` at ${clock(t.start)}` : ""}${t.start && t.end ? ` (until ${clock(t.end)})` : ""}`;
const kidsPhrase = (kids) => {
  const k = (kids || []).filter(Boolean);
  return k.length <= 1 ? k[0] || "the family" : k.slice(0, -1).join(", ") + " and " + k[k.length - 1];
};

// Email automation. Sent to the school after the consultant accepts an offered tour.
export function tourConfirmEmail({ contactName, schoolName, familyName, kids, tour, consultant }) {
  return {
    subject: `Tour confirmation: ${surnameOf(familyName)} family, ${weekdayDate(tour.date)}`,
    text:
      `Dear ${contactName || "Admissions team"},\n\n` +
      `Thank you for offering a tour at ${schoolName}. I am pleased to confirm that the ${surnameOf(familyName)} family would like to attend on ${slotPhrase(tour)}, for ${kidsPhrase(kids)}.\n\n` +
      `Could you please let me know if there is anything the family should bring, where they should go on arrival, and where to park?\n\n` +
      `Thank you so much for your help.\n\n${sign(consultant)}`,
  };
}

// Email automation. Sent when the offered time does not suit the parents: says
// when they are NOT free and asks for another time inside their visit.
export function tourChangeEmail({ contactName, schoolName, familyName, kids, offered, from, to, blocked, why, consultant }) {
  const bp = blockedPhrase(blocked);
  return {
    subject: `Another tour time? ${surnameOf(familyName)} family, ${schoolName}`,
    text:
      `Dear ${contactName || "Admissions team"},\n\n` +
      `Thank you for offering ${slotPhrase(offered)} for ${kidsPhrase(kids)}. Unfortunately that time does not work for the family${why ? ` (${why.replace(/\.$/, "")})` : ""}.\n\n` +
      (from && to ? `They will be in Dubai between ${longDate(from)} and ${longDate(to)}` : "They will be in Dubai during their visit") +
      (bp ? ` and are not available on ${bp}` : "") +
      `. Could you please offer another tour time within those dates?\n\n` +
      `Thank you so much for your help.\n\n${sign(consultant)}`,
  };
}
