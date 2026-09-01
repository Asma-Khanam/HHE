import logoWhite from "../assets/brand/relocate-logo-white.png";
import "./AuthLayout.css";

// Same shell shape as the client app's AuthLayout (burgundy brand panel +
// form card), just with the static Relocate mark instead of the 3D spinning
// logo — this app doesn't need that dependency weight for what's a small
// internal tool.
export default function AuthLayout({ eyebrow, title, subtitle, children }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand-panel">
        <img src={logoWhite} alt="Heather Harries · Relocate" className="auth-logo" />
        <p className="auth-brand-tagline">Everything the team knows, in one place.</p>
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
