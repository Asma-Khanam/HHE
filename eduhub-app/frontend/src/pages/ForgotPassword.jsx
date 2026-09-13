import { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { supabase } from "../lib/supabaseClient";
import "../styles/form.css";

// September 2026 change request — a self-serve way back into an account.
// Supabase never says whether the address actually has one; same
// confirmation message either way.
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout eyebrow="Password reset" title="Check your email" subtitle="One step left.">
        <div className="hh-form-banner hh-form-banner-success">
          If <strong>{email}</strong> has an account here, a reset link is on its way.
        </div>
        <p className="hh-switch-line">
          <Link to="/login">Back to log in</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Password reset"
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to set a new one."
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
        <button className="hh-btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Sending..." : "Send reset link"}
        </button>
      </form>
      <p className="hh-switch-line">
        <Link to="/login">Back to log in</Link>
      </p>
    </AuthLayout>
  );
}
