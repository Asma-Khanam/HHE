import { displayNameForChild } from "../lib/completeness";
import { packageLabel } from "../data/packages";
import SchoolPipelinePanel from "./SchoolPipelinePanel";
import CopyButton from "./CopyButton";
import CaseNotesPanel from "./CaseNotesPanel";
import GenericDocumentsPanel from "./GenericDocumentsPanel";
import "./panels.css";
import "./OverviewPanel.css";

function hasSen(child) {
  const st = (child?.sen_status || "").trim();
  return st !== "" && !st.startsWith("No, none");
}

// Read-only line: value (or a dash) with a copy icon. Editing lives in the
// Family details tab; this card only displays what's already on file.
function ReadLine({ value, label, icon, strong }) {
  return (
    <div className={"ov-line" + (strong ? " is-strong" : "")}>
      {icon && <span className="ov-line-icon" aria-hidden="true">{icon}</span>}
      <span className={"ov-value" + (value ? "" : " is-empty")}>{value || "—"}</span>
      <CopyButton text={value} label={label} />
    </div>
  );
}

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
  caseNotes,
  staff,
  schoolCatalog,
}) {
  const [mother, father] = namedParents;

  return (
    <div className="family-detail-tab-stack">
      <section className="family-detail-card ov-card">
        <header className="ov-head">
          <div>
            <span className="ov-eyebrow">Family</span>
            <div className="copy-line ov-family-name">
              <span>{displayName}</span>
              <CopyButton text={displayName} label="Copy family name" />
            </div>
          </div>
          <span className={"ov-pill" + (family.membership_type ? "" : " is-empty")}>
            {family.membership_type ? packageLabel(family.membership_type) : "No package set"}
          </span>
        </header>

        <div className="ov-people">
          {[mother, father].map((parent, i) => (
            <div className="ov-person" key={i === 0 ? "Mother" : "Father"}>
              <span className="ov-eyebrow">{i === 0 ? "Mother" : "Father"}</span>
              <ReadLine value={parent?.full_name} label="Copy name" strong />
              <ReadLine value={parent?.email} label="Copy email" icon="✉" />
              <ReadLine value={parent?.phone} label="Copy phone" icon="☎" />
            </div>
          ))}

          <div className="ov-person">
            <span className="ov-eyebrow">Household address</span>
            <ReadLine value={family.home_address} label="Copy address" />
          </div>
        </div>

        <div className="ov-lower">
          <div className="ov-kids">
            <span className="ov-eyebrow">Children</span>
            {familyChildren.length === 0 ? (
              <span className="ov-none">None on file yet</span>
            ) : (
              <div className="ov-kid-list">
                {familyChildren.map((c, i) => {
                  const sen = hasSen(c);
                  return (
                    <span className="ov-kid" key={c.id}>
                      {displayNameForChild(c, i)}
                      {sen && (
                        <span className="ov-sen" title={c.sen_status}>
                          SEN
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
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

      <CaseNotesPanel
        familyId={family.id}
        notes={caseNotes}
        staff={staff}
        familyChildren={familyChildren}
        schoolCatalog={schoolCatalog}
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
