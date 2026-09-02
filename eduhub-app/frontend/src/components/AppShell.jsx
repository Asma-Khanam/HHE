import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { IconUser, IconClipboard, IconGrid, IconLogout } from "./icons";
import logo from "../assets/brand/logo-vertical-burgundy.png";
import "./AppShell.css";

// Order asked for by the founders (2026-09-02): the Dashboard first — it's
// where a family lands once they've submitted, and the "how are we doing"
// answer — then the Application they're working through. Profile sits apart
// at the bottom of the nav, next to Log out, since it's account admin rather
// than part of the application itself.
const NAV_ITEMS = [
  { to: "/app/dashboard", label: "Dashboard", Icon: IconGrid },
  { to: "/app/form", label: "Application", Icon: IconClipboard },
];

const FOOTER_NAV_ITEMS = [{ to: "/app/profile", label: "Profile", Icon: IconUser }];

// The whole logged-in app lives inside this shell: content on the left,
// a vertical nav fixed to the right. Every /app/* page renders through the
// <Outlet /> here, so the nav is always present once you're logged in.
export default function AppShell() {
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <nav className="app-shell-nav">
        <img src={logo} alt="Heather Harries" className="app-shell-nav-logo" />

        <ul className="app-shell-nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) => "app-shell-nav-link" + (isActive ? " is-active" : "")}
              >
                <span className="app-shell-nav-icon" aria-hidden="true">
                  <item.Icon size={18} />
                </span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <ul className="app-shell-nav-list app-shell-nav-list-footer">
          {FOOTER_NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) => "app-shell-nav-link" + (isActive ? " is-active" : "")}
              >
                <span className="app-shell-nav-icon" aria-hidden="true">
                  <item.Icon size={18} />
                </span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <button className="app-shell-nav-logout" onClick={handleLogout}>
          <IconLogout size={16} />
          <span>Log out</span>
        </button>
      </nav>

      <main className="app-shell-content">
        <Outlet />
      </main>
    </div>
  );
}
