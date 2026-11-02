import { useState } from "react";
import AutosaveField from "./Autosave";
import { saveShortlistNote, markPlacementMoved, undoPlacementMoved, friendlyError } from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import { shortDate } from "../lib/placement";

// Small shared pieces for the School visits tab (SchoolShortlistPanel.jsx).

export const AVAILABILITY_OPTIONS = [
  { value: "awaiting", label: "Waiting for the school's reply" },
  { value: "yes", label: "Yes, place available" },
  { value: "some_year_groups", label: "Some year groups only" },
  { value: "waitlist", label: "Waitlist" },
  { value: "no", label: "No, full" },
];

export const CHIP_LABEL = {
  awaiting: "Waiting for school",
  yes: "Place",
  no: "No place",
  waitlist: "Waitlist",
  some_year_groups: "Some yrs",
};

export function chipClass(value) {
  if (value === "yes") return "is-yes";
  if (value === "waitlist" || value === "some_year_groups") return "is-partial";
  return "";
}

export function dotClass(value) {
  if (value === "yes") return "is-g";
  if (value === "waitlist" || value === "some_year_groups") return "is-a";
  return "";
}

export const TOUR_STATUS_OPTIONS = ["offered", "confirmed", "completed", "cancelled"];
export const TOUR_STATUS_LABEL = { offered: "Booked", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled" };

export function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function clock(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = ((hour + 11) % 12) + 1;
  return `${hour12}${m && m !== "00" ? ":" + m : ""}${suffix}`;
}

// "Sun 15 Nov, 9am"
export function shortTour(dateStr, timeStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return timeStr ? `${day}, ${clock(timeStr)}` : day;
}

export function daysBetween(a, b) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

// "in 17 days" / "today" / "3 days ago" for a yyyy-mm-dd date.
export function relativeDay(dateStr) {
  const days = daysBetween(new Date().toISOString().slice(0, 10), dateStr);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 1) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

export function admissionsProcessText(school) {
  return (
    [
      school.requires_cat4 && "CAT4",
      school.requires_map && "MAP",
      school.requires_interview && "Interview",
      school.requires_taster_day && "Taster day",
      school.application_fee != null && `Application fee: ${school.fee_currency || "AED"} ${school.application_fee}`,
      school.deposit_amount != null && `Deposit: ${school.fee_currency || "AED"} ${school.deposit_amount}`,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
}

// Internal notes for one shortlisted school -- somewhere to paste what a
// school's admissions team emailed back about availability. Separate from
// the Feedback box (which is about how the tour went). Saves by itself (see
// Autosave.jsx). Stored in shortlist_notes (staff-only, addendum 63), not on
// the shortlist row, because families can read that row.
export function ShortlistNotes({ shortlistId, initial, onSaved }) {
  return (
    <AutosaveField
      label="Consultant observations"
      multiline
      rows={8}
      placeholder="What you saw and what you think, and anything pasted from the school. The family can't see this."
      value={initial}
      onSave={async (v) => {
        await saveShortlistNote(shortlistId, v || "");
        onSaved?.(shortlistId, v || "");
      }}
    />
  );
}

// Every current contact at the school, each with their job title
// (addendum 80). Falls back to the single contact on the school row if the
// contacts list isn't set up yet.
export function SchoolContactsInline({ school, contacts }) {
  const list =
    contacts && contacts.length
      ? contacts
      : school?.admissions_contact_name || school?.admissions_contact_email || school?.admissions_contact_phone
      ? [
          {
            id: "legacy",
            full_name: school.admissions_contact_name,
            email: school.admissions_contact_email,
            phone: school.admissions_contact_phone,
          },
        ]
      : [];
  if (!list.length) return null;
  return (
    <>
      <dt>{list.length === 1 ? "Contact" : "Contacts"}</dt>
      <dd>
        <ul>
          {list.map((c) => (
            <li key={c.id}>
              <span>
                {c.full_name || (c.id === "legacy" ? "Admissions" : "No name")}
                {c.job_title && <span className="sv-sub"> · {c.job_title}</span>}
                {c.is_main && contacts?.length > 1 && <span className="sv-contact-main">Main</span>}
              </span>
              <span>
                {c.email && (
                  <a href={`mailto:${c.email}`} title="Opens in Titan">
                    {c.email}
                  </a>
                )}
                {c.email && c.phone && " · "}
                {c.phone}
              </span>
            </li>
          ))}
        </ul>
      </dd>
    </>
  );
}

// Small round initial for a child, same colour every time for the same position.
export function KidTag({ name, index }) {
  const cls = index === 1 ? " is-b" : index >= 2 ? " is-c" : "";
  return (
    <span className={"sv-kid" + cls}>
      <i>{(name || "?")[0].toUpperCase()}</i>
      {name}
    </span>
  );
}

// Says whose move it is, so a consultant picking up a family cold knows what to do:
// us = something for the consultant, school / family = we are waiting on them.
export function WhoTag({ who }) {
  if (!who || who === "none") return null;
  const text = who === "us" ? "To do" : who === "school" ? "Waiting on school" : "Waiting on parent";
  return <span className={"sv-who is-" + who}>{text}</span>;
}

export function SaveBadge({ state }) {
  if (!state || state === "idle") return null;
  if (state === "saving") return <span className="sv-saved">Saving…</span>;
  if (state === "saved") return <span className="sv-saved">✓ Saved</span>;
  return <span className="sv-saved is-error">Couldn't save. Try again.</span>;
}

// Addendum 149: who is placed at this school, and letting a consultant record
// that a child has moved on, with a reason. The placement row is never
// deleted -- it is marked moved, so the history stays.
export const MOVE_REASONS = [
  "Not happy at the school",
  "Moving again / relocating",
  "The place fell through",
  "Wanted a different curriculum or type of school",
  "Sibling needed to be at the same school",
  "Other",
];

export function PlacementHere({ row, kids, placements, onChanged }) {
  const [openFor, setOpenFor] = useState(null);
  const [form, setForm] = useState({ endedOn: "", toSchool: "", reason: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const name = (row.school?.name || "").trim().toLowerCase();
  const here = (placements || []).filter((p) => (p.school_name || "").trim().toLowerCase() === name);
  const childName = (id) => {
    const i = (kids || []).findIndex((c) => c.id === id);
    return i === -1 ? "This child" : displayNameForChild(kids[i], i);
  };

  if (!here.length) return null;

  async function save(p) {
    setBusy(true);
    setError("");
    try {
      onChanged?.(await markPlacementMoved(p.id, form));
      setOpenFor(null);
      setForm({ endedOn: "", toSchool: "", reason: "", note: "" });
    } catch (e) {
      setError(friendlyError(e, "Couldn't save that."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sv-blk">
      <h3>
        <span>Placement</span>
      </h3>
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
      {here.map((p) => (
        <div key={p.id} className="sv-place">
          <p style={{ margin: "0 0 6px" }}>
            <strong>{childName(p.child_id)}</strong>{" "}
            {p.placement_status === "moved" ? (
              <>
                left this school{p.ended_on ? ` on ${shortDate(p.ended_on)}` : ""}
                {p.moved_to_school ? `, now at ${p.moved_to_school}` : ""}.
              </>
            ) : (
              <>is placed here{p.start_date ? `, started ${shortDate(p.start_date)}` : ""}.</>
            )}
          </p>
          {p.placement_status === "moved" && (p.moved_reason || p.moved_note) && (
            <p className="sv-sub" style={{ margin: "0 0 6px" }}>
              {p.moved_reason}
              {p.moved_note ? ` — ${p.moved_note}` : ""}
            </p>
          )}
          {p.placement_status === "moved" ? (
            <button
              type="button"
              className="sv-btn is-sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  onChanged?.(await undoPlacementMoved(p.id));
                } catch (e) {
                  setError(friendlyError(e, "Couldn't undo that."));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Still at this school
            </button>
          ) : openFor === p.id ? (
            <div className="sv-move">
              <label className="sv-move-row">
                <span>Last day here</span>
                <input type="date" value={form.endedOn} onChange={(e) => setForm((f) => ({ ...f, endedOn: e.target.value }))} />
              </label>
              <label className="sv-move-row">
                <span>Moved to</span>
                <input
                  type="text"
                  placeholder="School name, if known"
                  value={form.toSchool}
                  onChange={(e) => setForm((f) => ({ ...f, toSchool: e.target.value }))}
                />
              </label>
              <label className="sv-move-row">
                <span>Why</span>
                <select value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}>
                  <option value="">Choose a reason</option>
                  {MOVE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                rows={3}
                placeholder="Anything else worth knowing"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
              <div className="sv-pills">
                <button type="button" className="sv-btn is-primary is-sm" disabled={busy || !form.reason} onClick={() => save(p)}>
                  {busy ? "Saving…" : "Save"}
                </button>
                <button type="button" className="sv-btn is-sm" disabled={busy} onClick={() => setOpenFor(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="sv-btn is-sm" onClick={() => setOpenFor(p.id)}>
              Moved schools
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
