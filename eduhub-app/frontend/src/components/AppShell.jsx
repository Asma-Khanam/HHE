import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useApplicationData } from "../context/ApplicationDataContext";
import PersonAvatar, { findProfilePhoto } from "./PersonAvatar";
import { IconBell, IconClipboard, IconFolder, IconGrid, IconLogout, IconSchool, IconWallet } from "./icons";
import logo from "../assets/brand/logo-vertical-burgundy.png";
import "./AppShell.css";

// Order asked for by the founders (2026-09-02): the Dashboard first — it's
// where a family lands once they've submitted, and the "how are we doing"
// answer — then the Application they're working through. The account holder's
// own profile sits apart at the bottom of the nav, next to Log out, since it's
// account admin rather than part of the application itself.
// On a phone the bar has just four tabs (27 Oct 2026): Home, Schools, Documents,
// Billing. "short" is the phone label; "desktopOnly" items are left off the phone
// bar.
const NAV_ITEMS = [
  { to: "/app/dashboard", label: "Dashboard", short: "Home", Icon: IconGrid },
  { to: "/app/form", label: "Application", short: "Application", Icon: IconClipboard },
  // September 2026 redesign: this page grew from just tours into the full
  // per-school journey (tours + applications), so the nav label follows.
  { to: "/app/timetable", label: "Your schools", short: "Schools", Icon: IconSchool },
  // September 2026: documents and billing got their own pages, off the
  // Dashboard, so each has one clear home.
  { to: "/app/documents", label: "Documents", short: "Documents", Icon: IconFolder },
  { to: "/app/billing", label: "Billing", short: "Billing", Icon: IconWallet },
  // Phone reaches this from the bell at the top; desktop gets a nav row.
  { to: "/app/notifications", label: "Notifications", short: "Alerts", Icon: IconBell, desktopOnly: true, badge: true },
];

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// The whole logged-in app lives inside this shell: content on the right,
// a vertical nav fixed to the left. Every /app/* page renders through the
// <Outlet /> here, so the nav is always present once you're logged in.
export default function AppShell() {
  const navigate = useNavigate();
  const { data, user, familyId } = useApplicationData();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  // Unread count for the bell; refreshed on every navigation (opening the
  // inbox clears it) and when the app comes back to the foreground.
  useEffect(() => {
    if (!familyId) return undefined;
    let cancelled = false;
    const load = () =>
      supabase
        .from("family_notifications")
        .select("id", { count: "exact", head: true })
        .eq("family_id", familyId)
        .is("read_at", null)
        .then(({ count, error }) => {
          if (!cancelled && !error) setUnread(count || 0);
        })
        .catch(() => {});
    load();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [familyId, location.pathname]);

  const parents = data?.parents || [];
  const holder = parents.find((p) => p.user_id === user?.id) || parents[0];
  const holderRole = holder?.relationship === "Father" ? "Father" : "Mother";
  const holderName = holder?.full_name || "";
  const holderPhoto = findProfilePhoto(holder?.id ? data?.documentsByOwner?.[`parent:${holder.id}`] : []);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  const firstName = String(holderName).trim().split(/\s+/)[0] || "";

  return (
    <div className="app-shell">
      {/* Phone only: who you are, top left. Tap it to open your profile. */}
      <NavLink to="/app/profile" className="app-topbar" aria-label="Open your profile">
        <PersonAvatar
          doc={holderPhoto}
          name={holderName}
          fallback={holderRole}
          className="app-topbar-avatar"
        />
        <span className="app-topbar-text">
          <span className="app-topbar-hello">{greetingForNow()},</span>
          <span className="app-topbar-name">{firstName || "Your profile"}</span>
        </span>
      </NavLink>
      <NavLink to="/app/notifications" className="app-bell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
        <IconBell size={22} />
        {unread > 0 && <span className="app-bell-badge">{unread > 9 ? "9+" : unread}</span>}
      </NavLink>

      <nav className="app-shell-nav">
        <img src={logo} alt="Heather Harries" className="app-shell-nav-logo" />

        <ul className="app-shell-nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  "app-shell-nav-link" + (isActive ? " is-active" : "") + (item.desktopOnly ? " is-desktop-only" : "")
                }
              >
                <span className="app-shell-nav-icon" aria-hidden="true">
                  <item.Icon size={18} />
                </span>
                <span className="app-shell-nav-label-full">{item.label}</span>
                <span className="app-shell-nav-label-short">{item.short}</span>
                {item.badge && unread > 0 && <span className="app-shell-nav-badge">{unread > 9 ? "9+" : unread}</span>}
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
          className={({ isActive }) => "app-shell-profile app-shell-desktop-only" + (isActive ? " is-active" : "")}
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

        <button className="app-shell-nav-logout app-shell-desktop-only" onClick={handleLogout}>
          <IconLogout size={16} />
          <span>Log out</span>
        </button>
        <NavLink to="/privacy" className="app-shell-privacy-link app-shell-desktop-only">Privacy policy</NavLink>
      </nav>

      <main className="app-shell-content">
        <Outlet />
      </main>
    </div>
  );
}
