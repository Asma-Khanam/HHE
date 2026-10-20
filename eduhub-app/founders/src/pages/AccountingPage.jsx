import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAccountingOverview, resolveStripeEvent, markDepositRefunded, updateApplicationFee, markFeePaidDirect, friendlyError } from "../lib/staffData";
import { buildLedger, aed, TYPE_LABEL, TYPE_COLOR } from "../lib/accountingRows";
import { shortDate, timeAgo } from "../lib/accounting";
import AddDepositForm from "../components/AddDepositForm";
import AccountingAnalytics from "../components/AccountingAnalytics";
import "./AccountingPage.css";

// Accounting, across every family, in plain tables. Three kinds of money
// (application fees, deposits, packages), one tab for each, a Total tab with
// all of it together, an Analytics tab, and an Overview of who owes what.
// Every row opens that family's own Accounting tab, where the real work
// (invoice, void) happens; this page only reads, apart from adding a deposit
// and marking one refunded by the school.

const PAGES = [
  ["overview", "Overview"],
  ["fees", "Application fees"],
  ["deposits", "Deposits"],
  ["packages", "Packages"],
  ["total", "Total"],
  ["analytics", "Analytics"],
  ["review", "Needs review"],
];

const SEARCH_PAGES = new Set(["overview", "fees", "deposits", "packages", "total"]);

const FILTERS = {
  fees: [["owed", "Still owed"], ["paid", "Paid"], ["all", "All"]],
  deposits: [["owed", "Still owed"], ["paid", "Paid"], ["refunded", "Refunded"], ["all", "All"]],
  packages: [["owed", "Still owed"], ["paid", "Paid"], ["all", "All"]],
};

const TOTAL_FILTERS = [
  ["all", "All"],
  ["application_fee", "Application fees"],
  ["registration_deposit", "Deposits"],
  ["package", "Packages"],
];

function familyLink(familyId) {
  return `/staff/families/${familyId}?tab=accounting`;
}

function applyFilter(rows, key) {
  if (key === "all") return rows;
  if (key === "owed") return rows.filter((r) => r.owed > 0);
  if (key === "paid") return rows.filter((r) => r.state.key === "paid");
  if (key === "refunded") return rows.filter((r) => r.state.key === "refunded");
  return rows;
}

// Still-owed rows first, the oldest-waiting at the top; paid and refunded sink.
function byUrgency(a, b) {
  const rank = (r) => (r.owed > 0 ? 0 : 1);
  return rank(a) - rank(b) || (b.lateDays || 0) - (a.lateDays || 0) || (b.waiting || 0) - (a.waiting || 0) || b.amount - a.amount;
}

// The "We paid" cell on the Application fees tab: click to type what HHE paid
// the school, per child. It writes the amount onto the application fee itself,
// so the Caseload shows the same number, and the accounting record keeps step.
// "they paid" marks that the family paid the school directly, which drops that
// child off the record. Only an open (not yet invoiced) record can be edited.
function PaidCell({ row, onSaved, onError }) {
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);

  if (row.status !== "open") return <span>{aed(row.paidOut)}</span>;

  function start(e) {
    e.stopPropagation();
    const v = {};
    (row.lines || []).forEach((l) => (v[l.feeId] = l.amountPaid == null ? "" : String(l.amountPaid)));
    setVals(v);
    setEditing(true);
  }

  async function save(e) {
    e.stopPropagation();
    onError("");
    setBusy(true);
    try {
      await Promise.all(
        (row.lines || [])
          .filter((l) => l.feeId && vals[l.feeId] !== "" && Number(vals[l.feeId]) !== (l.amountPaid ?? NaN))
          .map((l) => updateApplicationFee(l.feeId, { amount: Number(vals[l.feeId]) }))
      );
      setEditing(false);
      await onSaved();
    } catch (err) {
      onError(friendlyError(err, "Couldn't save the amount."));
    } finally {
      setBusy(false);
    }
  }

  async function paidDirect(e, feeId) {
    e.stopPropagation();
    onError("");
    setBusy(true);
    try {
      await markFeePaidDirect(feeId);
      setEditing(false);
      await onSaved();
    } catch (err) {
      onError(friendlyError(err, "Couldn't update that."));
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button type="button" className="acct2-paid-btn" onClick={start} title="Click to enter what we paid the school">
        {row.missing ? <span className="acct2-paid-enter">Enter amount</span> : aed(row.paidOut)}
      </button>
    );
  }

  return (
    <div className="acct2-paid-edit" onClick={(e) => e.stopPropagation()}>
      {(row.lines || []).map((l, i) => (
        <div key={l.feeId || i} className="acct2-paid-line">
          <span className="acct2-paid-name">{l.name}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="AED"
            autoFocus={i === 0}
            value={vals[l.feeId] ?? ""}
            onChange={(e) => setVals((v) => ({ ...v, [l.feeId]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") save(e);
            }}
          />
          <button
            type="button"
            className="acct2-link"
            disabled={busy}
            onClick={(e) => paidDirect(e, l.feeId)}
            title="The family paid the school themselves, so we are not recovering this one."
          >
            they paid
          </button>
        </div>
      ))}
      <div className="acct2-paid-actions">
        <button type="button" className="acct2-btn is-primary acct2-btn-sm" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="acct2-btn acct2-btn-sm" disabled={busy} onClick={(e) => { e.stopPropagation(); setEditing(false); }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ state }) {
  return <span className={"acct-pill-badge is-" + state.tone}>{state.label}</span>;
}

export default function AccountingPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const requested = params.get("view") || "overview";
  const page = PAGES.some(([k]) => k === requested) ? requested : "overview";
  const [filters, setFilters] = useState({ fees: "owed", deposits: "all", packages: "owed" });
  const [totalType, setTotalType] = useState("all");
  const [totalOwedOnly, setTotalOwedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [addingDeposit, setAddingDeposit] = useState(false);
  const [refunding, setRefunding] = useState(null); // record id waiting for a second click
  const [actionError, setActionError] = useState("");
  const [reviewed, setReviewed] = useState([]);
  const topRef = useRef(null);

  const load = useCallback(() => {
    return getAccountingOverview()
      .then(setData)
      .catch((err) => setError(friendlyError(err, "Couldn't load accounting.")));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A search typed on one tab should not silently hide rows on the next.
  useEffect(() => {
    setSearch("");
    setActionError("");
  }, [page]);

  const ledger = useMemo(() => buildLedger(data), [data]);
  const q = search.trim().toLowerCase();
  const matches = (r) => !q || `${r.family} ${r.desc} ${r.sub}`.toLowerCase().includes(q);

  const byType = useMemo(
    () => ({
      fees: ledger.filter((r) => r.type === "application_fee"),
      deposits: ledger.filter((r) => r.type === "registration_deposit"),
      packages: ledger.filter((r) => r.type === "package"),
    }),
    [ledger]
  );

  // Overview: one line per family that still owes us anything.
  const owing = useMemo(() => {
    const map = new Map();
    ledger.forEach((r) => {
      if (!r.owed) return;
      if (!map.has(r.familyId)) {
        map.set(r.familyId, { id: r.familyId, name: r.family, application_fee: 0, registration_deposit: 0, package: 0, total: 0, worst: 0, uninvoiced: 0 });
      }
      const f = map.get(r.familyId);
      f[r.type] += r.owed;
      f.total += r.owed;
      f.worst = Math.max(f.worst, r.lateDays || 0);
      if (r.status === "open") f.uninvoiced += 1;
    });
    return [...map.values()].sort((a, b) => b.worst - a.worst || b.total - a.total);
  }, [ledger]);

  const totals = useMemo(() => {
    const t = { owed: 0, application_fee: 0, registration_deposit: 0, package: 0 };
    owing.forEach((f) => {
      t.owed += f.total;
      t.application_fee += f.application_fee;
      t.registration_deposit += f.registration_deposit;
      t.package += f.package;
    });
    return t;
  }, [owing]);

  const stripeAlerts = (data?.stripeAlerts || []).filter((a) => !reviewed.includes(a.id));

  const familiesForForm = useMemo(
    () =>
      Object.entries(data?.familyNames || {})
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data]
  );

  const pageCounts = {
    fees: byType.fees.filter((r) => r.owed > 0).length,
    deposits: byType.deposits.filter((r) => r.owed > 0).length,
    packages: byType.packages.filter((r) => r.owed > 0).length,
    review: stripeAlerts.length,
  };
  const visiblePages = PAGES.filter(([k]) => k !== "review" || stripeAlerts.length > 0);

  function pickPage(key) {
    const next = new URLSearchParams(params);
    if (key === "overview") next.delete("view");
    else next.set("view", key);
    setParams(next, { replace: true });
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function markReviewed(id) {
    setActionError("");
    try {
      await resolveStripeEvent(id);
      setReviewed((list) => [...list, id]);
    } catch {
      setActionError("Couldn't mark that as reviewed. Check that addendum 117 has been run.");
    }
  }

  async function refund(recordId) {
    setActionError("");
    try {
      await markDepositRefunded(recordId);
      setRefunding(null);
      await load();
    } catch (err) {
      setRefunding(null);
      setActionError(friendlyError(err, "Couldn't mark that as refunded."));
    }
  }

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

  // One table for the three list tabs (fees, deposits, packages).
  function renderList({ tabKey, rows, columns, emptyText, addButton }) {
    const filter = filters[tabKey];
    const shown = applyFilter(rows, filter).filter(matches).sort(byUrgency);
    const countFor = (k) => applyFilter(rows, k).length;
    return (
      <div className="acct-list">
        <div className="acct2-toolbar">
          <div className="acct-filters">
            {FILTERS[tabKey].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={"acct-filter" + (filter === key ? " is-active" : "")}
                onClick={() => setFilters((f) => ({ ...f, [tabKey]: key }))}
              >
                {label} <span>{countFor(key)}</span>
              </button>
            ))}
          </div>
          {addButton}
        </div>
        {actionError && <p className="acct-error">{actionError}</p>}
        {shown.length === 0 ? (
          <p className="acct-empty">{emptyText}</p>
        ) : (
          <div className="acct-table-card">
            <table className="acct-ctable">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.head} className={c.num ? "num" : ""}>
                      {c.head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} onClick={() => navigate(familyLink(r.familyId))}>
                    {columns.map((c) => (
                      <td key={c.head} className={c.num ? "num" : ""}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="acct-table-foot">Click a row to open that family&apos;s Accounting tab.</p>
          </div>
        )}
      </div>
    );
  }

  const familyCol = { head: "Family", cell: (r) => <span className="acct-ctable-name">{r.family}</span> };
  const schoolCol = {
    head: "School and children",
    cell: (r) => (
      <>
        <div className="acct-cell-main">{r.desc}</div>
        <div className="acct-cell-sub">{r.sub}</div>
      </>
    ),
  };
  const statusCol = { head: "Status", cell: (r) => <StatusBadge state={r.state} /> };

  const feeColumns = [
    familyCol,
    schoolCol,
    { head: "We paid", cell: (r) => <PaidCell row={r} onSaved={load} onError={setActionError} /> },
    { head: "Family owes", num: true, cell: (r) => aed(r.amount) },
    statusCol,
  ];

  const depositColumns = [
    familyCol,
    schoolCol,
    { head: "Amount", num: true, cell: (r) => aed(r.amount) },
    statusCol,
    {
      head: "",
      cell: (r) =>
        r.canRefund ? (
          refunding === r.recordId ? (
            <span className="acct2-confirm" onClick={(e) => e.stopPropagation()}>
              Sure?{" "}
              <button type="button" className="acct2-link is-danger" onClick={() => refund(r.recordId)}>
                Yes, school refunded
              </button>{" "}
              <button type="button" className="acct2-link" onClick={() => setRefunding(null)}>
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="acct2-link"
              onClick={(e) => {
                e.stopPropagation();
                setRefunding(r.recordId);
              }}
            >
              School refunded
            </button>
          )
        ) : null,
    },
  ];

  const packageColumns = [
    familyCol,
    { head: "Payment", cell: (r) => r.desc },
    { head: "Amount", num: true, cell: (r) => aed(r.amount) },
    statusCol,
  ];

  const totalRows = ledger
    .filter((r) => (totalType === "all" ? true : r.type === totalType))
    .filter((r) => (totalOwedOnly ? r.owed > 0 : true))
    .filter(matches)
    .sort((a, b) => (b.date ? new Date(b.date).getTime() : 0) - (a.date ? new Date(a.date).getTime() : 0));

  const typeSummary = ["application_fee", "registration_deposit", "package"].map((t) => {
    const rows = ledger.filter((r) => r.type === t);
    return {
      t,
      billed: rows.reduce((n, r) => n + r.billed, 0),
      collected: rows.reduce((n, r) => n + r.collected, 0),
      owed: rows.reduce((n, r) => n + r.owed, 0),
    };
  });

  const owingShown = owing.filter((f) => !q || f.name.toLowerCase().includes(q));

  return (
    <div className="acct-page">
      <header className="acct-head">
        <div>
          <h1 className="acct-title">Accounting</h1>
          <p className="acct-subtitle">
            Application fees, deposits and packages in one place. Open any row to work on it in that family&apos;s Accounting tab.
          </p>
        </div>
        {SEARCH_PAGES.has(page) && (
          <input
            className="acct-search"
            type="search"
            placeholder="Search family, school or item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </header>

      <div className="acct-pills" role="tablist" ref={topRef}>
        {visiblePages.map(([key, label]) => {
          const count = pageCounts[key];
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={page === key}
              className={"acct-pill" + (page === key ? " is-active" : "") + (key === "review" ? " is-review" : "")}
              onClick={() => pickPage(key)}
            >
              {label}
              {count > 0 && <span className="acct-pill-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {page === "overview" && (
        <div className="acct-overview">
          <section className="acct-card">
            <div className="acct-card-head">
              <h2>Who owes us what</h2>
              <span className="acct-card-sub">
                {aed(totals.owed)} from {owing.length} {owing.length === 1 ? "family" : "families"}
              </span>
            </div>
            {owingShown.length === 0 ? (
              <p className="acct-empty">{owing.length === 0 ? "Nobody owes us anything right now." : "Nothing matches that."}</p>
            ) : (
              <div className="acct-table-card is-flat">
                <table className="acct-ctable">
                  <thead>
                    <tr>
                      <th>Family</th>
                      <th className="num">Application fees</th>
                      <th className="num">Deposits</th>
                      <th className="num">Packages</th>
                      <th className="num">Total owed</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {owingShown.map((f) => (
                      <tr key={f.id} onClick={() => navigate(familyLink(f.id))}>
                        <td>
                          <span className="acct-ctable-name">{f.name}</span>
                        </td>
                        <td className="num">{f.application_fee ? aed(f.application_fee) : "–"}</td>
                        <td className="num">{f.registration_deposit ? aed(f.registration_deposit) : "–"}</td>
                        <td className="num">{f.package ? aed(f.package) : "–"}</td>
                        <td className="num acct-strong">{aed(f.total)}</td>
                        <td>
                          {f.worst > 0 ? (
                            <span className="acct-pill-badge is-late">
                              Overdue {f.worst} day{f.worst === 1 ? "" : "s"}
                            </span>
                          ) : f.uninvoiced > 0 ? (
                            <span className="acct-pill-badge is-amber">We still need to invoice</span>
                          ) : (
                            <span className="acct-cell-sub">Waiting on the family</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="acct2-total-row">
                      <td>Total</td>
                      <td className="num">{aed(totals.application_fee)}</td>
                      <td className="num">{aed(totals.registration_deposit)}</td>
                      <td className="num">{aed(totals.package)}</td>
                      <td className="num acct-strong">{aed(totals.owed)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
                <p className="acct-table-foot">
                  Money we have paid out for a family counts as owed even before we invoice it. Click a row to open that family.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {page === "fees" &&
        renderList({
          tabKey: "fees",
          rows: byType.fees,
          columns: feeColumns,
          emptyText: filters.fees === "owed" ? "No application fee is waiting to be paid." : "Nothing here.",
        })}

      {page === "deposits" && (
        <>
          {addingDeposit && (
            <AddDepositForm
              families={familiesForForm}
              onCancel={() => setAddingDeposit(false)}
              onSaved={() => {
                setAddingDeposit(false);
                setFilters((f) => ({ ...f, deposits: "all" }));
                load();
              }}
            />
          )}
          {renderList({
            tabKey: "deposits",
            rows: byType.deposits,
            columns: depositColumns,
            emptyText:
              byType.deposits.length === 0
                ? "No registration deposits yet. Add one when we pay a school's deposit for a family."
                : "Nothing here.",
            addButton: !addingDeposit && (
              <button type="button" className="acct2-btn is-primary" onClick={() => setAddingDeposit(true)}>
                + Add a deposit
              </button>
            ),
          })}
        </>
      )}

      {page === "packages" &&
        renderList({
          tabKey: "packages",
          rows: byType.packages,
          columns: packageColumns,
          emptyText: filters.packages === "owed" ? "No package payment is waiting." : "Nothing here.",
        })}

      {page === "total" && (
        <div className="acct-list">
          <div className="acct-table-card is-flat acct2-summary-table">
            <table className="acct-ctable">
              <thead>
                <tr>
                  <th>Kind of money</th>
                  <th className="num">Billed</th>
                  <th className="num">Collected</th>
                  <th className="num">Still owed</th>
                </tr>
              </thead>
              <tbody>
                {typeSummary.map((s) => (
                  <tr key={s.t} className="is-static">
                    <td>
                      <span className="acct2-dot" style={{ background: TYPE_COLOR[s.t] }} />
                      {TYPE_LABEL[s.t]}
                    </td>
                    <td className="num">{aed(s.billed)}</td>
                    <td className="num">{aed(s.collected)}</td>
                    <td className="num">{aed(s.owed)}</td>
                  </tr>
                ))}
                <tr className="acct2-total-row is-static">
                  <td>Total</td>
                  <td className="num">{aed(typeSummary.reduce((n, s) => n + s.billed, 0))}</td>
                  <td className="num">{aed(typeSummary.reduce((n, s) => n + s.collected, 0))}</td>
                  <td className="num acct-strong">{aed(typeSummary.reduce((n, s) => n + s.owed, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="acct2-toolbar">
            <div className="acct-filters">
              {TOTAL_FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={"acct-filter" + (totalType === key ? " is-active" : "")}
                  onClick={() => setTotalType(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="acct2-check">
              <input type="checkbox" checked={totalOwedOnly} onChange={(e) => setTotalOwedOnly(e.target.checked)} /> Only what is still owed
            </label>
          </div>

          {totalRows.length === 0 ? (
            <p className="acct-empty">Nothing matches that.</p>
          ) : (
            <div className="acct-table-card">
              <table className="acct-ctable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Family</th>
                    <th>Kind</th>
                    <th>Item</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {totalRows.map((r) => (
                    <tr key={r.key} onClick={() => navigate(familyLink(r.familyId))}>
                      <td>{r.date ? shortDate(r.date) : "—"}</td>
                      <td>
                        <span className="acct-ctable-name">{r.family}</span>
                      </td>
                      <td>
                        <span className="acct2-dot" style={{ background: TYPE_COLOR[r.type] }} />
                        {TYPE_LABEL[r.type]}
                      </td>
                      <td>
                        <div className="acct-cell-main">{r.desc}</div>
                        {r.sub && <div className="acct-cell-sub">{r.sub}</div>}
                      </td>
                      <td className="num">{aed(r.amount)}</td>
                      <td>
                        <StatusBadge state={r.state} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="acct-table-foot">Newest first. Click a row to open that family&apos;s Accounting tab.</p>
            </div>
          )}
        </div>
      )}

      {page === "analytics" && <AccountingAnalytics ledger={ledger} />}

      {page === "review" && (
        <div className="acct-list">
          {actionError && <p className="acct-error">{actionError}</p>}
          {stripeAlerts.length === 0 ? (
            <p className="acct-empty">No Stripe payments need a look. The payment webhook will drop anything here if it does not match the invoice.</p>
          ) : (
            <ul className="acct-stripe-alerts">
              {stripeAlerts.map((a) => {
                const inv = data.invoices.find((i) => i.stripe_invoice_id === a.stripe_invoice_id);
                const title =
                  a.outcome === "mismatch"
                    ? "Payment did not match the invoice"
                    : a.outcome === "paid_but_void"
                      ? "Money arrived on a voided invoice"
                      : a.outcome === "unknown_invoice"
                        ? "Payment for an invoice we don't have"
                        : "Stripe payment needs a look";
                return (
                  <li key={a.id}>
                    <div>
                      <strong>{title}</strong>
                      <span>
                        {a.detail || a.type} · {timeAgo(a.received_at)}
                      </span>
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
        </div>
      )}
    </div>
  );
}
