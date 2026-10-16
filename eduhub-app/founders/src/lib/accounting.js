// Shared by the family's Accounting tab and the overall Accounting page, so
// both always agree on what counts as missing or at risk.

export const STATUS_LABEL = {
  open: "School paid · not invoiced yet",
  invoiced: "Invoiced · waiting for the family",
  paid: "Family paid",
};

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

// What is missing or wrong on a record, in plain words. Empty = nothing to do.
export function recordFlags(record) {
  const items = liveItems(record);
  const open = record.status === "open";
  const flags = [];
  items
    .filter((i) => i.amount_paid === null || i.amount_paid === undefined)
    .forEach((i) => flags.push(`Enter what we paid the school for ${childName(i.child)} (Application fee step).`));
  if (open && (!record.school_payment_method || !record.school_paid_at)) {
    flags.push("Add how and when we paid the school.");
  }
  if (open) {
    const withProof = items.filter((i) => i.fee?.payment_proof_path).length;
    const withReceipt = items.filter((i) => i.fee?.school_receipt_path).length;
    if (withProof < items.length) flags.push(`Our bank or Qashio evidence is uploaded for ${withProof} of ${items.length} children.`);
    if (withReceipt < items.length) flags.push(`The school's receipt is uploaded for ${withReceipt} of ${items.length} children.`);
  }
  return flags;
}
