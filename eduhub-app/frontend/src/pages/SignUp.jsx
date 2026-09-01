import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { supabase } from "../lib/supabaseClient";
import { ensureFamilyExists } from "../lib/ensureFamily";
import "../styles/form.css";

export default function SignUp() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
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

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setSubmitting(false);
      return;
    }

    // If Supabase is set to require email confirmation, there's no session
    // yet — we can't create the family row until they've confirmed and
    // logged in (RLS needs auth.uid() to match). Login.jsx calls
    // ensureFamilyExists() as a safety net for exactly this case.
    if (!data.session) {
      setNeedsEmailConfirmation(true);
      setSubmitting(false);
      return;
    }

    const { error: familyError } = await ensureFamilyExists();
    setSubmitting(false);

    if (familyError) {
      setError(familyError);
      return;
    }

    navigate("/app/form");
  }

  if (needsEmailConfirmation) {
    return (
      <AuthLayout
        eyebrow="Create your account"
        title="Almost there"
        subtitle="We've sent a confirmation link to your email. Confirm it, then come back and log in."
      >
        <div className="hh-form-banner hh-form-banner-success">
          Check {email} for a confirmation email.
        </div>
        <p className="hh-switch-line">
          <Link to="/login">Back to log in</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Create your account"
      title="Get started"
      subtitle="Set up your account to begin your child's application."
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
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="hh-switch-line">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  );
}
