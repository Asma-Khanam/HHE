import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  getSchoolDetail,
  updateSchool,
  addToShortlist,
  updateShortlistEntry,
  updateShortlistTour,
  removeFromShortlist,
  upsertChildAvailability,
  listFamilies,
  createApplication,
  friendlyError,
} from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import GenericDocumentsPanel from "../components/GenericDocumentsPanel";
import "../components/panels.css";
import "./FamilyDetailPage.css";
import "./SchoolDetailPage.css";

const AVAILABILITY_LABELS = {
  awaiting: "Awaiting reply",
  yes: "Yes",
  no: "No",
  waitlist: "Waitlist",
  some_year_groups: "Some year groups",
};

// Short per-child chip labels -- same wording/colour convention as the
// family-facing School shortlist panel (SchoolShortlistPanel.jsx), just
// duplicated here rather than shared since that file doesn't export them.
const CHILD_CHIP_LABEL = {
  awaiting: "Awaiting",
  yes: "Place",
  no: "No place",
  waitlist: "Waitlist",
  some_year_groups: "Some yrs",
};

function childChipClass(value) {
  if (value === "yes") return "is-yes";
  if (value === "no") return "is-no";
  if (value === "waitlist" || value === "some_year_groups") return "is-partial";
  return "is-awaiting";
}

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

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

// "Where it's up to" for one family at this school -- same precedence as
// SchoolShortlistPanel's stageInfo (offer > applied > toured > tour booked
// > awaiting reply), collapsed to a label only since this view doesn't
// need the relative-time detail the family-facing panel shows.
function familyStageLabel(row, applicationsForFamily) {
  if (applicationsForFamily.some((a) => a.status === "offer" || a.status === "offer_accepted")) return "Offer received";
  if (applicationsForFamily.some((a) => a.status !== "draft" && a.status !== "withdrawn")) return "Applied";
  if (row.tour_status === "completed") return row.feedback_text || row.feedback_rating ? "Toured, feedback in" : "Toured, feedback pending";
  if (row.tour_status === "cancelled") return "Tour cancelled";
  if (row.tour_date) return "Tour booked";
  if (row.availability_status !== "awaiting") return "Awaiting tour date";
  return "Awaiting reply";
}

// One school's full record and every
// family that has it shortlisted — the school-side view that complements
// SchoolVisitsPanel on FamilyDetailPage (Phase 1 of the School visits
// tracker; see eduhub_schema_addendum_36_school_visits_tracker.sql).
export default function SchoolDetailPage() {
  const { schoolId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const [families, setFamilies] = useState(null);
  const [addFamilyId, setAddFamilyId] = useState("");
  const [addingFamily, setAddingFamily] = useState(false);

  // Tour -> application handoff, mirroring the same action on the family's
  // own School visits tab (SchoolShortlistPanel.jsx) -- see handleReadyToApply.
  const [decliningId, setDecliningId] = useState(null);
  const [declineNote, setDeclineNote] = useState("");
  const [applyingId, setApplyingId] = useState(null);

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
      website_url: school.website_url || "",
      fees_url: school.fees_url || "",
      admissions_contact_name: school.admissions_contact_name || "",
      admissions_contact_email: school.admissions_contact_email || "",
      admissions_contact_phone: school.admissions_contact_phone || "",
      tour_booking_url: school.tour_booking_url || "",
      application_url: school.application_url || "",
      application_platform: school.application_platform || "",
      openapply_login_url: school.openapply_login_url || "",
      requires_cat4: !!school.requires_cat4,
      requires_map: !!school.requires_map,
      requires_interview: !!school.requires_interview,
      requires_taster_day: !!school.requires_taster_day,
      application_fee: school.application_fee ?? "",
      deposit_amount: school.deposit_amount ?? "",
      documents_required: school.documents_required || "",
      admissions_process_notes: school.admissions_process_notes || "",
      notes: school.notes || "",
    });
    setEditing(true);
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
        // Empty = not set. The platform column only accepts openapply / other / null.
        application_platform: draft.application_platform || null,
        openapply_login_url: (draft.openapply_login_url || "").trim() || null,
      };
      const updated = await updateSchool(schoolId, patch);
      setDetail((d) => ({ ...d, school: updated }));
      setEditing(false);
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that."));
    } finally {
      setSaving(false);
    }
  }

  async function handleAvailabilityChange(entry, availability_status) {
    try {
      const updated = await updateShortlistEntry(entry.id, { availability_status });
      setDetail((d) => ({
        ...d,
        shortlist: d.shortlist.map((s) => (s.id === entry.id ? { ...s, ...updated } : s)),
      }));
    } catch (err) {
      setError(friendlyError(err, "Couldn't update that."));
    }
  }

  async function handleChildAvailabilityChange(entry, childId, availability_status) {
    try {
      await upsertChildAvailability(entry.id, childId, availability_status);
      setDetail((d) => ({
        ...d,
        shortlist: d.shortlist.map((s) =>
          s.id === entry.id
            ? { ...s, children: s.children.map((c) => (c.id === childId ? { ...c, availability_status } : c)) }
            : s
        ),
      }));
    } catch (err) {
      setError(friendlyError(err, "Couldn't update that."));
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

  // Mirrors the family-page School visits tab's tour -> application handoff
  // (SchoolShortlistPanel.jsx's handleReadyToApply), so the same "family
  // wants to proceed" action exists from a school's own record too -- a
  // founder working a specific school (scanning through everyone shortlisted
  // for it) shouldn't have to go find the right family page first just to
  // start an application once a tour is done.
  async function handleReadyToApply(entry) {
    setApplyingId(entry.id);
    setError("");
    try {
      const childrenNeedingApplication = (entry.children || []).filter((c) => !(c.applications || []).length);
      if (childrenNeedingApplication.length > 0) {
        await Promise.all(
          childrenNeedingApplication.map((c) => createApplication({ childId: c.id, schoolId, status: "draft" }))
        );
      }
      if (entry.family_decision !== "proceeding") {
        await updateShortlistTour(entry.id, {
          family_decision: "proceeding",
          family_decision_at: new Date().toISOString(),
        });
      }
      navigate(`/staff/families/${entry.family_id}?tab=applications`);
    } catch (err) {
      setError(friendlyError(err, "Couldn't start that application."));
      setApplyingId(null);
    }
  }

  // The other half of that handoff: the family toured this school and
  // decided not to apply. Recorded on the tour itself, same as the
  // family-page version.
  async function handleDeclineFamily(entry) {
    setApplyingId(entry.id);
    setError("");
    try {
      const updated = await updateShortlistTour(entry.id, {
        family_decision: "declined",
        family_decision_note: declineNote.trim() || null,
        family_decision_at: new Date().toISOString(),
      });
      setDetail((d) => ({
        ...d,
        shortlist: d.shortlist.map((s) => (s.id === entry.id ? { ...s, ...updated } : s)),
      }));
      setDecliningId(null);
      setDeclineNote("");
    } catch (err) {
      setError(friendlyError(err, "Couldn't record that."));
    } finally {
      setApplyingId(null);
    }
  }

  async function handleUndoDecision(entry) {
    setApplyingId(entry.id);
    setError("");
    try {
      const updated = await updateShortlistTour(entry.id, {
        family_decision: null,
        family_decision_note: null,
        family_decision_at: null,
      });
      setDetail((d) => ({
        ...d,
        shortlist: d.shortlist.map((s) => (s.id === entry.id ? { ...s, ...updated } : s)),
      }));
    } catch (err) {
      setError(friendlyError(err, "Couldn't undo that."));
    } finally {
      setApplyingId(null);
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
  const availableFamilies = (families || []).filter((f) => !shortlistedFamilyIds.has(f.id));

  return (
    <div className="family-detail-page">
      <Link to="/staff/schools" className="hh-link-btn">
        ‹ Back to schools
      </Link>

      <div className="family-detail-header">
        <div className="family-detail-avatar">{(school.name || "?").charAt(0).toUpperCase()}</div>
        <div className="family-detail-header-text">
          <h1>{school.name}</h1>
          <div className="family-detail-meta">
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
        </div>
      )}

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      <div className="family-detail-stack">
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
          <div className="rec-grid">
            <h3 className="rec-subhead">Basics</h3>
            <div className="rec-field">
              <span className="rec-field-label">Area</span>
              <span className={"rec-field-value" + (school.area ? "" : " is-empty")}>{school.area || "—"}</span>
            </div>
            <div className="rec-field rec-field-wide">
              <span className="rec-field-label">Address</span>
              <span className={"rec-field-value" + (school.address ? "" : " is-empty")}>{school.address || "—"}</span>
            </div>
            <div className="rec-field">
              <span className="rec-field-label">Curriculum</span>
              <span className={"rec-field-value" + (school.curriculum ? "" : " is-empty")}>{school.curriculum || "—"}</span>
            </div>

            <h3 className="rec-subhead">Tour details</h3>
            <div className="rec-field rec-field-wide">
              <span className="rec-field-label">Typical tour schedule</span>
              <span className={"rec-field-value" + (school.typical_tour_schedule ? "" : " is-empty")}>
                {school.typical_tour_schedule || "—"}
              </span>
            </div>
            <div className="rec-field rec-field-wide">
              <span className="rec-field-label">On-the-day details</span>
              <span className="rec-field-value">
                {[
                  school.default_tour_gate && `Gate: ${school.default_tour_gate}`,
                  school.default_tour_building && `Building: ${school.default_tour_building}`,
                  school.default_tour_parking && `Parking: ${school.default_tour_parking}`,
                  school.default_tour_ask_for && `Ask for: ${school.default_tour_ask_for}`,
                  school.default_tour_bring && `Bring: ${school.default_tour_bring}`,
                ]
                  .filter(Boolean)
                  .join(". ") || <span className="is-empty">—</span>}
              </span>
            </div>
            <div className="rec-field">
              <span className="rec-field-label">Book a tour</span>
              {school.tour_booking_url ? (
                <a className="rec-field-value" href={school.tour_booking_url} target="_blank" rel="noreferrer">
                  {school.tour_booking_url}
                </a>
              ) : (
                <span className="rec-field-value is-empty">—</span>
              )}
            </div>

            <h3 className="rec-subhead">Admissions &amp; applications</h3>
            <div className="rec-field">
              <span className="rec-field-label">Website</span>
              {school.website_url ? (
                <a className="rec-field-value" href={school.website_url} target="_blank" rel="noreferrer">
                  {school.website_url}
                </a>
              ) : (
                <span className="rec-field-value is-empty">—</span>
              )}
            </div>
            <div className="rec-field">
              <span className="rec-field-label">Fees</span>
              {school.fees_url ? (
                <a className="rec-field-value" href={school.fees_url} target="_blank" rel="noreferrer">
                  {school.fees_url}
                </a>
              ) : (
                <span className="rec-field-value is-empty">—</span>
              )}
            </div>
            <div className="rec-field">
              <span className="rec-field-label">Start an application</span>
              {school.application_url ? (
                <a className="rec-field-value" href={school.application_url} target="_blank" rel="noreferrer">
                  {school.application_url}
                </a>
              ) : (
                <span className="rec-field-value is-empty">—</span>
              )}
            </div>
            <div className="rec-field">
              <span className="rec-field-label">Application portal</span>
              {school.openapply_login_url ? (
                <a className="rec-field-value" href={school.openapply_login_url} target="_blank" rel="noreferrer">
                  {school.application_platform === "openapply" ? "OpenApply · " : ""}
                  {school.openapply_login_url}
                </a>
              ) : (
                <span className="rec-field-value is-empty">—</span>
              )}
            </div>
            <div className="rec-field rec-field-wide">
              <span className="rec-field-label">Admissions contact</span>
              <span className="rec-field-value">
                {[school.admissions_contact_name, school.admissions_contact_email, school.admissions_contact_phone]
                  .filter(Boolean)
                  .join(" · ") || <span className="is-empty">—</span>}
              </span>
            </div>
            <div className="rec-field rec-field-wide">
              <span className="rec-field-label">Admissions process</span>
              <span className="rec-field-value">
                {[
                  school.requires_cat4 && "CAT4",
                  school.requires_map && "MAP",
                  school.requires_interview && "Interview",
                  school.requires_taster_day && "Taster day",
                  school.application_fee != null && `Application fee: ${school.application_fee}`,
                  school.deposit_amount != null && `Deposit: ${school.deposit_amount}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || <span className="is-empty">—</span>}
              </span>
            </div>
            <div className="rec-field rec-field-wide">
              <span className="rec-field-label">Admissions process notes</span>
              <span className={"rec-field-value" + (school.admissions_process_notes ? "" : " is-empty")}>
                {school.admissions_process_notes || "—"}
              </span>
            </div>
            <div className="rec-field rec-field-wide">
              <span className="rec-field-label">Documents required</span>
              <span className={"rec-field-value" + (school.documents_required ? "" : " is-empty")}>
                {school.documents_required || "—"}
              </span>
            </div>
            <div className="rec-field rec-field-wide">
              <span className="rec-field-label">Notes</span>
              <span className={"rec-field-value" + (school.notes ? "" : " is-empty")}>{school.notes || "—"}</span>
            </div>
          </div>
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
                  Application link
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
                  Application platform
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
                  Portal login link (where parents sign in after registering)
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
                <label className="rec-field-label" htmlFor="sch-admissions-name">
                  Admissions contact name
                </label>
                <input
                  id="sch-admissions-name"
                  className="panel-input"
                  value={draft.admissions_contact_name}
                  onChange={(e) => setDraft((d) => ({ ...d, admissions_contact_name: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-admissions-email">
                  Admissions contact email
                </label>
                <input
                  id="sch-admissions-email"
                  type="email"
                  className="panel-input"
                  value={draft.admissions_contact_email}
                  onChange={(e) => setDraft((d) => ({ ...d, admissions_contact_email: e.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-field-label" htmlFor="sch-admissions-phone">
                  Admissions contact phone
                </label>
                <input
                  id="sch-admissions-phone"
                  className="panel-input"
                  value={draft.admissions_contact_phone}
                  onChange={(e) => setDraft((d) => ({ ...d, admissions_contact_phone: e.target.value }))}
                />
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
                <label className="rec-field-label" htmlFor="sch-admissions-notes">
                  Admissions process notes
                </label>
                <textarea
                  id="sch-admissions-notes"
                  className="panel-input"
                  rows={3}
                  placeholder="e.g. Round 1 interview, then CAT4, offer usually within 2 weeks"
                  value={draft.admissions_process_notes}
                  onChange={(e) => setDraft((d) => ({ ...d, admissions_process_notes: e.target.value }))}
                />
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
              <div className="rec-field rec-field-wide">
                <label className="rec-field-label" htmlFor="sch-notes">
                  Notes
                </label>
                <textarea
                  id="sch-notes"
                  className="panel-input"
                  rows={2}
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
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

      <section className="family-detail-card">
        <h2>
          Shortlisted families
          {shortlist.length > 0 && <span className="family-detail-card-count">{shortlist.length}</span>}
        </h2>
        {shortlist.length === 0 ? (
          <p className="family-detail-hint">No family has shortlisted this school yet.</p>
        ) : (
          <ul className="panel-list schooldetail-shortlist-list">
            {shortlist.map((entry) => {
              const waitingDays = entry.availability_status === "awaiting" ? daysSince(entry.shortlisted_at) : null;
              const stageLabel = familyStageLabel(entry, (entry.children || []).flatMap((c) => c.applications || []));
              return (
                <li key={entry.id} className="schooldetail-shortlist-card">
                  <div className="schooldetail-shortlist-cardtop">
                    <Link to={`/staff/families/${entry.family_id}?tab=applications&school=${schoolId}`} className="schooldetail-shortlist-family">
                      {entry.familyName}
                    </Link>
                    <span className="schooldetail-shortlist-stage">{stageLabel}</span>
                    <button type="button" className="panel-btn panel-btn-quiet" onClick={() => handleRemoveShortlistEntry(entry)}>
                      Remove
                    </button>
                  </div>

                  {entry.children && entry.children.length > 0 && (
                    <div className="schooldetail-shortlist-children">
                      {entry.children.map((child, index) => (
                        <span key={child.id} className="schooldetail-child-chip-group">
                          <span className="schooldetail-child-name">
                            {displayNameForChild(child, index)}
                            {child.year_group_applying_for ? ` · ${child.year_group_applying_for}` : ""}
                          </span>
                          <select
                            className={"schooldetail-child-chip-select " + childChipClass(child.availability_status)}
                            value={child.availability_status}
                            onChange={(e) => handleChildAvailabilityChange(entry, child.id, e.target.value)}
                          >
                            {Object.entries(CHILD_CHIP_LABEL).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="schooldetail-shortlist-bottom">
                    <span className="schooldetail-shortlist-tour">
                      {entry.tour_date
                        ? `Tour: ${formatDateTime(entry.tour_date, entry.tour_start_time)}${
                            entry.tour_status ? ` · ${TOUR_STATUS_LABEL[entry.tour_status]}` : ""
                          }`
                        : "No tour scheduled yet"}
                      {entry.tour2_date && (
                        <> · Secondary: {formatDateTime(entry.tour2_date, entry.tour2_start_time)}{entry.tour2_status ? ` · ${TOUR_STATUS_LABEL[entry.tour2_status]}` : ""}</>
                      )}
                    </span>
                    <select
                      className="panel-select"
                      value={entry.availability_status}
                      onChange={(e) => handleAvailabilityChange(entry, e.target.value)}
                    >
                      {Object.entries(AVAILABILITY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <span className="schooldetail-shortlist-meta">
                      Shortlisted {formatDate(entry.shortlisted_at)}
                      {entry.availability_replied_at && ` · replied ${formatDate(entry.availability_replied_at)}`}
                      {waitingDays !== null && waitingDays >= 3 && (
                        <span className="is-overdue"> · {waitingDays} days, no reply</span>
                      )}
                    </span>
                  </div>

                  {entry.tour_status === "completed" && (() => {
                    const stillNeeded = (entry.children || []).filter((c) => !(c.applications || []).length).length;
                    const busy = applyingId === entry.id;

                    if (entry.family_decision === "declined") {
                      return (
                        <div className="schooldetail-ready-to-apply schooldetail-family-declined">
                          <p className="schooldetail-family-declined-text">
                            Family decided not to proceed with this school
                            {entry.family_decision_note ? `: "${entry.family_decision_note}"` : "."}
                          </p>
                          <button
                            type="button"
                            className="panel-btn panel-btn-quiet"
                            onClick={() => handleUndoDecision(entry)}
                            disabled={busy}
                          >
                            Undo
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div className="schooldetail-ready-to-apply">
                        <button
                          type="button"
                          className="panel-btn panel-btn-primary"
                          onClick={() => handleReadyToApply(entry)}
                          disabled={busy}
                        >
                          {stillNeeded > 0 ? "Family wants to proceed → start application" : "View application →"}
                        </button>
                        {stillNeeded > 0 && (
                          <>
                            <p className="schooldetail-ready-to-apply-hint">
                              Creates a draft application at this school for{" "}
                              {stillNeeded > 1 ? "each child who doesn't have one yet" : "this child"}, and takes
                              you to that family's Applications tab.
                            </p>
                            {decliningId === entry.id ? (
                              <div className="schooldetail-decline-form">
                                <input
                                  type="text"
                                  className="panel-input schooldetail-decline-input"
                                  placeholder="Reason (optional)"
                                  value={declineNote}
                                  onChange={(e) => setDeclineNote(e.target.value)}
                                />
                                <div className="schooldetail-decline-actions">
                                  <button
                                    type="button"
                                    className="panel-btn panel-btn-quiet"
                                    onClick={() => handleDeclineFamily(entry)}
                                    disabled={busy}
                                  >
                                    Confirm decline
                                  </button>
                                  <button
                                    type="button"
                                    className="panel-btn panel-btn-quiet"
                                    onClick={() => {
                                      setDecliningId(null);
                                      setDeclineNote("");
                                    }}
                                    disabled={busy}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="panel-btn panel-btn-quiet schooldetail-decline-trigger"
                                onClick={() => {
                                  setDecliningId(entry.id);
                                  setDeclineNote("");
                                }}
                                disabled={busy}
                              >
                                Family isn't proceeding
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </li>
              );
            })}
          </ul>
        )}

        {availableFamilies.length > 0 && (
          <form className="school-year-group-add" onSubmit={handleAddFamily}>
            <select className="panel-select" value={addFamilyId} onChange={(e) => setAddFamilyId(e.target.value)}>
              <option value="">Add a family to this shortlist…</option>
              {availableFamilies.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.displayName}
                </option>
              ))}
            </select>
            <button type="submit" className="panel-btn" disabled={!addFamilyId || addingFamily}>
              {addingFamily ? "Adding…" : "Add"}
            </button>
          </form>
        )}
      </section>

      {/* Addendum 55 (Heather, September 2026 via WhatsApp): "Can we also
          have a document upload available in the schools section so we can
          upload A Level/ GCSE option booklets?" Generic, no fixed
          checklist -- "staff" stands in for a per-user storage folder here
          since a school isn't owned by any one family/account. */}
      <section className="family-detail-card">
        <GenericDocumentsPanel
          ownerType="school"
          ownerId={schoolId}
          uploadUserId="staff"
          title="Documents"
          uploadHint="A-Level/GCSE option booklets, or anything else worth keeping on this school's own record."
        />
      </section>
      </div>
    </div>
  );
}
