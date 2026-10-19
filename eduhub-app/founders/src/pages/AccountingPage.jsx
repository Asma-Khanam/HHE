import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAccountingOverview, resolveStripeEvent, friendlyError } from "../lib/staffData";
import {
  STATUS_LABEL,
  money,
  moneyRound,
  childName,
  sum,
  liveItems,
  recordFlags,
  daysSince,
  timeAgo,
} from "../lib/accounting";
import { daysUntil } from "../lib/workflow";
import "./AccountingPage.css";

// Accounting, across every family (16 Oct 2026). Built around the questions a
// consultant actually asks when they open it:
//   1. How much of our money is out there right now?
//   2. Who do I need to chase or fix today?
//   3. For one family: what do they owe us, in total?
//   4. Who has been working on these records?
// So: money tiles and two bar charts on top, a grouped "do this today" list and
// a recent-activity feed, then the detail in tabs (School application fees,
// Package payments, By family) in the same table style as the Caseload.
// Staff-only and read-only; every row opens that family's own Accounting tab.

// A school we paid, with no invoice sent yet, is our money out of the bank.
// It is called out once it has waited this many days.
const WAITING_RED_AFTER_DAYS = 3;
const FAMILIES_SHOWN = 5;
const SCHOOLS_PER_FAMILY = 2;

const TABS = [
  ["fees", "School application fees"],
  ["package", "Package payments"],
  ["family", "By family"],
];

const FEE_FILTERS = [
  ["attention", "Needs attention"],
  ["open", "Not invoiced"],
  ["invoiced", "Invoiced"],
  ["paid", "Family paid"],
  ["all", "All"],
];

const PACKAGE_FILTERS = [
  ["attention", "Needs attention"],
  ["upcoming", "Not due yet"],
  ["paid", "Paid"],
  ["all", "All"],
];

function familyLink(familyId) {
  return `/staff/families/${familyId}?tab=accounting`;
}

function dueText(dueDate) {
  const d = daysUntil(dueDate);
  if (d === null) return "No due date";
  if (d === 0) return "Due today";
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
  return `Due in ${d} day${d === 1 ? "" : "s"}`;
}

function shortDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// The state of one package payment in the words a consultant would use.
function packageState(p) {
  if (p.status === "paid") return { key: "paid", label: p.paid_at ? `Paid ${shortDate(p.paid_at)}` : "Paid", tone: "good" };
  if (p.status === "waived") return { key: "paid", label: "Waived", tone: "muted" };
  if (p.status === "submitted") return { key: "attention", label: "Receipt uploaded · confirm it", tone: "blue" };
  const d = daysUntil(p.due_date);
  if (d !== null && d < 0) return { key: "attention", label: dueText(p.due_date), tone: "late" };
  return { key: "upcoming", label: dueText(p.due_date), tone: "amber" };
}

// "Updated by Lyndsay · 2d ago", or who opened it when nothing else has happened.
function lastChangeText(record) {
  if (!record.lastChange) return null;
  return `Updated by ${record.lastChange.by} · ${timeAgo(record.lastChange.at)}`;
}

// One small ageing table: rows of money, columns of how old it is. Late columns
// turn red so a quick glance shows where the risk is.
function AgingTable({ title, heads, lines }) {
  return (
    <div className="acct-aging">
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th />
            {heads.map((h, i) => (
              <th key={h} className={i >= 2 ? "is-late" : ""}>
                {h}
              </th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(([label, buckets]) => (
            <tr key={label}>
              <td>{label}</td>
              {buckets.map((b, i) => (
                <td key={i} className={b.count && i >= 2 ? "is-late" : b.count ? "" : "is-zero"}>
                  {b.count ? (
                    <>
                      {moneyRound(b.amount)}
                      <em>{b.count}</em>
                    </>
                  ) : (
                    "–"
                  )}
                </td>
              ))}
              <td className="is-total">{moneyRound(buckets.reduce((n, b) => n + b.amount, 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AccountingPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = TABS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "fees";
  const [feeFilter, setFeeFilter] = useState("attention");
  const [packageFilter, setPackageFilter] = useState("attention");
  const [search, setSearch] = useState("");
  const [showAllActions, setShowAllActions] = useState(false);
  const [reviewed, setReviewed] = useState([]);
  const [alertError, setAlertError] = useState("");
  const detailRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getAccountingOverview()
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(friendlyError(err, "Couldn't load accounting.")));
    return () => {
      alive = false;
    };
  }, []);

  // School application fee records, with the maths done once.
  const rows = useMemo(() => {
    if (!data) return [];
    return data.records.map((record) => {
      const items = liveItems(record);
      return {
        record,
        items,
        flags: recordFlags(record),
        waiting: record.status === "open" ? daysSince(record.school_paid_at || record.created_at) : null,
        family: data.familyNames[record.family_id] || "Family",
        paid: sum(items, "amount_paid"),
        charged: sum(items, "amount_charged"),
        difference: sum(items, "difference"),
      };
    });
  }, [data]);

  const packages = useMemo(() => {
    if (!data) return [];
    return data.payments.map((p) => ({ p, state: packageState(p), family: data.familyNames[p.family_id] || "Family" }));
  }, [data]);

  // Headline money.
  const totals = useMemo(() => {
    const byStatus = (s) => rows.filter((r) => r.record.status === s);
    const open = byStatus("open");
    const invoiced = byStatus("invoiced");
    const paid = byStatus("paid");
    const packOwed = packages.filter((x) => x.p.status === "unpaid" || x.p.status === "submitted");
    const packPaid = packages.filter((x) => x.p.status === "paid");
    const amt = (list, key) => sum(list.map((r) => ({ v: r[key] })), "v");
    return {
      open,
      invoiced,
      paid,
      outOfPocket: amt(open, "paid") + amt(invoiced, "paid"),
      schoolToCollect: amt(open, "charged") + amt(invoiced, "charged"),
      packageToCollect: sum(packOwed.map((x) => x.p), "amount"),
      collected: amt(paid, "charged") + sum(packPaid.map((x) => x.p), "amount"),
      margin: amt(rows, "difference"),
      marginEarned: amt(paid, "difference"),
      openCharged: amt(open, "charged"),
      invoicedCharged: amt(invoiced, "charged"),
      paidCharged: amt(paid, "charged"),
    };
  }, [rows, packages]);

  // "Do this today", grouped by family then by school, as short chips.
  const groups = useMemo(() => {
    const m = new Map();
    const ensure = (familyId, family) => {
      if (!m.has(familyId)) m.set(familyId, { familyId, family, schools: [], packages: [], late: false });
      return m.get(familyId);
    };
    rows.forEach((r) => {
      const chips = r.flags.map((f) => ({ text: f, tone: "amber" }));
      if (r.waiting !== null && r.waiting >= WAITING_RED_AFTER_DAYS) {
        chips.push({ text: `Not invoiced · ${r.waiting}d`, tone: "late" });
      }
      if (!chips.length) return;
      const g = ensure(r.record.family_id, r.family);
      g.schools.push({ name: r.record.school?.name || "School", chips });
      if (chips.some((c) => c.tone === "late")) g.late = true;
    });
    packages.forEach((x) => {
      if (x.state.tone === "late") {
        const g = ensure(x.p.family_id, x.family);
        g.packages.push({ text: `${x.p.label} · overdue`, tone: "late" });
        g.late = true;
      } else if (x.p.status === "submitted") {
        ensure(x.p.family_id, x.family).packages.push({ text: `${x.p.label} · confirm receipt`, tone: "blue" });
      }
    });
    const arr = [...m.values()];
    arr.forEach((g) => {
      g.count = g.schools.reduce((n, s) => n + s.chips.length, 0) + g.packages.length;
    });
    return arr.sort((a, b) => (b.late ? 1 : 0) - (a.late ? 1 : 0) || b.count - a.count);
  }, [rows, packages]);

  const totalItems = groups.reduce((n, g) => n + g.count, 0);

  // What each family owes us across both kinds of payment.
  const families = useMemo(() => {
    const map = new Map();
    const get = (id, name) => {
      if (!map.has(id)) map.set(id, { id, name, school: 0, pack: 0, items: 0, worst: null });
      return map.get(id);
    };
    rows.forEach((r) => {
      if (r.record.status === "paid") return;
      const f = get(r.record.family_id, r.family);
      f.school += r.charged;
      f.items += 1;
    });
    packages.forEach((x) => {
      if (x.p.status !== "unpaid" && x.p.status !== "submitted") return;
      const f = get(x.p.family_id, x.family);
      f.pack += Number(x.p.amount) || 0;
      f.items += 1;
      const d = daysUntil(x.p.due_date);
      if (d !== null && d < 0) f.worst = Math.max(f.worst || 0, Math.abs(d));
    });
    return [...map.values()].sort((a, b) => b.school + b.pack - (a.school + a.pack));
  }, [rows, packages]);

  // Ageing: how old is the money we are waiting on. Buckets are days past the
  // due date for invoices and packages, and days since we paid for records not
  // yet invoiced.
  const aging = useMemo(() => {
    const empty = () => [0, 1, 2, 3].map(() => ({ amount: 0, count: 0 }));
    const owed = { fees: empty(), packages: empty() };
    const notInvoiced = empty();
    let oldest = null;
    const lateBucket = (days) => (days <= 0 ? 0 : days <= 7 ? 1 : days <= 14 ? 2 : 3);
    const waitBucket = (days) => (days <= 3 ? 0 : days <= 7 ? 1 : days <= 14 ? 2 : 3);
    const add = (list, i, amount) => {
      list[i].amount += Number(amount) || 0;
      list[i].count += 1;
    };
    const note = (days, familyId, family, what) => {
      if (days > 0 && (!oldest || days > oldest.days)) oldest = { days, familyId, family, what };
    };
    rows.forEach((r) => {
      if (r.record.status === "open") {
        const w = r.waiting ?? 0;
        add(notInvoiced, waitBucket(w), r.charged);
        note(w, r.record.family_id, r.family, "paid to school, not invoiced");
      } else if (r.record.status === "invoiced") {
        const d = daysUntil(r.record.invoice?.due_date);
        const late = d === null ? 0 : -d;
        add(owed.fees, lateBucket(late), r.record.invoice?.amount ?? r.charged);
        note(late, r.record.family_id, r.family, "invoice overdue");
      }
    });
    packages.forEach((x) => {
      if (x.p.status !== "unpaid" && x.p.status !== "submitted") return;
      const d = daysUntil(x.p.due_date);
      const late = d === null ? 0 : -d;
      add(owed.packages, lateBucket(late), x.p.amount);
      note(late, x.p.family_id, x.family, `${x.p.label} overdue`);
    });
    return { owed, notInvoiced, oldest };
  }, [rows, packages]);

  // The margin on school fees, worked only from children whose amount we know,
  // so a missing amount cannot make the margin look bigger than it is.
  const margin = useMemo(() => {
    let paid = 0;
    let charged = 0;
    let children = 0;
    let missing = 0;
    let earned = 0;
    rows.forEach((r) =>
      r.items.forEach((i) => {
        if (i.amount_paid === null || i.amount_paid === undefined) {
          missing += 1;
          return;
        }
        paid += Number(i.amount_paid);
        charged += Number(i.amount_charged);
        children += 1;
        if (r.record.status === "paid") earned += Number(i.amount_charged) - Number(i.amount_paid);
      })
    );
    const total = charged - paid;
    return { paid, charged, total, children, missing, earned, pending: total - earned, perChild: children ? total / children : 0 };
  }, [rows]);

  const stripeAlerts = (data?.stripeAlerts || []).filter((a) => !reviewed.includes(a.id));

  // The strip at the top: only what needs a person, each one a shortcut to the list.
  const actions = useMemo(() => {
    const countFrom = (list) => list.slice(1).reduce((n, b) => n + b.count, 0);
    const oldest = totals.open.reduce((m, r) => Math.max(m, r.waiting || 0), 0);
    const list = [
      { key: "open", count: totals.open.length, label: "paid to school, not invoiced", tone: oldest >= WAITING_RED_AFTER_DAYS ? "late" : "amber", tab: "fees", filter: "open" },
      { key: "missing", count: margin.missing, label: "school amounts missing", tone: "late", tab: "fees", filter: "attention" },
      { key: "inv", count: countFrom(aging.owed.fees), label: "invoices overdue", tone: "late", tab: "fees", filter: "invoiced" },
      { key: "pack", count: countFrom(aging.owed.packages), label: "package payments overdue", tone: "late", tab: "package", filter: "attention" },
      { key: "conf", count: packages.filter((x) => x.p.status === "submitted").length, label: "receipts to confirm", tone: "blue", tab: "package", filter: "attention" },
    ];
    return list.filter((a) => a.count > 0);
  }, [totals, margin.missing, aging, packages]);

  const q = search.trim().toLowerCase();
  const matches = (text) => !q || text.toLowerCase().includes(q);

  const feeCounts = {
    attention: rows.filter((r) => r.flags.length > 0).length,
    open: totals.open.length,
    invoiced: totals.invoiced.length,
    paid: totals.paid.length,
    all: rows.length,
  };
  const packageCounts = {
    attention: packages.filter((x) => x.state.key === "attention").length,
    upcoming: packages.filter((x) => x.state.key === "upcoming").length,
    paid: packages.filter((x) => x.state.key === "paid").length,
    all: packages.length,
  };

  const shownFees = rows
    .filter((r) => (feeFilter === "attention" ? r.flags.length > 0 : feeFilter === "all" ? true : r.record.status === feeFilter))
    .filter((r) => matches(`${r.family} ${r.record.school?.name || ""}`))
    // Oldest waiting first, so the thing most at risk is always at the top.
    .sort((a, b) => (b.waiting ?? -1) - (a.waiting ?? -1));
  const shownPackages = packages
    .filter((x) => (packageFilter === "all" ? true : x.state.key === packageFilter))
    .filter((x) => matches(`${x.family} ${x.p.label}`));
  const shownFamilies = families.filter((f) => matches(f.name));

  if (error) {
    return (
      <div className="acct-page">
        <h1 className="acct-title">Accounting</h1>
        <p className="acct-error">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="acct-page">
        <h1 className="acct-title">Accounting</h1>
        <p className="acct-empty">Loading…</p>
      </div>
    );
  }

  const oldestWaiting = totals.open.reduce((m, r) => Math.max(m, r.waiting || 0), 0);
  const visibleGroups = showAllActions ? groups : groups.slice(0, FAMILIES_SHOWN);

  function goTo(tabKey, filter) {
    if (tabKey === "fees") setFeeFilter(filter);
    else setPackageFilter(filter);
    pickTab(tabKey);
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function markReviewed(id) {
    setAlertError("");
    try {
      await resolveStripeEvent(id);
      setReviewed((list) => [...list, id]);
    } catch {
      setAlertError("Couldn't mark that as reviewed. Check that addendum 117 has been run.");
    }
  }

  function pickTab(key) {
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: true });
    setSearch("");
  }

  return (
    <div className="acct-page">
      <header className="acct-head">
        <div>
          <h1 className="acct-title">Accounting</h1>
          <p className="acct-subtitle">
            Where our money is, who needs chasing, and what each family owes. Open any row to work on it in that family's
            Accounting tab.
          </p>
        </div>
      </header>

      <section className="acct-card acct-actionbar">
        <div className="acct-card-head">
          <h2>Needs action today</h2>
          <span className="acct-card-sub">
            {actions.length === 0 && stripeAlerts.length === 0
              ? "All clear"
              : `${actions.reduce((n, a) => n + a.count, 0) + stripeAlerts.length} item${actions.reduce((n, a) => n + a.count, 0) + stripeAlerts.length === 1 ? "" : "s"}`}
          </span>
        </div>
        {actions.length === 0 && stripeAlerts.length === 0 ? (
          <p className="acct-empty">Nothing is missing, overdue or waiting on us.</p>
        ) : (
          <div className="acct-action-tiles">
            {actions.map((a) => (
              <button key={a.key} type="button" className={"acct-action-tile is-" + a.tone} onClick={() => goTo(a.tab, a.filter)}>
                <strong>{a.count}</strong>
                <span>{a.label}</span>
              </button>
            ))}
            {stripeAlerts.length > 0 && (
              <div className="acct-action-tile is-late is-static">
                <strong>{stripeAlerts.length}</strong>
                <span>Stripe payment{stripeAlerts.length === 1 ? "" : "s"} need a look</span>
              </div>
            )}
          </div>
        )}
        {stripeAlerts.length > 0 && (
          <ul className="acct-stripe-alerts">
            {stripeAlerts.map((a) => {
              const inv = data.invoices.find((i) => i.stripe_invoice_id === a.stripe_invoice_id);
              return (
                <li key={a.id}>
                  <div>
                    <strong>{a.outcome === "mismatch" ? "Payment did not match the invoice" : a.outcome === "paid_but_void" ? "Money arrived on a voided invoice" : "Stripe payment needs a look"}</strong>
                    <span>{a.detail || a.type} · {timeAgo(a.received_at)}</span>
                  </div>
                  {inv && (
                    <button type="button" className="acct-open" onClick={() => navigate(familyLink(inv.family_id))}>
                      Open family
                    </button>
                  )}
                  <button type="button" className="acct-open" onClick={() => markReviewed(a.id)}>
                    Mark reviewed
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {alertError && <p className="acct-error">{alertError}</p>}
      </section>

      <div className="acct-stats">
        <div className={"acct-stat acct-stat--amber" + (oldestWaiting >= WAITING_RED_AFTER_DAYS ? " is-risk" : "")}>
          <span className="acct-stat-label">Out of pocket</span>
          <strong>{moneyRound(totals.outOfPocket)}</strong>
          <em>Paid to schools, not yet recovered</em>
        </div>
        <div className="acct-stat acct-stat--blue">
          <span className="acct-stat-label">To collect</span>
          <strong>{moneyRound(totals.schoolToCollect + totals.packageToCollect)}</strong>
          <em>
            {moneyRound(totals.schoolToCollect)} school fees · {moneyRound(totals.packageToCollect)} packages
          </em>
        </div>
        <div className="acct-stat acct-stat--green is-good">
          <span className="acct-stat-label">Collected</span>
          <strong>{moneyRound(totals.collected)}</strong>
          <em>School fees and packages paid</em>
        </div>
        <div className="acct-stat acct-stat--gold">
          <span className="acct-stat-label">Margin on school fees</span>
          <strong>{moneyRound(totals.margin)}</strong>
          <em>{moneyRound(totals.marginEarned)} earned so far · before Stripe's fee</em>
        </div>
      </div>

      <div className="acct-grid">
        <div className="acct-col">
          <StageCard
            title="School fees: where the money is"
            sub="What we charge families, by stage"
            empty="No school fees paid by HHE yet."
            stages={[
              { key: "open", label: "School paid, not invoiced", amount: totals.openCharged, count: totals.open.length },
              { key: "invoiced", label: "Invoiced, waiting for the family", amount: totals.invoicedCharged, count: totals.invoiced.length },
              { key: "paid", label: "Family paid", amount: totals.paidCharged, count: totals.paid.length },
            ]}
          />
          <StageCard
            title="Package payments: where the money is"
            sub="Registration, deposits and services"
            empty="No package payments yet."
            stages={[
              { key: "open", label: "Waiting for the family", amount: sum(packages.filter((x) => x.p.status === "unpaid").map((x) => x.p), "amount"), count: packages.filter((x) => x.p.status === "unpaid").length },
              { key: "invoiced", label: "Receipt uploaded, confirm it", amount: sum(packages.filter((x) => x.p.status === "submitted").map((x) => x.p), "amount"), count: packages.filter((x) => x.p.status === "submitted").length },
              { key: "paid", label: "Paid", amount: sum(packages.filter((x) => x.p.status === "paid").map((x) => x.p), "amount"), count: packages.filter((x) => x.p.status === "paid").length },
            ]}
          />

        </div>

        <section className="acct-card acct-today">
          <div className="acct-card-head">
            <h2>Fix by family</h2>
            <span className="acct-card-sub">
              {totalItems === 0 ? "All clear" : `${groups.length} famil${groups.length === 1 ? "y" : "ies"} · ${totalItems} item${totalItems === 1 ? "" : "s"}`}
            </span>
          </div>
          {totalItems === 0 ? (
            <p className="acct-empty">Nothing is missing, overdue or waiting on us.</p>
          ) : (
            <>
              <ul className="acct-actions">
                {visibleGroups.map((g) => (
                  <li key={g.familyId} className={"acct-action" + (g.late ? " is-late" : "")}>
                    <div className="acct-action-main">
                      <div className="acct-action-top">
                        <strong>{g.family}</strong>
                        <span className="acct-action-count">{g.count}</span>
                      </div>
                      {g.schools.slice(0, SCHOOLS_PER_FAMILY).map((sc) => (
                        <div key={sc.name} className="acct-action-school">
                          <span className="acct-action-schoolname">{sc.name}</span>
                          <span className="acct-chips">
                            {sc.chips.map((c, i) => (
                              <span key={i} className={"acct-chip is-" + c.tone}>
                                {c.text}
                              </span>
                            ))}
                          </span>
                        </div>
                      ))}
                      {g.packages.length > 0 && (
                        <div className="acct-action-school">
                          <span className="acct-action-schoolname">Packages</span>
                          <span className="acct-chips">
                            {g.packages.map((c, i) => (
                              <span key={i} className={"acct-chip is-" + c.tone}>
                                {c.text}
                              </span>
                            ))}
                          </span>
                        </div>
                      )}
                      {g.schools.length > SCHOOLS_PER_FAMILY && (
                        <span className="acct-action-more">+ {g.schools.length - SCHOOLS_PER_FAMILY} more school{g.schools.length - SCHOOLS_PER_FAMILY === 1 ? "" : "s"} on their tab</span>
                      )}
                    </div>
                    <button type="button" className="acct-open" onClick={() => navigate(familyLink(g.familyId))}>
                      Open
                    </button>
                  </li>
                ))}
              </ul>
              {groups.length > FAMILIES_SHOWN && (
                <button type="button" className="acct-more" onClick={() => setShowAllActions((v) => !v)}>
                  {showAllActions ? "Show fewer" : `Show all ${groups.length} families`}
                </button>
              )}
            </>
          )}
        </section>
      </div>

      <div className="acct-grid">
        <section className="acct-card">
          <div className="acct-card-head">
            <h2>Margin on school fees</h2>
            <span className="acct-card-sub">
              {margin.children} child{margin.children === 1 ? "" : "ren"} · before Stripe's fee
            </span>
          </div>
          <div className="acct-margin">
            <div>
              <span>We paid schools</span>
              <strong>{moneyRound(margin.paid)}</strong>
            </div>
            <div>
              <span>We charge families</span>
              <strong>{moneyRound(margin.charged)}</strong>
            </div>
            <div className="is-total">
              <span>Margin</span>
              <strong>{moneyRound(margin.total)}</strong>
            </div>
          </div>
          <div className="acct-margin-bar" aria-hidden="true">
            <i style={{ width: margin.total > 0 ? `${Math.max(0, Math.min(100, (margin.earned / margin.total) * 100))}%` : "0%" }} />
          </div>
          <p className="acct-margin-foot">
            <strong>{moneyRound(margin.earned)}</strong> earned (family has paid) · <strong>{moneyRound(margin.pending)}</strong> still to come ·
            average <strong>{moneyRound(margin.perChild)}</strong> per child
          </p>
          {margin.missing > 0 && (
            <p className="acct-warn">
              {margin.missing} child{margin.missing === 1 ? "" : "ren"} {margin.missing === 1 ? "has" : "have"} no school amount yet, so this margin
              is not counting them.
            </p>
          )}
        </section>

        <section className="acct-card">
          <div className="acct-card-head">
            <h2>How old is the money we are waiting on</h2>
            <span className="acct-card-sub">
              {aging.oldest
                ? `Oldest: ${aging.oldest.family}, ${aging.oldest.what}, ${aging.oldest.days} day${aging.oldest.days === 1 ? "" : "s"}`
                : "Nothing is late"}
            </span>
          </div>
          <AgingTable
            title="Owed by families (days past due)"
            heads={["Not due yet", "1–7 days", "8–14 days", "15+ days"]}
            lines={[
              ["School fees invoiced", aging.owed.fees],
              ["Package payments", aging.owed.packages],
            ]}
          />
          <AgingTable
            title="Paid to schools, not invoiced (days since we paid)"
            heads={["0–3 days", "4–7 days", "8–14 days", "15+ days"]}
            lines={[["School fees", aging.notInvoiced]]}
          />
        </section>
      </div>

      <section className="acct-detail" ref={detailRef}>
        <div className="acct-toolbar">
          <div className="acct-pills" role="tablist">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={"acct-pill" + (tab === key ? " is-active" : "")}
                onClick={() => pickTab(key)}
              >
                {label}
                <span className="acct-pill-count">
                  {key === "fees" ? rows.length : key === "package" ? packages.length : families.length}
                </span>
              </button>
            ))}
          </div>
          <input
            className="acct-search"
            type="search"
            placeholder="Search family, school or item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {tab === "fees" && (
          <>
            <div className="acct-filters">
              {FEE_FILTERS.map(([key, label]) => (
                <button key={key} type="button" className={"acct-filter" + (feeFilter === key ? " is-active" : "")} onClick={() => setFeeFilter(key)}>
                  {label} <span>{feeCounts[key]}</span>
                </button>
              ))}
            </div>
            {shownFees.length === 0 ? (
              <p className="acct-empty">{feeFilter === "attention" ? "Nothing is missing. Every record is complete." : "Nothing here."}</p>
            ) : (
              <div className="acct-table-card">
                <table className="acct-ctable">
                  <thead>
                    <tr>
                      <th>Family</th>
                      <th>School and children</th>
                      <th className="num">We paid</th>
                      <th className="num">We charge</th>
                      <th className="num">Difference</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownFees.map((r) => (
                      <tr key={r.record.id} onClick={() => navigate(familyLink(r.record.family_id))}>
                        <td>
                          <span className="acct-ctable-name">{r.family}</span>
                          {lastChangeText(r.record) && <span className="acct-ctable-sub">{lastChangeText(r.record)}</span>}
                        </td>
                        <td>
                          <div className="acct-cell-main">{r.record.school?.name || "School"}</div>
                          <div className="acct-cell-sub">{r.items.map((i) => childName(i.child)).join(", ") || "No children"}</div>
                          {r.flags.length > 0 && (
                            <span className="acct-chips acct-chips-tight">
                              {r.flags.map((f) => (
                                <span key={f} className="acct-chip is-amber">
                                  {f}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className="num">{money(r.paid)}</td>
                        <td className="num">{money(r.charged)}</td>
                        <td className="num">{money(r.difference)}</td>
                        <td>
                          <span className={"acct-pill-badge is-" + r.record.status}>{STATUS_LABEL[r.record.status] || r.record.status}</span>
                          {r.waiting !== null && (
                            <div className={"acct-cell-sub" + (r.waiting >= WAITING_RED_AFTER_DAYS ? " is-risk" : "")}>
                              {r.waiting === 0 ? "Paid today" : `Waiting ${r.waiting} day${r.waiting === 1 ? "" : "s"}`}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="acct-table-foot">Click a row to open that family's Accounting tab.</p>
              </div>
            )}
          </>
        )}

        {tab === "package" && (
          <>
            <div className="acct-filters">
              {PACKAGE_FILTERS.map(([key, label]) => (
                <button key={key} type="button" className={"acct-filter" + (packageFilter === key ? " is-active" : "")} onClick={() => setPackageFilter(key)}>
                  {label} <span>{packageCounts[key]}</span>
                </button>
              ))}
            </div>
            {shownPackages.length === 0 ? (
              <p className="acct-empty">{packageFilter === "attention" ? "Nothing overdue and no receipts waiting." : "Nothing here."}</p>
            ) : (
              <div className="acct-table-card">
                <table className="acct-ctable">
                  <thead>
                    <tr>
                      <th>Family</th>
                      <th>Item</th>
                      <th className="num">Amount</th>
                      <th>Due</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownPackages.map((x) => (
                      <tr key={x.p.id} onClick={() => navigate(familyLink(x.p.family_id))}>
                        <td>
                          <span className="acct-ctable-name">{x.family}</span>
                        </td>
                        <td>{x.p.label}</td>
                        <td className="num">{money(x.p.amount, x.p.currency || "AED")}</td>
                        <td>{x.p.due_date ? shortDate(x.p.due_date) : "—"}</td>
                        <td>
                          <span className={"acct-pill-badge is-" + x.state.tone}>{x.state.label}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="acct-table-foot">Click a row to open that family's Accounting tab.</p>
              </div>
            )}
          </>
        )}

        {tab === "family" && (
          <>
            {shownFamilies.length === 0 ? (
              <p className="acct-empty">No family owes us anything right now.</p>
            ) : (
              <div className="acct-table-card">
                <table className="acct-ctable">
                  <thead>
                    <tr>
                      <th>Family</th>
                      <th className="num">School fees owed</th>
                      <th className="num">Packages owed</th>
                      <th className="num">Total owed</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownFamilies.map((f) => (
                      <tr key={f.id} onClick={() => navigate(familyLink(f.id))}>
                        <td>
                          <span className="acct-ctable-name">{f.name}</span>
                        </td>
                        <td className="num">{money(f.school)}</td>
                        <td className="num">{money(f.pack)}</td>
                        <td className="num acct-strong">{money(f.school + f.pack)}</td>
                        <td>
                          {f.worst ? (
                            <span className="acct-pill-badge is-late">
                              Overdue {f.worst} day{f.worst === 1 ? "" : "s"}
                            </span>
                          ) : (
                            <span className="acct-cell-sub">
                              {f.items} open item{f.items === 1 ? "" : "s"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="acct-table-foot">What each family still owes us, largest first. Click a row to open their tab.</p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// One "where is the money" card: a small vertical bar chart.
function StageCard({ title, sub, empty, stages }) {
  const total = sum(stages, "amount");
  const max = Math.max(1, ...stages.map((st) => st.amount));
  return (
    <section className="acct-card">
      <div className="acct-card-head">
        <h2>{title}</h2>
        <span className="acct-card-sub">{sub}</span>
      </div>
      {total === 0 ? (
        <p className="acct-empty">{empty}</p>
      ) : (
        <div className="acct-chart" role="img" aria-label={title}>
          {stages.map((st) => (
            <div key={st.key} className="acct-col-bar">
              <span className="acct-col-val">{moneyRound(st.amount)}</span>
              <div className="acct-col-track">
                <div
                  className={"acct-col-fill is-" + st.key}
                  style={{ height: `${Math.max(st.amount > 0 ? 6 : 0, (st.amount / max) * 100)}%` }}
                />
              </div>
              <div className="acct-col-foot">
                <span className="acct-col-count">{st.count}</span>
                <span className="acct-col-label">{st.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
