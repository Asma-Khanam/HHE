import { Link, useNavigate } from "react-router-dom";
import { useApplicationData } from "../context/ApplicationDataContext";
import { supabase } from "../lib/supabaseClient";
import PersonAvatar, { findProfilePhoto } from "../components/PersonAvatar";
import ThemePicker from "../components/ThemePicker";
import PackageUsageCard from "../components/PackageUsageCard";
import DeleteAccountCard from "../components/DeleteAccountCard";
import { IconBell, IconChevronRight, IconClipboard, IconFolder, IconUser } from "../components/icons";
import { replayTour, tourNoun } from "../components/AppTour";
import "./SettingsPage.css";

// Everything behind the gear on the phone top bar (app design, board 9).
// Only things that work today live here; reminder and push preferences are
// added when the reminder job and push notifications exist.
function Row({ to, Icon, label, sub, value }) {
  const body = (
    <>
      <span className="set-row-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="set-row-text">
        <span className="set-row-label">{label}</span>
        {sub && <span className="set-row-sub">{sub}</span>}
      </span>
      {value && <span className="set-row-value">{value}</span>}
      {to && <IconChevronRight size={18} />}
    </>
  );
  return to ? (
    <Link to={to} className="set-row">{body}</Link>
  ) : (
    <div className="set-row">{body}</div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, data } = useApplicationData();
  const parents = data?.parents || [];
  const children = data?.children || [];
  const holder = parents.find((p) => p.user_id === user?.id) || parents[0];
  const holderRole = holder?.relationship === "Father" ? "Father" : "Mother";
  const photo = findProfilePhoto(holder?.id ? data?.documentsByOwner?.[`parent:${holder.id}`] : []);
  const people = parents.filter((p) => p.full_name).length + children.length;

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="settings-page">
      <div className="settings-head">
        <button type="button" className="settings-back" aria-label="Back" onClick={() => navigate(-1)}>
          <IconChevronRight size={22} style={{ transform: "rotate(180deg)" }} />
        </button>
        <h1>Settings</h1>
      </div>

      <Link to="/app/profile" className="settings-profile-card">
        <PersonAvatar doc={photo} name={holder?.full_name || user?.email} fallback={holderRole} className="settings-profile-avatar" />
        <span className="settings-profile-text">
          <span className="settings-profile-name">{holder?.full_name || "Your profile"}</span>
          <span className="settings-profile-sub">{holderRole}{people ? ` · family of ${people}` : ""}</span>
        </span>
        <IconChevronRight size={18} />
      </Link>

      <div className="settings-grid">
        <div className="settings-col">
      <section className="settings-group sg-1">
        <h2>Appearance</h2>
        <div className="settings-card settings-card-pad"><ThemePicker /></div>
      </section>

      <section className="settings-group sg-2">
        <h2>Your application</h2>
        <div className="settings-card">
          <Row to="/app/form" Icon={IconClipboard} label="Application form" sub="Edit anytime. Saves automatically." />
          <Row to="/app/profile" Icon={IconUser} label="Your family" sub="Who is on the application, and photos" />
          <Row to="/app/documents" Icon={IconFolder} label="Documents" sub="Upload and review" />
        </div>
      </section>

      <section className="settings-group sg-4">
        <h2>Help</h2>
        <div className="settings-card">
          <button type="button" className="set-row set-row-btn" onClick={() => { navigate("/app/dashboard"); setTimeout(replayTour, 300); }}>
            <span className="set-row-icon" aria-hidden="true"><IconBell size={18} /></span>
            <span className="set-row-text">
              <span className="set-row-label">Replay the tour</span>
              <span className="set-row-sub">A quick walk through the {tourNoun}</span>
            </span>
            <IconChevronRight size={18} />
          </button>
        </div>
      </section>

        </div>
        <div className="settings-col">
          <div className="sg-3"><PackageUsageCard /></div>
      <section className="settings-group sg-5">
        <h2>Account and privacy</h2>
        <div className="settings-card">
          <Row Icon={IconUser} label="Email address" value={user?.email} />
          <Row to="/privacy" Icon={IconClipboard} label="Privacy policy" />
        </div>
      </section>

        </div>
      </div>

      <button type="button" className="settings-logout" onClick={handleLogout}>Log out</button>
      <DeleteAccountCard />
    </div>
  );
}
