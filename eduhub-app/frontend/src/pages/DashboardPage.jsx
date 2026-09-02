import { useNavigate } from "react-router-dom";
import { useApplicationData } from "../context/ApplicationDataContext";
import StatTile from "../components/StatTile";
import StillOutstandingCard from "../components/StillOutstandingCard";
import WhatsLeftCard from "../components/WhatsLeftCard";
import DocumentVaultCard from "../components/DocumentVaultCard";
import { IconCheckCircle, IconChevronRight, IconDocument, IconClipboard, IconUser } from "../components/icons";
import {
  getMissingItems,
  getOutstandingDocuments,
  getReadinessPct,
  getStepBreakdown,
  displayNameForChild,
} from "../lib/completeness";
import "./DashboardPage.css";

// The Dashboard — what replaced the old Overview tab on 2026-09-02.
//
// The founders sent through two reference screens for what they wanted this
// to feel like: a calm "here's where you're up to and here's the one or two
// things that need you today" page rather than a wall of statistics. This is
// that shape, built entirely from data this application actually holds —
// every number, name and action below is real and clicks through to the
// exact field or upload row it's about. Nothing here is a placeholder.
//
// The family-tree flowchart that used to sit in the middle of this page is
// gone (founder feedback); who's in the family is now shown as the same
// person-with-a-progress-bar rows used everywhere else.

const JOURNEY_STEPS = [
  { key: "parents", label: "Parent details" },
  { key: "household", label: "Home address" },
  { key: "children", label: "Children's details" },
  { key: "documents", label: "Documents" },
  { key: "submitted", label: "Application submitted" },
];

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstNameOf(fullName) {
  return String(fullName || "").trim().split(/\s+/)[0] || "";
}

// The family's surname, for the "Welcome, the Khan family" line. Taken from
// a child's last name first (that's the name schools will have them under),
// then the account holder's, and skipped entirely rather than guessed if
// neither is filled in yet.
function familySurname(children, holder) {
  const fromChild = children.map((c) => (c.last_name || "").trim()).find(Boolean);
  if (fromChild) return fromChild;
  const parts = String(holder?.full_name || "").trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export default function DashboardPage() {
  const { data, user } = useApplicationData();
  const navigate = useNavigate();

  const children = data?.children || [];
  const parents = data?.parents || [];
  const documentsByOwner = data?.documentsByOwner || {};
  const homeAddress = data?.family?.home_address;
  // Same shape ApplicationForm builds — schoolsByChild is keyed by child id,
  // this lines it up as one array parallel to `children` by index.
  const currentSchools = children.map((c) => data?.schoolsByChild?.[c.id] || {});

  const holder = parents.find((p) => p.user_id === user?.id) || parents[0];
  const accountHolderRole = holder?.relationship === "Father" ? "Father" : "Mother";
  const mother = parents.find((p) => p.relationship === "Mother");
  const father = parents.find((p) => p.relationship === "Father");

  const missingFields = getMissingItems({ parents, accountHolderRole, homeAddress, children, currentSchools });
  const outstandingDocs = getOutstandingDocuments({ parents, accountHolderRole, children, documentsByOwner });
  const overallPct = getReadinessPct({ parents, accountHolderRole, homeAddress, children, currentSchools, documentsByOwner });
  const breakdown = getStepBreakdown({ parents, accountHolderRole, children, currentSchools, documentsByOwner });

  const intakeStatus = data?.family?.intake_status || "draft";
  const submittedAt = data?.family?.intake_submitted_at;
  const isSubmitted = intakeStatus === "submitted";

  // Which of the five journey steps are done. A step counts as complete when
  // nothing it's responsible for is outstanding — the same missing-items list
  // everything else on this page reads from, so the tracker can't disagree
  // with the cards underneath it.
  const parentsDone = !missingFields.some((m) => m.owner === "parent");
  const householdDone = !missingFields.some((m) => m.owner === "family");
  const childrenDone =
    children.length > 0 && !missingFields.some((m) => m.owner === "child" || m.owner === "school");
  const documentsDone = outstandingDocs.length === 0;
  const stepDone = {
    parents: parentsDone,
    household: householdDone,
    children: childrenDone,
    documents: documentsDone,
    submitted: isSubmitted,
  };
  const currentStepIndex = JOURNEY_STEPS.findIndex((s) => !stepDone[s.key]);
  const activeIndex = currentStepIndex === -1 ? JOURNEY_STEPS.length - 1 : currentStepIndex;

  // "Needs you today" — the two or three things actually worth doing next,
  // rather than the whole backlog. Required fields come first (they're what
  // holds up submitting), then documents. The full lists are both further
  // down the page, so nothing is hidden by this, just prioritised.
  const todo = [
    ...missingFields.map((m) => ({
      key: m.fieldKey,
      title: m.label,
      detail: "Needed before you can submit",
      urgent: true,
      stepKey: m.stepKey,
      fieldKey: m.fieldKey,
      Icon: m.owner === "parent" ? IconUser : IconClipboard,
    })),
    ...outstandingDocs.map((d) => ({
      key: d.fieldKey,
      title: `Upload ${d.docLabel.toLowerCase()}`,
      detail: `${d.personName} · ${d.personTag} — whenever you have it`,
      urgent: false,
      stepKey: d.stepKey,
      fieldKey: d.fieldKey,
      Icon: IconDocument,
    })),
  ].slice(0, 3);

  const greetingName = firstNameOf(holder?.full_name);
  const surname = familySurname(children, holder);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  function openForm(stepKey, fieldKey) {
    navigate("/app/form", { state: { stepKey, fieldKey } });
  }

  // The one-line "where things stand" sentence under the greeting — the
  // whole point of the page in a sentence, and different at each stage
  // rather than one generic line that's true forever and useful never.
  let statusLine;
  if (isSubmitted && documentsDone) {
    statusLine = "Everything's in. We'll be in touch as things move forward.";
  } else if (isSubmitted) {
    statusLine = `Your application is submitted. ${outstandingDocs.length} document${
      outstandingDocs.length === 1 ? "" : "s"
    } still to upload when you have ${outstandingDocs.length === 1 ? "it" : "them"}.`;
  } else if (!missingFields.length) {
    statusLine = "Everything required is filled in — you can submit whenever you're ready.";
  } else if (todo.length) {
    statusLine = `${missingFields.length} thing${missingFields.length === 1 ? "" : "s"} still needed before you can submit.`;
  } else {
    statusLine = "Let's get your application started.";
  }

  return (
    <div className="dash">
      <header className="dash-greeting">
        <span className="dash-date">{today}</span>
        <h1>
          {greetingForNow()}
          {greetingName ? ", " : ""}
          <span className="dash-greeting-name">{greetingName}</span>.
        </h1>
        {surname && <p className="dash-family-line">Welcome back, the {surname} family.</p>}
        <p className="dash-status-line">{statusLine}</p>
      </header>

      <div className="dash-body">
        {/* --- Where we're up to ------------------------------------------ */}
        <section className="dash-card dash-journey">
          <div className="dash-journey-head">
            <h2>Where we're up to</h2>
            <span className="dash-journey-step">
              Step {activeIndex + 1} of {JOURNEY_STEPS.length}
            </span>
          </div>
          <div className="dash-journey-bars">
            {JOURNEY_STEPS.map((step, i) => (
              <span
                key={step.key}
                className={
                  "dash-journey-bar" +
                  (stepDone[step.key] ? " is-done" : i === activeIndex ? " is-active" : "")
                }
                title={step.label}
              />
            ))}
          </div>
          <h3 className="dash-journey-now">{JOURNEY_STEPS[activeIndex].label}</h3>
          <p className="dash-journey-next">
            {activeIndex < JOURNEY_STEPS.length - 1
              ? `Next: ${JOURNEY_STEPS[activeIndex + 1].label.toLowerCase()}`
              : isSubmitted
                ? "Nothing left to do here."
                : "Last step — submit your application."}
          </p>
        </section>

        {/* --- Needs you today -------------------------------------------- */}
        <section className="dash-section">
          <h2 className="dash-section-title">Needs you today</h2>
          {todo.length ? (
            <div className="dash-todo-list">
              {todo.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={"dash-todo" + (item.urgent ? " is-urgent" : "")}
                  onClick={() => openForm(item.stepKey, item.fieldKey)}
                >
                  <span className="dash-todo-icon" aria-hidden="true">
                    <item.Icon size={18} />
                  </span>
                  <span className="dash-todo-text">
                    <span className="dash-todo-title">{item.title}</span>
                    <span className="dash-todo-detail">{item.detail}</span>
                  </span>
                  <IconChevronRight size={18} />
                </button>
              ))}
            </div>
          ) : (
            <div className="dash-card dash-allclear">
              <IconCheckCircle size={20} />
              <div>
                <h3>Nothing needs you right now</h3>
                <p>Every field and document we've asked for is in.</p>
              </div>
            </div>
          )}
        </section>

        {/* --- everything still required ---------------------------------- */}
        {missingFields.length > 0 && (
          <section className="dash-section">
            <h2 className="dash-section-title">Still to fill in</h2>
            <WhatsLeftCard items={missingFields} />
          </section>
        )}

        {/* --- Readiness + status ----------------------------------------- */}
        <section className="dash-hero">
          <StatTile hero bare onDark label="Overall readiness" percent={overallPct} detail="Fields and documents together" />
          <div className="dash-hero-status">
            <div className={"dash-status-badge" + (isSubmitted ? " is-submitted" : "")}>
              {isSubmitted && <IconCheckCircle size={14} />}
              {isSubmitted ? "Submitted" : "Draft"}
            </div>
            <p className="dash-hero-note">
              {isSubmitted
                ? `Submitted${
                    submittedAt
                      ? ` on ${new Date(submittedAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}`
                      : ""
                  }. You can still go back and edit anything, and keep uploading documents as they come through.`
                : "Not submitted yet — everything saves as you go, and you can submit once the required fields are in. Missing documents won't stop you."}
            </p>
          </div>
        </section>

        {/* --- Who's on this application ---------------------------------- */}
        <section className="dash-section">
          <h2 className="dash-section-title">Who's on this application</h2>
          <div className="dash-people">
            <PersonRow
              name={mother?.full_name}
              role="Mother"
              isHolder={accountHolderRole === "Mother"}
              pct={breakdown.mother?.pct ?? 0}
              onOpen={() => openForm("mother")}
            />
            <PersonRow
              name={father?.full_name}
              role="Father"
              isHolder={accountHolderRole === "Father"}
              pct={breakdown.father?.pct ?? 0}
              onOpen={() => openForm("father")}
            />
            {children.map((child, i) => (
              <PersonRow
                key={child.id || i}
                name={displayNameForChild(child, i)}
                role={children.length > 1 ? `Child ${i + 1}` : "Child"}
                detail={child.year_group_applying_for}
                pct={breakdown[`child-${i}`]?.pct ?? 0}
                onOpen={() => openForm(`child-${i}`)}
              />
            ))}
          </div>
        </section>

        {/* --- Documents --------------------------------------------------- */}
        <section className="dash-section">
          <h2 className="dash-section-title">Outstanding documents</h2>
          <StillOutstandingCard items={outstandingDocs} />
        </section>

        <DocumentVaultCard
          mother={mother}
          father={father}
          children={children}
          documentsByOwner={documentsByOwner}
          displayNameForChild={displayNameForChild}
        />
      </div>
    </div>
  );
}

// One person on the application — the plain replacement for the family-tree
// flowchart the founders asked to have removed. Same numbers the Application
// tab's cards show, and clicking through opens that person's section.
function PersonRow({ name, role, detail, isHolder, pct, onOpen }) {
  const shown = (name || "").trim();
  return (
    <button type="button" className="dash-person" onClick={onOpen}>
      <span className="dash-person-avatar">{(shown || role || "?").charAt(0).toUpperCase()}</span>
      <span className="dash-person-text">
        <span className="dash-person-name">{shown || `${role} — not added yet`}</span>
        <span className="dash-person-role">
          {role}
          {isHolder ? " · account holder" : ""}
          {detail ? ` · ${detail}` : ""}
        </span>
      </span>
      <span className="dash-person-progress">
        <span className="dash-person-bar">
          <span className="dash-person-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
        </span>
        <span className="dash-person-pct">{pct}%</span>
      </span>
      <IconChevronRight size={16} />
    </button>
  );
}
