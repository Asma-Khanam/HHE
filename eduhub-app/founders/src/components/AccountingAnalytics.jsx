import { useMemo } from "react";
import { TYPE_LABEL, TYPE_COLOR, aed } from "../lib/accountingRows";
import { moneyRound } from "../lib/accounting";

// The Analytics tab: the same ledger as every other tab, drawn as simple charts.
// Plain SVG/CSS, no chart library. Money in AED, whole numbers.

const TYPES = ["application_fee", "registration_deposit", "package"];

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

function Legend() {
  return (
    <div className="acct2-legend">
      {TYPES.map((t) => (
        <span key={t}>
          <i style={{ background: TYPE_COLOR[t] }} />
          {TYPE_LABEL[t]}
        </span>
      ))}
    </div>
  );
}

// Money collected each month, stacked by kind.
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

  const max = Math.max(1, ...months.map((m) => TYPES.reduce((n, t) => n + m.parts[t], 0)));
  const W = 520;
  const H = 210;
  const base = 180;
  const slot = W / months.length;
  const bar = Math.min(48, slot - 16);

  return (
    <div className="acct-card">
      <div className="acct-card-head">
        <h2>Money collected each month</h2>
        <span className="acct-card-sub">Last 6 months · by kind</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="acct2-chart" role="img" aria-label="Money collected each month">
        <line x1="0" y1={base} x2={W} y2={base} stroke="#d9d2d6" />
        {months.map((m, i) => {
          let y = base;
          const x = i * slot + (slot - bar) / 2;
          const total = TYPES.reduce((n, t) => n + m.parts[t], 0);
          return (
            <g key={m.key}>
              {TYPES.map((t) => {
                const h = (m.parts[t] / max) * 150;
                y -= h;
                return h > 0 ? <rect key={t} x={x} y={y} width={bar} height={h} fill={TYPE_COLOR[t]} rx="2" /> : null;
              })}
              {total > 0 && (
                <text x={x + bar / 2} y={y - 6} textAnchor="middle" className="acct2-chart-val">
                  {moneyRound(total, "").trim()}
                </text>
              )}
              <text x={x + bar / 2} y={base + 18} textAnchor="middle" className="acct2-chart-lab">
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
      <Legend />
    </div>
  );
}

// What is still owed, by how late it is.
function OwedByAge({ ledger }) {
  const rows = useMemo(() => {
    const b = [
      { label: "We have not invoiced yet", amount: 0, tone: "amber" },
      { label: "Not due yet", amount: 0, tone: "blue" },
      { label: "1 to 7 days late", amount: 0, tone: "late" },
      { label: "8 to 14 days late", amount: 0, tone: "late" },
      { label: "15 or more days late", amount: 0, tone: "late" },
    ];
    ledger.forEach((r) => {
      if (!r.owed) return;
      if (r.status === "open") b[0].amount += r.owed;
      else if (r.lateDays <= 0) b[1].amount += r.owed;
      else if (r.lateDays <= 7) b[2].amount += r.owed;
      else if (r.lateDays <= 14) b[3].amount += r.owed;
      else b[4].amount += r.owed;
    });
    return b;
  }, [ledger]);
  const max = Math.max(1, ...rows.map((r) => r.amount));
  const total = rows.reduce((n, r) => n + r.amount, 0);

  return (
    <div className="acct-card">
      <div className="acct-card-head">
        <h2>How old the money we are owed is</h2>
        <span className="acct-card-sub">{aed(total)} in total</span>
      </div>
      <div className="acct2-hbars">
        {rows.map((r) => (
          <div key={r.label} className="acct2-hbar">
            <span className="acct2-hbar-label">{r.label}</span>
            <span className="acct2-hbar-track">
              <i className={"is-" + r.tone} style={{ width: `${(r.amount / max) * 100}%` }} />
            </span>
            <span className="acct2-hbar-val">{r.amount ? aed(r.amount) : "–"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// How the billed money splits between the three kinds.
function Mix({ ledger }) {
  const parts = useMemo(() => {
    const totals = { application_fee: 0, registration_deposit: 0, package: 0 };
    ledger.forEach((r) => (totals[r.type] += r.billed));
    const sum = TYPES.reduce((n, t) => n + totals[t], 0);
    return { totals, sum };
  }, [ledger]);

  return (
    <div className="acct-card">
      <div className="acct-card-head">
        <h2>Where our income comes from</h2>
        <span className="acct-card-sub">Everything billed so far</span>
      </div>
      {parts.sum === 0 ? (
        <p className="acct-empty">Nothing billed yet.</p>
      ) : (
        <>
          <div className="acct2-stack">
            {TYPES.map((t) =>
              parts.totals[t] > 0 ? (
                <i key={t} style={{ width: `${(parts.totals[t] / parts.sum) * 100}%`, background: TYPE_COLOR[t] }} />
              ) : null
            )}
          </div>
          <ul className="acct2-mix">
            {TYPES.map((t) => (
              <li key={t}>
                <span>
                  <i style={{ background: TYPE_COLOR[t] }} />
                  {TYPE_LABEL[t]}
                </span>
                <strong>{aed(parts.totals[t])}</strong>
                <em>{Math.round((parts.totals[t] / parts.sum) * 100)}%</em>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
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

  return (
    <div className="acct-card">
      <div className="acct-card-head">
        <h2>Margin on application fees</h2>
        <span className="acct-card-sub">Before Stripe&apos;s fee</span>
      </div>
      <div className="acct-margin">
        <div>
          <span>We paid schools</span>
          <strong>{aed(m.paid)}</strong>
        </div>
        <div>
          <span>We charge families</span>
          <strong>{aed(m.charged)}</strong>
        </div>
        <div className="is-total">
          <span>Margin</span>
          <strong>{aed(m.total)}</strong>
        </div>
      </div>
      <div className="acct-margin-bar" aria-hidden="true">
        <i style={{ width: m.total > 0 ? `${Math.max(0, Math.min(100, (m.earned / m.total) * 100))}%` : "0%" }} />
      </div>
      <p className="acct-margin-foot">
        <strong>{aed(m.earned)}</strong> earned (family has paid) · <strong>{aed(m.pending)}</strong> still to come
      </p>
      {m.missing > 0 && (
        <p className="acct-warn">
          {m.missing} record{m.missing === 1 ? " has" : "s have"} no school amount yet, so they are not counted here.
        </p>
      )}
    </div>
  );
}

// The families that owe us the most.
function TopOwing({ ledger }) {
  const top = useMemo(() => {
    const map = new Map();
    ledger.forEach((r) => {
      if (!r.owed) return;
      map.set(r.familyId, { name: r.family, amount: (map.get(r.familyId)?.amount || 0) + r.owed });
    });
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 6);
  }, [ledger]);
  const max = Math.max(1, ...top.map((t) => t.amount));

  return (
    <div className="acct-card">
      <div className="acct-card-head">
        <h2>Who owes us the most</h2>
        <span className="acct-card-sub">Top {top.length || 0}</span>
      </div>
      {top.length === 0 ? (
        <p className="acct-empty">No family owes us anything right now.</p>
      ) : (
        <div className="acct2-hbars">
          {top.map((t) => (
            <div key={t.name} className="acct2-hbar">
              <span className="acct2-hbar-label">{t.name}</span>
              <span className="acct2-hbar-track">
                <i className="is-blue" style={{ width: `${(t.amount / max) * 100}%` }} />
              </span>
              <span className="acct2-hbar-val">{aed(t.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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
  return (
    <div className="acct2-analytics">
      <div className="acct2-summary">
        <div>
          <span>Billed</span>
          <strong>{aed(sums.billed)}</strong>
        </div>
        <div>
          <span>Collected</span>
          <strong>{aed(sums.collected)}</strong>
        </div>
        <div>
          <span>Still owed</span>
          <strong>{aed(sums.owed)}</strong>
        </div>
      </div>
      <div className="acct2-analytics-grid">
        <CollectedByMonth ledger={ledger} />
        <OwedByAge ledger={ledger} />
        <Mix ledger={ledger} />
        <Margin ledger={ledger} />
        <TopOwing ledger={ledger} />
      </div>
    </div>
  );
}
