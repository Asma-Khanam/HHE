// One list of every bit of money, whatever kind it is, so the Accounting page's
// tabs (Overview, Application fees, Deposits, Packages, Total, Analytics) all
// read the same rows and can never disagree.
//
// Three kinds of money:
//   application_fee       HHE paid a school's application fee; the family is
//                         charged the flat fee per child (addendum 109)
//   registration_deposit  HHE paid a first-term registration deposit; the family
//                         repays exactly that, and the school may refund it (119)
//   package               HHE's own fee, from the package payments list
//
// state.key says who has to act: todo = we do (invoice it, confirm a receipt),
// waiting = the family does, paid, refunded.

import { liveItems, sum, childName, daysSince, shortDate, kindOf, invoiceBlockers } from "./accounting";
import { daysUntil } from "./workflow";

export const TYPE_LABEL = {
  application_fee: "Application fee",
  registration_deposit: "Deposit",
  package: "Package",
};
export const TYPE_COLOR = {
  application_fee: "#7a1f3d",
  registration_deposit: "#265bad",
  package: "#1e7f6e",
};

export const NOT_INVOICED_RED_AFTER_DAYS = 3;

function feeRow(record, data) {
  const type = kindOf(record);
  const items = liveItems(record);
  const paidOut = sum(items, "amount_paid");
  const charged = sum(items, "amount_charged");
  const family = data.familyNames[record.family_id] || "Family";
  const kids = items.map((i) => childName(i.child)).join(", ") || "No children";
  const missing = items.some((i) => i.amount_paid === null || i.amount_paid === undefined);
  const waiting = record.status === "open" ? daysSince(record.school_paid_at || record.created_at) : null;
  const inv = record.invoice;
  const daysToDue = record.status === "invoiced" ? daysUntil(inv?.due_date) : null;
  const lateDays = daysToDue !== null && daysToDue < 0 ? -daysToDue : 0;

  let state;
  if (record.status === "paid") {
    state = { key: "paid", label: record.family_paid_at ? `Paid ${shortDate(record.family_paid_at)}` : "Paid", tone: "good" };
  } else if (record.status === "refunded") {
    state = { key: "refunded", label: "Refunded by school", tone: "muted" };
  } else if (record.status === "invoiced") {
    state = lateDays > 0
      ? { key: "waiting", label: `Invoice ${lateDays} day${lateDays === 1 ? "" : "s"} overdue`, tone: "late" }
      : { key: "waiting", label: inv?.due_date ? `Invoiced · due ${shortDate(inv.due_date)}` : "Invoiced · waiting", tone: "blue" };
  } else {
    const blocked = invoiceBlockers(record).length > 0;
    const red = waiting !== null && waiting >= NOT_INVOICED_RED_AFTER_DAYS;
    state = { key: "todo", label: blocked ? "Paid to school · details missing" : "Ready to invoice", tone: red ? "late" : "amber" };
  }

  const owed = record.status === "open" || record.status === "invoiced" ? charged : 0;
  return {
    key: `r-${record.id}`,
    type,
    recordId: record.id,
    familyId: record.family_id,
    family,
    desc: `${record.school?.name || "School"}`,
    sub: kids,
    paidOut,
    amount: charged,
    state,
    status: record.status,
    date: record.status === "paid" ? record.family_paid_at : record.school_paid_at || record.created_at,
    billed: record.status === "refunded" ? 0 : charged,
    collected: record.status === "paid" ? charged : 0,
    owed,
    lateDays,
    waiting,
    missing,
    lines: items.map((i) => ({ feeId: i.application_fee_id, name: childName(i.child), amountPaid: i.amount_paid })),
    canRefund: type === "registration_deposit" && record.status === "open",
  };
}

function packageRow(p, data) {
  const d = daysUntil(p.due_date);
  const lateDays = d !== null && d < 0 ? -d : 0;
  let state;
  if (p.status === "paid") state = { key: "paid", label: p.paid_at ? `Paid ${shortDate(p.paid_at)}` : "Paid", tone: "good" };
  else if (p.status === "waived") state = { key: "paid", label: "Waived", tone: "muted" };
  else if (p.status === "submitted") state = { key: "todo", label: "Receipt uploaded · confirm it", tone: "blue" };
  else if (lateDays > 0) state = { key: "waiting", label: `${lateDays} day${lateDays === 1 ? "" : "s"} overdue`, tone: "late" };
  else if (d === null) state = { key: "waiting", label: "No due date", tone: "amber" };
  else state = { key: "waiting", label: d === 0 ? "Due today" : `Due in ${d} day${d === 1 ? "" : "s"}`, tone: "amber" };

  const amount = Number(p.amount) || 0;
  const owed = p.status === "unpaid" || p.status === "submitted" ? amount : 0;
  return {
    key: `p-${p.id}`,
    type: "package",
    recordId: null,
    familyId: p.family_id,
    family: data.familyNames[p.family_id] || "Family",
    desc: p.label || "Package payment",
    sub: p.due_date ? `Due ${shortDate(p.due_date)}` : "",
    paidOut: 0,
    amount,
    state,
    status: p.status,
    date: p.status === "paid" ? p.paid_at : p.due_date,
    billed: p.status === "waived" ? 0 : amount,
    collected: p.status === "paid" ? amount : 0,
    owed,
    lateDays: owed > 0 ? lateDays : 0,
    waiting: null,
    missing: false,
    canRefund: false,
  };
}

export function buildLedger(data) {
  if (!data) return [];
  const fees = (data.records || []).map((r) => feeRow(r, data));
  const packs = (data.payments || []).map((p) => packageRow(p, data));
  return [...fees, ...packs];
}

// Whole-number AED for tables.
export function aed(n) {
  return `AED ${Math.round(Number(n) || 0).toLocaleString()}`;
}
