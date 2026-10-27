import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchApplicationFees } from "../lib/applicationFees";
import { useApplicationData } from "../context/ApplicationDataContext";
import SchoolsPipelineCard from "../components/SchoolsPipelineCard";
import SchoolContactsCard from "../components/SchoolContactsCard";
import { PageError, PageLoading } from "../components/StatePanels";
import IntroductionsCard from "../components/IntroductionsCard";
import PackageUsageCard from "../components/PackageUsageCard";
import PersonAvatar, { findProfilePhoto } from "../components/PersonAvatar";
import { IconCheckCircle, IconChevronDown, IconChevronRight, IconAlertCircle, IconUser } from "../components/icons";
import {
  getMissingItems,
  getReadinessPct,
  getStepBreakdown,
  displayNameForChild,
} from "../lib/completeness";
import "./DashboardPage.css";
import "./DashboardMobile.css";

// The Dashboard — 14 Oct 2026 redesign. Earlier version had five boxes
// telling the same story (big "Needs your attention", Where you're at
// per-school, Upcoming tours, Upcoming assessments, Recently completed).
// New shape: one slim banner, package card at the top, then one tabbed
// pipeline card doing the work of all five, then the family/contacts/
// intros grid under it.

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

// "The Khan family" — father's surname first, then a child's, then the
// account holder's. Skipped rather than guessed when none exist yet.
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
  const { data, user, status, error, reload } = useApplicationData();
  const navigate = useNavigate();
  const [familyOpen, setFamilyOpen] = useState(false);

  const children = data?.children || [];
  const rawParents = data?.parents || [];
  const parents = orderParents(rawParents);
  const family = data?.family || {};
  const familyAnswers = {
    schoolPriorities: family.school_priorities || [],
    comfortableFeeRange: family.comfortable_fee_range || "",
    budgetStatus: family.budget_status || "",
  };
  const documentsByOwner = data?.documentsByOwner || {};

  // Outstanding payments chip in the top banner (kept, Miss Lyndsay, 12 Oct
  // 2026) -- but no longer blown up into its own box; it's a chip now, and
  // the fees themselves live inside the pipeline's Assessments tab.
  const [feesForDue, setFeesForDue] = useState([]);
  useEffect(() => {
    let alive = true;
    fetchApplicationFees()
      .then((rows) => alive && setFeesForDue(rows || []))
      .catch(() => alive && setFeesForDue([]));
    return () => {
      alive = false;
    };
  }, []);

  if (status === "loading") return <PageLoading label="Loading your dashboard…" />;
  if (status === "error") return <PageError title="We couldn’t load your dashboard" message={error} onRetry={reload} />;

  const paymentsForDue = data?.payments || [];
  const dueItems = [
    ...paymentsForDue.filter((p) => p.status === "unpaid"),
    ...feesForDue.filter((f) => f.status !== "paid" && f.status !== "waived" && !f.paid_direct_by_family && f.sent_to_family_at),
  ];
  const dueTotal = dueItems.reduce((t, r) => t + (Number(r.amount) || 0), 0);
  const dueCurrency = dueItems[0]?.currency || paymentsForDue[0]?.currency || "AED";
  const dueMoney = dueTotal
    ? `${dueCurrency} ${dueTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "";

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

  // One compact status line under the greeting -- replaces the whole old
  // "Your application is with us" / "Next step" banner. Everything that
  // was there is in two words plus a chevron CTA now; the big story is on
  // the pipeline card below.
  let statusLine;
  if (isSubmitted) {
    statusLine = {
      tone: "good",
      icon: <IconCheckCircle size={14} />,
      text: submittedAt
        ? `Application submitted on ${new Date(submittedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
        : "Application submitted",
      cta: null,
    };
  } else if (missingFields.length) {
    statusLine = {
      tone: "warn",
      icon: <IconAlertCircle size={14} />,
      text: `${missingFields.length} field${missingFields.length === 1 ? "" : "s"} to finish on your application`,
      cta: { label: "Continue", onClick: () => openForm(missingFields[0].stepKey, missingFields[0].fieldKey) },
    };
  } else {
    statusLine = {
      tone: "ready",
      icon: <IconCheckCircle size={14} />,
      text: "Everything required is filled in — ready to submit",
      cta: { label: "Go to the application", onClick: () => openForm() },
    };
  }

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
      {/* ---------- one slim banner: greeting + status + readiness ---------- */}
      <header className="dash-banner">
        <div className="dash-banner-left">
          <div className="dash-crest">{(surname || greetingName || "?").charAt(0).toUpperCase()}</div>
          <div className="dash-banner-text">
            <h1>
              {greetingForNow()}
              {greetingName ? ", " : ""}
              <span className="dash-name">{greetingName}</span>
            </h1>
            <p className="dash-banner-sub">
              {surname ? `The ${surname} family` : "Your application"}
              {children.length > 0 && ` · ${children.length} ${children.length === 1 ? "child" : "children"}`}
            </p>
            <div className="dash-actions">
            <div className={"dash-status dash-status--" + statusLine.tone}>
              <span className="dash-status-icon">{statusLine.icon}</span>
              <span className="dash-status-text">{statusLine.text}</span>
              {statusLine.cta && (
                <button type="button" className="dash-status-cta" onClick={statusLine.cta.onClick}>
                  {statusLine.cta.label} <IconChevronRight size={14} />
                </button>
              )}
            </div>
              {dueItems.length > 0 && (
                <button
                  type="button"
                  className="dash-status-pay"
                  onClick={() => navigate("/app/billing")}
                  title="Open Billing"
                >
                  {dueMoney ? `${dueMoney} outstanding` : `${dueItems.length} item${dueItems.length === 1 ? "" : "s"} outstanding`}
                  <IconChevronRight size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        <Readiness pct={overallPct} />
      </header>

      {/* ---------- package at the top ---------- */}
      <PackageUsageCard />

      {/* ---------- schools pipeline (the main thing on the page) ---------- */}
      <SchoolsPipelineCard />

      {/* ---------- rest of the dashboard ---------- */}
      <div className={"dash-grid" + (missingFields.length ? "" : " is-single")}>
        <div className="dash-main">
          <section className={"dash-card dash-family" + (familyOpen ? " is-open" : "")}>
            <div className="dash-card-head">
              <button
                type="button"
                className="dash-family-toggle"
                onClick={() => setFamilyOpen((o) => !o)}
                aria-expanded={familyOpen}
              >
                <h2><span className="dash-card-icon dash-card-icon--neutral"><IconUser size={16} /></span>Your family</h2>
                {!familyOpen && (
                  <span className="dash-family-preview">
                    {people.map((p) => firstNameOf(p.name) || p.role).filter(Boolean).join(" · ") || "Add your family"}
                  </span>
                )}
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
                const incomplete = person.pct < 100;
                return (
                  <button
                    type="button"
                    className={"dash-row" + (incomplete ? " is-incomplete" : "")}
                    key={person.key}
                    onClick={() => openForm(person.stepKey)}
                  >
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
                      <span className={"dash-pill tone-" + (incomplete ? "pending" : status.tone)}>{status.label}</span>
                      <IconChevronRight size={16} />
                    </span>
                  </button>
                );
              })}
            </div>
            )}
          </section>

          <SchoolContactsCard />
          <IntroductionsCard />
        </div>

        {missingFields.length > 0 && (
          <aside className="dash-side">
            <section className="dash-card">
              <div className="dash-card-head">
                <h2><span className="dash-card-icon dash-card-icon--error"><IconAlertCircle size={16} /></span>Still to fill in</h2>
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

// Four-segment meter from the founders' mockup.
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

// Small readiness ring — the one headline number on the page.
function Readiness({ pct }) {
  const size = 96;
  const stroke = 9;
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
