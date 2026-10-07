import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSitePage } from "../lib/sitePages";
import PolicyText from "../components/PolicyText";
import "./PrivacyPage.css";

// Public -- no login needed -- so it can be linked from the App Store and
// Google Play listings. The wording is edited by the team in the Consultant
// website (Settings > Privacy policy), not in the code.
export default function PrivacyPage() {
  const [page, setPage] = useState(undefined); // undefined = loading, null = unavailable

  useEffect(() => {
    fetchSitePage("privacy").then(setPage);
  }, []);

  const updated = page?.updated_at
    ? new Date(page.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="privacy-shell">
      <main className="privacy-card">
        <Link to="/login" className="privacy-back">← Back</Link>
        {page === undefined && <p className="privacy-status">Loading…</p>}
        {page === null && <p className="privacy-status">The privacy policy isn't available right now. Please try again shortly.</p>}
        {page && (
          <>
            <h1>{page.title}</h1>
            {updated && <p className="privacy-updated">Last updated {updated}</p>}
            <PolicyText text={page.body} />
          </>
        )}
      </main>
    </div>
  );
}
