import { displayNameForChild } from "../lib/completeness";
import { packageLabel } from "../data/packages";
import SchoolPipelinePanel from "./SchoolPipelinePanel";
import GenericDocumentsPanel from "./GenericDocumentsPanel";
import "./panels.css";

// The Overview tab (September 2026 change request, then revised again).
// The family/contact basics stay a plain card; the two things that used to
// be Tours and Applications fields here are now the one live School
// pipeline widget below -- same shortlist and applications data the School
// visits and Applications tabs manage, just read as "where's each school up
// to" instead of two separate lists someone has to keep in sync by eye.
export default function OverviewPanel({
  family,
  displayName,
  namedParents,
  familyChildren,
  applicationsByChild,
  onFamilyRefresh,
  onGoToVisits,
  onGoToApplications,
}) {
  const [mother, father] = namedParents;
  const childNames = familyChildren.map((c, i) => displayNameForChild(c, i));

  return (
    <div className="family-detail-tab-stack">
      <section className="family-detail-card">
        <div className="rec-grid">
          <div className="rec-field">
            <span className="rec-field-label">Family</span>
            <span className="rec-field-value">{displayName}</span>
          </div>

          <div className="rec-field">
            <span className="rec-field-label">Membership</span>
            <span className={"rec-field-value" + (family.membership_type ? "" : " is-empty")}>
              {family.membership_type ? packageLabel(family.membership_type) : "Not set"}
            </span>
          </div>

          <div className="rec-field">
            <span className="rec-field-label">Mother</span>
            <span className={"rec-field-value" + (mother?.full_name ? "" : " is-empty")}>
              {mother?.full_name || "Not on file"}
              {(mother?.email || mother?.phone) && <> — {[mother.email, mother.phone].filter(Boolean).join(" · ")}</>}
            </span>
          </div>

          <div className="rec-field">
            <span className="rec-field-label">Father</span>
            <span className={"rec-field-value" + (father?.full_name ? "" : " is-empty")}>
              {father?.full_name || "Not on file"}
              {(father?.email || father?.phone) && <> — {[father.email, father.phone].filter(Boolean).join(" · ")}</>}
            </span>
          </div>

          <div className="rec-field rec-field-wide">
            <span className="rec-field-label">Children</span>
            <span className={"rec-field-value" + (childNames.length ? "" : " is-empty")}>
              {childNames.length ? childNames.join(", ") : "None on file yet"}
            </span>
          </div>

          <div className="rec-field rec-field-wide">
            <span className="rec-field-label">Household address</span>
            <span className={"rec-field-value" + (family.home_address ? "" : " is-empty")}>
              {family.home_address || "Not on file"}
            </span>
          </div>
        </div>
      </section>

      <SchoolPipelinePanel
        familyId={family.id}
        familyChildren={familyChildren}
        applicationsByChild={applicationsByChild}
        onFamilyRefresh={onFamilyRefresh}
        onGoToVisits={onGoToVisits}
        onGoToApplications={onGoToApplications}
      />

      {/* Addendum 55 (Heather, September 2026 via WhatsApp): "Can we add a
          document upload on the family overview please? I create a
          timetable of visits for the family." Generic, not a checklist
          slot -- staff label each upload themselves (a tour schedule, or
          anything else worth attaching at the family level). */}
      <section className="family-detail-card">
        <GenericDocumentsPanel
          ownerType="family"
          ownerId={family.id}
          uploadUserId={family.account_user_id}
          title="Documents"
          uploadHint="For anything that doesn't belong to one specific person -- a tour schedule, a general note, etc."
        />
      </section>
    </div>
  );
}
