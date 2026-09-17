import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useApplicationData } from "../context/ApplicationDataContext";
import PersonAvatar, { findProfilePhoto } from "./PersonAvatar";
import { IconClipboard, IconGrid, IconLogout, IconSchool } from "./icons";
import logo from "../assets/brand/logo-vertical-burgundy.png";
import "./AppShell.css";

// Order asked for by the founders (2026-09-02): the Dashboard first — it's
// where a family lands once they've submitted, and the "how are we doing"
// answer — then the Application they're working through. The account holder's
// own profile sits apart at the bottom of the nav, next to Log out, since it's
// account admin rather than part of the application itself.
const NAV_ITEMS = [
  { to: "/app/dashboard", label: "Dashboard", Icon: IconGrid },
  { to: "/app/form", label: "Application", Icon: IconClipboard },
  // September 2026 redesign: this page grew from just tours into the full
  // per-school journey (tours + applications), so the nav label follows.
  { to: "/app/timetable", label: "Your schools", Icon: IconSchool },
];

// The whole logged-in app lives inside this shell: content on the right,
// a vertical nav fixed to the left. Every /app/* page renders through the
// <Outlet /> here, so the nav is always present once you're logged in.
export default function AppShell() {
  const navigate = useNavigate();
  const { data, user } = useApplicationData();

  const parents = data?.parents || [];
  const holder = parents.find((p) => p.user_id === user?.id) || parents[0];
  const holderRole = holder?.relationship === "Father" ? "Father" : "Mother";
  const holderName = holder?.full_name || "";
  const holderPhoto = findProfilePhoto(holder?.id ? data?.documentsByOwner?.[`parent:${holder.id}`] : []);

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

        {/* Whoever is signed in, at the foot of the nav — their photo (or
            initial), their name, and which parent they are. Doubles as the
            link to their profile, so the nav doesn't need a separate row for
            it. Shaped after the founders' own consultant card. */}
        <NavLink
          to="/app/profile"
          className={({ isActive }) => "app-shell-profile" + (isActive ? " is-active" : "")}
        >
          <PersonAvatar
            doc={holderPhoto}
            name={holderName}
            fallback={holderRole}
            className="app-shell-profile-avatar"
          />
          <span className="app-shell-profile-text">
            <span className="app-shell-profile-name">{holderName || "Your profile"}</span>
            <span className="app-shell-profile-role">{holderName ? holderRole : "Add your details"}</span>
          </span>
        </NavLink>

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
