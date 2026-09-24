import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApplicationData } from "../context/ApplicationDataContext";
import SchoolUpdatesCard from "../components/SchoolUpdatesCard";
import IntroductionsCard from "../components/IntroductionsCard";
import PersonAvatar, { findProfilePhoto } from "../components/PersonAvatar";
import { IconCheckCircle, IconChevronDown, IconChevronRight } from "../components/icons";
import {
  getMissingItems,
  getReadinessPct,
  getStepBreakdown,
  displayNameForChild,
} from "../lib/completeness";
import "./DashboardPage.css";

// The Dashboard — built against the founders' own consultant-view mockup and
// then trimmed twice on their feedback (2026-09-02).
//
// Three things came out along the way, all for the same reason — the page was
// saying the same thing more than once: the five-step "Where we're up to"
// tracker (the progress meters already said it), "Needs you today" (it was the
// outstanding-documents list under another name), and the separate Household
// card (the same people as "Your application", listed twice). What's left
// answers three questions and stops: how far along are we, who still needs
// something, and what's the one next thing.
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

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return `DOB ${d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`;
}

function orderParents(list) {
  const byRole = { Mother: null, Father: null };
  (list || []).forEach((p) => {
    if (p.relationship === "Mother" || p.relationship === "Father") byRole[p.relationship] = p;
  });
  const unassigned = (list || []).filter((p) => p.relationship !== "Mother" && p.relationship !== "Father");
  if (!byRole.Mother && unassigned.length) byRole.Mother = unassigned.shift();
  if (!byRole.Father && unassigned.length) byRole.Father = unassigned.shift();
  return [
    { ...(byRole.Mother || {}), relationship: "Mother" },
    { ...(byRole.Father || {}), relationship: "Father" },
  ];
}

function statusFor(pct) {
  if (pct >= 100) return { label: "Complete", tone: "done" };
  if (pct > 0) return { label: "In progress", tone: "progress" };
  return { label: "Not started", tone: "empty" };
}

export default function DashboardPage() {
  const { data, user } = useApplicationData();
  const navigate = useNavigate();
  // "Your family" opens and closes like a dropdown (September 2026).
  const [familyOpen, setFamilyOpen] = useState(false);

  const children = data?.children || [];
  const rawParents = data?.parents || [];
  // Same [Mother, Father] order the Application form uses (see
  // buildInitialParents there), so "parent-0"/"parent-1" in a missing
  // item's link points at the same person's card on both pages. Straight
  // database order could put Father first and send the family to the wrong
  // card.
  const parents = orderParents(rawParents);
  const family = data?.family || {};
  const familyAnswers = {
    schoolPriorities: family.school_priorities || [],
    comfortableFeeRange: family.comfortable_fee_range || "",
    budgetStatus: family.budget_status || "",
  };
  const documentsByOwner = data?.documentsByOwner || {};
  // Same shape ApplicationForm builds — schoolsByChild is keyed by child id,
  // this lines it up as one array parallel to `children` by index.
  const currentSchools = children.map((c) => data?.schoolsByChild?.[c.id] || {});

  const holder = rawParents.find((p) => p.user_id === user?.id) || rawParents[0];
  const accountHolderRole = holder?.relationship === "Father" ? "Father" : "Mother";
  const mother = rawParents.find((p) => p.relationship === "Mother");
  const father = rawParents.find((p) => p.relationship === "Father");

  const missingFields = getMissingItems({ parents, accountHolderRole, children, currentSchools, ...familyAnswers });
  const overallPct = getReadinessPct({ parents, accountHolderRole, children, currentSchools, documentsByOwner, ...familyAnswers });
  const breakdown = getStepBreakdown({
    parents,
    accountHolderRole,
    children,
    currentSchools,
    documentsByOwner,
    budgetStatus: familyAnswers.budgetStatus,
  });

  const isSubmitted = (data?.family?.intake_status || "draft") === "submitted";
  const submittedAt = data?.family?.intake_submitted_at;

  const greetingName = firstNameOf(holder?.full_name);
  const surname = familySurname({ father, children, holder });

  function openForm(stepKey, fieldKey) {
    navigate("/app/form", { state: { stepKey, fieldKey } });
  }

  function docsFor(ownerType, ownerId) {
    return ownerId ? documentsByOwner[`${ownerType}:${ownerId}`] || [] : [];
  }

  // The one next thing, as a single call to action. Deliberately never about
  // documents — those have their own panel, and saying "2 documents to upload"
  // here as well was just the same sentence twice.
  let spotlight;
  if (isSubmitted) {
    spotlight = {
      eyebrow: "Submitted",
      title: "Your application is with us",
      body: submittedAt
        ? `Sent on ${new Date(submittedAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}. You can still go back and change anything.`
        : "You can still go back and change anything.",
      cta: null,
    };
  } else if (missingFields.length) {
    spotlight = {
      eyebrow: "Next step",
      title: `${missingFields.length} required field${missingFields.length === 1 ? "" : "s"} to finish`,
      body: "Everything you've typed is already saved. Fill these in and you'll be able to submit.",
      cta: {
        label: "Continue the application",
        onClick: () => openForm(missingFields[0].stepKey, missingFields[0].fieldKey),
      },
    };
  } else {
    spotlight = {
      eyebrow: "Ready",
      title: "You can submit whenever you're ready",
      body: "Everything required is filled in. Anything still to upload can follow afterwards.",
      cta: { label: "Go to the application", onClick: () => openForm() },
    };
  }

  // Everyone on the application, in the order the form itself shows them —
  // whoever is filling it in first. One list, used once: this replaced the
  // separate "Your application" and "Household" cards, which were the same
  // people twice.
  const people = [];
  const parentOrder = accountHolderRole === "Father" ? ["Father", "Mother"] : ["Mother", "Father"];
  parentOrder.forEach((role) => {
    const parent = role === "Mother" ? mother : father;
    const stepKey = role === "Mother" ? "mother" : "father";
    people.push({
      key: stepKey,
      stepKey,
      name: parent?.full_name,
      role,
      tagline: [role, role === accountHolderRole ? "primary contact" : null, parent?.employer_name || parent?.phone]
        .filter(Boolean)
        .join(" · "),
      pct: breakdown[stepKey]?.pct ?? 0,
      photo: findProfilePhoto(docsFor("parent", parent?.id)),
    });
  });
  children.forEach((child, i) => {
    const label = displayNameForChild(child, i);
    people.push({
      key: `child-${i}`,
      stepKey: `child-${i}`,
      name: label,
      role: children.length > 1 ? `Child ${i + 1}` : "Child",
      isChild: true,
      badge: child.year_group_applying_for,
      tagline: [formatDob(child.date_of_birth), child.year_group_applying_for].filter(Boolean).join(" · ") ||
        "Details still to come",
      pct: breakdown[`child-${i}`]?.pct ?? 0,
      photo: findProfilePhoto(docsFor("child", child.id)),
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
              {!isSubmitted && missingFields.length === 0 && <span className="dash-chip is-quiet">Ready to submit</span>}
            </div>
          </div>
        </div>

        <Readiness pct={overallPct} />
      </header>

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


      <div className={"dash-grid" + (missingFields.length ? "" : " is-single")}>
        {/* ---------- main column ---------- */}
        <div className="dash-main">
          <section className={"dash-card dash-family" + (familyOpen ? " is-open" : "")}>
            <div className="dash-card-head">
              <button
                type="button"
                className="dash-family-toggle"
                onClick={() => setFamilyOpen((o) => !o)}
                aria-expanded={familyOpen}
              >
                <h2>Your family</h2>
                <span className="dash-family-faces" aria-hidden="true">
                  {people.map((person) => (
                    <PersonAvatar
                      key={person.key}
                      doc={person.photo}
                      name={person.name}
                      fallback={person.role}
                      isChild={person.isChild}
                      className="dash-family-face"
                    />
                  ))}
                </span>
                <span className="dash-family-caret">
                  <IconChevronDown size={18} />
                </span>
              </button>
              {familyOpen && (
                <button type="button" className="dash-card-link" onClick={() => openForm()}>
                  Edit <IconChevronRight size={14} />
                </button>
              )}
            </div>
            {familyOpen && (
            <div className="dash-rows">
              {people.map((person) => {
                const status = statusFor(person.pct);
                return (
                  <button type="button" className="dash-row" key={person.key} onClick={() => openForm(person.stepKey)}>
                    <PersonAvatar
                      doc={person.photo}
                      name={person.name}
                      fallback={person.role}
                      isChild={person.isChild}
                    />
                    <span className="dash-row-text">
                      <span className="dash-row-name">
                        {person.name || `${person.role} — not added yet`}
                        {person.badge && <span className="dash-row-tag"> · {person.badge}</span>}
                      </span>
                      <span className="dash-row-detail">{person.tagline}</span>
                    </span>
                    <span className="dash-row-meta">
                      <Segments pct={person.pct} />
                      <span className={"dash-pill tone-" + status.tone}>{status.label}</span>
                      <IconChevronRight size={16} />
                    </span>
                  </button>
                );
              })}
            </div>
            )}
          </section>

          <SchoolUpdatesCard />

          <IntroductionsCard />
        </div>

        {missingFields.length > 0 && (
          <aside className="dash-side">
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
          </aside>
        )}
      </div>


    </div>
  );
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
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="dash-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
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
