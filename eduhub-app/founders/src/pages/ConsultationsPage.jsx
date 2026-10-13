import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listCalendlyBookings,
  linkCalendlyBooking,
  saveCalendlyBookingNote,
  listFamilies,
  friendlyError,
} from "../lib/staffData";
import "../components/panels.css";
import "./ConsultationsPage.css";

// Consultations (13 Oct 2026). Miss Lyndsay: "can calendly bookings for
// relocation link to the dashboard and upload basic details as a paid
// consultation?" Every booking made in Calendly lands here (saved by
// /api/calendly-webhook). The booker is usually not a client yet, so a booking
// stands on its own and is linked to a family when one matches, or by hand.

const FILTERS = [
  ["upcoming", "Upcoming"],
  ["past", "Past"],
  ["unlinked", "Not linked to a family"],
  ["canceled", "Cancelled"],
  ["all", "All"],
];

function fmtWhen(iso) {
  if (!iso) return "Time not set";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentLabel(b) {
  if (b.payment_paid === null || b.payment_paid === undefined) return null;
  const amount = b.payment_amount != null ? `${b.payment_currency || ""} ${Number(b.payment_amount).toLocaleString()}`.trim() : "";
  return b.payment_paid ? `Paid${amount ? ` · ${amount}` : ""}` : `Not paid${amount ? ` · ${amount}` : ""}`;
}

function BookingCard({ booking, families, onChanged }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [note, setNote] = useState(booking.staff_note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [moved, setMoved] = useState(false);

  const family = families.find((f) => f.id === booking.family_id) || null;
  const pay = paymentLabel(booking);
  const canceled = booking.status === "canceled";

  async function link() {
    if (!pick) return;
    setBusy(true);
    setError("");
    try {
      const r = await linkCalendlyBooking(booking, pick);
      setMoved(!!r?.movedToPaidConsult);
      setPick("");
      await onChanged();
    } catch (e) {
      setError(friendlyError(e, "Couldn't link this booking."));
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    setBusy(true);
    setError("");
    try {
      await saveCalendlyBookingNote(booking.id, note);
      await onChanged();
    } catch (e) {
      setError(friendlyError(e, "Couldn't save the note."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={"consult-card" + (canceled ? " is-canceled" : "")}>
      <button type="button" className="consult-card-head" onClick={() => setOpen((o) => !o)}>
        <div className="consult-card-main">
          <div className="consult-card-name">{booking.invitee_name || booking.invitee_email || "Unknown booker"}</div>
          <div className="consult-card-meta">
            {booking.event_name || "Calendly call"} · {fmtWhen(booking.start_time)}
            {booking.host_name ? ` · with ${booking.host_name}` : ""}
          </div>
        </div>
        <div className="consult-card-tags">
          {canceled && <span className="consult-tag consult-tag-red">{booking.rescheduled ? "Rescheduled" : "Cancelled"}</span>}
          {pay && (
            <span className={"consult-tag " + (booking.payment_paid ? "consult-tag-green" : "consult-tag-amber")}>{pay}</span>
          )}
          {family ? (
            <span className="consult-tag consult-tag-blue">{family.displayName}</span>
          ) : (
            <span className="consult-tag consult-tag-grey">Not linked</span>
          )}
        </div>
      </button>

      {open && (
        <div className="consult-card-body">
          <dl className="consult-details">
            <div>
              <dt>Email</dt>
              <dd>{booking.invitee_email || "—"}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{booking.invitee_phone || "—"}</dd>
            </div>
            {booking.join_url && (
              <div>
                <dt>Join link</dt>
                <dd>
                  <a href={booking.join_url} target="_blank" rel="noreferrer">
                    {booking.join_url}
                  </a>
                </dd>
              </div>
            )}
            {booking.cancel_reason && (
              <div>
                <dt>Cancel reason</dt>
                <dd>{booking.cancel_reason}</dd>
              </div>
            )}
            {(booking.answers || []).map((a, i) => (
              <div key={i}>
                <dt>{a.question}</dt>
                <dd>{a.answer}</dd>
              </div>
            ))}
          </dl>

          {family ? (
            <p className="consult-linked">
              Linked to{" "}
              <Link to={`/staff/families/${family.id}`}>{family.displayName}</Link>. It is on their Meetings tab.
              {moved ? " They have been moved to Paid consult on the Caseload." : ""}
            </p>
          ) : (
            <div className="panel-form consult-link-form">
              <select className="panel-select" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Link to a family…</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.displayName}
                  </option>
                ))}
              </select>
              <button type="button" className="panel-btn panel-btn-primary" disabled={!pick || busy} onClick={link}>
                Link
              </button>
            </div>
          )}

          <label className="panel-field-label" htmlFor={`cn-${booking.id}`}>
            Staff note
          </label>
          <textarea
            id={`cn-${booking.id}`}
            className="panel-input consult-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Outcome of the call, follow-ups…"
          />
          <button
            type="button"
            className="panel-btn"
            disabled={busy || note === (booking.staff_note || "")}
            onClick={saveNote}
          >
            Save note
          </button>
          {error && <p className="consult-error">{error}</p>}
        </div>
      )}
    </li>
  );
}

export default function ConsultationsPage() {
  const [bookings, setBookings] = useState([]);
  const [families, setFamilies] = useState([]);
  const [filter, setFilter] = useState("upcoming");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [b, f] = await Promise.all([listCalendlyBookings(), listFamilies()]);
      setBookings(b);
      setFamilies(f);
      setError("");
    } catch (e) {
      setError(friendlyError(e, "Couldn't load consultations."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => {
    const now = Date.now();
    const isFuture = (b) => b.start_time && new Date(b.start_time).getTime() >= now;
    const active = bookings.filter((b) => b.status !== "canceled");
    let rows;
    if (filter === "upcoming") rows = active.filter(isFuture).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    else if (filter === "past") rows = active.filter((b) => !isFuture(b)).sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
    else if (filter === "unlinked") rows = active.filter((b) => !b.family_id);
    else if (filter === "canceled") rows = bookings.filter((b) => b.status === "canceled");
    else rows = bookings;
    return rows;
  }, [bookings, filter]);

  const counts = useMemo(() => {
    const now = Date.now();
    const active = bookings.filter((b) => b.status !== "canceled");
    return {
      upcoming: active.filter((b) => b.start_time && new Date(b.start_time).getTime() >= now).length,
      unlinked: active.filter((b) => !b.family_id).length,
    };
  }, [bookings]);

  return (
    <div className="consult-page">
      <h1 className="consult-title">Consultations</h1>
      <p className="consult-subtitle">
        Every relocation consultation booked in Calendly appears here with the booker's details. {counts.upcoming} upcoming
        {counts.unlinked ? `, ${counts.unlinked} not linked to a family yet` : ""}.
      </p>

      <div className="consult-filters" role="tablist">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={"consult-filter" + (filter === key ? " is-active" : "")}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="consult-error">{error}</p>}
      {loading ? (
        <p className="consult-empty">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="consult-empty">Nothing here yet. New Calendly bookings show up on their own.</p>
      ) : (
        <ul className="consult-list">
          {shown.map((b) => (
            <BookingCard key={b.id} booking={b} families={families} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  );
}
