import { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { supabase } from "../lib/supabaseClient";
import "../styles/form.css";

// This ONLY creates a login (an auth.users row) — same as any family
// signing up through the client app. It does NOT grant access to any
// family's data. That only happens once someone with database access adds
// a matching row to the `staff` table by hand — see
// eduhub_schema_addendum_2_staff.sql for the exact insert to run, and
// RequireStaff.jsx for what a login without that row sees.
export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);

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
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (!data.session) {
      setNeedsEmailConfirmation(true);
      return;
    }

    setDone(true);
  }

  if (needsEmailConfirmation || done) {
    return (
      <AuthLayout eyebrow="Heather Harries · Team" title="Login created" subtitle="One step left.">
        <div className="hh-form-banner hh-form-banner-success">
          {needsEmailConfirmation
            ? `Check ${email} for a confirmation email, then log in.`
            : "Your login is ready."}
        </div>
        <p style={{ color: "var(--hh-ink)", opacity: 0.75, lineHeight: 1.6, margin: "0 0 20px" }}>
          This just created your sign-in — it doesn't give you access to any family's records yet. Ask whoever
          manages Supabase for Heather Harries to add <strong>{email}</strong> to the <code>staff</code> table,
          then log in and everything will be there.
        </p>
        <p className="hh-switch-line">
          <Link to="/login">Go to sign in</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Heather Harries · Team"
      title="Create your login"
      subtitle="For Heather Harries staff and consultants only — this creates your sign-in; access is granted separately."
    >
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <div className="hh-field">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="hh-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className="hh-hint-text">At least 8 characters.</span>
        </div>

        <div className="hh-field">
          <label htmlFor="confirmPassword">Confirm password</label>
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
          {submitting ? "Creating login..." : "Create login"}
        </button>
      </form>

      <p className="hh-switch-line">
        Already have a login? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
