// Invoices and receipts for every payment (October 2026).
//
// Nothing is stored: the document is built on the spot from the payment row
// (or school application fee row) and opened in a new tab with a Print / Save
// as PDF button. The number is made from the row's id, so the same payment
// always gets the same invoice and receipt number.

const BUSINESS = "Heather Harries Relocation";

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function money(amount, currency) {
  const n = Number(amount);
  if (amount === null || amount === undefined || amount === "" || Number.isNaN(n)) return "";
  return `${currency || "AED"} ${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function day(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function numberFor(prefix, item) {
  return `${prefix}-${String(item.id || "").replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

// Turns a payments row or an application_fees row into the same shape.
export function toBillingItem(row, kind = "payment") {
  if (kind === "fee") {
    const school = row.application?.school?.name;
    const child = row.application?.child;
    const childName = (child?.preferred_name || child?.first_name || (child?.full_name || "").split(" ")[0] || "").trim();
    return {
      id: row.id,
      title: `${row.label || "Application fee"}${school ? ` — ${school}` : ""}`,
      detail: childName ? `For ${childName}` : "",
      amount: row.amount,
      currency: row.currency,
      due_date: row.due_date,
      paid_at: row.paid_at,
      paid: row.status === "paid" || !!row.paid_at,
      created_at: row.created_at,
    };
  }
  return {
    id: row.id,
    title: row.label,
    detail: row.notes || "",
    amount: row.amount,
    currency: row.currency,
    due_date: row.due_date,
    paid_at: row.paid_at,
    paid: row.status === "paid",
    created_at: row.created_at,
  };
}

export function buildBillingDocument({ kind, item, billTo }) {
  const isReceipt = kind === "receipt";
  const title = isReceipt ? "Receipt" : "Invoice";
  const number = numberFor(isReceipt ? "RCT" : "INV", item);
  const issued = isReceipt ? item.paid_at || new Date() : item.created_at || new Date();
  const total = money(item.amount, item.currency);
  const rows = [
    [isReceipt ? "Receipt no." : "Invoice no.", number],
    [isReceipt ? "Date paid" : "Date issued", day(issued)],
  ];
  if (!isReceipt && item.due_date) rows.push(["Due date", day(item.due_date)]);

  const status = isReceipt
    ? `<div class="stamp paid">PAID</div>`
    : item.paid
      ? `<div class="stamp paid">PAID</div>`
      : `<div class="stamp due">AWAITING PAYMENT</div>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} ${esc(number)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#f3f1ee;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#2b2b2b}
  .bar{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px}
  .bar button{font:inherit;padding:8px 16px;border-radius:8px;border:0;background:#6b1d3a;color:#fff;cursor:pointer}
  .page{max-width:760px;margin:0 auto 40px;background:#fff;padding:48px 52px;border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:2px solid #6b1d3a;padding-bottom:18px}
  h1{margin:0;font-size:28px;color:#6b1d3a;letter-spacing:.5px}
  .biz{font-size:15px;font-weight:600;text-align:right}
  .meta{display:flex;justify-content:space-between;gap:24px;margin:26px 0;flex-wrap:wrap}
  .meta h4{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#888}
  .meta p{margin:0;font-size:15px;line-height:1.5}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#888;padding:8px 0;border-bottom:1px solid #ddd}
  th:last-child,td:last-child{text-align:right}
  td{padding:14px 0;border-bottom:1px solid #eee;font-size:15px;vertical-align:top}
  td small{display:block;color:#777;margin-top:3px}
  .total{display:flex;justify-content:flex-end;gap:30px;margin-top:18px;font-size:18px;font-weight:700}
  .stamp{display:inline-block;margin-top:26px;padding:6px 16px;border:2px solid;border-radius:6px;font-weight:700;letter-spacing:.12em;font-size:13px;transform:rotate(-3deg)}
  .stamp.paid{color:#1f7a3f;border-color:#1f7a3f}
  .stamp.due{color:#b36a00;border-color:#b36a00}
  .foot{margin-top:36px;font-size:12px;color:#888;line-height:1.5}
  @media(max-width:600px){.page{padding:28px 22px}}
  @media print{body{background:#fff}.bar{display:none}.page{box-shadow:none;margin:0;max-width:none;padding:0}}
</style></head><body>
<div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="page">
  <div class="top"><h1>${esc(title.toUpperCase())}</h1><div class="biz">${esc(BUSINESS)}</div></div>
  <div class="meta">
    <div><h4>Billed to</h4><p>${esc(billTo || "Family")}</p></div>
    <div><h4>Details</h4><p>${rows.map(([k, v]) => `${esc(k)}: <strong>${esc(v)}</strong>`).join("<br>")}</p></div>
  </div>
  <table>
    <thead><tr><th>Description</th><th>Amount</th></tr></thead>
    <tbody><tr><td>${esc(item.title)}${item.detail ? `<small>${esc(item.detail)}</small>` : ""}</td><td>${esc(total)}</td></tr></tbody>
  </table>
  <div class="total"><span>${isReceipt ? "Total received" : "Total due"}</span><span>${esc(total)}</span></div>
  ${status}
  <p class="foot">${isReceipt ? "Thank you for your payment." : "Please pay by the due date and upload your proof of payment on your Billing page."}<br>${esc(BUSINESS)}</p>
</div></body></html>`;
}

// Opens the document in a new tab. Must be called straight from a click so
// the browser doesn't block the pop-up.
export function openBillingDocument({ kind, item, billTo }) {
  const html = buildBillingDocument({ kind, item, billTo });
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) throw new Error("Your browser blocked the pop-up. Allow pop-ups for this site and try again.");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
