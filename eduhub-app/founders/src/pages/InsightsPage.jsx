import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadInsightsData, computeInsights } from "../lib/insights";
import { ChartCard, Kpi, BarList, Columns, Funnel, StackedBars, MonthHeat, Scatter, Empty } from "../components/InsightCharts";
import "./InsightsPage.css";

// Dashboard (September 2026): the whole business in one view -- who comes
// to us, from where, how they move through the process, which schools say
// yes, and how the team's time is spread. Everything is computed live from
// the same tables the rest of the app writes to.

const RANGES = [
  { key: "all", label: "All time" },
  { key: "12m", label: "Last 12 months" },
  { key: "90d", label: "Last 90 days" },
];

// Offer / in progress / declined -- validated as a set (adjacent CVD ΔE ≥ 8),
// always shown with a legend + table, so colour never carries it alone.
const OUTCOME_KEYS = [
  { key: "offers", label: "Offer", color: "#1baf7a" },
  { key: "pending", label: "In progress", color: "#2a78d6" },
  { key: "declined", label: "Declined", color: "#e34948" },
];

const fmtAED = (n) =>
  n >= 1000000 ? `AED ${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `AED ${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `AED ${Math.round(n)}`;

const asTable = (list, col = "Families") => ({ columns: ["", col], rows: list.map((d) => [d.label, d.value]) });

export default function InsightsPage() {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("all");
  const [hideTest, setHideTest] = useState(true);

  useEffect(() => {
    loadInsightsData()
      .then(setRaw)
      .catch((e) => setError(e.message || "Couldn't load the dashboard."));
  }, []);

  const d = useMemo(() => (raw ? computeInsights(raw, { range, hideTest }) : null), [raw, range, hideTest]);

  if (error) return <div className="hh-form-banner hh-form-banner-error">{error}</div>;
  if (!d) return <p className="in-loading">Crunching the numbers…</p>;
  const k = d.kpis;

  return (
    <div className="in-page">
      <header className="in-head">
        <div>
          <h1>Dashboard</h1>
          <p>Live from every family, school and application on file.</p>
        </div>
        <div className="in-filters">
          <div className="in-seg" role="tablist" aria-label="Time range">
            {RANGES.map((r) => (
              <button key={r.key} type="button" role="tab" aria-selected={range === r.key} className={range === r.key ? "is-on" : ""} onClick={() => setRange(r.key)}>
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

      {/* ---- headline numbers ---- */}
      <div className="in-kpis">
        <Kpi label="Families on file" value={k.families} sub={`${k.children} children`} />
        <Kpi label="Successfully placed" value={k.placed} sub={`${k.placedRate}% of families`} tone="good" />
        <Kpi label="Children per family" value={k.avgKids ? k.avgKids.toFixed(1) : "—"} sub="average, families with children" />
        <Kpi label="Offer rate" value={k.decided ? `${k.offerRate}%` : "—"} sub={`${k.offers} offers from ${k.decided} decisions`} />
        <Kpi label="Tour → application" value={k.toured ? `${k.tourConversion}%` : "—"} sub={`of ${k.toured} completed tours`} />
        <Kpi label="Days to placement" value={k.medianDaysToPlace ?? "—"} sub="median, from joining" />
      </div>

      {/* ---- auto findings ---- */}
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
          wide
          title="New families per month"
          subtitle="Last 12 months · line is the 3-month average, to smooth out one-off spikes"
          table={{ columns: ["Month", "New families", "3-month avg"], rows: d.months.map((m, i) => [`${m.label} ${m.year}`, m.value, d.movingAvg[i].toFixed(1)]) }}
        >
          <Columns data={d.months.map((m) => ({ ...m, fullLabel: `${m.label} ${m.year}` }))} line={d.movingAvg} lineLabel="3-month average" />
        </ChartCard>

        <ChartCard
          title="How families move through"
          subtitle="Families who reached each stage · % is the step-to-step conversion"
          table={{ columns: ["Stage", "Families", "From previous"], rows: d.funnel.map((s, i) => [s.label, s.value, i ? `${d.funnel[i - 1].value ? Math.round((s.value / d.funnel[i - 1].value) * 100) : 0}%` : "—"]) }}
        >
          <Funnel steps={d.funnel} />
        </ChartCard>

        <ChartCard
          title="Where families find us"
          subtitle="Answer to “How did you hear about us?”"
          table={asTable(d.referral)}
          footnote={d.referralMissing ? `${d.referralMissing} families haven't answered yet.` : null}
        >
          <BarList data={d.referral} />
        </ChartCard>

        <ChartCard
          title="Moving from"
          subtitle="Country families are relocating from"
          table={asTable(d.origins)}
          footnote={d.originMissing ? `${d.originMissing} families with no origin entered.` : null}
        >
          <BarList data={d.origins} />
        </ChartCard>

        <ChartCard title="Children per family" subtitle="How many children each family brings" table={asTable(d.familySize)}>
          <Columns data={d.familySize.map((x) => ({ ...x, fullLabel: `${x.label} ${x.label === "1" ? "child" : "children"}` }))} height={170} />
        </ChartCard>

        <ChartCard title="Schools they're leaving" subtitle="Each child's current school" table={asTable(d.fromSchools, "Children")}>
          <BarList data={d.fromSchools} />
        </ChartCard>

        <ChartCard title="Curriculum they're coming from" subtitle="Current school curriculum, per child" table={asTable(d.curriculum, "Children")}>
          <BarList data={d.curriculum} />
        </ChartCard>

        <ChartCard title="Why they're leaving" subtitle="Reason for leaving current school, per child" table={asTable(d.reasons, "Children")}>
          <BarList data={d.reasons} />
        </ChartCard>

        <ChartCard title="Year groups in demand" subtitle="Year group each child is applying for" table={asTable(d.yearGroups, "Children")}>
          <Columns data={d.yearGroups.map((y) => ({ label: y.label.split(" /")[0].replace("Year ", "Y"), fullLabel: y.label, value: y.value }))} height={170} />
        </ChartCard>

        <ChartCard title="When families arrive" subtitle="Month families say they'll be in Dubai — plan tours and staffing around it" table={asTable(d.arrivals)}>
          <MonthHeat data={d.arrivals} />
        </ChartCard>

        <ChartCard title="Fee budget per child" subtitle="Comfortable annual fee range" table={asTable(d.feeRange)}>
          <BarList data={d.feeRange} />
        </ChartCard>

        <ChartCard
          wide
          title="School demand vs success"
          subtitle="Each bubble is a school · across = how often we shortlist it · up = offer rate · size = applications"
          table={{
            columns: ["School", "Shortlisted", "Toured", "Applied", "Offers", "Declined", "Offer rate", "Family keen"],
            rows: d.scorecard.map((s) => [s.name, s.shortlisted, s.toured, s.applied, s.offers, s.declined, s.offerRate === null ? "—" : `${s.offerRate}%`, s.keen]),
          }}
        >
          <Scatter points={d.scorecard.filter((s) => s.offerRate !== null).map((s) => ({ label: s.name, x: s.shortlisted, y: s.offerRate, r: s.applied }))} />
        </ChartCard>

        <ChartCard
          wide
          title="Application outcomes by school"
          subtitle="Top schools by applications"
          table={{ columns: ["School", "Offer", "In progress", "Declined"], rows: d.outcomesBySchool.map((s) => [s.name, s.offers, s.pending, s.declined]) }}
          footnote={d.withdrawn ? `${d.withdrawn} withdrawn applications not shown.` : null}
        >
          <StackedBars rows={d.outcomesBySchool} keys={OUTCOME_KEYS} />
        </ChartCard>

        <ChartCard title="Caseload by consultant" subtitle="Families each person owns" table={asTable(d.caseload)}>
          <BarList data={d.caseload} />
          {d.caseload.find((c) => c.label === "Unassigned") && (
            <Link className="in-card-link" to="/staff/today">
              Assign owners →
            </Link>
          )}
        </ChartCard>

        <ChartCard title="Families by client stage" subtitle="Free sanity check → Placed" table={asTable(d.clientStages)}>
          <BarList data={d.clientStages} />
        </ChartCard>

        <ChartCard
          title="Time spent in each stage"
          subtitle="Median days before a family moves on"
          table={{ columns: ["Stage", "Median days", "Moves measured"], rows: d.stageDays.map((s) => [s.label, s.value, s.n]) }}
        >
          {d.stageDays.length ? (
            <BarList data={d.stageDays.map((s) => ({ label: s.label, value: s.value }))} showShare={false} unit=" days" />
          ) : (
            <Empty>Builds up as families move between stages.</Empty>
          )}
        </ChartCard>

        <ChartCard
          title="Money"
          subtitle="AED payments across the caseload"
          table={{ columns: ["", "AED"], rows: [["Collected", Math.round(k.collected).toLocaleString()], ["Outstanding", Math.round(k.outstanding).toLocaleString()]] }}
        >
          <div className="in-money">
            <div>
              <span>Collected</span>
              <strong>{fmtAED(k.collected)}</strong>
            </div>
            <div>
              <span>Outstanding</span>
              <strong>{fmtAED(k.outstanding)}</strong>
            </div>
          </div>
          {k.collected + k.outstanding > 0 && (
            <div className="in-money-bar" title={`${Math.round((k.collected / (k.collected + k.outstanding)) * 100)}% collected`}>
              <span style={{ flexGrow: k.collected }} />
              <span style={{ flexGrow: k.outstanding }} />
            </div>
          )}
          <p className="in-card-foot">
            {k.collected + k.outstanding > 0
              ? `${Math.round((k.collected / (k.collected + k.outstanding)) * 100)}% of everything billed has been collected.`
              : "No payments recorded yet."}
          </p>
        </ChartCard>
      </div>
    </div>
  );
}
