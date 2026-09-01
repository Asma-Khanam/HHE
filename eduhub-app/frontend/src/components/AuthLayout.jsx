import SpinningLogo3D from "./SpinningLogo3D";
import "./AuthLayout.css";

// Shared shell for Sign Up / Login: a burgundy brand panel on the left,
// the actual form on the right. Keeps both auth pages visually consistent.
export default function AuthLayout({ eyebrow, title, subtitle, children }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand-panel">
        <SpinningLogo3D />
        <p className="auth-brand-tagline">
          Relocation and tutoring support, in one place.
        </p>
      </aside>

      <main className="auth-form-panel">
        <div className="auth-form-card">
          {eyebrow && <span className="auth-eyebrow">{eyebrow}</span>}
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}
