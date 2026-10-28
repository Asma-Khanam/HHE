import { useEffect, useMemo, useState } from "react";
import EmailComposer from "./EmailComposer";
import {
  listShortlistForFamily,
  listSchoolContacts,
  listChildAvailabilityForShortlistIds,
  updateShortlistTour,
  friendlyError,
} from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import { enquiryEmail } from "../lib/visitEmails";
import "./panels.css";
import "./TourWorkflow.css";

const shortDay = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

// Stage 2 of the School Visits workflow: the system drafts the availability
// email for every shortlisted school; a consultant reviews it and sends, edits
// it, or skips that school. Nothing goes out without a click.
export default function SchoolEnquiryDrafts({ familyId, family, familyName, familyChildren, blocked, composerCtx, refreshKey, onChanged }) {
  const [rows, setRows] = useState([]);
  const [contacts, setContacts] = useState({});
  const [childStatus, setChildStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drafting, setDrafting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const children = familyChildren || [];
  const from = family?.dubai_available_from || "";
  const to = family?.dubai_available_until || "";
  const hasDates = !!(from && to);

  async function load() {
    setError("");
    try {
      const shortlist = await listShortlistForFamily(familyId);
      const [cs, cts] = await Promise.all([
        listChildAvailabilityForShortlistIds(shortlist.map((r) => r.id)),
        listSchoolContacts([...new Set(shortlist.map((r) => r.school_id))]).catch(() => null),
      ]);
      const by = {};
      (cts || []).filter((c) => !c.archived_at && c.email).forEach((c) => (by[c.school_id] = by[c.school_id] || []).push(c));
      setRows(shortlist);
      setChildStatus(cs);
      setContacts(by);
    } catch (err) {
      setError(friendlyError(err, "Couldn't load the schools."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, refreshKey]);

  const items = useMemo(
    () =>
      rows.map((row) => {
        const list = contacts[row.school_id] || [];
        const main = list.find((c) => c.is_main) || list[0];
        const email = main?.email || row.school?.admissions_contact_email || "";
        const contactName = main?.full_name || row.school?.admissions_contact_name || "";
        const hasReply = childStatus.some((s) => s.shortlist_id === row.id && s.availability_status !== "awaiting") || !!row.tour_date;
        let state = "todo";
        if (row.enquiry_sent_at) state = "sent";
        else if (row.enquiry_skipped_at) state = "skipped";
        else if (hasReply) state = "progress";
        return { row, name: row.school?.name || "School", email, contactName, state };
      }),
    [rows, contacts, childStatus]
  );

  const todo = items.filter((i) => i.state === "todo");

  function open(item) {
    const option = hasDates ? "option_1" : "option_2";
    const draft = enquiryEmail({
      option,
      familyName,
      children: children.map((c, i) => ({ name: displayNameForChild(c, i), year: c.year_group_applying_for || "", record: c })),
      from,
      to,
      blocked,
      contactName: item.contactName,
      schoolName: item.name,
      consultant: composerCtx.staffName,
      plannedMoveDate: family?.planned_move_date || "",
    });
    setDrafting({ item, option, initial: { mode: "draft", to: item.email ? [item.email] : [], subject: draft.subject, text: draft.text } });
  }

  async function sent() {
    const { item, option } = drafting;
    setBusy(true);
    try {
      await updateShortlistTour(item.row.id, { enquiry_sent_at: new Date().toISOString(), enquiry_type: option, enquiry_skipped_at: null });
      setDrafting(null);
      await load();
      if (onChanged) onChanged();
    } catch (err) {
      setError(friendlyError(err, "The email was sent, but it couldn't be marked as sent. Do not send it again."));
      setDrafting(null);
    } finally {
      setBusy(false);
    }
  }

  async function skip(item) {
    setBusy(true);
    setError("");
    try {
      await updateShortlistTour(item.row.id, { enquiry_skipped_at: new Date().toISOString() });
      setDrafting(null);
      await load();
    } catch (err) {
      setError(friendlyError(err, "Couldn't skip that school."));
    } finally {
      setBusy(false);
    }
  }

  // Nothing left to email -> nothing to show.
  if (loading || (todo.length === 0 && !drafting)) return null;
  const isOpen = expanded || !!drafting;

  return (
    <section className="panel tw-card tw-slim">
      <div className="panel-head">
        <h2>
          {todo.length === 1 ? "1 school still to email" : `${todo.length} schools still to email`}
        </h2>
        <button type="button" className="panel-btn panel-btn-primary" onClick={() => setExpanded((v) => !v)}>
          {isOpen ? "Hide drafts" : "Review drafts"}
        </button>
      </div>
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {isOpen && (
      <>
      <p className="panel-hint tw-hint">
        {hasDates ? "Asks for spaces and tour slots inside the visit window." : "Asks about spaces only; tour slots come once the family has dates."} Nothing sends until you press Send.
      </p>
      <ul className="tw-enq">
        {items.filter((it) => it.state === "todo" || it.state === "skipped" || (drafting && drafting.item.row.id === it.row.id)).map((it) => (
          <li key={it.row.id} className={"tw-enq-row is-" + it.state}>
            <div className="tw-enq-main">
              <strong>{it.name}</strong>
              <span className="tw-muted">
                {it.email ? (it.contactName ? `${it.contactName} · ${it.email}` : it.email) : <em className="tw-warn">No admissions email on file</em>}
              </span>
            </div>
            <div className="tw-enq-act">
              {it.state === "sent" && <span className="tw-status is-done">Enquiry sent {shortDay(it.row.enquiry_sent_at)}</span>}
              {it.state === "progress" && <span className="tw-status">Already in progress</span>}
              {it.state === "skipped" && (
                <>
                  <span className="tw-status">Skipped</span>
                  <button type="button" className="panel-btn" onClick={() => open(it)}>
                    Draft anyway
                  </button>
                </>
              )}
              {it.state === "todo" && (
                <button type="button" className="panel-btn panel-btn-primary" onClick={() => open(it)} disabled={busy}>
                  Review draft
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      </>
      )}

      {drafting && (
        <div className="tw-compose">
          <div className="tw-compose-head">
            <span>
              Draft to <strong>{drafting.item.name}</strong> · {drafting.option === "option_1" ? "tour request" : "availability enquiry"}
            </span>
            <button type="button" className="tw-skip" onClick={() => skip(drafting.item)} disabled={busy}>
              Skip this school
            </button>
          </div>
          <EmailComposer
            key={drafting.item.row.id + drafting.option}
            familyId={familyId}
            familyName={familyName}
            childLines={composerCtx.childLines}
            documents={[]}
            staffName={composerCtx.staffName}
            familyAddress={composerCtx.familyAddress}
            childRows={children}
            dubaiFrom={from}
            dubaiUntil={to}
            initial={drafting.initial}
            onSent={sent}
            onClose={() => setDrafting(null)}
          />
        </div>
      )}
    </section>
  );
}
