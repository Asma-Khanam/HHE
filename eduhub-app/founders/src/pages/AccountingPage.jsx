import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAccountingOverview, friendlyError } from "../lib/staffData";
import { STATUS_LABEL, money, moneyRound, childName, sum, liveItems, recordFlags, daysSince } from "../lib/accounting";
import { daysUntil } from "../lib/workflow";
import "./AccountingPage.css";

// Accounting, across every family (16 Oct 2026). Built around the questions a
// consultant actually asks when they open it:
//   1. How much of our money is out there right now?
//   2. Who do I need to chase or fix today?
//   3. For one family: what do they owe us, in total?
// So: a money summary and a recovery bar on top, a short "do this today" list,
// then the detail in tabs: School application fees (HHE paid the school and
// invoices the family), Package payments (registration, deposits, services),
// and a By family view. Each row opens that family's own Accounting tab.
// Staff-only. Nothing here can be edited; changes happen on the family's tab.

// A school we paid, with no invoice sent yet, is our money out of the bank.
// It is called out once it has waited this many days.
const WAITING_RED_AFTER_DAYS = 3;
const FAMILIES_SHOWN = 5;
const ITEMS_PER_FAMILY = 3;

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

export default function AccountingPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "fees";
  const [feeFilter, setFeeFilter] = useState("attention");
  const [packageFilter, setPackageFilter] = useState("attention");
  const [search, setSearch] = useState("");
  const [showAllActions, setShowAllActions] = useState(false);

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
    const outOfPocket = sum(open.map((r) => ({ v: r.paid })), "v") + sum(invoiced.map((r) => ({ v: r.paid })), "v");
    return {
      open,
      invoiced,
      paid,
      outOfPocket,
      schoolToCollect: sum(open.map((r) => ({ v: r.charged })), "v") + sum(invoiced.map((r) => ({ v: r.charged })), "v"),
      packageToCollect: sum(packOwed.map((x) => x.p), "amount"),
      collected: sum(paid.map((r) => ({ v: r.charged })), "v") + sum(packPaid.map((x) => x.p), "amount"),
      margin: sum(rows.map((r) => ({ v: r.difference })), "v"),
      marginEarned: sum(paid.map((r) => ({ v: r.difference })), "v"),
      openCharged: sum(open.map((r) => ({ v: r.charged })), "v"),
      invoicedCharged: sum(invoiced.map((r) => ({ v: r.charged })), "v"),
      paidCharged: sum(paid.map((r) => ({ v: r.charged })), "v"),
    };
  }, [rows, packages]);

  // "Do this today": the things that are costing us money or time right now.
  const actions = useMemo(() => {
    const list = [];
    rows.forEach((r) => {
      r.flags.forEach((f) =>
        list.push({ id: `${r.record.id}-${f}`, rank: 1, tone: "late", family: r.family, familyId: r.record.family_id, what: `${r.record.school?.name || "School"}: ${f}` })
      );
      if (r.waiting !== null && r.waiting >= WAITING_RED_AFTER_DAYS) {
        list.push({
          id: `${r.record.id}-wait`,
          rank: 2,
          tone: "late",
          family: r.family,
          familyId: r.record.family_id,
          what: `We paid ${r.record.school?.name || "the school"} ${r.waiting} days ago (${money(r.paid)}) and the family has not been invoiced.`,
        });
      }
    });
    packages.forEach((x) => {
      if (x.state.tone === "late")
        list.push({ id: `pk-${x.p.id}`, rank: 3, tone: "late", family: x.family, familyId: x.p.family_id, what: `${x.p.label} (${money(x.p.amount, x.p.currency || "AED")}) is ${x.state.label.toLowerCase()}.` });
      if (x.p.status === "submitted")
        list.push({ id: `pk-${x.p.id}`, rank: 4, tone: "blue", family: x.family, familyId: x.p.family_id, what: `Receipt uploaded for ${x.p.label}. Check it and confirm.` });
    });
    return list.sort((a, b) => a.rank - b.rank);
  }, [rows, packages]);

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

  // The same family often has several things to fix; show them once, together.
  const groups = useMemo(() => {
    const m = new Map();
    actions.forEach((a) => {
      if (!m.has(a.familyId)) m.set(a.familyId, { familyId: a.familyId, family: a.family, items: [], rank: a.rank, tone: a.tone });
      const g = m.get(a.familyId);
      g.items.push(a);
      g.rank = Math.min(g.rank, a.rank);
      if (a.tone === "late") g.tone = "late";
    });
    return [...m.values()].sort((x, y) => x.rank - y.rank || y.items.length - x.items.length);
  }, [actions]);

  const pk = useMemo(() => {
    const of = (st) => packages.filter((x) => x.p.status === st);
    const amt = (list) => sum(list.map((x) => x.p), "amount");
    return { unpaid: of("unpaid"), submitted: of("submitted"), paid: of("paid"), amt };
  }, [packages]);

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
    .filter((r) => matches(`${r.family} ${r.record.school?.name || ""}`));
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

      <div className="acct-stats">
        <div className={"acct-stat" + (oldestWaiting >= WAITING_RED_AFTER_DAYS ? " is-risk" : "")}>
          <span className="acct-stat-label">Out of pocket</span>
          <strong>{moneyRound(totals.outOfPocket)}</strong>
          <em>Paid to schools, not yet recovered</em>
        </div>
        <div className="acct-stat">
          <span className="acct-stat-label">To collect</span>
          <strong>{moneyRound(totals.schoolToCollect + totals.packageToCollect)}</strong>
          <em>
            {moneyRound(totals.schoolToCollect)} school fees · {moneyRound(totals.packageToCollect)} packages
          </em>
        </div>
        <div className="acct-stat is-good">
          <span className="acct-stat-label">Collected</span>
          <strong>{moneyRound(totals.collected)}</strong>
          <em>School fees and packages paid</em>
        </div>
        <div className="acct-stat">
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
              { key: "open", label: "Waiting for the family", amount: pk.amt(pk.unpaid), count: pk.unpaid.length },
              { key: "invoiced", label: "Receipt uploaded, confirm it", amount: pk.amt(pk.submitted), count: pk.submitted.length },
              { key: "paid", label: "Paid", amount: pk.amt(pk.paid), count: pk.paid.length },
            ]}
          />
        </div>

        <section className="acct-card">
          <div className="acct-card-head">
            <h2>Do this today</h2>
            <span className="acct-card-sub">
              {actions.length === 0 ? "All clear" : `${groups.length} famil${groups.length === 1 ? "y" : "ies"} · ${actions.length} item${actions.length === 1 ? "" : "s"}`}
            </span>
          </div>
          {actions.length === 0 ? (
            <p className="acct-empty">Nothing is missing, overdue or waiting on us.</p>
          ) : (
            <>
              <ul className="acct-actions">
                {visibleGroups.map((g) => (
                  <li key={g.familyId} className={"is-" + g.tone}>
                    <div className="acct-action-main">
                      <div className="acct-action-top">
                        <strong>{g.family}</strong>
                        <span className="acct-action-count">{g.items.length}</span>
                      </div>
                      <ul className="acct-action-items">
                        {g.items.slice(0, ITEMS_PER_FAMILY).map((a) => (
                          <li key={a.id}>{a.what}</li>
                        ))}
                      </ul>
                      {g.items.length > ITEMS_PER_FAMILY && (
                        <span className="acct-action-more">+ {g.items.length - ITEMS_PER_FAMILY} more on their tab</span>
                      )}
                    </div>
                    <Link to={familyLink(g.familyId)} className="acct-open">
                      Open
                    </Link>
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

      <section className="acct-card acct-detail">
        <div className="acct-tabs" role="tablist">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={"acct-tab" + (tab === key ? " is-active" : "")}
              onClick={() => pickTab(key)}
            >
              {label}
              <span className="acct-tab-count">
                {key === "fees" ? rows.length : key === "package" ? packages.length : families.length}
              </span>
            </button>
          ))}
          <input
            className="acct-search"
            type="search"
            placeholder="Search family, school or item"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {tab === "fees" && (
          <>
            <p className="acct-tab-hint">
              Schools HHE paid on a family's behalf. The family is charged the flat fee; the difference is ours.
            </p>
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
              <div className="acct-table-wrap">
                <table className="acct-table">
                  <thead>
                    <tr>
                      <th>Family</th>
                      <th>School and children</th>
                      <th className="num">We paid</th>
                      <th className="num">We charge</th>
                      <th className="num">Difference</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {shownFees.map((r) => (
                      <tr key={r.record.id}>
                        <td>
                          <Link to={familyLink(r.record.family_id)} className="acct-link">
                            {r.family}
                          </Link>
                        </td>
                        <td>
                          <div className="acct-cell-main">{r.record.school?.name || "School"}</div>
                          <div className="acct-cell-sub">{r.items.map((i) => childName(i.child)).join(", ") || "No children"}</div>
                          {r.flags.length > 0 && (
                            <ul className="acct-flags">
                              {r.flags.map((f) => (
                                <li key={f}>{f}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="num">{money(r.paid)}</td>
                        <td className="num">{money(r.charged)}</td>
                        <td className="num">{money(r.difference)}</td>
                        <td>
                          <span className={"acct-pill is-" + r.record.status}>{STATUS_LABEL[r.record.status] || r.record.status}</span>
                          {r.waiting !== null && (
                            <div className={"acct-cell-sub" + (r.waiting >= WAITING_RED_AFTER_DAYS ? " is-risk" : "")}>
                              {r.waiting === 0 ? "Paid today" : `Waiting ${r.waiting} day${r.waiting === 1 ? "" : "s"}`}
                            </div>
                          )}
                        </td>
                        <td>
                          <Link to={familyLink(r.record.family_id)} className="acct-open">
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === "package" && (
          <>
            <p className="acct-tab-hint">
              Registration, deposits and service fees added to each family. Families pay and upload a receipt; you confirm it on their tab.
            </p>
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
              <div className="acct-table-wrap">
                <table className="acct-table">
                  <thead>
                    <tr>
                      <th>Family</th>
                      <th>Item</th>
                      <th className="num">Amount</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {shownPackages.map((x) => (
                      <tr key={x.p.id}>
                        <td>
                          <Link to={familyLink(x.p.family_id)} className="acct-link">
                            {x.family}
                          </Link>
                        </td>
                        <td>{x.p.label}</td>
                        <td className="num">{money(x.p.amount, x.p.currency || "AED")}</td>
                        <td>{x.p.due_date ? shortDate(x.p.due_date) : "—"}</td>
                        <td>
                          <span className={"acct-pill is-" + x.state.tone}>{x.state.label}</span>
                        </td>
                        <td>
                          <Link to={familyLink(x.p.family_id)} className="acct-open">
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === "family" && (
          <>
            <p className="acct-tab-hint">What each family still owes us across school fees and packages, largest first.</p>
            {shownFamilies.length === 0 ? (
              <p className="acct-empty">No family owes us anything right now.</p>
            ) : (
              <div className="acct-table-wrap">
                <table className="acct-table">
                  <thead>
                    <tr>
                      <th>Family</th>
                      <th className="num">School fees owed</th>
                      <th className="num">Packages owed</th>
                      <th className="num">Total owed</th>
                      <th>Note</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {shownFamilies.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <Link to={familyLink(f.id)} className="acct-link">
                            {f.name}
                          </Link>
                        </td>
                        <td className="num">{money(f.school)}</td>
                        <td className="num">{money(f.pack)}</td>
                        <td className="num acct-strong">{money(f.school + f.pack)}</td>
                        <td>
                          {f.worst ? (
                            <span className="acct-pill is-late">Overdue {f.worst} day{f.worst === 1 ? "" : "s"}</span>
                          ) : (
                            <span className="acct-cell-sub">{f.items} open item{f.items === 1 ? "" : "s"}</span>
                          )}
                        </td>
                        <td>
                          <Link to={familyLink(f.id)} className="acct-open">
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// One "where is the money" card: a bar split by stage, then a line per stage.
function StageCard({ title, sub, empty, stages }) {
  const total = sum(stages, "amount");
  return (
    <section className="acct-card">
      <div className="acct-card-head">
        <h2>{title}</h2>
        <span className="acct-card-sub">{sub}</span>
      </div>
      {total === 0 ? (
        <p className="acct-empty">{empty}</p>
      ) : (
        <div className="acct-bar" role="img" aria-label={title}>
          {stages.map((st) => (
            <span key={st.key} className={"acct-bar-seg is-" + st.key} style={{ width: `${(st.amount / total) * 100}%` }} />
          ))}
        </div>
      )}
      <ul className="acct-legend">
        {stages.map((st) => (
          <li key={st.key}>
            <i className={"is-" + st.key} />
            <span>{st.label}</span>
            <strong>{moneyRound(st.amount)}</strong>
            <em>{st.count}</em>
          </li>
        ))}
      </ul>
    </section>
  );
}
