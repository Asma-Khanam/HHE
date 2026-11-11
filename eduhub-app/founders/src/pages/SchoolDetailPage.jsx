import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getSchoolDetail,
  updateSchool,
  addToShortlist,
  removeFromShortlist,
  listFamilies,
  listStaff,
  listSchoolNotes,
  createSchoolNote,
  updateSchoolNote,
  friendlyError,
} from "../lib/staffData";
import { relativeDay } from "../lib/workflow";
import { displayNameForChild } from "../lib/completeness";
import GenericDocumentsPanel from "../components/GenericDocumentsPanel";
import AutosaveField from "../components/Autosave";
import { EMIRATE_CHOICES } from "../data/emirates";
import SchoolContactsPanel from "../components/SchoolContactsPanel";
import SchoolFeedbackPanel from "../components/SchoolFeedbackPanel";
import "../components/panels.css";
import "./FamilyDetailPage.css";
import "./SchoolDetailPage.css";

const TOUR_STATUS_LABEL = { offered: "Booked", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled" };

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(dateStr, timeStr) {
  if (!dateStr) return "";
  const d = formatDate(dateStr + "T00:00:00");
  if (!timeStr) return d;
  const [h, m] = timeStr.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = ((hour + 11) % 12) + 1;
  return `${d}, ${hour12}${m && m !== "00" ? ":" + m : ""}${suffix}`;
}

// One school's full record and every
// family that has it shortlisted — the school-side view that complements
// SchoolVisitsPanel on FamilyDetailPage (Phase 1 of the School visits
// tracker; see eduhub_schema_addendum_36_school_visits_tracker.sql).
// Where each family sits with this school, for the Shortlisted families
// sub-tabs. A family can be in more than one (visited AND applied).
function kidsOf(entry) {
  return entry.children && entry.children.length ? entry.children : [null];
}
// This child's applications at this school.
function childApps(entry, child) {
  return (child?.applications || []).filter((a) => a.school_id === entry.school_id || !a.school_id);
}
const isPlaced = (child) => !!child?.placement && child.placement.placement_status !== "moved";
const hasApp = (entry, child, ...statuses) => childApps(entry, child).some((a) => statuses.includes(a.status));
const hasToured = (entry) => entry.tour_status === "completed" || entry.tour2_status === "completed";

// The Shortlisted families sub-tabs. Each one asks about a child at this
// school, so a family with one child placed and another still applying shows
// up in both Placed and Applied. An offer that has become a placement moves
// from Offered to Placed.
const FAMILY_FILTERS = [
  ["all", "Suggested", () => true],
  ["toured", "Toured", (e) => hasToured(e)],
  ["applied", "Applied", (e, c) => childApps(e, c).some((a) => a.status && a.status !== "draft")],
  ["offered", "Offered", (e, c) => !isPlaced(c) && hasApp(e, c, "offer", "offer_accepted")],
  ["placed", "Placed", (e, c) => isPlaced(c)],
  ["withdrew", "Withdrawn", (e, c) => hasApp(e, c, "withdrawn")],
];
// Counts the rows you see (one per child), not families.
const countFor = (list, test) => list.reduce((n, e) => n + kidsOf(e).filter((c) => test(e, c)).length, 0);

// Where this child's placement at this school stands, as a coloured tag.
function placementCell(entry, child) {
  const p = child?.placement;
  if (p && p.placement_status === "moved") {
    return (
      <span>
        <span className="sd-pill is-grey">Left</span>
        <span className="sd-simple-sub">
          {[p.ended_on ? formatDate(p.ended_on) : "", p.moved_to_school ? `→ ${p.moved_to_school}` : "", p.moved_reason].filter(Boolean).join(" · ")}
        </span>
      </span>
    );
  }
  if (p) return <span className="sd-pill is-green">Placed here</span>;
  if (hasApp(entry, child, "offer_accepted")) return <span className="sd-pill is-amber">Offer accepted</span>;
  if (hasApp(entry, child, "offer")) return <span className="sd-pill is-amber">Offer</span>;
  if (hasApp(entry, child, "rejected")) return <span className="sd-pill is-red">Declined by the school</span>;
  if (hasApp(entry, child, "withdrawn")) return <span className="sd-pill is-grey">Withdrawn</span>;
  if (childApps(entry, child).some((a) => a.status && a.status !== "draft")) return <span className="sd-pill is-blue">Applied</span>;
  return <span className="sd-pill is-none">Not placed</span>;
}

function SchoolNotesFeed({ schoolId }) {
  const [notes, setNotes] = useState(null);
  const [staffById, setStaffById] = useState({});
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    listSchoolNotes(schoolId)
      .then((n) => alive && setNotes(n))
      .catch((e) => alive && (setNotes([]), setErr(friendlyError(e, "Couldn't load notes."))));
    listStaff()
      .then((rows) => alive && setStaffById(Object.fromEntries((rows || []).map((r) => [r.user_id, r]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [schoolId]);

  async function add() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr("");
    try {
      const row = await createSchoolNote(schoolId, body);
      setNotes((l) => [row, ...(l || [])]);
      setText("");
    } catch (e) {
      setErr(friendlyError(e, "Couldn't save that note."));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id, body) {
    if (!body.trim()) return false;
    try {
      const row = await updateSchoolNote(id, body);
      setNotes((l) => l.map((n) => (n.id === id ? row : n)));
      return true;
    } catch (e) {
      setErr(friendlyError(e, "Couldn't save that note."));
      return false;
    }
  }

  const who = (n) => {
    const r = n.author_id ? staffById[n.author_id] : null;
    return r?.full_name || r?.email || "Team member";
  };

  return (
    <div className="snf">
      <div className="snf-composer">
        <textarea
          className="panel-input"
          rows={2}
          placeholder="Add a note…  (Enter to add, Shift+Enter for a new line)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="panel-btn panel-btn-primary" onClick={add} disabled={busy || !text.trim()}>
          {busy ? "Adding…" : "+ Add note"}
        </button>
      </div>
      {err && <div className="hh-form-banner hh-form-banner-error">{err}</div>}
      {notes === null ? (
        <p className="family-detail-hint">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="family-detail-hint">No notes yet. Add the first one above.</p>
      ) : (
        <ul className="snf-list">
          {notes.map((n) => (
            <li key={n.id} className="snf-item">
              <span className="snf-avatar">{who(n).charAt(0).toUpperCase()}</span>
              <div className="snf-main">
                <div className="snf-meta">
                  <strong>{who(n)}</strong>
                  <span title={new Date(n.created_at).toLocaleString()}>
                    {relativeDay(n.created_at)} · {new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {n.edited_at && <span>· edited</span>}
                </div>
                <AutosaveField bare multiline rows={3} collapsible value={n.body} onSave={(v) => saveEdit(n.id, v)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LongText({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return <span className="sd-empty">Nothing added yet</span>;
  const long = text.length > 280 || text.split("\n").length > 4;
  return (
    <div>
      <div className={"sd-long" + (long && !open ? " is-clamped" : "")}>{text}</div>
      {long && (
        <button type="button" className="sd-more" onClick={() => setOpen((o) => !o)}>
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function SvRow({ label, children }) {
  return (
    <div className="sd-row">
      <span className="sd-label">{label}</span>
      <span className="sd-value">{children || <span className="sd-empty">Not added</span>}</span>
    </div>
  );
}

function SchoolRecordView({ school, onEmirate }) {
  const links = [
    ["Website", school.website_url],
    ["Fees", school.fees_url],
    ["Book a tour", school.tour_booking_url],
    [school.application_platform === "openapply" ? "OpenApply portal" : "Application portal", school.openapply_login_url || school.application_url],
  ];
  const onDay = [
    ["Gate", school.default_tour_gate],
    ["Building", school.default_tour_building],
    ["Parking", school.default_tour_parking],
    ["Ask for", school.default_tour_ask_for],
    ["Bring", school.default_tour_bring],
    ["On arrival", school.default_tour_on_arrival],
    ["Maps link", school.default_tour_maps_url],
  ].filter(([, v]) => v);
  const reqs = [
    school.requires_cat4 && "CAT4",
    school.requires_map && "MAP",
    school.requires_interview && "Interview",
    school.requires_taster_day && "Taster day",
  ].filter(Boolean);
  return (
    <div className="sd">
      <div className="sd-links">
        {links.map(([label, url]) =>
          url ? (
            <a key={label} className="sd-chip is-on" href={url} target="_blank" rel="noreferrer">
              {label} ↗
            </a>
          ) : (
            <span key={label} className="sd-chip">{label}: not set</span>
          )
        )}
      </div>
      <div className="sd-cols">
        <div className="sd-card">
          <h3>Basics</h3>
          <div className="sd-row">
            <span className="sd-label">Emirate</span>
            <span className="sd-value">
              <select
                className="panel-select sd-emirate"
                value={school.emirate || ""}
                onChange={(e) => onEmirate(e.target.value)}
                aria-label="Emirate"
              >
                <option value="">Not set yet</option>
                {EMIRATE_CHOICES.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </span>
          </div>
          <SvRow label="Area">{school.area}</SvRow>
          <SvRow label="Curriculum">{school.curriculum}</SvRow>
          <SvRow label="Address">{school.address}</SvRow>
          <SvRow label="School phone">
            {school.general_phone && <a href={"tel:" + school.general_phone.replace(/\s+/g, "")}>{school.general_phone}</a>}
          </SvRow>
        </div>
        <div className="sd-card">
          <h3>Tours</h3>
          <SvRow label="Usual schedule">{school.typical_tour_schedule}</SvRow>
          {onDay.map(([l, v]) => (
            <SvRow key={l} label={l}>{v}</SvRow>
          ))}
          {onDay.length === 0 && <SvRow label="On the day" />}
        </div>
        <div className="sd-card">
          <h3>Admissions</h3>
          <SvRow label="Assessments">
            {reqs.length > 0 && (
              <span className="sd-pills">
                {reqs.map((r) => <span key={r} className="sd-pill">{r}</span>)}
              </span>
            )}
          </SvRow>
          <SvRow label="Application fee">{school.application_fee != null ? `${school.fee_currency || "AED"} ${school.application_fee}` : ""}</SvRow>
          <SvRow label="Deposit">{school.deposit_amount != null ? `${school.fee_currency || "AED"} ${school.deposit_amount}` : ""}</SvRow>
          <SvRow label="Tuition per year">
            {school.tuition_from != null ? `${school.fee_currency || "AED"} ${school.tuition_from}${school.tuition_to != null && school.tuition_to !== school.tuition_from ? ` – ${school.tuition_to}` : ""}` : ""}
          </SvRow>
          <SvRow label="Transport per year">{school.transport_per_year != null ? `${school.fee_currency || "AED"} ${school.transport_per_year}` : ""}</SvRow>
        </div>
      </div>
      <div className="sd-card sd-wide">
        <h3>Documents required</h3>
        <LongText text={school.documents_required} />
      </div>
    </div>
  );
}

export default function SchoolDetailPage() {
  const { schoolId } = useParams();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("record");
  const [famFilter, setFamFilter] = useState("all");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const [families, setFamilies] = useState(null);
  const [addFamilyId, setAddFamilyId] = useState("");
  const [addingFamily, setAddingFamily] = useState(false);

  // Tour -> application handoff, mirroring the same action on the family's
  // own School visits tab (SchoolShortlistPanel.jsx) -- see handleReadyToApply.

  function load() {
    return getSchoolDetail(schoolId)
      .then(setDetail)
      .catch((err) => setError(friendlyError(err, "Couldn't load this school.")));
  }

  useEffect(() => {
    setDetail(null);
    setError("");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  useEffect(() => {
    listFamilies()
      .then(setFamilies)
      .catch(() => {});
  }, []);

  if (error) {
    return (
      <div className="family-detail-page">
        <Link to="/staff/schools" className="hh-link-btn">
          ‹ Back to schools
        </Link>
        <div className="hh-form-banner hh-form-banner-error" style={{ marginTop: 16 }}>
          {error}
        </div>
      </div>
    );
  }

  if (!detail) return <div className="family-detail-page">Loading…</div>;

  const { school, shortlist, stats } = detail;

  function startEdit() {
    setDraft({
      name: school.name || "",
      area: school.area || "",
      address: school.address || "",
      curriculum: school.curriculum || "",
      typical_tour_schedule: school.typical_tour_schedule || "",
      default_tour_gate: school.default_tour_gate || "",
      default_tour_building: school.default_tour_building || "",
      default_tour_parking: school.default_tour_parking || "",
      default_tour_ask_for: school.default_tour_ask_for || "",
      default_tour_bring: school.default_tour_bring || "",
      default_tour_on_arrival: school.default_tour_on_arrival || "",
      default_tour_maps_url: school.default_tour_maps_url || "",
      general_phone: school.general_phone || "",
      website_url: school.website_url || "",
      fees_url: school.fees_url || "",
      tour_booking_url: school.tour_booking_url || "",
      application_url: school.application_url || "",
      application_platform: school.application_platform || "",
      openapply_login_url: school.openapply_login_url || "",
      requires_cat4: !!school.requires_cat4,
      requires_map: !!school.requires_map,
      requires_interview: !!school.requires_interview,
      requires_taster_day: !!school.requires_taster_day,
      fee_currency: school.fee_currency || "AED",
      application_fee: school.application_fee ?? "",
      deposit_amount: school.deposit_amount ?? "",
      tuition_from: school.tuition_from ?? "",
      tuition_to: school.tuition_to ?? "",
      transport_per_year: school.transport_per_year ?? "",
      documents_required: school.documents_required || "",
    });
    setEditing(true);
  }

  async function saveSchoolField(patch) {
    try {
      const updated = await updateSchool(schoolId, patch);
      setDetail((d) => ({ ...d, school: updated }));
      return true;
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that."));
      return false;
    }
  }

  async function saveRecord(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const patch = {
        ...draft,
        application_fee: draft.application_fee === "" ? null : Number(draft.application_fee),
        deposit_amount: draft.deposit_amount === "" ? null : Number(draft.deposit_amount),
        tuition_from: draft.tuition_from === "" ? null : Number(draft.tuition_from),
        tuition_to: draft.tuition_to === "" ? null : Number(draft.tuition_to),
        transport_per_year: draft.transport_per_year === "" ? null : Number(draft.transport_per_year),
        // Empty = not set. The platform column only accepts openapply / other / null.
        application_platform: draft.application_platform || null,
        openapply_login_url: (draft.openapply_login_url || "").trim() || null,
      };
      // An OpenApply address tags the school as OpenApply on its own, so
      // consultants only ever have to paste the link.
      if (patch.openapply_login_url && /openapply\.com/i.test(patch.openapply_login_url) && !patch.application_platform) {
        patch.application_platform = "openapply";
      }
      const updated = await updateSchool(schoolId, patch);
      setDetail((d) => ({ ...d, school: updated }));
      setEditing(false);
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that."));
    } finally {
      setSaving(false);
    }
  }

  // Founder feedback (Sept 2026): "if I remove a school from a shortlist -
  // where does it go? It seems to disappear" -- it disappears because this
  // is a real, permanent delete with no undo, and there was no confirmation
  // step before it ran. Meant for "added by mistake", not for a family
  // dropping a school they've genuinely considered -- that case should use
  // Decline instead, which keeps the row visible (greyed out, sorted last)
  // rather than erasing it.
  async function handleRemoveShortlistEntry(entry) {
    const familyName = entry.familyName || "this family";
    if (!window.confirm(`Remove ${familyName} from this school's shortlist? This can't be undone -- if they're just no longer pursuing it, use Decline instead so there's still a record.`)) {
      return;
    }
    try {
      await removeFromShortlist(entry.id);
      setDetail((d) => ({ ...d, shortlist: d.shortlist.filter((s) => s.id !== entry.id) }));
    } catch (err) {
      setError(friendlyError(err, "Couldn't remove that."));
    }
  }

  async function handleAddFamily(e) {
    e.preventDefault();
    if (!addFamilyId) return;
    setAddingFamily(true);
    setError("");
    try {
      await addToShortlist({ familyId: addFamilyId, schoolId });
      await load();
      setAddFamilyId("");
    } catch (err) {
      setError(friendlyError(err, "Couldn't add that family — they may already be on this school's shortlist."));
    } finally {
      setAddingFamily(false);
    }
  }

  const shortlistedFamilyIds = new Set(shortlist.map((s) => s.family_id));
  const availableFamilies = (families || []).filter((f) => !shortlistedFamilyIds.has(f.id) && !f.archived_at);

  return (
    <div className="family-detail-page">
      <Link to="/staff/schools" className="hh-link-btn">
        ‹ Back to schools
      </Link>

      <div className="family-detail-header">
        <div className="family-detail-avatar">{(school.name || "?").charAt(0).toUpperCase()}</div>
        <div className="family-detail-header-text">
          <div className="school-title-row">
            <h1>{school.name}</h1>
            {school.general_phone && (
              <a
                className="school-phone-chip"
                href={"tel:" + school.general_phone.replace(/\s+/g, "")}
                title="Call the school's main number"
              >
                <span aria-hidden="true">☎</span> {school.general_phone}
              </a>
            )}
          </div>
          <div className="family-detail-meta">
            {school.emirate && <span>{school.emirate}</span>}
            {school.area && <span>{school.area}</span>}
            {school.curriculum && <span>{school.curriculum}</span>}
            <span>
              {shortlist.length} famil{shortlist.length === 1 ? "y" : "ies"} shortlisted
            </span>
          </div>
        </div>
      </div>

      {stats && (
        <div className="school-stats-row">
          <div className="school-stat">
            <span className="school-stat-value">{stats.toursBooked}</span>
            <span className="school-stat-label">tours booked</span>
          </div>
          <div className="school-stat">
            <span className="school-stat-value">{stats.toured}</span>
            <span className="school-stat-label">toured</span>
          </div>
          <div className="school-stat">
            <span className="school-stat-value">{stats.applications}</span>
            <span className="school-stat-label">applications</span>
          </div>
          <div className="school-stat">
            <span className="school-stat-value">{stats.assessments}</span>
            <span className="school-stat-label">assessments</span>
          </div>
          <div className="school-stat">
            <span className="school-stat-value">{stats.offers}</span>
            <span className="school-stat-label">offers</span>
          </div>
          <div className="school-stat">
            <span className="school-stat-value">{stats.accepted ?? 0}</span>
            <span className="school-stat-label">placed through us</span>
          </div>
        </div>
      )}

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <div className="family-detail-tabs" role="tablist">
        {[
          ["record", "School record"],
          ["notes", "Notes"],
          ["documents", "Documents"],
          ["families", "Shortlisted families" + (shortlist.length ? ` (${shortlist.length})` : "")],
          ["feedback", "Feedback"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={"family-detail-tab" + (tab === key ? " is-active" : "")}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="family-detail-stack">
      {tab === "record" && (
      <section className="family-detail-card">
        <div className="panel-head">
          <h2>School record</h2>
          {!editing && (
            <button type="button" className="panel-btn" onClick={startEdit}>
              Edit
            </button>
          )}
        </div>

        {!editing ? (
          <SchoolRecordView school={school} onEmirate={(emirate) => saveSchoolField({ emirate: emirate || null })} />
        ) : (
          <form className="school-edit-form" onSubmit={saveRecord}>
            <div className="rec-grid">
              <h3 className="rec-subhead">Basics</h3>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-name">
                  School name
                </label>
                <input
                  id="sch-name"
                  className="panel-input"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  required
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-area">
                  Area
                </label>
                <input
                  id="sch-area"
                  className="panel-input"
                  value={draft.area}
                  onChange={(e) => setDraft((d) => ({ ...d, area: e.target.value }))}
                />
              </div>
              <div className="rec-field rec-field-wide">
                <label className="rec-field-label" htmlFor="sch-address">
                  Address
                </label>
                <input
                  id="sch-address"
                  className="panel-input"
                  value={draft.address}
                  onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-curriculum">
                  Curriculum
                </label>
                <input
                  id="sch-curriculum"
                  className="panel-input"
                  value={draft.curriculum}
                  onChange={(e) => setDraft((d) => ({ ...d, curriculum: e.target.value }))}
                />
              </div>

              <h3 className="rec-subhead">Tour details</h3>
              <div className="rec-field rec-field-wide">
                <label className="rec-field-label" htmlFor="sch-tour-schedule">
                  Typical tour schedule
                </label>
                <textarea
                  id="sch-tour-schedule"
                  className="panel-input"
                  rows={2}
                  placeholder="e.g. Reception: Tuesdays 10am; Year 1-6: Thursdays 9:30am"
                  value={draft.typical_tour_schedule}
                  onChange={(e) => setDraft((d) => ({ ...d, typical_tour_schedule: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-tour-gate">
                  On-the-day: Gate
                </label>
                <input
                  id="sch-tour-gate"
                  className="panel-input"
                  value={draft.default_tour_gate}
                  onChange={(e) => setDraft((d) => ({ ...d, default_tour_gate: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-tour-building">
                  On-the-day: Building
                </label>
                <input
                  id="sch-tour-building"
                  className="panel-input"
                  value={draft.default_tour_building}
                  onChange={(e) => setDraft((d) => ({ ...d, default_tour_building: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-tour-parking">
                  On-the-day: Parking
                </label>
                <input
                  id="sch-tour-parking"
                  className="panel-input"
                  value={draft.default_tour_parking}
                  onChange={(e) => setDraft((d) => ({ ...d, default_tour_parking: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-tour-ask-for">
                  On-the-day: Ask for
                </label>
                <input
                  id="sch-tour-ask-for"
                  className="panel-input"
                  value={draft.default_tour_ask_for}
                  onChange={(e) => setDraft((d) => ({ ...d, default_tour_ask_for: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-tour-bring">
                  On-the-day: Bring
                </label>
                <input
                  id="sch-tour-bring"
                  className="panel-input"
                  value={draft.default_tour_bring}
                  onChange={(e) => setDraft((d) => ({ ...d, default_tour_bring: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-tour-arrival">
                  On-the-day: On arrival
                </label>
                <input
                  id="sch-tour-arrival"
                  className="panel-input"
                  placeholder="e.g. Tell reception you are here for a school tour with Admissions"
                  value={draft.default_tour_on_arrival}
                  onChange={(e) => setDraft((d) => ({ ...d, default_tour_on_arrival: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-tour-maps">
                  On-the-day: Google Maps link
                </label>
                <input
                  id="sch-tour-maps"
                  className="panel-input"
                  placeholder="https://maps.app.goo.gl/…"
                  value={draft.default_tour_maps_url}
                  onChange={(e) => setDraft((d) => ({ ...d, default_tour_maps_url: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-tour-booking">
                  Tour booking link
                </label>
                <input
                  id="sch-tour-booking"
                  className="panel-input"
                  value={draft.tour_booking_url}
                  onChange={(e) => setDraft((d) => ({ ...d, tour_booking_url: e.target.value }))}
                />
              </div>

              <h3 className="rec-subhead">Admissions &amp; applications</h3>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-phone">
                  General school phone
                </label>
                <input
                  id="sch-phone"
                  className="panel-input"
                  type="tel"
                  placeholder="Main switchboard (not an admissions contact)"
                  value={draft.general_phone}
                  onChange={(e) => setDraft((d) => ({ ...d, general_phone: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-website">
                  Website
                </label>
                <input
                  id="sch-website"
                  className="panel-input"
                  value={draft.website_url}
                  onChange={(e) => setDraft((d) => ({ ...d, website_url: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-fees-url">
                  Fees link
                </label>
                <input
                  id="sch-fees-url"
                  className="panel-input"
                  placeholder="Link to the school's fee schedule"
                  value={draft.fees_url}
                  onChange={(e) => setDraft((d) => ({ ...d, fees_url: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-application-url">
                  Sign-up link (where parents first register, if different from the portal)
                </label>
                <input
                  id="sch-application-url"
                  className="panel-input"
                  value={draft.application_url}
                  onChange={(e) => setDraft((d) => ({ ...d, application_url: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-platform">
                  Portal type (set automatically for OpenApply links)
                </label>
                <select
                  id="sch-platform"
                  className="panel-input"
                  value={draft.application_platform}
                  onChange={(e) => setDraft((d) => ({ ...d, application_platform: e.target.value }))}
                >
                  <option value="">Not set</option>
                  <option value="openapply">OpenApply</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-portal-url">
                  Portal link (where parents sign in after registering)
                </label>
                <input
                  id="sch-portal-url"
                  className="panel-input"
                  placeholder="e.g. https://school.openapply.com/dashboard"
                  value={draft.openapply_login_url}
                  onChange={(e) => setDraft((d) => ({ ...d, openapply_login_url: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-currency">
                  Currency (application fee and deposit)
                </label>
                <select
                  id="sch-currency"
                  className="panel-input"
                  value={draft.fee_currency}
                  onChange={(e) => setDraft((d) => ({ ...d, fee_currency: e.target.value }))}
                >
                  {["AED", "GBP", "USD", "EUR"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-fee">
                  Application fee
                </label>
                <input
                  id="sch-fee"
                  type="number"
                  step="0.01"
                  className="panel-input"
                  value={draft.application_fee}
                  onChange={(e) => setDraft((d) => ({ ...d, application_fee: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-deposit">
                  Deposit
                </label>
                <input
                  id="sch-deposit"
                  type="number"
                  step="0.01"
                  className="panel-input"
                  value={draft.deposit_amount}
                  onChange={(e) => setDraft((d) => ({ ...d, deposit_amount: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-tuition-from">
                  Tuition per year, lowest
                </label>
                <input
                  id="sch-tuition-from"
                  type="number"
                  step="0.01"
                  className="panel-input"
                  value={draft.tuition_from}
                  onChange={(e) => setDraft((d) => ({ ...d, tuition_from: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-tuition-to">
                  Tuition per year, highest
                </label>
                <input
                  id="sch-tuition-to"
                  type="number"
                  step="0.01"
                  className="panel-input"
                  value={draft.tuition_to}
                  onChange={(e) => setDraft((d) => ({ ...d, tuition_to: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-transport">
                  Transport per year
                </label>
                <input
                  id="sch-transport"
                  type="number"
                  step="0.01"
                  className="panel-input"
                  value={draft.transport_per_year}
                  onChange={(e) => setDraft((d) => ({ ...d, transport_per_year: e.target.value }))}
                />
              </div>
              <div className="rec-field rec-field-wide">
                <span className="rec-field-label">Admissions requirements</span>
                <div className="school-edit-checkboxes">
                  <label className="school-edit-checkbox">
                    <input
                      type="checkbox"
                      checked={draft.requires_cat4}
                      onChange={(e) => setDraft((d) => ({ ...d, requires_cat4: e.target.checked }))}
                    />
                    CAT4
                  </label>
                  <label className="school-edit-checkbox">
                    <input
                      type="checkbox"
                      checked={draft.requires_map}
                      onChange={(e) => setDraft((d) => ({ ...d, requires_map: e.target.checked }))}
                    />
                    MAP
                  </label>
                  <label className="school-edit-checkbox">
                    <input
                      type="checkbox"
                      checked={draft.requires_interview}
                      onChange={(e) => setDraft((d) => ({ ...d, requires_interview: e.target.checked }))}
                    />
                    Interview
                  </label>
                  <label className="school-edit-checkbox">
                    <input
                      type="checkbox"
                      checked={draft.requires_taster_day}
                      onChange={(e) => setDraft((d) => ({ ...d, requires_taster_day: e.target.checked }))}
                    />
                    Taster day
                  </label>
                </div>
              </div>
              <div className="rec-field rec-field-wide">
                <label className="rec-field-label" htmlFor="sch-documents">
                  Documents required
                </label>
                <textarea
                  id="sch-documents"
                  className="panel-input"
                  rows={2}
                  value={draft.documents_required}
                  onChange={(e) => setDraft((d) => ({ ...d, documents_required: e.target.value }))}
                />
              </div>
            </div>
            <div className="school-edit-actions">
              <button type="submit" className="panel-btn panel-btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" className="panel-btn panel-btn-quiet" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
      )}

      {tab === "record" && (
        <SchoolContactsPanel
          school={school}
          onSchoolChange={(patch) => setDetail((d) => ({ ...d, school: { ...d.school, ...patch } }))}
        />
      )}

      {tab === "notes" && (
      <section className="family-detail-card">
        <div className="panel-head"><h2>Notes</h2></div>
        <SchoolNotesFeed schoolId={schoolId} />
        <h3 className="snf-sub">Reference notes</h3>
        <div className="sd-notes">
          <AutosaveField
            label="Admissions process notes"
            multiline
            rows={6}
            collapsible
            value={school.admissions_process_notes || ""}
            placeholder="e.g. Round 1 interview, then CAT4, offer usually within 2 weeks"
            onSave={async (v) => saveSchoolField({ admissions_process_notes: v })}
          />
          <AutosaveField
            label="Notes"
            multiline
            rows={6}
            collapsible
            value={school.notes || ""}
            placeholder="Anything else worth knowing about this school"
            onSave={async (v) => saveSchoolField({ notes: v })}
          />
        </div>
      </section>
      )}

      {tab === "feedback" && <SchoolFeedbackPanel schoolId={schoolId} />}

      {tab === "families" && (
      <section className="family-detail-card">
        <div className="sd-fam-head">
          <h2>
            Shortlisted families
            {shortlist.length > 0 && <span className="family-detail-card-count">{shortlist.length}</span>}
          </h2>
          {availableFamilies.length > 0 && (
            <form className="sd-fam-add" onSubmit={handleAddFamily}>
              <select className="panel-select" value={addFamilyId} onChange={(e) => setAddFamilyId(e.target.value)} aria-label="Add a family to this shortlist">
                <option value="">Add a family…</option>
                {availableFamilies.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.displayName}
                  </option>
                ))}
              </select>
              <button type="submit" className="panel-btn panel-btn-primary" disabled={!addFamilyId || addingFamily}>
                {addingFamily ? "Adding…" : "+ Add"}
              </button>
            </form>
          )}
        </div>
        {shortlist.length > 0 && (
          <div className="family-detail-tabs household-tabs sd-subtabs" role="tablist">
            {FAMILY_FILTERS.map(([key, label, test]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={famFilter === key}
                className={"family-detail-tab" + (famFilter === key ? " is-active" : "")}
                onClick={() => setFamFilter(key)}
              >
                {label} ({countFor(shortlist, test)})
              </button>
            ))}
          </div>
        )}
        {shortlist.length === 0 ? (
          <p className="family-detail-hint">No family has shortlisted this school yet.</p>
        ) : countFor(shortlist, FAMILY_FILTERS.find((f) => f[0] === famFilter)[2]) === 0 ? (
          <p className="family-detail-hint">No families here yet.</p>
        ) : (
          // Simplified after the 30/10/2026 meeting: one line per child with
          // only what a consultant needs when looking at the school itself --
          // name, year group, where their placement stands, the tour and the
          // start date. Everything editable lives on the family's own page.
          <div className="sd-simple-wrap">
            <table className="sd-simple">
              <thead>
                <tr>
                  <th>Child</th>
                  <th>Year group</th>
                  <th>Placement</th>
                  <th>Tour</th>
                  <th>Start date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shortlist.flatMap((entry) => {
                  const test = FAMILY_FILTERS.find((f) => f[0] === famFilter)[2];
                  const kids = kidsOf(entry).map((c, i) => ({ c, i })).filter(({ c }) => test(entry, c));
                  return kids.map(({ c: child, i: kidNo }, index) => (
                    <tr key={entry.id + ":" + (child?.id || "none")} className={index > 0 ? "is-sibling" : "is-first"}>
                      <td>
                        <div className="sd-who">
                          <span className="sd-av" aria-hidden="true">
                            {(child ? displayNameForChild(child, kidNo) : entry.familyName || "?").trim().charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <Link
                              to={`/staff/families/${entry.family_id}?tab=visits&school=${schoolId}`}
                              className="schooldetail-shortlist-family"
                            >
                              {child ? displayNameForChild(child, kidNo) : entry.familyName}
                            </Link>
                            <span className="sd-simple-sub">{entry.familyName}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {child?.years?.applying || child?.year_group_applying_for ? (
                          <span className="sd-year">{child?.years?.applying || child?.year_group_applying_for}</span>
                        ) : (
                          <span className="is-muted">—</span>
                        )}
                      </td>
                      <td>{placementCell(entry, child)}</td>
                      <td>
                        {entry.tour_date ? (
                          <>
                            {formatDateTime(entry.tour_date, entry.tour_start_time)}
                            {entry.tour_status && (
                              <span className={"sd-pill sd-pill-sm " + (entry.tour_status === "completed" ? "is-green" : entry.tour_status === "cancelled" ? "is-grey" : "is-blue")}>
                                {entry.tour_status === "completed" ? "Toured" : TOUR_STATUS_LABEL[entry.tour_status]}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="is-muted">No tour yet</span>
                        )}
                      </td>
                      <td>
                        {child?.placement?.start_date ? formatDate(child.placement.start_date) : <span className="is-muted">—</span>}
                      </td>
                      <td>
                        {index === 0 && (
                          <button
                            type="button"
                            className="sd-trash"
                            title="Remove from this school's shortlist"
                            aria-label={`Remove ${entry.familyName || "this family"} from this school's shortlist`}
                            onClick={() => handleRemoveShortlistEntry(entry)}
                          >
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M6 6l1 14h10l1-14" />
                              <path d="M10 10v6M14 10v6" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}

      </section>
      )}

      {/* Addendum 55 (Heather, September 2026 via WhatsApp): "Can we also
          have a document upload available in the schools section so we can
          upload A Level/ GCSE option booklets?" Generic, no fixed
          checklist -- "staff" stands in for a per-user storage folder here
          since a school isn't owned by any one family/account. */}
      {tab === "documents" && (
      <section className="family-detail-card">
        <GenericDocumentsPanel
          ownerType="school"
          ownerId={schoolId}
          uploadUserId="staff"
          title="Documents"
          uploadHint="A-Level/GCSE option booklets, or anything else worth keeping on this school's own record."
        />
      </section>
      )}
      </div>
    </div>
  );
}
