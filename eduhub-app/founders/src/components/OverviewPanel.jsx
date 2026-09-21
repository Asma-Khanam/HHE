import { useState } from "react";
import { displayNameForChild } from "../lib/completeness";
import { packageLabel } from "../data/packages";
import SchoolPipelinePanel from "./SchoolPipelinePanel";
import CopyButton from "./CopyButton";
import CaseNotesPanel from "./CaseNotesPanel";
import GenericDocumentsPanel from "./GenericDocumentsPanel";
import EditableLine from "./EditableLine";
import { updateFamily, updateRecordFields } from "../lib/staffData";
import "./panels.css";
import "./OverviewPanel.css";

function hasSen(child) {
  const st = (child?.sen_status || "").trim();
  return st !== "" && !st.startsWith("No, none");
}

function stayLabel(from, until) {
  if (!from || !until) return "";
  const days = Math.round((new Date(until) - new Date(from)) / 86400000);
  if (Number.isNaN(days) || days < 0) return "";
  return days === 0 ? "1 day" : `${days + 1} days`;
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
  onFamilyChange,
  onParentSaved,
}) {
  const [mother, father] = namedParents;
  const [dateError, setDateError] = useState("");
  const stay = stayLabel(family.dubai_available_from, family.dubai_available_until);

  // Throws on failure (EditableLine shows the error); the date boxes use
  // saveDates, which reports it beside them instead.
  async function saveFamily(patch) {
    const updated = await updateFamily(family.id, patch);
    if (updated) onFamilyChange?.(updated);
  }
  async function saveDates(patch) {
    setDateError("");
    try {
      await saveFamily(patch);
    } catch (err) {
      setDateError(err?.message || "Couldn't save those dates.");
    }
  }
  async function saveParent(parentId, patch) {
    const updated = await updateRecordFields("parents", parentId, patch);
    if (updated) onParentSaved?.(updated);
  }

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
          {[mother, father].map((parent, i) => {
            const role = i === 0 ? "Mother" : "Father";
            return (
              <div className="ov-person" key={role}>
                <span className="ov-eyebrow">{role}</span>
                {parent ? (
                  <>
                    <EditableLine
                      strong
                      placeholder="Full name"
                      value={parent.full_name}
                      onSave={(v) => saveParent(parent.id, { full_name: v })}
                    />
                    <EditableLine
                      icon="mail"
                      type="email"
                      placeholder="Add email"
                      value={parent.email}
                      onSave={(v) => saveParent(parent.id, { email: v })}
                    />
                    <EditableLine
                      icon="phone"
                      type="tel"
                      placeholder="Add phone"
                      value={parent.phone}
                      onSave={(v) => saveParent(parent.id, { phone: v })}
                    />
                  </>
                ) : (
                  <span className="ov-none">Not on file</span>
                )}
              </div>
            );
          })}

          <div className="ov-person">
            <span className="ov-eyebrow">Household address</span>
            <EditableLine
              placeholder="Add address"
              value={family.home_address}
              onSave={(v) => saveFamily({ home_address: v })}
            />
          </div>
        </div>

        <div className="ov-lower">
          <div className="ov-dubai">
            <span className="ov-eyebrow">Available in Dubai</span>
            <div className="ov-dates">
              <input
                type="date"
                className="ov-date"
                value={family.dubai_available_from || ""}
                onChange={(e) => saveDates({ dubai_available_from: e.target.value })}
                aria-label="Available in Dubai from"
              />
              <span className="ov-arrow">→</span>
              <input
                type="date"
                className="ov-date"
                value={family.dubai_available_until || ""}
                onChange={(e) => saveDates({ dubai_available_until: e.target.value })}
                aria-label="Available in Dubai until"
              />
              {stay && <span className="ov-stay">{stay}</span>}
            </div>
            <span className="ov-note">Families sometimes change plans by text — edit here and it updates everywhere.</span>
            {dateError && <span className="ov-error">{dateError}</span>}
          </div>

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
