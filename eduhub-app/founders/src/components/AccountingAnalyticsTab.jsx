import { useEffect, useMemo, useState } from "react";
import { getAccountingOverview, friendlyError } from "../lib/staffData";
import { buildLedger } from "../lib/accountingRows";
import AccountingAnalytics from "./AccountingAnalytics";
import "../pages/AccountingPage.css";

// The Accounting page's Analytics tab, shown on the Dashboard too. Same component, same numbers.
export default function AccountingAnalyticsTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getAccountingOverview()
      .then(setData)
      .catch((err) => setError(friendlyError(err, "Couldn't load accounting.")));
  }, []);
  const ledger = useMemo(() => buildLedger(data), [data]);
  if (error) return <div className="hh-form-banner hh-form-banner-error">{error}</div>;
  if (!data) return <p className="in-loading">Crunching the numbers…</p>;
  return <AccountingAnalytics ledger={ledger} />;
}
