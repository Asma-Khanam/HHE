import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { loadInsightsData, computeInsights } from "../lib/insights";
import { ChartCard, Columns, StackedBars, MonthHeat, Scatter, Empty } from "../components/InsightCharts";
import { Donut, TrendChart, Ring, Spark, TaperFunnel, Treemap, Lollipop, SegBar, Stat, RAMP, topN, compact } from "../components/Viz";
import SchoolAnalytics from "../components/SchoolAnalytics";
import AccountingAnalyticsTab from "../components/AccountingAnalyticsTab";
import "./InsightsPage.css";

// Dashboard: one tab per question the team asks. Everything is computed live
// from the same tables the rest of the app writes to.

const TABS = [
  ["overview", "Overview"],
  ["pipeline", "Pipeline"],
  ["families", "Families"],
  ["schools", "Schools"],
  ["team", "Team"],
  ["money", "Money"],
  ["school-analytics", "School analytics"],
  ["accounting-analytics", "Accounting analytics"],
];

const RANGES = [
  { key: "all", label: "All time" },
  { key: "12m", label: "Last 12 months" },
  { key: "90d", label: "Last 90 days" },
];

// Offer / in progress / declined -- validated as a set, always shown with a legend + table.
const OUTCOME_KEYS = [
  { key: "offers", label: "Offer", color: "#1baf7a" },
  { key: "pending", label: "In progress", color: "#2a78d6" },
  { key: "declined", label: "Declined", color: "#e34948" },
];

const fmtAED = (n) => `AED ${compact(n)}`;
const asTable = (list, col = "Families") => ({ columns: ["", col], rows: list.map((x) => [x.label, x.value]) });

export default function InsightsPage() {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("all");
  const [hideTest, setHideTest] = useState(true);
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab") || "overview";
  const tab = TABS.some(([k]) => k === requested) ? requested : "overview";

  useEffect(() => {
    loadInsightsData()
      .then(setRaw)
      .catch((e) => setError(e.message || "Couldn't load the dashboard."));
  }, []);

  const d = useMemo(() => (raw ? computeInsights(raw, { range, hideTest }) : null), [raw, range, hideTest]);

  if (error) return <div className="hh-form-banner hh-form-banner-error">{error}</div>;
  if (!d) return <p className="in-loading">Crunching the numbers…</p>;
  const k = d.kpis;
  const billed = k.collected + k.outstanding;
  const collectedPct = billed ? Math.round((k.collected / billed) * 100) : 0;

  const pickTab = (key) => {
    const next = new URLSearchParams(params);
    if (key === "overview") next.delete("tab");
    else next.set("tab", key);
    setParams(next, { replace: true });
  };

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

      <div className="vz-tabs" role="tablist" aria-label="Dashboard sections">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={"vz-tab" + (tab === key ? " is-on" : "")} onClick={() => pickTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------ Overview */}
      {tab === "overview" && (
        <>
          <section className="vz-hero">
            <div>
              <span className="vz-hero-label">Families on file</span>
              <strong className="vz-hero-num">{k.families}</strong>
              <span className="vz-hero-sub">
                {k.children} children · {k.applications} live applications
              </span>
              <Spark values={d.months.map((m) => m.value)} w={220} h={46} light />
            </div>
            <Ring pct={k.placedRate} size={156} thickness={13} light>
              <b>{k.placedRate}%</b>
              <small>placed</small>
            </Ring>
            <div className="vz-hero-stats">
              <Stat light label="Offer rate" value={k.decided ? `${k.offerRate}%` : "—"} sub={`${k.offers} offers from ${k.decided} decisions`} />
              <Stat light label="Tour to application" value={k.toured ? `${k.tourConversion}%` : "—"} sub={`of ${k.toured} completed tours`} />
              <Stat light label="Days to placement" value={k.medianDaysToPlace ?? "—"} sub="median, from joining" />
              <Stat light label="Children per family" value={k.avgKids ? k.avgKids.toFixed(1) : "—"} sub="average" />
            </div>
          </section>

          <div className="vz-split">
            <ChartCard
              title="New families per month"
              subtitle="Last 12 months, with the 3-month average to smooth out one-off spikes"
              table={{ columns: ["Month", "New families", "3-month avg"], rows: d.months.map((m, i) => [`${m.label} ${m.year}`, m.value, d.movingAvg[i].toFixed(1)]) }}
            >
              <TrendChart
                labels={d.months.map((m) => m.label)}
                series={[
                  { label: "New families", color: RAMP[1], values: d.months.map((m) => m.value), area: true },
                  { label: "3-month average", color: "#b89a5a", values: d.movingAvg },
                ]}
              />
            </ChartCard>
            <ChartCard title="Where families are now" subtitle="Free sanity check to placed" table={asTable(d.clientStages)}>
              <Donut data={d.clientStages} size={150} center={{ big: k.families, small: "families" }} />
            </ChartCard>
          </div>

          {d.findings.length > 0 && (
            <section>
              <h2 className="vz-section">What the data says</h2>
              <div className="vz-notes">
                {d.findings.map((f, i) => (
                  <p key={f} className="vz-note" data-n={i + 1}>
                    {f}
                  </p>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ------------------------------------------------ Pipeline */}
      {tab === "pipeline" && (
        <>
          <div className="vz-split">
            <ChartCard
              title="How families move through"
              subtitle="Families who reached each stage, with the share that made the step from the one before"
              table={{ columns: ["Stage", "Families", "From previous"], rows: d.funnel.map((s, i) => [s.label, s.value, i ? `${d.funnel[i - 1].value ? Math.round((s.value / d.funnel[i - 1].value) * 100) : 0}%` : "—"]) }}
            >
              <TaperFunnel steps={d.funnel} />
            </ChartCard>
            <ChartCard
              title="Time in each stage"
              subtitle="Median days before a family moves on"
              table={{ columns: ["Stage", "Median days", "Moves measured"], rows: d.stageDays.map((s) => [s.label, s.value, s.n]) }}
            >
              {d.stageDays.length ? <Lollipop data={d.stageDays.map((s) => ({ label: s.label, value: s.value }))} unit=" d" /> : <Empty>Builds up as families move between stages.</Empty>}
            </ChartCard>
          </div>
          <div className="vz-split is-even">
            <ChartCard title="Tours that turn into applications" subtitle={`${k.toured} completed tours`}>
              <div className="vz-ringrow">
                <Ring pct={k.tourConversion} size={120}>
                  <b>{k.toured ? `${k.tourConversion}%` : "—"}</b>
                </Ring>
                <p>Of the families who completed a school tour, this share went on to apply to that school.</p>
              </div>
            </ChartCard>
            <ChartCard title="Offers from decisions" subtitle={`${k.offers} offers from ${k.decided} decisions`}>
              <div className="vz-ringrow">
                <Ring pct={k.offerRate} size={120}>
                  <b>{k.decided ? `${k.offerRate}%` : "—"}</b>
                </Ring>
                <p>Of the applications a school has answered, this share came back as an offer. Withdrawn applications are not counted.</p>
              </div>
            </ChartCard>
          </div>
        </>
      )}

      {/* ------------------------------------------------ Families */}
      {tab === "families" && (
        <>
          <div className="vz-split is-even">
            <ChartCard title="Where families find us" subtitle="Answer to “How did you hear about us?”" table={asTable(d.referral)} footnote={d.referralMissing ? `${d.referralMissing} families haven't answered yet.` : null}>
              <Donut data={topN(d.referral, 5)} size={168} center={{ big: d.referral.reduce((t, x) => t + x.value, 0), small: "answers" }} />
            </ChartCard>
            <ChartCard title="Moving from" subtitle="Country families are relocating from" table={asTable(d.origins)} footnote={d.originMissing ? `${d.originMissing} families with no origin entered.` : null}>
              <Lollipop data={d.origins} />
            </ChartCard>
          </div>

          <ChartCard title="Schools they're leaving" subtitle="Each child's current school, tile size is the number of children" table={asTable(d.fromSchools, "Children")}>
            <Treemap data={d.fromSchools} />
          </ChartCard>

          <div className="vz-split is-even">
            <ChartCard title="Curriculum they're coming from" subtitle="Current school curriculum, per child" table={asTable(d.curriculum, "Children")}>
              <Donut data={topN(d.curriculum, 5)} size={168} center={{ big: d.curriculum.reduce((t, x) => t + x.value, 0), small: "children" }} />
            </ChartCard>
            <ChartCard title="Why they're leaving" subtitle="Reason for leaving current school, per child" table={asTable(d.reasons, "Children")}>
              <Lollipop data={d.reasons} />
            </ChartCard>
          </div>

          <div className="vz-split is-even">
            <ChartCard title="Children per family" subtitle="How many children each family brings" table={asTable(d.familySize)}>
              <div className="vz-bigtiles">
                {d.familySize.map((x) => (
                  <div key={x.label} className="vz-bigtile">
                    <b>{x.value}</b>
                    <span>{x.label === "1" ? "1 child" : `${x.label} children`}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
            <ChartCard title="Fee budget per child" subtitle="Comfortable annual fee range" table={asTable(d.feeRange)}>
              <SegBar segments={d.feeRange.map((x, i) => ({ label: x.label, value: x.value, color: RAMP[Math.min(i, RAMP.length - 1)] }))} />
            </ChartCard>
          </div>

          <ChartCard title="Year groups in demand" subtitle="Year group each child is applying for" table={asTable(d.yearGroups, "Children")}>
            <Columns data={d.yearGroups.map((y) => ({ label: y.label.split(" /")[0].replace("Year ", "Y"), fullLabel: y.label, value: y.value }))} height={170} />
          </ChartCard>

          <ChartCard title="When families arrive" subtitle="Month families say they'll be in Dubai, to plan tours and staffing around it" table={asTable(d.arrivals)}>
            <MonthHeat data={d.arrivals} />
          </ChartCard>
        </>
      )}

      {/* ------------------------------------------------ Schools */}
      {tab === "schools" && (
        <>
          <ChartCard
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
            title="Application outcomes by school"
            subtitle="Top schools by applications"
            table={{ columns: ["School", "Offer", "In progress", "Declined"], rows: d.outcomesBySchool.map((s) => [s.name, s.offers, s.pending, s.declined]) }}
            footnote={d.withdrawn ? `${d.withdrawn} withdrawn applications not shown.` : null}
          >
            <StackedBars rows={d.outcomesBySchool} keys={OUTCOME_KEYS} />
          </ChartCard>

          <ChartCard title="School scorecard" subtitle="The busiest schools, with how often they say yes">
            {d.scorecard.length ? (
              <table className="vz-score">
                <thead>
                  <tr>
                    <th>School</th>
                    <th className="num">Shortlisted</th>
                    <th className="num">Toured</th>
                    <th className="num">Applied</th>
                    <th className="num">Offers</th>
                    <th className="num">Offer rate</th>
                  </tr>
                </thead>
                <tbody>
                  {[...d.scorecard].sort((a, b) => b.applied - a.applied || b.shortlisted - a.shortlisted).slice(0, 12).map((s) => (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td className="num">{s.shortlisted}</td>
                      <td className="num">{s.toured}</td>
                      <td className="num">{s.applied}</td>
                      <td className="num">{s.offers}</td>
                      <td className="num">
                        {s.offerRate === null ? (
                          "—"
                        ) : (
                          <span className="vz-meter">
                            {s.offerRate}%<i style={{ "--p": `${s.offerRate}%` }} />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty />
            )}
          </ChartCard>
        </>
      )}

      {/* ------------------------------------------------ Team */}
      {tab === "team" && (
        <div className="vz-split is-even">
          <ChartCard title="Caseload by consultant" subtitle="Families each person owns" table={asTable(d.caseload)}>
            <Lollipop data={d.caseload} />
            {d.caseload.find((c) => c.label === "Unassigned") && (
              <Link className="in-card-link" to="/staff/today">
                Assign owners →
              </Link>
            )}
            <Link className="in-card-link" to="/staff/team">
              See each consultant&apos;s families by stage →
            </Link>
          </ChartCard>
          <ChartCard
            title="Time in each stage"
            subtitle="Median days before a family moves on"
            table={{ columns: ["Stage", "Median days", "Moves measured"], rows: d.stageDays.map((s) => [s.label, s.value, s.n]) }}
          >
            {d.stageDays.length ? <Lollipop data={d.stageDays.map((s) => ({ label: s.label, value: s.value }))} unit=" d" /> : <Empty>Builds up as families move between stages.</Empty>}
          </ChartCard>
        </div>
      )}

      {/* ------------------------------------------------ Money */}
      {tab === "school-analytics" && <SchoolAnalytics embedded range={range} hideTest={hideTest} />}

      {tab === "accounting-analytics" && <AccountingAnalyticsTab />}

      {tab === "money" && (
        <>
          <div className="vz-split is-even">
            <ChartCard
              title="Collected so far"
              subtitle="AED payments across the caseload"
              table={{ columns: ["", "AED"], rows: [["Collected", Math.round(k.collected).toLocaleString()], ["Outstanding", Math.round(k.outstanding).toLocaleString()]] }}
            >
              {billed > 0 ? (
                <div className="vz-ringrow">
                  <Ring pct={collectedPct} size={132}>
                    <b>{collectedPct}%</b>
                    <small>collected</small>
                  </Ring>
                  <div className="vz-ringstats">
                    <Stat label="Collected" value={fmtAED(k.collected)} />
                    <Stat label="Outstanding" value={fmtAED(k.outstanding)} />
                  </div>
                </div>
              ) : (
                <Empty>No payments recorded yet.</Empty>
              )}
            </ChartCard>
            <ChartCard title="Paid out, not charged back" subtitle="Application fees HHE paid the school for, that the family hasn't paid back yet">
              {d.owedToHhe.count > 0 ? (
                <div className="vz-ringstats">
                  {d.owedToHhe.totalsByCurrency.map(([cur, total]) => (
                    <Stat key={cur} label={cur} value={Math.round(total).toLocaleString()} sub={`${d.owedToHhe.count} fee${d.owedToHhe.count === 1 ? "" : "s"}`} />
                  ))}
                </div>
              ) : (
                <Empty>Nothing outstanding right now. Every fee HHE has fronted has been paid back.</Empty>
              )}
            </ChartCard>
          </div>

          {d.owedToHhe.count > 0 && (
            <ChartCard
              title="Who still owes us"
              subtitle="Largest first"
              table={{ columns: ["Family", "School", "Amount"], rows: d.owedToHhe.rows.map((r) => [r.familyName, r.school, `${r.currency} ${r.amount.toLocaleString()}`]) }}
            >
              <ul className="vz-owed">
                {d.owedToHhe.rows.slice(0, 10).map((r) => (
                  <li key={r.id}>
                    <Link to={`/staff/families/${r.familyId}`}>{r.familyName}</Link>
                    <span>{r.school}</span>
                    <b>
                      {r.currency} {r.amount.toLocaleString()}
                    </b>
                  </li>
                ))}
              </ul>
              {d.owedToHhe.rows.length > 10 && <p className="in-card-foot">+ {d.owedToHhe.rows.length - 10} more.</p>}
            </ChartCard>
          )}
        </>
      )}
    </div>
  );
}
