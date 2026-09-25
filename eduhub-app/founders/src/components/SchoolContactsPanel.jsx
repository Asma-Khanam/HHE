import { useEffect, useState } from "react";
import AutosaveField from "./Autosave";
import CopyButton from "./CopyButton";
import {
  listSchoolContacts,
  createSchoolContact,
  updateSchoolContact,
  setMainSchoolContact,
  friendlyError,
} from "../lib/staffData";
import "./SchoolContactsPanel.css";

// Everyone we deal with at a school (founders, 25 Sept 2026): name, job
// title, email, phone -- as many as needed. The starred one is the main
// contact, shown on each family's School visits tab and copied to the
// school record. Nobody is deleted: someone who leaves is moved to
// "Former contacts" and can be brought back.

const TITLES = [
  "Admissions Manager",
  "Head of Admissions",
  "Admissions Officer",
  "Registrar",
  "Principal",
  "Head of Primary",
  "Head of Secondary",
  "PA to the Principal",
  "Finance",
  "Marketing",
];

export default function SchoolContactsPanel({ school, onSchoolChange }) {
  const [contacts, setContacts] = useState(null);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    listSchoolContacts(school.id)
      .then((rows) => {
        if (!alive) return;
        if (rows === null) setUnsupported(true);
        setContacts(rows || []);
      })
      .catch((e) => alive && setError(friendlyError(e, "Couldn't load contacts.")));
    return () => {
      alive = false;
    };
  }, [school.id]);

  const active = (contacts || []).filter((c) => !c.archived_at);
  const former = (contacts || []).filter((c) => c.archived_at);

  // The school row's own copy of the main contact changes in the database;
  // mirror it here so the rest of the page (and the list) stay in step.
  function syncMain(list) {
    const main = list.filter((c) => !c.archived_at).sort((a, b) => b.is_main - a.is_main)[0];
    onSchoolChange?.({
      admissions_contact_name: main?.full_name || null,
      admissions_contact_email: main?.email || null,
      admissions_contact_phone: main?.phone || null,
    });
  }

  function replace(updated) {
    setContacts((list) => {
      const next = list.map((c) => (c.id === updated.id ? updated : c));
      syncMain(next);
      return next;
    });
  }

  async function add() {
    setBusy(true);
    setError("");
    try {
      const row = await createSchoolContact(school.id, { is_main: active.length === 0 });
      setContacts((list) => [...list, row]);
    } catch (e) {
      setError(friendlyError(e, "Couldn't add a contact."));
    } finally {
      setBusy(false);
    }
  }

  async function makeMain(c) {
    setBusy(true);
    setError("");
    try {
      const updated = await setMainSchoolContact(school.id, c.id);
      setContacts((list) => {
        const next = list.map((x) => (x.id === updated.id ? updated : { ...x, is_main: false }));
        syncMain(next);
        return next;
      });
    } catch (e) {
      setError(friendlyError(e, "Couldn't change the main contact."));
    } finally {
      setBusy(false);
    }
  }

  async function archive(c, archived) {
    setBusy(true);
    setError("");
    try {
      const patch = archived ? { archived_at: new Date().toISOString(), is_main: false } : { archived_at: null };
      replace(await updateSchoolContact(c.id, patch));
    } catch (e) {
      setError(friendlyError(e, "Couldn't update that contact."));
    } finally {
      setBusy(false);
    }
  }

  const field = (c, key) => async (v) => replace(await updateSchoolContact(c.id, { [key]: v }));

  return (
    <section className="family-detail-card sc">
      <div className="panel-head">
        <h2>
          Contacts {active.length > 0 && <span className="panel-count">{active.length}</span>}
        </h2>
        {!unsupported && (
          <button type="button" className="panel-btn panel-btn-primary" onClick={add} disabled={busy || !contacts}>
            + Add contact
          </button>
        )}
      </div>
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {unsupported ? (
        <p className="sc-hint">
          Run addendum 80 in Supabase to add more than one contact. For now: {school.admissions_contact_name || "no name"}
          {school.admissions_contact_email ? ` · ${school.admissions_contact_email}` : ""}
          {school.admissions_contact_phone ? ` · ${school.admissions_contact_phone}` : ""}
        </p>
      ) : !contacts ? (
        <p className="sc-hint">Loading…</p>
      ) : active.length === 0 ? (
        <p className="sc-hint">No contacts yet. Add the admissions team and anyone else you deal with here.</p>
      ) : (
        <>
          <datalist id="sc-titles">
            {TITLES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <div className="sc-table" role="table">
            <div className="sc-head" role="row">
              <span />
              <span>Name</span>
              <span>Job title</span>
              <span>Email</span>
              <span>Phone</span>
              <span />
            </div>
            {active.map((c) => (
              <div key={c.id} className={"sc-row" + (c.is_main ? " is-main" : "")} role="row">
                <button
                  type="button"
                  className={"sc-star" + (c.is_main ? " is-on" : "")}
                  onClick={() => !c.is_main && makeMain(c)}
                  disabled={busy}
                  title={c.is_main ? "Main contact" : "Make main contact"}
                  aria-label={c.is_main ? "Main contact" : "Make main contact"}
                >
                  {c.is_main ? "★" : "☆"}
                </button>
                <AutosaveField bare value={c.full_name} placeholder="Full name" onSave={field(c, "full_name")} />
                <AutosaveField bare value={c.job_title} placeholder="e.g. Registrar" list="sc-titles" onSave={field(c, "job_title")} />
                <span className="sc-copy">
                  <AutosaveField bare type="email" value={c.email} placeholder="name@school.ae" onSave={field(c, "email")} />
                  {c.email && <CopyButton text={c.email} label="Copy email" />}
                </span>
                <span className="sc-copy">
                  <AutosaveField bare value={c.phone} placeholder="+971 …" onSave={field(c, "phone")} />
                  {c.phone && <CopyButton text={c.phone} label="Copy phone" />}
                </span>
                <button type="button" className="sc-archive" onClick={() => archive(c, true)} disabled={busy}>
                  Left the school
                </button>
              </div>
            ))}
          </div>
          <p className="sc-hint">★ is the main contact, shown first on every family&apos;s School visits tab.</p>
        </>
      )}

      {former.length > 0 && (
        <details className="sc-former">
          <summary>Former contacts ({former.length})</summary>
          <ul>
            {former.map((c) => (
              <li key={c.id}>
                <span>
                  {c.full_name || "No name"}
                  {c.job_title ? ` · ${c.job_title}` : ""}
                  {c.email ? ` · ${c.email}` : ""}
                </span>
                <button type="button" className="sc-archive" onClick={() => archive(c, false)} disabled={busy}>
                  Bring back
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
