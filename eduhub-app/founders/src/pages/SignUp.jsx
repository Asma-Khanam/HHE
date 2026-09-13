import { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import PasswordField from "../components/PasswordField";
import { supabase } from "../lib/supabaseClient";
import "../styles/form.css";

// This ONLY creates a login (an auth.users row) — same as any family
// signing up through the client app. It does NOT grant access to any
// family's data. A team admin grants that separately from the Team page's
// "Pending signups" list (addendum 14) — see RequireStaff.jsx for what a
// login without staff access sees in the meantime.
export default function SignUp() {
  const [fullName, setFullName] = useState("");
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
    // Families sign up through the client app using this same Supabase
    // Auth project, so this login lands in the exact same auth.users table
    // as theirs. signup_source: "founders" is the only thing that tells
    // list_pending_signups() (addendum 15) this one was meant for staff
    // access, not a family's own account.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim() || null, signup_source: "founders" } },
    });
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
          This just created your sign-in — it doesn't give you access to any family's records yet. Let a team
          admin know <strong>{email}</strong> has signed up — they'll see it under Pending signups on the Team
          page and can grant you access from there.
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
          <label htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

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

        <PasswordField
          id="password"
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters."
        />

        <PasswordField
          id="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

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
