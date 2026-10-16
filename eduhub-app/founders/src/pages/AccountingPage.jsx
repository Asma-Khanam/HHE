import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAccountingOverview, friendlyError } from "../lib/staffData";
import { STATUS_LABEL, money, childName, sum, liveItems, recordFlags, daysSince } from "../lib/accounting";
import { daysUntil } from "../lib/workflow";
import "./AccountingPage.css";

// Accounting, across every family (16 Oct 2026). Miss Lyndsay's flowchart: when
// HHE pays a school, an accounting record opens; the family is invoiced; the
// family pays. This page is the whole picture for the accounts office: what is
// waiting on us, on the family, what is missing, and the package payments
// still owed. Each row opens that family's own Accounting tab. Staff-only.

// A school we paid with no invoice sent yet is money out of the bank, so it
// turns red once it has been waiting this many days.
const WAITING_RED_AFTER_DAYS = 3;

const FILTERS = [
  ["attention", "Needs attention"],
  ["open", "School paid · not invoiced"],
  ["invoiced", "Invoiced"],
  ["paid", "Family paid"],
  ["all", "All"],
];

function familyLink(familyId) {
  return `/staff/families/${familyId}?tab=accounting`;
}

function dueText(dueDate) {
  const d = daysUntil(dueDate);
  if (d === null) return "no due date";
  if (d === 0) return "due today";
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
  return `due in ${d} day${d === 1 ? "" : "s"}`;
}

export default function AccountingPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("attention");

  useEffect(() => {
    let alive = true;
    getAccountingOverview()
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(friendlyError(err, "Couldn't load accounting.")));
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.records.map((record) => {
      const items = liveItems(record);
      const flags = recordFlags(record);
      const waiting = record.status === "open" ? daysSince(record.school_paid_at || record.created_at) : null;
      return {
        record,
        items,
        flags,
        waiting,
        family: data.familyNames[record.family_id] || "Family",
        paid: sum(items, "amount_paid"),
        charged: sum(items, "amount_charged"),
        difference: sum(items, "difference"),
      };
    });
  }, [data]);

  const counts = useMemo(
    () => ({
      attention: rows.filter((r) => r.flags.length > 0).length,
      open: rows.filter((r) => r.record.status === "open").length,
      invoiced: rows.filter((r) => r.record.status === "invoiced").length,
      paid: rows.filter((r) => r.record.status === "paid").length,
      all: rows.length,
    }),
    [rows]
  );

  const shown = rows.filter((r) =>
    filter === "attention" ? r.flags.length > 0 : filter === "all" ? true : r.record.status === filter
  );

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

  const open = rows.filter((r) => r.record.status === "open");
  const invoiced = rows.filter((r) => r.record.status === "invoiced");
  const paid = rows.filter((r) => r.record.status === "paid");
  const oldestWaiting = open.reduce((m, r) => Math.max(m, r.waiting || 0), 0);
  const owed = data.payments.filter((p) => p.status === "unpaid");
  const toConfirm = data.payments.filter((p) => p.status === "submitted");
  const overdue = owed.filter((p) => (daysUntil(p.due_date) ?? 0) < 0);

  return (
    <div className="acct-page">
      <h1 className="acct-title">Accounting</h1>
      <p className="acct-subtitle">
        Every school HHE has paid for a family, what we charge, and what is still owed, in one place. Open a row to see
        that family's own Accounting tab.
      </p>

      <div className="acct-tiles">
        <div className={"acct-tile" + (oldestWaiting >= WAITING_RED_AFTER_DAYS ? " is-risk" : "")}>
          <span>School paid · not invoiced</span>
          <strong>{money(sum(open.map((r) => ({ v: r.charged })), "v"))}</strong>
          <em>
            {open.length} record{open.length === 1 ? "" : "s"}
            {open.length > 0 ? ` · oldest ${oldestWaiting} day${oldestWaiting === 1 ? "" : "s"}` : ""}
          </em>
        </div>
        <div className="acct-tile">
          <span>Invoiced · waiting for family</span>
          <strong>{money(sum(invoiced.map((r) => ({ v: r.charged })), "v"))}</strong>
          <em>
            {invoiced.length} record{invoiced.length === 1 ? "" : "s"}
          </em>
        </div>
        <div className="acct-tile is-good">
          <span>Family paid</span>
          <strong>{money(sum(paid.map((r) => ({ v: r.charged })), "v"))}</strong>
          <em>
            {paid.length} record{paid.length === 1 ? "" : "s"}
          </em>
        </div>
        <div className="acct-tile">
          <span>Difference on school fees</span>
          <strong>{money(sum(rows.map((r) => ({ v: r.difference })), "v"))}</strong>
          <em>Before Stripe's own fee</em>
        </div>
        <div className={"acct-tile" + (overdue.length > 0 ? " is-risk" : "")}>
          <span>Package payments owed</span>
          <strong>{money(sum(owed, "amount"))}</strong>
          <em>
            {overdue.length} overdue · {toConfirm.length} receipt{toConfirm.length === 1 ? "" : "s"} to confirm
          </em>
        </div>
      </div>

      <section className="acct-section">
        <h2>School payments by HHE</h2>
        <div className="acct-filters">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={"acct-filter" + (filter === key ? " is-active" : "")}
              onClick={() => setFilter(key)}
            >
              {label} <span className="acct-filter-count">{counts[key]}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="acct-empty">
            {filter === "attention" ? "Nothing is missing. Every record is complete." : "Nothing here."}
          </p>
        ) : (
          <ul className="acct-list">
            {shown.map((r) => (
              <li key={r.record.id} className="acct-row">
                <div className="acct-row-main">
                  <Link to={familyLink(r.record.family_id)} className="acct-row-family">
                    {r.family}
                  </Link>
                  <span className="acct-row-school">
                    {r.record.school?.name || "School"} ·{" "}
                    {r.items.map((i) => childName(i.child)).join(", ") || "no children"}
                  </span>
                  {r.flags.length > 0 && (
                    <ul className="acct-flags">
                      {r.flags.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="acct-row-money">
                  <span>
                    <em>We paid</em>
                    {money(r.paid)}
                  </span>
                  <span>
                    <em>We charge</em>
                    {money(r.charged)}
                  </span>
                  <span>
                    <em>Difference</em>
                    {money(r.difference)}
                  </span>
                </div>
                <div className="acct-row-status">
                  <span className={"acct-pill is-" + r.record.status}>{STATUS_LABEL[r.record.status] || r.record.status}</span>
                  {r.waiting !== null && (
                    <span className={"acct-waiting" + (r.waiting >= WAITING_RED_AFTER_DAYS ? " is-risk" : "")}>
                      {r.waiting === 0 ? "paid today" : `waiting ${r.waiting} day${r.waiting === 1 ? "" : "s"}`}
                    </span>
                  )}
                  <Link to={familyLink(r.record.family_id)} className="panel-btn panel-btn-quiet">
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="acct-section">
        <h2>
          Package and other payments <span className="acct-filter-count">{data.payments.length}</span>
        </h2>
        {data.payments.length === 0 ? (
          <p className="acct-empty">Nothing owed.</p>
        ) : (
          <ul className="acct-list">
            {data.payments.map((p) => {
              const late = (daysUntil(p.due_date) ?? 0) < 0 && p.status === "unpaid";
              return (
                <li key={p.id} className="acct-row">
                  <div className="acct-row-main">
                    <Link to={familyLink(p.family_id)} className="acct-row-family">
                      {data.familyNames[p.family_id] || "Family"}
                    </Link>
                    <span className="acct-row-school">{p.label}</span>
                  </div>
                  <div className="acct-row-money">
                    <span>
                      <em>Amount</em>
                      {money(p.amount, p.currency || "AED")}
                    </span>
                  </div>
                  <div className="acct-row-status">
                    <span className={"acct-pill " + (p.status === "submitted" ? "is-invoiced" : late ? "is-late" : "is-open")}>
                      {p.status === "submitted" ? "Receipt uploaded · confirm it" : dueText(p.due_date)}
                    </span>
                    <Link to={familyLink(p.family_id)} className="panel-btn panel-btn-quiet">
                      Open
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
