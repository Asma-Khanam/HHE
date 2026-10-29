import AutosaveField from "./Autosave";
import { saveShortlistNote } from "../lib/staffData";

// Small shared pieces for the School visits tab (SchoolShortlistPanel.jsx).

export const AVAILABILITY_OPTIONS = [
  { value: "awaiting", label: "Awaiting reply" },
  { value: "yes", label: "Yes, place available" },
  { value: "some_year_groups", label: "Some year groups only" },
  { value: "waitlist", label: "Waitlist" },
  { value: "no", label: "No, full" },
];

export const CHIP_LABEL = {
  awaiting: "Awaiting reply",
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
      label="Notes"
      multiline
      rows={8}
      placeholder="Internal notes, e.g. paste the school's email about availability. The family can't see this."
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

export function SaveBadge({ state }) {
  if (!state || state === "idle") return null;
  if (state === "saving") return <span className="sv-saved">Saving…</span>;
  if (state === "saved") return <span className="sv-saved">✓ Saved</span>;
  return <span className="sv-saved is-error">Couldn't save. Try again.</span>;
}
