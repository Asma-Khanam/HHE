// Shared by the family's Accounting tab and the overall Accounting page, so
// both always agree on what counts as missing or at risk.

export const STATUS_LABEL = {
  open: "School paid · not invoiced yet",
  invoiced: "Invoiced · waiting for the family",
  paid: "Family paid",
  refunded: "Refunded by the school",
};

// Which of the three kinds of money a record is (addendum 119). Records made
// before that SQL was run have no kind and are application fees.
export function kindOf(record) {
  return record?.kind || "application_fee";
}

export function shortDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function money(n, currency = "AED") {
  if (n === null || n === undefined || n === "") return "—";
  return `${currency} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function childName(c) {
  return (c?.preferred_name || c?.first_name || (c?.full_name || "").split(" ")[0] || "Child").trim();
}

export function sum(rows, key) {
  return rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);
}

export function liveItems(record) {
  return (record.items || []).filter((i) => !i.removed_at);
}

// Whole days since a date (0 = today). Null when there is no date.
export function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  if (Number.isNaN(then.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  then.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today - then) / 86400000));
}

// What is missing or wrong on a record, as short chip labels. Empty = all good.
// Kept terse on purpose: these show as chips on the overview, not sentences.
export function recordFlags(record) {
  const items = liveItems(record);
  const open = record.status === "open";
  const flags = [];
  const missing = items.filter((i) => i.amount_paid === null || i.amount_paid === undefined);
  if (missing.length === 1) flags.push(`Amount missing · ${childName(missing[0].child)}`);
  else if (missing.length > 1) flags.push(`Amount missing · ${missing.length} children`);
  if (open && (!record.school_payment_method || !record.school_paid_at)) flags.push("Method & date");
  // A registration deposit has no application fee behind it, so there is no proof
  // or receipt to chase (the method and date still are).
  if (open && kindOf(record) !== "registration_deposit") {
    const withProof = items.filter((i) => i.fee?.payment_proof_path).length;
    const withReceipt = items.filter((i) => i.fee?.school_receipt_path).length;
    if (withProof < items.length) flags.push(`Proof ${withProof}/${items.length}`);
    if (withReceipt < items.length) flags.push(`Receipt ${withReceipt}/${items.length}`);
  }
  return flags;
}

// What stops a record being invoiced yet. Mirrors prepare_record_invoice in the
// database (addendum 117), which is the rule that cannot be bypassed.
export function invoiceBlockers(record) {
  const items = liveItems(record);
  const out = [];
  const noAmount = items.filter((i) => i.amount_paid === null || i.amount_paid === undefined);
  if (noAmount.length) out.push(`Add what we paid the school for ${noAmount.map((i) => childName(i.child)).join(", ")}`);
  if (!record.school_payment_method || !record.school_paid_at) out.push("Add how and when we paid the school");
  const noProof = kindOf(record) === "registration_deposit" ? [] : items.filter((i) => !i.fee?.payment_proof_path);
  if (noProof.length) out.push(`Attach proof of payment (${items.length - noProof.length}/${items.length} done)`);
  return out;
}

// The accounting log, in plain words. Who did what, from an accounting_events row.
const EVENT_FIELD_LABEL = {
  name: "the record name",
  school_payment_method: "how we paid the school",
  school_paid_at: "the date we paid",
  school_payment_reference: "the payment reference",
};
export function describeEvent(e) {
  const d = e.detail || {};
  switch (e.kind) {
    case "record_opened": return "opened the record";
    case "child_added": return "added a child";
    case "child_removed": return "removed a child";
    case "record_void": return "voided the record";
    case "amount_paid_changed": return "updated what we paid the school";
    case "invoice_sent": return "sent the invoice";
    case "invoice_voided": return "voided the invoice";
    case "family_paid": return "family paid (Stripe)";
    case "stripe_payment_mismatch": return "Stripe payment did not match the invoice";
    case "stripe_paid_on_void_invoice": return "money arrived on a voided invoice";
    case "record_updated": return `updated ${EVENT_FIELD_LABEL[d.field] || d.field || "a detail"}`;
    default: return (e.kind || "changed something").replace(/_/g, " ");
  }
}

// Short relative time, e.g. "2d ago". Empty when there is no date.
export function timeAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const mos = Math.floor(days / 30);
  if (mos < 12) return `${mos}mo ago`;
  return `${Math.floor(mos / 12)}y ago`;
}

// Whole-number money for headline tiles.
export function moneyRound(n, currency = "AED") {
  return `${currency} ${Math.round(Number(n) || 0).toLocaleString()}`;
}
