import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loadSchoolAnalytics, computeSchoolAnalytics } from "../lib/schoolAnalytics";
import { ChartCard, Kpi, Funnel, StackedBars, Scatter, Empty } from "./InsightCharts";
import UaeMap from "./UaeMap";
import { Donut, AreaTrend } from "./SchoolCharts";
import { EMIRATES, OUTSIDE_UAE } from "../data/emirates";
import "../pages/InsightsPage.css";
import "./SchoolAnalytics.css";

// Schools > Analytics (founders, 25 Sept 2026). Answers the questions a
// consultant actually asks about schools: where do our children end up,
// which schools say yes, who's slow to answer, and which applications
// need chasing today. Live from the same tables the rest of the app uses.

const RANGES = [
  { key: "all", label: "All time" },
  { key: "12m", label: "Last 12 months" },
  { key: "90d", label: "Last 90 days" },
];

// Same validated outcome colours as the main Dashboard.
const OUTCOME_KEYS = [
  { key: "offers", label: "Offer", color: "#1baf7a" },
  { key: "pending", label: "Waiting", color: "#2a78d6" },
  { key: "declined", label: "Declined", color: "#e34948" },
];

const STATUS_LABEL = {
  submitted: "Submitted",
  assessment_booked: "Assessment booked",
  under_review: "Awaiting decision",
  waitlisted: "Waitlisted",
};

const asTable = (list, col) => ({ columns: ["", col], rows: list.map((d) => [d.label, d.value]) });

const METRICS = [
  { key: "schools", label: "Schools", note: "schools on our system" },
  { key: "shortlisted", label: "Shortlisted", note: "times a family shortlisted a school here" },
  { key: "applied", label: "Applications", note: "applications made" },
  { key: "placed", label: "Placed", note: "children placed" },
];
const BOARDS = [
  { key: "placed", label: "Most placed", empty: "No children placed yet." },
  { key: "shortlisted", label: "Most shortlisted", empty: "Nothing shortlisted yet." },
  { key: "offerRate", label: "Says yes most", empty: "Needs 2+ decisions from a school." },
  { key: "speed", label: "Fastest to answer", empty: "Builds up as schools answer." },
];
const MIX_COLORS = ["#7a1743", "#b89a5a", "#d98aa5", "#3a8f85", "#5b6b8c"];
const shortDate = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";

const SORTS = {
  placed: (a, b) => b.placed - a.placed || b.applied - a.applied,
  applied: (a, b) => b.applied - a.applied,
  shortlisted: (a, b) => b.shortlisted - a.shortlisted,
  offerRate: (a, b) => (b.offerRate ?? -1) - (a.offerRate ?? -1),
  medianDecision: (a, b) => (a.medianDecision ?? 9999) - (b.medianDecision ?? 9999),
  name: (a, b) => a.name.localeCompare(b.name),
};

export default function SchoolAnalytics() {
  const navigate = useNavigate();
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("all");
  const [hideTest, setHideTest] = useState(true);
  const [sort, setSort] = useState("placed");
  const [showAllChase, setShowAllChase] = useState(false);
  const [metric, setMetric] = useState("schools");
  const [emirate, setEmirate] = useState(null);
  const [boardKey, setBoardKey] = useState("placed");
  const [curr, setCurr] = useState("placed");

  useEffect(() => {
    loadSchoolAnalytics()
      .then(setRaw)
      .catch((e) => setError(e.message || "Couldn't load the analytics."));
  }, []);

  const d = useMemo(() => (raw ? computeSchoolAnalytics(raw, { range, hideTest }) : null), [raw, range, hideTest]);
  if (error) return <div className="hh-form-banner hh-form-banner-error">{error}</div>;
  if (!d) return <p className="in-loading">Crunching the numbers…</p>;
  const k = d.kpis;
  const table = [...d.scorecard].filter((s) => !emirate || s.emirate === emirate).sort((a, b) => SORTS[sort](a, b));
  const chase = showAllChase ? d.chase : d.chase.slice(0, 8);

  const allNames = [...EMIRATES, OUTSIDE_UAE];
  const sum = (key) => allNames.reduce((t, n) => t + d.byEmirate[n][key], 0);
  const totals = { name: "All of the UAE", schools: sum("schools"), shortlisted: sum("shortlisted"), applied: sum("applied"), placed: sum("placed") };
  const focus = emirate ? d.byEmirate[emirate] : totals;
  const mapValues = Object.fromEntries(EMIRATES.map((n) => [n, d.byEmirate[n][metric]]));
  const rank = allNames
    .map((n) => ({ name: n, value: d.byEmirate[n][metric] }))
    .filter((r) => r.value > 0 || r.name !== OUTSIDE_UAE)
    .sort((a, b) => b.value - a.value || EMIRATES.indexOf(a.name) - EMIRATES.indexOf(b.name));
  const rankMax = Math.max(1, ...rank.map((r) => r.value));
  const metricNote = METRICS.find((m) => m.key === metric).note;
  const board = d.leaderboards[boardKey];
  const mixTotal = emirate ? d.byEmirate[emirate].curricula.reduce((t, c) => t + c.value, 0) : 0;
  const currData = curr === "placed" ? d.placedByCurriculum : d.curriculumShortlisted;

  const SortTh = ({ id, children, num }) => (
    <th className={num ? "is-num" : ""}>
      <button type="button" className={"sa-sort" + (sort === id ? " is-on" : "")} onClick={() => setSort(id)}>
        {children}
        {sort === id ? " ▾" : ""}
      </button>
    </th>
  );

  return (
    <div className="in-page sa">
      <header className="in-head">
        <div>
          <h2 className="sa-title">School analytics</h2>
          <p>Live from every shortlist, tour and application.</p>
        </div>
        <div className="in-filters">
          <div className="in-seg" role="tablist" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                role="tab"
                aria-selected={range === r.key}
                className={range === r.key ? "is-on" : ""}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <label className="in-check">
            <input type="checkbox" checked={hideTest} onChange={(e) => setHideTest(e.target.checked)} />
            Hide test families
          </label>
        </div>
      </header>

      <div className="in-kpis">
        <Kpi label="Children placed through us" value={k.placed} sub={`of ${k.children} children on file`} tone="good" />
        <Kpi label="Applications made" value={k.applied} sub={`across ${k.schoolsUsed} schools`} />
        <Kpi label="Offer rate" value={k.offerRate === null ? "—" : `${k.offerRate}%`} sub={`${k.offers} offers from ${k.decided} decisions`} />
        <Kpi label="Tour → application" value={k.tourConversion === null ? "—" : `${k.tourConversion}%`} sub="of schools toured" />
        <Kpi label="Days to a decision" value={k.medianDecision ?? "—"} sub="median, from applying" />
        <Kpi
          label="Next 14 days"
          value={k.upcomingTours + k.upcomingAssessments}
          sub={`${k.upcomingTours} tours · ${k.upcomingAssessments} assessments`}
        />
      </div>

      <section className="in-card sa-hero">
        <header className="in-card-head sa-hero-head">
          <div>
            <h2>Where we work</h2>
            <p>The UAE by emirate. Click an emirate to see what is happening there.</p>
          </div>
          <div className="in-seg" role="tablist" aria-label="Show on the map">
            {METRICS.map((m) => (
              <button key={m.key} type="button" role="tab" aria-selected={metric === m.key} className={metric === m.key ? "is-on" : ""} onClick={() => setMetric(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
        </header>
        <div className="sa-hero-body">
          <UaeMap values={mapValues} selected={emirate} onSelect={setEmirate} />
          <aside className="sa-side">
            <ul className="sa-rank" aria-label={`Emirates by ${metricNote}`}>
              {rank.map((r) => (
                <li key={r.name}>
                  <button type="button" className={emirate === r.name ? "is-on" : ""} onClick={() => setEmirate(emirate === r.name ? null : r.name)}>
                    <span className="sa-rank-name">{r.name}</span>
                    <span className="sa-rank-track">
                      <span style={{ width: `${(r.value / rankMax) * 100}%` }} />
                    </span>
                    <b>{r.value}</b>
                  </button>
                </li>
              ))}
            </ul>

            <div className="sa-focus">
              <div className="sa-focus-head">
                <h3>{focus.name}</h3>
                {emirate && (
                  <button type="button" className="sa-clear" onClick={() => setEmirate(null)}>
                    Show all ✕
                  </button>
                )}
              </div>
              <div className="sa-focus-stats">
                <div><b>{focus.schools}</b><span>schools</span></div>
                <div><b>{focus.shortlisted}</b><span>shortlisted</span></div>
                <div><b>{focus.applied}</b><span>applications</span></div>
                <div><b>{focus.placed}</b><span>placed</span></div>
              </div>
              {emirate ? (
                <>
                  {focus.offerRate !== null && <p className="sa-focus-line">Offer rate here: <b>{focus.offerRate}%</b> of {focus.offers + focus.declined} decisions.</p>}
                  <h4>Busiest schools</h4>
                  {focus.topSchools.length ? (
                    <ul className="sa-focus-schools">
                      {focus.topSchools.map((s) => (
                        <li key={s.id}>
                          <Link to={`/staff/schools/${s.id}`}>{s.name}</Link>
                          <span>{s.placed ? `${s.placed} placed` : s.applied ? `${s.applied} applied` : `${s.shortlisted} shortlisted`}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="sa-focus-line">No family activity at a school here yet.</p>
                  )}
                  {focus.curricula.length > 0 && (
                    <>
                      <h4>Curricula on our list</h4>
                      <div className="sa-mix" role="img" aria-label="Curriculum mix">
                        {focus.curricula.map((c, i) => (
                          <span key={c.label} style={{ width: `${(c.value / mixTotal) * 100}%`, background: MIX_COLORS[i % MIX_COLORS.length] }} title={`${c.label}: ${c.value}`} />
                        ))}
                      </div>
                      <ul className="sa-mix-legend">
                        {focus.curricula.map((c, i) => (
                          <li key={c.label}><i style={{ background: MIX_COLORS[i % MIX_COLORS.length] }} />{c.label} <b>{c.value}</b></li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              ) : (
                d.noEmirate > 0 && (
                  <p className="sa-focus-line">{d.noEmirate} school{d.noEmirate === 1 ? " has" : "s have"} no emirate yet. Set it on the school record so it shows here.</p>
                )
              )}
            </div>
          </aside>
        </div>
      </section>

      {d.findings.length > 0 && (
        <section className="in-findings">
          <h2>What the data says</h2>
          <ul>
            {d.findings.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="in-grid">
        <ChartCard
          title="From shortlist to placed"
          subtitle="Each family + school pair · % is step-to-step"
          table={{
            columns: ["Step", "Pairs", "From previous"],
            rows: d.funnel.map((s, i) => [
              s.label,
              s.value,
              i ? `${d.funnel[i - 1].value ? Math.round((s.value / d.funnel[i - 1].value) * 100) : 0}%` : "—",
            ]),
          }}
        >
          <Funnel steps={d.funnel} />
        </ChartCard>

        <section className="in-card">
          <header className="in-card-head">
            <div>
              <h2>Curriculum mix</h2>
              <p>{curr === "placed" ? "Curriculum of the school each child was placed at" : "Curriculum of every school a family shortlisted"}</p>
            </div>
            <div className="in-seg sa-mini-seg" role="tablist" aria-label="Curriculum view">
              <button type="button" role="tab" aria-selected={curr === "placed"} className={curr === "placed" ? "is-on" : ""} onClick={() => setCurr("placed")}>Placed</button>
              <button type="button" role="tab" aria-selected={curr === "shortlisted"} className={curr === "shortlisted" ? "is-on" : ""} onClick={() => setCurr("shortlisted")}>Shortlisted</button>
            </div>
          </header>
          <div className="in-card-body">
            <Donut data={currData} unit={curr === "placed" ? "children" : "shortlists"} />
          </div>
        </section>

        <section className="in-card">
          <header className="in-card-head">
            <div>
              <h2>Top schools</h2>
              <p>Our busiest, friendliest and quickest schools</p>
            </div>
          </header>
          <div className="in-seg sa-board-tabs" role="tablist" aria-label="Leaderboard">
            {BOARDS.map((b) => (
              <button key={b.key} type="button" role="tab" aria-selected={boardKey === b.key} className={boardKey === b.key ? "is-on" : ""} onClick={() => setBoardKey(b.key)}>
                {b.label}
              </button>
            ))}
          </div>
          <div className="in-card-body">
            {board.length === 0 ? (
              <Empty>{BOARDS.find((b) => b.key === boardKey).empty}</Empty>
            ) : (
              <ol className="sa-board">
                {board.map((s, i) => (
                  <li key={s.id}>
                    <span className={"sa-board-rank r" + (i + 1)}>{i + 1}</span>
                    <Link to={`/staff/schools/${s.id}`} className="sa-board-name">
                      {s.name}
                      <em>{[s.area, s.emirate].filter((v, i, arr) => v && arr.indexOf(v) === i).join(" · ")}</em>
                    </Link>
                    <span className="sa-board-val">{s.value}{s.unit}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <ChartCard
          title="Popular vs successful"
          subtitle="Each dot is a school · bigger dot = more applications"
          table={{ columns: ["School", "Shortlisted", "Offer rate %", "Applications"], rows: d.scatter.map((p) => [p.label, p.x, p.y, p.r]) }}
        >
          <Scatter points={d.scatter} />
        </ChartCard>

        <ChartCard
          title="School tours by month"
          subtitle="Last 6 months, this month and the next 3 (dashed) · plan diaries around it"
          table={{ columns: ["Month", "Tours"], rows: d.months.map((m) => [m.fullLabel, m.value]) }}
        >
          <AreaTrend data={d.months} future={3} />
        </ChartCard>

        <ChartCard title="Why schools say no" subtitle="Reason recorded on declined applications" table={asTable(d.declineReasons, "Applications")}>
          <Donut data={d.declineReasons} unit="declined" />
        </ChartCard>

        <ChartCard
          wide
          title="What happens to our applications"
          subtitle="Top schools by applications made"
          table={{
            columns: ["School", "Offer", "Waiting", "Declined", "Closed (placed elsewhere)"],
            rows: d.outcomes.map((s) => [s.name, s.offers, s.pending, s.declined, s.closed]),
          }}
          footnote="Applications closed because the child was placed at another school aren't counted as waiting."
        >
          <StackedBars rows={d.outcomes} keys={OUTCOME_KEYS} />
        </ChartCard>
      </div>

      <section className="in-card is-wide sa-chase">
        <header className="in-card-head">
          <div>
            <h2>Waiting on a school ({d.chase.length})</h2>
            <p>Applications with no answer yet, longest wait first. Worth a chase email.</p>
          </div>
        </header>
        {d.chase.length === 0 ? (
          <Empty>Nothing waiting on a school right now.</Empty>
        ) : (
          <>
            <table className="in-table sa-table">
              <thead>
                <tr>
                  <th>School</th>
                  <th>Child</th>
                  <th>Family</th>
                  <th>Stage</th>
                  <th className="is-num">Waiting</th>
                </tr>
              </thead>
              <tbody>
                {chase.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/staff/families/${c.familyId}?tab=applications&school=${c.schoolId}`)}>
                    <td>{c.school}</td>
                    <td>{c.child}</td>
                    <td>{c.family}</td>
                    <td>
                      {STATUS_LABEL[c.status] || c.status}
                      {c.assessment ? ` · assessment ${shortDate(c.assessment)}` : ""}
                    </td>
                    <td className="is-num">
                      {c.days === null ? "—" : <span className={"sa-wait" + (c.days >= 14 ? " is-late" : c.days >= 7 ? " is-warn" : "")}>{c.days} days</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.chase.length > 8 && (
              <button type="button" className="sa-more" onClick={() => setShowAllChase((v) => !v)}>
                {showAllChase ? "Show fewer" : `Show all ${d.chase.length}`}
              </button>
            )}
          </>
        )}
      </section>

      <section className="in-card is-wide sa-score">
        <header className="in-card-head">
          <div>
            <h2>School scorecard{emirate ? ` · ${emirate}` : ""}</h2>
            <p>Every school we've used. Click a heading to sort, click a school to open it.</p>
          </div>
          {emirate && (
            <button type="button" className="sa-clear" onClick={() => setEmirate(null)}>
              Show all emirates ✕
            </button>
          )}
        </header>
        {table.length === 0 ? (
          <Empty>{emirate ? `No family activity at a school in ${emirate} yet.` : "Not enough data yet."}</Empty>
        ) : (
          <div className="sa-scroll">
            <table className="in-table sa-table">
              <thead>
                <tr>
                  <SortTh id="name">School</SortTh>
                  <SortTh id="shortlisted" num>Shortlisted</SortTh>
                  <th className="is-num">Toured</th>
                  <SortTh id="applied" num>Applied</SortTh>
                  <th className="is-num">Offers</th>
                  <SortTh id="placed" num>Placed</SortTh>
                  <SortTh id="offerRate" num>Offer rate</SortTh>
                  <SortTh id="medianDecision" num>Days to answer</SortTh>
                  <th className="is-num">Families keen</th>
                </tr>
              </thead>
              <tbody>
                {table.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/staff/schools/${s.id}`}>{s.name}</Link>
                      {(s.area || s.emirate) && <span className="sa-sub">{[s.area, s.emirate].filter((v, i, arr) => v && arr.indexOf(v) === i).join(" · ")}</span>}
                    </td>
                    <td className="is-num">{s.shortlisted}</td>
                    <td className="is-num">{s.toured}</td>
                    <td className="is-num">{s.applied}</td>
                    <td className="is-num">{s.offers}</td>
                    <td className="is-num">
                      <strong>{s.placed}</strong>
                    </td>
                    <td className="is-num">
                      {s.offerRate === null ? (
                        "—"
                      ) : (
                        <span className="sa-rate">
                          <span className="sa-rate-track"><span style={{ width: `${s.offerRate}%` }} /></span>
                          {s.offerRate}%
                        </span>
                      )}
                    </td>
                    <td className="is-num">{s.medianDecision ?? "—"}</td>
                    <td className="is-num">{s.shortlisted ? `${s.keen}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
