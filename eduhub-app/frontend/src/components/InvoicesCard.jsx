import "./ApplicationFeesCard.css";

const KIND = {
  application_fee: "Application fee",
  registration_deposit: "Registration deposit",
  package: "Package payment",
};

function money(amount, currency) {
  return `${currency || "AED"} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function day(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(inv) {
  if (inv.status !== "open" || !inv.due_date) return false;
  const due = new Date(inv.due_date);
  due.setHours(23, 59, 59, 999);
  return due < new Date();
}

// Invoices HHE has sent through Stripe. "Pay now" opens Stripe's own secure
// page; once the family has paid, Stripe tells our server and this flips to
// Paid by itself, so there is nothing for the family to confirm.
export default function InvoicesCard({ invoices = [] }) {
  if (invoices.length === 0) return null;

  return (
    <section className="appfee-card">
      <h3>Invoices</h3>
      <ul className="appfee-list">
        {invoices.map((inv) => {
          const paid = inv.status === "paid";
          const checking = inv.status === "needs_review";
          const overdue = isOverdue(inv);
          return (
            <li key={inv.id} className="appfee-row">
              <div className="appfee-main">
                <strong>{KIND[inv.kind] || "Invoice"}{inv.school_name ? ` · ${inv.school_name}` : ""}</strong>
                <span className="appfee-sub">
                  {inv.children || ""}
                  {inv.children && !paid && inv.due_date ? " · " : ""}
                  {!paid && inv.due_date ? `due ${day(inv.due_date)}` : ""}
                </span>
              </div>
              <div className="appfee-amount">{money(inv.amount, inv.currency)}</div>
              <div className="appfee-actions">
                {paid ? (
                  <span className="appfee-badge is-paid">Paid {inv.paid_at ? day(inv.paid_at) : ""}</span>
                ) : checking ? (
                  <span className="appfee-badge">Payment received, being checked</span>
                ) : overdue ? (
                  <span className="appfee-badge is-owed">Overdue</span>
                ) : (
                  <span className="appfee-badge">Awaiting payment</span>
                )}
                {!paid && !checking && inv.hosted_invoice_url && (
                  <a className="appfee-btn is-primary" href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer">
                    Pay now
                  </a>
                )}
                {paid && inv.hosted_invoice_url && (
                  <a className="appfee-btn" href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer">
                    Receipt
                  </a>
                )}
                {inv.invoice_pdf_url && (
                  <a className="appfee-btn" href={inv.invoice_pdf_url} target="_blank" rel="noopener noreferrer">
                    Download PDF
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
