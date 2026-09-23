import { useApplicationData } from "../context/ApplicationDataContext";
import PaymentsCard from "../components/PaymentsCard";
import "./BillingPage.css";

function sumBy(rows, currency) {
  return rows.reduce((t, p) => t + (Number(p.amount) || 0), 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ` ${currency}`;
}

// Billing (September 2026) -- moved off the Dashboard into its own page.
// Three quick totals up top, then the same payments list as before
// (upload a receipt, see when it's confirmed).
export default function BillingPage() {
  const { status, user, data } = useApplicationData();
  if (status === "loading") return <p className="dashboard-status">Loading...</p>;

  const payments = data?.payments || [];
  const currency = payments[0]?.currency || "AED";
  const due = payments.filter((p) => p.status === "unpaid");
  const checking = payments.filter((p) => p.status === "submitted");
  const paid = payments.filter((p) => p.status === "paid");

  return (
    <div className="billing-page">
      <header className="page-head">
        <h1>Billing</h1>
        <p>What's due, what's paid, and your receipts.</p>
      </header>

      <div className="billing-tiles">
        <div className="billing-tile is-due">
          <span className="billing-tile-label">To pay</span>
          <strong>{sumBy(due, currency)}</strong>
          <span className="billing-tile-sub">{due.length} item{due.length === 1 ? "" : "s"}</span>
        </div>
        <div className="billing-tile is-checking">
          <span className="billing-tile-label">Being checked</span>
          <strong>{sumBy(checking, currency)}</strong>
          <span className="billing-tile-sub">Receipt sent, awaiting confirmation</span>
        </div>
        <div className="billing-tile is-paid">
          <span className="billing-tile-label">Paid</span>
          <strong>{sumBy(paid, currency)}</strong>
          <span className="billing-tile-sub">Confirmed by Heather Harries</span>
        </div>
      </div>

      <PaymentsCard userId={user?.id} payments={payments} />
    </div>
  );
}
