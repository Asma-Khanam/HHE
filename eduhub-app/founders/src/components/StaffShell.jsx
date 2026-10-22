import StaffAvatar from "./StaffAvatar";
import { useEffect, useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { countUnreadEmails } from "../lib/staffData";
import logoWhite from "../assets/brand/relocate-logo-white.png";
import Harri from "./Harri";
import "./StaffShell.css";

// The sidebar shell every /staff page sits inside — styled after the
// reference screenshots (burgundy sidebar, "Heather Harries · Relocate"
// wordmark, a signed-in-person footer). Today and Caseload are wired to
// real pages; the reference's School inbox / Messages / Intelligence items
// need a messaging system that doesn't exist yet, so they're left off
// entirely rather than shown as dead links.
export default function StaffShell() {
  const [me, setMe] = useState(null);
  const [unreadEmails, setUnreadEmails] = useState(0);

  useEffect(() => {
    let live = true;
    const refresh = () => countUnreadEmails().then((n) => live && setUnreadEmails(n)).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("emails-read", refresh);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("emails-read", refresh);
    };
  }, []);

  useEffect(() => {
    const load = () =>
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        supabase
          .from("staff")
          .select("full_name, email, role, avatar_url, position")
          .eq("user_id", user.id)
          .maybeSingle()
          .then(({ data }) => setMe(data));
      });
    load();
    window.addEventListener("profile-updated", load);
    return () => window.removeEventListener("profile-updated", load);
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="staff-shell">
      <aside className="staff-sidebar">
        <div className="staff-sidebar-brand">
          <img src={logoWhite} alt="" className="staff-sidebar-logo" />
          <div>
            <div className="staff-sidebar-brand-name">Heather Harries</div>
            <div className="staff-sidebar-brand-sub">Relocate</div>
          </div>
        </div>

        <nav className="staff-sidebar-nav">
          <NavLink to="/staff/today" className={({ isActive }) => "staff-nav-item" + (isActive ? " is-active" : "")}>
            Today
          </NavLink>
          <NavLink to="/staff/dashboard" className={({ isActive }) => "staff-nav-item" + (isActive ? " is-active" : "")}>
            Dashboard
          </NavLink>
          <NavLink to="/staff/families" className={({ isActive }) => "staff-nav-item" + (isActive ? " is-active" : "")}>
            Caseload
          </NavLink>
          <NavLink to="/staff/calendar" className={({ isActive }) => "staff-nav-item" + (isActive ? " is-active" : "")}>
            Calendar
          </NavLink>
          <NavLink to="/staff/consultations" className={({ isActive }) => "staff-nav-item" + (isActive ? " is-active" : "")}>
            Consultations
          </NavLink>
          <NavLink to="/staff/accounting" className={({ isActive }) => "staff-nav-item" + (isActive ? " is-active" : "")}>
            Accounting
          </NavLink>
          <NavLink to="/staff/emails" className={({ isActive }) => "staff-nav-item" + (isActive ? " is-active" : "")}>
            Emails
            {unreadEmails > 0 && (
              <span className="staff-nav-badge" aria-label={`${unreadEmails} unread`}>
                {unreadEmails > 99 ? "99+" : unreadEmails}
              </span>
            )}
          </NavLink>
          {me?.role === "admin" && (
            <NavLink to="/staff/team" className={({ isActive }) => "staff-nav-item" + (isActive ? " is-active" : "")}>
              Team
            </NavLink>
          )}
          <NavLink to="/staff/schools" className={({ isActive }) => "staff-nav-item" + (isActive ? " is-active" : "")}>
            Schools
          </NavLink>
          {me?.role === "admin" && (
            <NavLink to="/staff/settings" className={({ isActive }) => "staff-nav-item" + (isActive ? " is-active" : "")}>
              Settings
            </NavLink>
          )}
        </nav>

        <div className="staff-sidebar-footer">
          <NavLink to="/staff/profile" className="staff-sidebar-me" title="My profile">
            <StaffAvatar person={me} size={36} className="staff-sidebar-avatar-photo" />
          </NavLink>
          <div className="staff-sidebar-footer-text">
            <NavLink to="/staff/profile" className="staff-sidebar-name">{me?.full_name || me?.email || "..."}</NavLink>
            <button type="button" className="staff-sidebar-signout" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="staff-main">
        <Outlet />
      </main>

      {/* Harri, the robot sidekick -- bottom-right on every staff page */}
      <Harri staffName={me?.full_name || ""} />
    </div>
  );
}
