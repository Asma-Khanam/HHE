import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useApplicationData } from "../context/ApplicationDataContext";
import { PageError, PageLoading } from "../components/StatePanels";
import { IconBell, IconChevronDown } from "../components/icons";
import "./NotificationsPage.css";

// Inbox: tours and assessments the consultant has booked or changed, with
// everything needed on the day. Rows come from database triggers (addenda
// 136/137); opening this page marks them read.

const KIND = {
  tour_scheduled: { chip: "Tour booked", tone: "good" },
  tour_updated: { chip: "Tour updated", tone: "info" },
  tour_cancelled: { chip: "Tour cancelled", tone: "warn" },
  assessment_scheduled: { chip: "Assessment booked", tone: "good" },
  assessment_updated: { chip: "Assessment updated", tone: "info" },
};

const LINK_LABEL = { Location: "Open in Maps", "Join link": "Join assessment" };

function ago(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60 * 1000) return "Just now";
  if (diff < 60 * 60 * 1000) return `${Math.round(diff / 60000)} min ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.round(diff / 3600000)} h ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function tileParts(n) {
  const d = n.event_date ? new Date(`${n.event_date}T00:00:00`) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return {
    month: d.toLocaleDateString("en-GB", { month: "short" }),
    day: d.getDate(),
    weekday: d.toLocaleDateString("en-GB", { weekday: "short" }),
  };
}

const isUrl = (v) => /^https?:\/\//i.test(String(v || ""));

function Item({ n, isNew, open, onToggle }) {
  const kind = KIND[n.kind] || { chip: "Update", tone: "info" };
  const tile = tileParts(n);
  const details = (Array.isArray(n.details) ? n.details : []).filter((d) => d.label !== "When");
  const school = n.school_name || n.title;
  return (
    <li className={`notif-item notif-${kind.tone}` + (isNew ? " is-new" : "") + (open ? " is-open" : "")}>
      <button type="button" className="notif-head" onClick={onToggle} aria-expanded={open}>
        <span className="notif-tile" aria-hidden="true">
          {tile ? (
            <>
              <span className="notif-tile-month">{tile.month}</span>
              <span className="notif-tile-day">{tile.day}</span>
              <span className="notif-tile-wd">{tile.weekday}</span>
            </>
          ) : (
            <IconBell size={20} />
          )}
        </span>
        <span className="notif-main">
          <span className="notif-top">
            <span className={`notif-chip notif-chip-${kind.tone}`}>{kind.chip}</span>
            {isNew && <span className="notif-dot" aria-label="New" />}
            <span className="notif-ago">{ago(n.created_at)}</span>
          </span>
          <span className="notif-school">{school}</span>
          {n.event_time && n.kind !== "tour_cancelled" && <span className="notif-when">{n.event_time}</span>}
          {n.kind === "tour_cancelled" && <span className="notif-when">Your consultant will arrange a new time</span>}
        </span>
        <span className="notif-chevron" aria-hidden="true"><IconChevronDown size={18} /></span>
      </button>
      {open && details.length > 0 && (
        <dl className="notif-details">
          {details.map((d, i) => (
            <div key={i} className="notif-detail">
              <dt>{d.label}</dt>
              <dd>
                {isUrl(d.value) ? (
                  <a className="notif-btn" href={d.value} target="_blank" rel="noreferrer">
                    {LINK_LABEL[d.label] || "Open link"}
                  </a>
                ) : (
                  d.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

export default function NotificationsPage() {
  const { status, error, familyId, reload } = useApplicationData();
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState("");
  const [open, setOpen] = useState(null);

  useEffect(() => {
    if (!familyId) return undefined;
    let cancelled = false;
    supabase
      .from("family_notifications")
      .select("id, kind, title, body, details, link, created_at, read_at, school_name, event_date, event_time")
      .eq("family_id", familyId)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setFailed("Couldn't load your notifications.");
          return;
        }
        const list = data || [];
        setRows(list);
        const firstNew = list.find((r) => !r.read_at);
        setOpen(firstNew ? firstNew.id : "");
        if (firstNew) supabase.rpc("family_mark_notifications_read").then(() => {}, () => {});
      });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  if (status === "loading") return <PageLoading label="Loading…" />;
  if (status === "error") return <PageError title="We couldn’t load this page" message={error} onRetry={reload} />;
  if (failed) return <PageError title="Notifications" message={failed} onRetry={() => window.location.reload()} />;
  if (!rows) return <PageLoading label="Loading your notifications…" />;

  const fresh = rows.filter((r) => !r.read_at);
  const earlier = rows.filter((r) => r.read_at);
  const render = (list, isNew) =>
    list.map((n) => (
      <Item key={n.id} n={n} isNew={isNew} open={open === n.id} onToggle={() => setOpen(open === n.id ? "" : n.id)} />
    ));

  return (
    <div className="notif-page">
      <h1 className="notif-h1">Notifications</h1>
      {rows.length === 0 ? (
        <div className="notif-empty">
          <span className="notif-empty-icon"><IconBell size={26} /></span>
          <strong>You’re all caught up</strong>
          <p>When your consultant books a school tour or an assessment, the date, time and everything you need on the day will show up here.</p>
        </div>
      ) : (
        <>
          {fresh.length > 0 && (
            <>
              <h2 className="notif-section">New</h2>
              <ul className="notif-list">{render(fresh, true)}</ul>
            </>
          )}
          {earlier.length > 0 && (
            <>
              <h2 className="notif-section">Earlier</h2>
              <ul className="notif-list">{render(earlier, false)}</ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
