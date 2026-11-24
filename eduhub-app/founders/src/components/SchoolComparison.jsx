import { useMemo, useState } from "react";
import { commuteEstimate, firstYearCost } from "../lib/travelCost";
import { stageOf } from "../lib/schoolStages";
import { khdaText } from "../lib/schoolFacts";
import { AVAILABILITY_OPTIONS, shortTour } from "./SchoolVisitsParts";
import "./SchoolComparison.css";

// Side-by-side comparison of a family's live shortlist: one column per school, one row per thing
// the family weighs up. Print / Save as PDF prints just the sheet. The first-year cost and the
// commute are estimates and are labelled that way. Nothing here is saved anywhere.
const AVAIL_LABEL = Object.fromEntries(AVAILABILITY_OPTIONS.map((o) => [o.value, o.label]));
const LEVEL_LABEL = { none: "None", limited: "Limited", moderate: "Moderate", extensive: "Extensive" };
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const aed = (n) => Math.round(n).toLocaleString("en-GB");

function feeText(s) {
  const from = num(s.tuition_from);
  const to = num(s.tuition_to) ?? from;
  if (from === null) return null;
  const cur = s.fee_currency || "AED";
  return from === to ? `${cur} ${aed(from)}` : `${cur} ${aed(from)}–${aed(to)}`;
}
const money = (s, key) => (num(s[key]) === null ? null : `${s.fee_currency || "AED"} ${aed(num(s[key]))}`);
const years = (s) => {
  if (!s.lowest_year_group && !s.highest_year_group) return null;
  const stage = stageOf(s);
  const range = `${s.lowest_year_group || "?"} to ${s.highest_year_group || "?"}`;
  return stage && stage !== "custom" ? `${stage}: ${range}` : range;
};

export default function SchoolComparison({ rows, familyChildren, childName, availOf, livingArea, onClose }) {
  const [showStatus, setShowStatus] = useState(true);

  const cols = useMemo(
    () =>
      rows.map((r) => {
        const s = r.school || {};
        return { row: r, school: s, trip: commuteEstimate(livingArea, s), cost: firstYearCost(s), fee: feeText(s) };
      }),
    [rows, livingArea]
  );

  const cheapest = Math.min(...cols.map((c) => num(c.school.tuition_from) ?? Infinity));
  const nearest = Math.min(...cols.map((c) => c.trip?.minutes ?? Infinity));

  const sections = [
    {
      title: "The school",
      lines: [
        ["Curriculum", (c) => c.school.curriculum],
        ["Area", (c) => c.school.area],
        ["Year groups taken", (c) => years(c.school)],
        ["Exam boards", (c) => (c.school.exam_boards || []).join(", ") || null],
        ["KHDA rating", (c) => khdaText(c.school).replace(/^KHDA /, "") || null],
      ],
    },
    {
      title: "Getting there",
      lines: [
        [
          livingArea ? `Commute from ${livingArea} (estimate)` : "Commute (estimate)",
          (c) => (c.trip ? `About ${c.trip.minutes} min (${c.trip.km} km)` : null),
          (c) => c.trip && c.trip.minutes === nearest && cols.filter((x) => x.trip).length > 1,
          "Shortest",
        ],
      ],
    },
    {
      title: "Cost",
      lines: [
        [
          "Tuition per year",
          (c) => c.fee,
          (c) => num(c.school.tuition_from) === cheapest && cols.filter((x) => num(x.school.tuition_from) !== null).length > 1,
          "Lowest",
        ],
        ["Application fee", (c) => money(c.school, "application_fee")],
        ["Deposit", (c) => money(c.school, "deposit_amount")],
        ["Transport per year", (c) => money(c.school, "transport_per_year")],
        ["First year, estimated", (c) => (c.cost ? `${c.cost.label}${c.cost.missing.length ? ` (before ${c.cost.missing.join(", ")})` : ""}` : null)],
      ],
    },
    {
      title: "Support",
      lines: [
        ["Inclusion level", (c) => LEVEL_LABEL[c.school.inclusion_level] || null],
        ["Needs supported", (c) => (c.school.inclusion_needs_supported || []).join(", ") || null],
      ],
    },
  ];

  const statusLines = showStatus
    ? [
        ...familyChildren.map((ch) => [
          `Place for ${childName(ch)}`,
          (c) => AVAIL_LABEL[availOf(c.row, ch.id)] || null,
        ]),
        ["Tour", (c) => (c.row.tour_date ? shortTour(c.row.tour_date, c.row.tour_start_time) : null)],
      ]
    : [];

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="sv-modal-back cmp-back" onClick={onClose}>
      <div className="sv-modal is-wide cmp-modal" role="dialog" aria-modal="true" aria-label="Compare schools" onClick={(e) => e.stopPropagation()}>
        <div className="cmp-top">
          <h3>Compare shortlisted schools</h3>
          <div className="cmp-actions">
            <label className="cmp-check">
              <input type="checkbox" checked={showStatus} onChange={(e) => setShowStatus(e.target.checked)} />
              Show places and tours
            </label>
            <button type="button" className="sv-btn is-primary is-sm" onClick={() => window.print()}>
              Print / Save as PDF
            </button>
            <button type="button" className="sv-btn is-sm is-quiet" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="cmp-sheet">
          <div className="cmp-sheet-head">
            <b>School comparison</b>
            <span>{today}</span>
          </div>
          <div className="cmp-scroll">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th />
                  {cols.map((c) => (
                    <th key={c.row.id}>{c.school.name || "School"}</th>
                  ))}
                </tr>
              </thead>
              {[...sections, ...(statusLines.length ? [{ title: "Places and tours", lines: statusLines }] : [])].map((sec) => (
                <tbody key={sec.title}>
                  <tr className="cmp-sec">
                    <td colSpan={cols.length + 1}>{sec.title}</td>
                  </tr>
                  {sec.lines.map(([label, get, best, tag]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      {cols.map((c) => {
                        const v = get(c);
                        return (
                          <td key={c.row.id} className={v ? "" : "is-empty"}>
                            {v || "Not recorded"}
                            {v && best && best(c) && <span className="cmp-best">{tag}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <p className="cmp-note">
            Commute and first-year cost are estimates from the school's area and recorded fees, not a live route or a quote. Fees are per
            child per year. Check details with each school.
          </p>
        </div>
      </div>
    </div>
  );
}
