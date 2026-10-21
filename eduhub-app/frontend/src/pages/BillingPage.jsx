import { useEffect, useState } from "react";
import { fetchApplicationFees } from "../lib/applicationFees";
import { fetchFamilyInvoices } from "../lib/invoices";
import { useApplicationData } from "../context/ApplicationDataContext";
import PaymentsCard from "../components/PaymentsCard";
import ApplicationFeesCard from "../components/ApplicationFeesCard";
import InvoicesCard from "../components/InvoicesCard";
import "./BillingPage.css";
import { PageError, PageLoading } from "../components/StatePanels";

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
  const { status, error, user, data, reload } = useApplicationData();
  const [fees, setFees] = useState([]);
  const [feesError, setFeesError] = useState("");
  const [invoices, setInvoices] = useState([]);
  useEffect(() => {
    fetchApplicationFees()
      .then(setFees)
      .catch(() => setFeesError("Couldn't load application fees."));
  }, []);
  // Invoices are paid on Stripe's page. Reload when the family comes back to
  // this tab so a payment shows as Paid without a manual refresh.
  useEffect(() => {
    const load = () => fetchFamilyInvoices().then(setInvoices).catch(() => {});
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", load);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", load);
    };
  }, []);
  if (status === "loading") return <PageLoading label="Loading your billing…" />;
  if (status === "error") return <PageError title="We couldn’t load your billing" message={error} onRetry={reload} />;

  const payments = data?.payments || [];
  const parent = (data?.parents || []).find((x) => x.full_name || x.first_name);
  const billTo =
    parent?.full_name || [parent?.first_name, parent?.last_name].filter(Boolean).join(" ") || user?.email || "Family";
  const currency = payments[0]?.currency || "AED";
  // School application fees the team has sent over count towards the same totals.
  const feePaid = (f) => f.status === "paid" || !!f.paid_at;
  const feesDue = fees.filter((f) => !feePaid(f) && f.status !== "waived");
  const feesPaid = fees.filter(feePaid);
  const due = [...payments.filter((p) => p.status === "unpaid"), ...feesDue, ...invoices.filter((i) => i.status === "open")];
  const checking = [...payments.filter((p) => p.status === "submitted"), ...invoices.filter((i) => i.status === "needs_review")];
  const paid = [...payments.filter((p) => p.status === "paid"), ...feesPaid, ...invoices.filter((i) => i.status === "paid")];

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

      <InvoicesCard invoices={invoices} />

      <ApplicationFeesCard fees={fees} loadError={feesError} billTo={billTo} />

      <PaymentsCard userId={user?.id} payments={payments} billTo={billTo} />
    </div>
  );
}
