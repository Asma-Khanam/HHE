import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { supabase } from "../lib/supabaseClient";
import "../styles/form.css";

// Reached only via the link in the reset email. Supabase's client parses
// that link's token straight out of the URL on load (detectSessionInUrl is
// on by default) and turns it into a short-lived "recovery" session, firing
// a PASSWORD_RECOVERY auth event once it has. Landing here any other way
// means there's no recovery session to use, so the form stays hidden and
// says so instead of pretending a save would work.
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && mounted) setReady(true);
    });
    // Covers the case where the event already fired before this listener
    // attached — the recovery session is still sitting there either way.
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) setReady(true);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password needs to be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Those passwords don't match.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => navigate("/staff"), 1500);
  }

  if (done) {
    return (
      <AuthLayout eyebrow="Heather Harries · Team" title="Password updated" subtitle="Taking you in now.">
        <div className="hh-form-banner hh-form-banner-success">Your password has been changed.</div>
      </AuthLayout>
    );
  }

  if (!ready) {
    return (
      <AuthLayout eyebrow="Heather Harries · Team" title="Reset your password" subtitle="">
        <p style={{ color: "var(--hh-ink)", opacity: 0.75, lineHeight: 1.6 }}>
          This page only works when opened from the link in a password reset email — open it from there, or{" "}
          <Link to="/forgot-password">request a new link</Link>.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow="Heather Harries · Team" title="Set a new password" subtitle="At least 8 characters.">
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <div className="hh-field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="hh-field">
          <label htmlFor="confirmPassword">Confirm new password</label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <button className="hh-btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Save new password"}
        </button>
      </form>
    </AuthLayout>
  );
}
