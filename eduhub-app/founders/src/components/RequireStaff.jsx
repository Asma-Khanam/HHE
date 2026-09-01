import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { getOwnStaffRecord } from "../lib/staffAuth";

// Wraps every real page in this app: not just "is someone logged in"
// (RequireAuth's job in the client app) but "is the logged-in person
// actually staff" — a plain login with no `staff` row gets a clear message
// instead of silently landing on an empty dashboard, since that's most
// likely someone who just signed up and is waiting to be granted access,
// not an error.
export default function RequireStaff({ children }) {
  const [status, setStatus] = useState("checking"); // checking | ok | no-session | not-staff | error
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) setStatus("no-session");
        return;
      }
      try {
        const { staff } = await getOwnStaffRecord();
        if (cancelled) return;
        setStatus(staff ? "ok" : "not-staff");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err.message || "Something went wrong checking your access.");
        setStatus("error");
      }
    }

    check();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setStatus("no-session");
      else check();
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  if (status === "checking") return null;
  if (status === "no-session") return <Navigate to="/login" replace />;

  if (status === "not-staff") {
    return (
      <div className="staff-gate">
        <div className="staff-gate-card">
          <h1>You're signed in, but not set up yet</h1>
          <p>
            Your login works, but nobody's granted this account access to the family records yet. Ask whoever
            manages Supabase for Heather Harries to add you to the <code>staff</code> table, then come back and
            refresh this page.
          </p>
          <button type="button" className="hh-btn-primary" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="staff-gate">
        <div className="staff-gate-card">
          <h1>Something went wrong</h1>
          <p>{errorMessage}</p>
          <button type="button" className="hh-btn-primary" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return children;
}
