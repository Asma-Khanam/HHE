import { useMemo } from "react";
import { TYPE_LABEL, aed } from "../lib/accountingRows";
import { TrendChart, Donut, Ring, Lollipop, SegBar, Stat, CAT, compact } from "./Viz";

// The Analytics tab: the same ledger as every other tab, drawn so a person can
// read it at a glance. Plain SVG/HTML, no chart library. Money in AED.

const TYPES = ["application_fee", "registration_deposit", "package"];
// One validated colour per money type (rose, blue, green).
const COLOR = { application_fee: CAT.rose, registration_deposit: CAT.blue, package: CAT.green };

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: monthKey(d), label: d.toLocaleDateString("en-GB", { month: "short" }) });
  }
  return out;
}

function Card({ title, sub, children }) {
  return (
    <section className="vz-card">
      <header className="vz-card-head">
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </header>
      {children}
    </section>
  );
}

// Money collected each month, one line per kind.
function CollectedByMonth({ ledger }) {
  const months = useMemo(() => {
    const list = lastMonths(6).map((m) => ({ ...m, parts: { application_fee: 0, registration_deposit: 0, package: 0 } }));
    const byKey = Object.fromEntries(list.map((m) => [m.key, m]));
    ledger.forEach((r) => {
      if (!r.collected || !r.date) return;
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) return;
      const m = byKey[monthKey(d)];
      if (m) m.parts[r.type] += r.collected;
    });
    return list;
  }, [ledger]);

  return (
    <Card title="Money collected each month" sub="Last 6 months, one line per kind of money">
      <TrendChart
        labels={months.map((m) => m.label)}
        format={(v) => compact(v)}
        series={TYPES.map((t) => ({ label: TYPE_LABEL[t], color: COLOR[t], values: months.map((m) => m.parts[t]), area: t === "application_fee" }))}
      />
    </Card>
  );
}

// How the billed money splits between the three kinds.
function Mix({ ledger }) {
  const data = useMemo(() => {
    const totals = { application_fee: 0, registration_deposit: 0, package: 0 };
    ledger.forEach((r) => (totals[r.type] += r.billed));
    return TYPES.filter((t) => totals[t] > 0).map((t) => ({ label: TYPE_LABEL[t], value: totals[t], color: COLOR[t] }));
  }, [ledger]);
  const sum = data.reduce((n, x) => n + x.value, 0);

  return (
    <Card title="Where our income comes from" sub="Everything billed so far">
      {sum === 0 ? <p className="vz-empty">Nothing billed yet.</p> : <Donut data={data} size={164} center={{ big: `AED ${compact(sum)}`, small: "billed" }} format={(v) => aed(v).replace("AED ", "")} />}
    </Card>
  );
}

// What is still owed, by how late it is.
function OwedByAge({ ledger }) {
  const { rows, total } = useMemo(() => {
    const b = [
      { label: "Not invoiced yet", value: 0, color: "#b89a5a" },
      { label: "Not due yet", value: 0, color: "#cdbfc6" },
      { label: "1 to 7 days late", value: 0, color: "#e9a23b" },
      { label: "8 to 14 days late", value: 0, color: "#e0662f" },
      { label: "15 or more days late", value: 0, color: "#b3261e" },
    ];
    ledger.forEach((r) => {
      if (!r.owed) return;
      if (r.status === "open") b[0].value += r.owed;
      else if (r.lateDays <= 0) b[1].value += r.owed;
      else if (r.lateDays <= 7) b[2].value += r.owed;
      else if (r.lateDays <= 14) b[3].value += r.owed;
      else b[4].value += r.owed;
    });
    return { rows: b, total: b.reduce((n, x) => n + x.value, 0) };
  }, [ledger]);

  return (
    <Card title="How old the money we are owed is" sub={`${aed(total)} in total`}>
      {total === 0 ? <p className="vz-empty">Nobody owes us anything right now.</p> : <SegBar segments={rows} format={(v) => (v ? aed(v) : "–")} />}
    </Card>
  );
}

// Margin on application fees only: deposits are repaid at cost and packages are
// our own fee, so neither has a margin against a school.
function Margin({ ledger }) {
  const m = useMemo(() => {
    let paid = 0;
    let charged = 0;
    let earned = 0;
    let missing = 0;
    ledger.forEach((r) => {
      if (r.type !== "application_fee" || r.status === "refunded") return;
      if (r.missing) missing += 1;
      if (r.missing) return;
      paid += r.paidOut;
      charged += r.amount;
      if (r.status === "paid") earned += r.amount - r.paidOut;
    });
    return { paid, charged, total: charged - paid, earned, pending: charged - paid - earned, missing };
  }, [ledger]);
  const pct = m.total > 0 ? Math.round(Math.max(0, Math.min(100, (m.earned / m.total) * 100))) : 0;

  return (
    <Card title="Margin on application fees" sub="Before Stripe's fee">
      <div className="vz-ringrow">
        <Ring pct={pct} size={124}>
          <b>{pct}%</b>
          <small>earned</small>
        </Ring>
        <div className="vz-ringstats">
          <Stat label="We paid schools" value={aed(m.paid)} />
          <Stat label="We charge families" value={aed(m.charged)} />
          <Stat label="Margin" value={aed(m.total)} sub={`${aed(m.earned)} earned · ${aed(m.pending)} to come`} />
        </div>
      </div>
      {m.missing > 0 && (
        <p className="vz-card-foot">
          {m.missing} record{m.missing === 1 ? " has" : "s have"} no school amount yet, so they are not counted here.
        </p>
      )}
    </Card>
  );
}

// The families that owe us the most.
function TopOwing({ ledger }) {
  const top = useMemo(() => {
    const map = new Map();
    ledger.forEach((r) => {
      if (!r.owed) return;
      map.set(r.familyId, { label: r.family, value: (map.get(r.familyId)?.value || 0) + r.owed });
    });
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 6);
  }, [ledger]);

  return (
    <Card title="Who owes us the most" sub={`Top ${top.length || 0}`}>
      {top.length === 0 ? <p className="vz-empty">No family owes us anything right now.</p> : <Lollipop data={top} format={(v) => aed(v)} />}
    </Card>
  );
}

export default function AccountingAnalytics({ ledger }) {
  const sums = useMemo(
    () => ({
      billed: ledger.reduce((n, r) => n + r.billed, 0),
      collected: ledger.reduce((n, r) => n + r.collected, 0),
      owed: ledger.reduce((n, r) => n + r.owed, 0),
    }),
    [ledger]
  );
  const pct = sums.billed > 0 ? Math.round((sums.collected / sums.billed) * 100) : 0;

  return (
    <div className="acct2-analytics">
      <section className="vz-hero">
        <div>
          <span className="vz-hero-label">Collected so far</span>
          <strong className="vz-hero-num">{aed(sums.collected)}</strong>
          <span className="vz-hero-sub">of {aed(sums.billed)} billed</span>
        </div>
        <Ring pct={pct} size={150} thickness={13} light>
          <b>{pct}%</b>
          <small>collected</small>
        </Ring>
        <div className="vz-hero-stats">
          <Stat light label="Billed" value={aed(sums.billed)} sub="all three kinds of money" />
          <Stat light label="Still owed" value={aed(sums.owed)} sub="waiting on families" />
        </div>
      </section>

      <div className="vz-split">
        <CollectedByMonth ledger={ledger} />
        <Mix ledger={ledger} />
      </div>
      <OwedByAge ledger={ledger} />
      <div className="vz-split is-even">
        <Margin ledger={ledger} />
        <TopOwing ledger={ledger} />
      </div>
    </div>
  );
}
