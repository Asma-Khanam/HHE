import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { supabase } from "../lib/supabaseClient";
import "../styles/form.css";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    // RequireStaff (on the /staff route) checks whether this login is
    // actually in the staff table and shows its own message if not — no
    // need to check that here.
    navigate("/staff");
  }

  return (
    <AuthLayout eyebrow="Heather Harries · Team" title="Sign in" subtitle="For Heather Harries staff and consultants only.">
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button className="hh-btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="hh-switch-line">
        New team member? <Link to="/signup">Create your login</Link>
      </p>
    </AuthLayout>
  );
}
