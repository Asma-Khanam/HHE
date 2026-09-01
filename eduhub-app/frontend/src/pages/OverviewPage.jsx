import { useApplicationData } from "../context/ApplicationDataContext";
import PageHeader from "../components/PageHeader";
import StatTile from "../components/StatTile";
import WhatsLeftCard from "../components/WhatsLeftCard";
import StillOutstandingCard from "../components/StillOutstandingCard";
import DocumentVaultCard from "../components/DocumentVaultCard";
import FamilyTree from "../components/FamilyTree";
import { IconCheckCircle } from "../components/icons";
import { CHILD_DOCUMENT_TYPES, PARENT_DOCUMENT_TYPES } from "../data/documentTypes";
import { getMissingItems, getReadinessPct, displayNameForChild } from "../lib/completeness";
import "./OverviewPage.css";

// Deliberately the ONLY percentage on this whole page. It's computed the
// exact same way as "What's left" below counts what's missing — fields AND
// documents together — so the headline number can never again say "100%"
// while a required document checklist still has items on it. Who's who in
// the family is shown as the flow diagram the CEO actually sketched
// (Mother <-> Father -> Child 1, Child 2, ...) instead of text tiles.
export default function OverviewPage() {
  const { data, user } = useApplicationData();

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
  const motherIndex = mother ? parents.indexOf(mother) : -1;
  const fatherIndex = father ? parents.indexOf(father) : -1;

  const missingItems = getMissingItems({ parents, accountHolderRole, homeAddress, children, currentSchools, documentsByOwner });
  const overallPct = getReadinessPct({ parents, accountHolderRole, homeAddress, children, currentSchools, documentsByOwner });

  function missingCountFor(kind, childIndex) {
    if (kind === "mother") return missingItems.filter((m) => m.owner === "parent" && m.parentIndex === motherIndex).length;
    if (kind === "father") return missingItems.filter((m) => m.owner === "parent" && m.parentIndex === fatherIndex).length;
    return missingItems.filter((m) => (m.owner === "child" || m.owner === "school") && (m.childIndex ?? m.schoolIndex) === childIndex).length;
  }

  // Documents-only slice of missingItems, enriched with who each one
  // belongs to for the "Still outstanding" panel — reuses the exact same
  // items WhatsLeftCard and the readiness percentage already agree on, so
  // this list can never say something's outstanding that Submit wouldn't
  // also block on, or the other way around.
  function docTypeLabel(item) {
    const types = item.owner === "parent" ? PARENT_DOCUMENT_TYPES : CHILD_DOCUMENT_TYPES;
    return types.find((d) => d.key === item.docKey)?.label || item.label;
  }
  const outstandingDocs = missingItems
    .filter((m) => m.kind === "document")
    .map((m) => {
      if (m.owner === "parent") {
        const roleLabel = m.parentIndex === motherIndex ? "Mother" : "Father";
        return {
          ...m,
          docLabel: docTypeLabel(m),
          personName: parents[m.parentIndex]?.full_name || roleLabel,
          personTag: roleLabel,
        };
      }
      return {
        ...m,
        docLabel: docTypeLabel(m),
        personName: displayNameForChild(children[m.childIndex], m.childIndex),
        personTag: children.length > 1 ? `Child ${m.childIndex + 1}` : "Child",
      };
    });

  const intakeStatus = data?.family?.intake_status || "draft";
  const submittedAt = data?.family?.intake_submitted_at;

  return (
    <div>
      <PageHeader title="Overview" subtitle="A quick-reference snapshot of where this application stands." />
      <div className="overview-body">
        <div className="overview-hero">
          <StatTile hero bare onDark label="Overall readiness" percent={overallPct} detail="Required fields and documents" />
          <div className="overview-hero-status">
            <div className={"overview-status-badge" + (intakeStatus === "submitted" ? " is-submitted" : "")}>
              {intakeStatus === "submitted" && <IconCheckCircle size={14} />}
              {intakeStatus === "submitted" ? "Submitted" : "Draft"}
            </div>
            <p className="overview-status-note">
              {intakeStatus === "submitted"
                ? `Submitted${submittedAt ? ` on ${new Date(submittedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}` : ""}. You can still go back and edit — status tracking for a specific school (under review, offer) goes live once that flow is built.`
                : "Not submitted yet — save a draft any time and submit once everything required is in."}
            </p>
          </div>
        </div>

        <WhatsLeftCard items={missingItems} />

        <FamilyTree
          mother={mother}
          father={father}
          accountHolderRole={accountHolderRole}
          childList={children}
          missingCountFor={missingCountFor}
        />

        <StillOutstandingCard items={outstandingDocs} />

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
