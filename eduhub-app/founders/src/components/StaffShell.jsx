import { useEffect, useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import logoWhite from "../assets/brand/relocate-logo-white.png";
import "./StaffShell.css";

// The sidebar shell every /staff page sits inside — styled after the
// reference screenshots (burgundy sidebar, "Heather Harries · Relocate"
// wordmark, a signed-in-person footer). Today and Caseload are wired to
// real pages; the reference's School inbox / Messages / Intelligence items
// need a messaging system that doesn't exist yet, so they're left off
// entirely rather than shown as dead links.
export default function StaffShell() {
  const [me, setMe] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("staff")
        .select("full_name, email, role")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => setMe(data));
    });
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
          <NavLink to="/staff/families" className={({ isActive }) => "staff-nav-item" + (isActive ? " is-active" : "")}>
            Caseload
          </NavLink>
          <NavLink to="/staff/calendar" className={({ isActive }) => "staff-nav-item" + (isActive ? " is-active" : "")}>
            Calendar
          </NavLink>
          {me?.role === "admin" && (
            <NavLink to="/staff/team" className={({ isActive }) => "staff-nav-item" + (isActive ? " is-active" : "")}>
              Team
            </NavLink>
          )}
          {me?.role === "admin" && (
            <NavLink to="/staff/settings" className={({ isActive }) => "staff-nav-item" + (isActive ? " is-active" : "")}>
              Settings
            </NavLink>
          )}
        </nav>

        <div className="staff-sidebar-footer">
          <div className="staff-sidebar-avatar">{(me?.full_name || me?.email || "?").charAt(0).toUpperCase()}</div>
          <div className="staff-sidebar-footer-text">
            <div className="staff-sidebar-name">{me?.full_name || me?.email || "..."}</div>
            <button type="button" className="staff-sidebar-signout" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="staff-main">
        <Outlet />
      </main>
    </div>
  );
}
