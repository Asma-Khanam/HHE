import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loadSchoolAnalytics, computeSchoolAnalytics } from "../lib/schoolAnalytics";
import { ChartCard, Kpi, BarList, Columns, Funnel, StackedBars, Empty } from "./InsightCharts";
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

  useEffect(() => {
    loadSchoolAnalytics()
      .then(setRaw)
      .catch((e) => setError(e.message || "Couldn't load the analytics."));
  }, []);

  const d = useMemo(() => (raw ? computeSchoolAnalytics(raw, { range, hideTest }) : null), [raw, range, hideTest]);
  if (error) return <div className="hh-form-banner hh-form-banner-error">{error}</div>;
  if (!d) return <p className="in-loading">Crunching the numbers…</p>;
  const k = d.kpis;
  const table = [...d.scorecard].sort(SORTS[sort]);
  const chase = showAllChase ? d.chase : d.chase.slice(0, 8);

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
                    <td className={"is-num" + (c.days >= 14 ? " sa-late" : "")}>{c.days === null ? "—" : `${c.days} days`}</td>
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

        <ChartCard title="Where our children are placed" subtitle="Children placed, by school" table={asTable(d.placedBySchool, "Children")}>
          <BarList data={d.placedBySchool} />
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

        <ChartCard title="Who says yes" subtitle="Offer rate, schools with 2+ decisions" table={asTable(d.offerRates, "Offer rate %")}>
          {d.offerRates.length ? <BarList data={d.offerRates} showShare={false} unit="%" /> : <Empty>Needs 2+ decisions from a school.</Empty>}
        </ChartCard>

        <ChartCard title="How long schools take" subtitle="Median days from applying to an answer · fastest first" table={asTable(d.speed, "Days")}>
          {d.speed.length ? (
            <BarList data={d.speed} showShare={false} unit=" days" />
          ) : (
            <Empty>Builds up as schools answer.</Empty>
          )}
        </ChartCard>

        <ChartCard title="Most shortlisted" subtitle="Families who put each school on their list" table={asTable(d.popular, "Families")}>
          <BarList data={d.popular} showShare={false} />
        </ChartCard>

        <ChartCard title="Why schools say no" subtitle="Reason recorded on declined applications" table={asTable(d.declineReasons, "Applications")}>
          <BarList data={d.declineReasons} />
        </ChartCard>

        <ChartCard
          title="School tours by month"
          subtitle="Last 6 months and the next 3 · plan diaries around it"
          table={{ columns: ["Month", "Tours"], rows: d.months.map((m) => [m.fullLabel, m.value]) }}
        >
          <Columns data={d.months} height={170} />
        </ChartCard>

        <ChartCard title="Placed by area" subtitle="Where in Dubai our children go to school" table={asTable(d.placedByArea, "Children")}>
          <BarList data={d.placedByArea} />
        </ChartCard>

        <ChartCard title="Placed by curriculum" subtitle="Curriculum of the school each child was placed at" table={asTable(d.placedByCurriculum, "Children")}>
          <BarList data={d.placedByCurriculum} />
        </ChartCard>
      </div>

      <section className="in-card is-wide sa-score">
        <header className="in-card-head">
          <div>
            <h2>School scorecard</h2>
            <p>Every school we've used. Click a heading to sort, click a school to open it.</p>
          </div>
        </header>
        {table.length === 0 ? (
          <Empty />
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
                      {s.area && <span className="sa-sub">{s.area}</span>}
                    </td>
                    <td className="is-num">{s.shortlisted}</td>
                    <td className="is-num">{s.toured}</td>
                    <td className="is-num">{s.applied}</td>
                    <td className="is-num">{s.offers}</td>
                    <td className="is-num">
                      <strong>{s.placed}</strong>
                    </td>
                    <td className="is-num">{s.offerRate === null ? "—" : `${s.offerRate}%`}</td>
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
