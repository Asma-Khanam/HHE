// The "Ask about places" email (Miss Lyndsay, 26 Oct 2026). Plain wording, with
// the child's date of birth, the term and academic year, the year group and, only
// when the family has dates in Dubai on their account, the visit sentence.

const pad = (n) => String(n).padStart(2, "0");

function dmy(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function longDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function joinList(items) {
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const uniq = (children, key) => [...new Set(children.flatMap((c) => (Array.isArray(c[key]) ? c[key] : [])).filter(Boolean))];

export function placesEmailText({ familyName = "", children = [], dubaiFrom = "", dubaiUntil = "" }) {
  const surname = String(familyName || "").trim().split(/\s+/).pop();
  const fam = surname ? `the ${surname} family` : "a family";

  const kids = children.length ? children : [{}];
  const many = kids.length > 1;
  const nameOf = (c) => c.preferred_name || c.first_name || (c.full_name || "").split(" ")[0] || "(child's name)";
  const dobOf = (c) => {
    const d = c.date_of_birth ? dmy(c.date_of_birth) : "";
    return d ? ` (DOB ${d})` : "";
  };
  const yearOf = (c) => (c.year_group_applying_for || "").split(" /")[0].trim() || "(year group)";

  const genders = [...new Set(kids.map((c) => String(c.gender || "").toLowerCase()))];
  const noun = many ? "children" : genders[0] === "female" ? "daughter" : genders[0] === "male" ? "son" : "child";
  const places = many ? "school places" : "a school place";
  const childList = joinList(kids.map((c) => `${nameOf(c)}${dobOf(c)}`));

  // Term + academic year, e.g. "term 2 of the 2026-27 academic year" and "a January start".
  const terms = uniq(children, "terms").filter((x) => !/flexible/i.test(x));
  const years = uniq(children, "academic_years_of_entry").sort();
  const termNums = terms.map((t) => /term\s*(\d)/i.exec(t)?.[1]).filter(Boolean).sort();
  const months = terms.slice().sort().map((t) => /\(([A-Za-z]+)\s+start\)/i.exec(t)?.[1]).filter(Boolean);
  let forClause = "";
  if (termNums.length) {
    forClause = ` for term ${termNums.join(" or ")}${years.length ? ` of the ${years.join(" or ")} academic year` : ""}`;
  } else if (years.length) {
    forClause = ` for the ${years.join(" or ")} academic year`;
  }
  const startClause = months.length ? ` for ${/^[aeiou]/i.test(months[0]) ? "an" : "a"} ${months.join(" or ")} start` : "";

  const joinFull = many
    ? `${joinList(kids.map((c) => `${nameOf(c)} would be looking to join ${yearOf(c)}`))}.`
    : `${nameOf(kids[0])} would be looking to join ${yearOf(kids[0])}.`;

  const fromTxt = dubaiFrom ? longDay(dubaiFrom) : "";
  const untilTxt = dubaiUntil ? longDay(dubaiUntil) : "";
  let visit = "";
  if (fromTxt || untilTxt) {
    const when = fromTxt && untilTxt ? `from ${fromTxt} until ${untilTxt}` : fromTxt ? `from ${fromTxt}` : `until ${untilTxt}`;
    visit = ` If so, the family will be in Dubai ${when}, could you please let me know if you have tours available they could join?`;
  }

  return (
    `Hi\n\n` +
    `We are currently supporting ${fam} who are looking for ${places} for their ${noun}, ${childList},${forClause}.\n` +
    `${joinFull}\n` +
    `Could you please advise if you have any availability in ${many ? "these year groups" : "this year group"}${startClause}?${visit}\n\n` +
    `Kind regards,`
  );
}
