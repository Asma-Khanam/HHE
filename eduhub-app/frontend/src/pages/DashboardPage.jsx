import { useNavigate } from "react-router-dom";
import { useApplicationData } from "../context/ApplicationDataContext";
import DocumentVaultCard from "../components/DocumentVaultCard";
import { IconCheckCircle, IconChevronRight } from "../components/icons";
import {
  getMissingItems,
  getOutstandingDocuments,
  getReadinessPct,
  getStepBreakdown,
  displayNameForChild,
} from "../lib/completeness";
import "./DashboardPage.css";

// The Dashboard — rebuilt 2026-09-02 against the founders' own consultant-view
// mockup: a cream page of white cards, a family header carrying the one
// readiness number, a main column and a narrower side rail rather than
// everything stretched wall to wall.
//
// Gone from the first version, on their feedback: the five-step "Where we're
// up to" tracker (it didn't tell anyone anything the progress bars don't), and
// "Needs you today" (it was the outstanding-documents list under a second
// name). What's left is meant to answer three questions and stop: how far
// along are we, who still needs something, and what's the one next thing.

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstNameOf(fullName) {
  return String(fullName || "").trim().split(/\s+/)[0] || "";
}

function surnameOf(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

// "The Khan family" — the founders asked for the father's surname here
// specifically, whichever parent happens to be filling the form in. Falls back
// to a child's last name, then the account holder's, and is skipped entirely
// rather than guessed at when none of those exist yet.
function familySurname({ father, children, holder }) {
  return (
    surnameOf(father?.full_name) ||
    (children.map((c) => (c.last_name || "").trim()).find(Boolean) || "") ||
    surnameOf(holder?.full_name)
  );
}

function statusFor(pct) {
  if (pct >= 100) return { label: "Complete", tone: "done" };
  if (pct > 0) return { label: "In progress", tone: "progress" };
  return { label: "Not started", tone: "empty" };
}

export default function DashboardPage() {
  const { data, user } = useApplicationData();
  const navigate = useNavigate();

  const children = data?.children || [];
  const parents = data?.parents || [];
  const documentsByOwner = data?.documentsByOwner || {};
  // Same shape ApplicationForm builds — schoolsByChild is keyed by child id,
  // this lines it up as one array parallel to `children` by index.
  const currentSchools = children.map((c) => data?.schoolsByChild?.[c.id] || {});

  const holder = parents.find((p) => p.user_id === user?.id) || parents[0];
  const accountHolderRole = holder?.relationship === "Father" ? "Father" : "Mother";
  const mother = parents.find((p) => p.relationship === "Mother");
  const father = parents.find((p) => p.relationship === "Father");

  const missingFields = getMissingItems({ parents, accountHolderRole, children, currentSchools });
  const outstandingDocs = getOutstandingDocuments({ parents, accountHolderRole, children, documentsByOwner });
  const overallPct = getReadinessPct({ parents, accountHolderRole, children, currentSchools, documentsByOwner });
  const breakdown = getStepBreakdown({ parents, accountHolderRole, children, currentSchools, documentsByOwner });

  const intakeStatus = data?.family?.intake_status || "draft";
  const submittedAt = data?.family?.intake_submitted_at;
  const isSubmitted = intakeStatus === "submitted";

  const greetingName = firstNameOf(holder?.full_name);
  const surname = familySurname({ father, children, holder });

  function openForm(stepKey, fieldKey) {
    navigate("/app/form", { state: { stepKey, fieldKey } });
  }

  // The single next thing worth doing, as one clear call to action rather than
  // a list competing with the two lists already on this page.
  let spotlight;
  if (isSubmitted && !outstandingDocs.length) {
    spotlight = {
      eyebrow: "All done",
      title: "Everything's in",
      body: "Your application and every document we asked for are with us. We'll be in touch as things move forward.",
      cta: null,
    };
  } else if (isSubmitted) {
    spotlight = {
      eyebrow: "One thing left",
      title: `${outstandingDocs.length} document${outstandingDocs.length === 1 ? "" : "s"} still to upload`,
      body: "Your application is already submitted — these can follow whenever you get hold of them.",
      cta: { label: "Upload documents", onClick: () => openForm(outstandingDocs[0].stepKey, outstandingDocs[0].fieldKey) },
    };
  } else if (missingFields.length) {
    spotlight = {
      eyebrow: "Next step",
      title: `${missingFields.length} required field${missingFields.length === 1 ? "" : "s"} to finish`,
      body: "Everything you've typed is already saved. Fill these in and you'll be able to submit — missing documents won't hold you up.",
      cta: { label: "Continue the application", onClick: () => openForm(missingFields[0].stepKey, missingFields[0].fieldKey) },
    };
  } else {
    spotlight = {
      eyebrow: "Ready",
      title: "You can submit whenever you're ready",
      body: "Everything required is filled in. Any documents still to come can be uploaded after you submit.",
      cta: { label: "Go to the application", onClick: () => openForm() },
    };
  }

  // Everyone on the application, in the order the form itself shows them —
  // whoever is filling it in first.
  const people = [];
  const parentOrder = accountHolderRole === "Father" ? ["Father", "Mother"] : ["Mother", "Father"];
  parentOrder.forEach((role) => {
    const parent = role === "Mother" ? mother : father;
    const stepKey = role === "Mother" ? "mother" : "father";
    people.push({
      key: stepKey,
      name: parent?.full_name,
      role,
      isHolder: role === accountHolderRole,
      detail: parent?.employer_name ? `employer: ${parent.employer_name}` : parent?.phone,
      pct: breakdown[stepKey]?.pct ?? 0,
      stepKey,
    });
  });
  children.forEach((child, i) => {
    people.push({
      key: `child-${i}`,
      name: displayNameForChild(child, i),
      role: child.year_group_applying_for || (children.length > 1 ? `Child ${i + 1}` : "Child"),
      isChild: true,
      detail: formatDob(child.date_of_birth),
      pct: breakdown[`child-${i}`]?.pct ?? 0,
      stepKey: `child-${i}`,
    });
  });

  return (
    <div className="dash">
      {/* ---------- family header + the one readiness number ---------- */}
      <header className="dash-top">
        <div className="dash-top-identity">
          <div className="dash-crest">{(surname || greetingName || "?").charAt(0).toUpperCase()}</div>
          <div className="dash-top-text">
            <h1>
              {greetingForNow()}
              {greetingName ? ", " : ""}
              <span className="dash-name">{greetingName}</span>.
            </h1>
            <p className="dash-top-family">
              {surname ? `The ${surname} family` : "Your application"}
              {children.length > 0 && ` · ${children.length} ${children.length === 1 ? "child" : "children"}`}
            </p>
            <div className="dash-chips">
              <span className={"dash-chip" + (isSubmitted ? " is-submitted" : "")}>
                {isSubmitted && <IconCheckCircle size={13} />}
                {isSubmitted ? "Submitted" : "Draft"}
              </span>
              {isSubmitted && submittedAt && (
                <span className="dash-chip is-quiet">
                  {new Date(submittedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                </span>
              )}
              {!isSubmitted && missingFields.length === 0 && (
                <span className="dash-chip is-quiet">Ready to submit</span>
              )}
            </div>
          </div>
        </div>

        <Readiness pct={overallPct} />
      </header>

      <div className="dash-grid">
        {/* ---------- main column ---------- */}
        <div className="dash-main">
          <section className="dash-card">
            <div className="dash-card-head">
              <h2>Your application</h2>
              <button type="button" className="dash-card-link" onClick={() => openForm()}>
                Open <IconChevronRight size={14} />
              </button>
            </div>
            <div className="dash-rows">
              {people.map((person) => {
                const status = statusFor(person.pct);
                return (
                  <button
                    type="button"
                    className="dash-row"
                    key={person.key}
                    onClick={() => openForm(person.stepKey)}
                  >
                    <span className={"dash-avatar" + (person.isChild ? " is-child" : "")}>
                      {initialsFor(person.name, person.role)}
                    </span>
                    <span className="dash-row-text">
                      <span className="dash-row-name">{person.name || `${person.role} — not added yet`}</span>
                      <span className="dash-row-detail">
                        {person.role}
                        {person.isHolder ? " · filling this in" : ""}
                        {person.detail ? ` · ${person.detail}` : ""}
                      </span>
                    </span>
                    <Segments pct={person.pct} />
                    <span className={"dash-pill tone-" + status.tone}>{status.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="dash-spotlight">
            <span className="dash-spotlight-eyebrow">{spotlight.eyebrow}</span>
            <h2>{spotlight.title}</h2>
            <p>{spotlight.body}</p>
            {spotlight.cta && (
              <button type="button" className="dash-spotlight-cta" onClick={spotlight.cta.onClick}>
                {spotlight.cta.label}
              </button>
            )}
          </section>

          {missingFields.length > 0 && (
            <section className="dash-card">
              <div className="dash-card-head">
                <h2>Still to fill in</h2>
                <span className="dash-count">{missingFields.length}</span>
              </div>
              <ul className="dash-list">
                {missingFields.slice(0, 8).map((item) => (
                  <li key={item.fieldKey}>
                    <button type="button" onClick={() => openForm(item.stepKey, item.fieldKey)}>
                      <span className="dash-bullet" />
                      <span className="dash-list-label">{item.label}</span>
                      <IconChevronRight size={15} />
                    </button>
                  </li>
                ))}
              </ul>
              {missingFields.length > 8 && (
                <p className="dash-note">+ {missingFields.length - 8} more, once these are done.</p>
              )}
            </section>
          )}
        </div>

        {/* ---------- side rail ---------- */}
        <aside className="dash-side">
          <section className="dash-card">
            <div className="dash-card-head">
              <h2>Household</h2>
              <button type="button" className="dash-card-link" onClick={() => openForm()}>
                Edit <IconChevronRight size={14} />
              </button>
            </div>
            <div className="dash-household">
              {people.map((person) => (
                <div className="dash-household-row" key={person.key}>
                  <span className={"dash-avatar" + (person.isChild ? " is-child" : "")}>
                    {initialsFor(person.name, person.role)}
                  </span>
                  <span className="dash-row-text">
                    <span className="dash-row-name">
                      {person.name || `${person.role} — not added yet`}
                      {person.isChild && person.role ? <span className="dash-row-tag"> · {person.role}</span> : null}
                    </span>
                    <span className="dash-row-detail">
                      {person.isChild ? person.detail || "Details to come" : person.role}
                      {person.isHolder ? " · primary contact" : ""}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="dash-card">
            <div className="dash-card-head">
              <h2>Outstanding documents</h2>
              {outstandingDocs.length > 0 && <span className="dash-count">{outstandingDocs.length}</span>}
            </div>
            {outstandingDocs.length === 0 ? (
              <div className="dash-allclear">
                <IconCheckCircle size={18} />
                <p>Every document we've asked for is on file.</p>
              </div>
            ) : (
              <>
                <ul className="dash-docs">
                  {outstandingDocs.slice(0, 7).map((item) => (
                    <li key={item.fieldKey}>
                      <button type="button" onClick={() => openForm(item.stepKey, item.fieldKey)}>
                        <span className="dash-doc-mark" aria-hidden="true" />
                        <span className="dash-row-text">
                          <span className="dash-doc-label">{item.docLabel}</span>
                          <span className="dash-row-detail">
                            {item.personName} · {item.personTag}
                          </span>
                        </span>
                        <span className="dash-pill tone-pending">Needed</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {outstandingDocs.length > 7 && (
                  <p className="dash-note">+ {outstandingDocs.length - 7} more, once these are in.</p>
                )}
                <p className="dash-note dash-note-soft">
                  None of these stop you submitting — upload them whenever you get hold of them.
                </p>
              </>
            )}
          </section>
        </aside>
      </div>

      <DocumentVaultCard
        mother={mother}
        father={father}
        children={children}
        documentsByOwner={documentsByOwner}
        displayNameForChild={displayNameForChild}
      />
    </div>
  );
}

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return `DOB ${d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`;
}

// Two initials for a full name, one for a single name — the same shape the
// founders' own mockup uses for its household rows.
function initialsFor(name, fallback) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return (fallback || "?").charAt(0).toUpperCase();
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// The four-segment progress meter from the founders' mockup — easier to read
// at a glance than a continuous bar, because "two of four" is a shape you
// recognise without reading a number.
const SEGMENT_COUNT = 4;

function Segments({ pct }) {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * SEGMENT_COUNT);
  return (
    <span className="dash-segments" aria-label={`${pct}% complete`}>
      {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
        <span key={i} className={"dash-segment" + (i < filled ? (pct >= 100 ? " is-done" : " is-on") : "")} />
      ))}
    </span>
  );
}

// The one number on the page, as a ring. Deliberately the only percentage
// shown large, so nothing on the Dashboard can appear to contradict it.
function Readiness({ pct }) {
  const size = 116;
  const stroke = 11;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));

  return (
    <div className="dash-readiness">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="dash-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className="dash-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="dash-readiness-value">
        <strong>{clamped}%</strong>
        <span>ready</span>
      </div>
    </div>
  );
}
