import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { IconUser, IconClipboard, IconGrid, IconLogout } from "./icons";
import logo from "../assets/brand/logo-vertical-burgundy.png";
import "./AppShell.css";

const NAV_ITEMS = [
  { to: "/app/profile", label: "Profile", Icon: IconUser },
  { to: "/app/form", label: "Application", Icon: IconClipboard },
  { to: "/app/overview", label: "Overview", Icon: IconGrid },
];

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
