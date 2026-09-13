import { useState } from "react";

// Every password box in this app used a plain type="password" input with no
// way to check what you'd typed — easy to mistype on a phone keyboard and
// not notice until "Invalid login credentials" comes back. This wraps the
// same markup Login/SignUp/ResetPassword already had with a show/hide
// toggle, so it's a drop-in swap for the old <div className="hh-field">
// block, not a new pattern to learn.
export default function PasswordField({ id, label, autoComplete, value, onChange, required = true, hint }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="hh-field">
      <label htmlFor={id}>{label}</label>
      <div className="hh-password-wrap">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          value={value}
          onChange={onChange}
        />
        <button
          type="button"
          className="hh-password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          // Doesn't earn a stop on the way through the form with Tab — it's
          // a convenience for the mouse/touch, not another field to fill in.
          tabIndex={-1}
        >
          {visible ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 3l18 18" strokeLinecap="round" />
              <path
                d="M10.58 10.58a2 2 0 002.83 2.83"
                strokeLinecap="round"
              />
              <path
                d="M6.1 6.1C3.9 7.6 2.3 9.6 1.5 12c1.6 4.6 5.6 8 10.5 8 1.9 0 3.7-.5 5.2-1.4M9.9 4.24A10.6 10.6 0 0112 4c4.9 0 8.9 3.4 10.5 8-.5 1.5-1.3 2.9-2.4 4.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path
                d="M1.5 12c1.6-4.6 5.6-8 10.5-8s8.9 3.4 10.5 8c-1.6 4.6-5.6 8-10.5 8s-8.9-3.4-10.5-8z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {hint && <span className="hh-hint-text">{hint}</span>}
    </div>
  );
}
