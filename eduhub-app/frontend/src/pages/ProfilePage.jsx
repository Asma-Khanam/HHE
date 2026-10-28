import { Link } from "react-router-dom";
import { useApplicationData } from "../context/ApplicationDataContext";
import PageHeader from "../components/PageHeader";
import PersonAvatar, { findProfilePhoto } from "../components/PersonAvatar";
import AvatarUpload from "../components/AvatarUpload";
import { displayNameForChild, getMissingItems, getReadinessPct } from "../lib/completeness";
import "./ProfilePage.css";

function Row({ label, value }) {
  return (
    <div className="profile-row">
      <span className="profile-row-label">{label}</span>
      <span className="profile-row-value">{value || "—"}</span>
    </div>
  );
}

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return `DOB ${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

// One row of the Household list — their photo (or initials until they add
// one), the name, and a short second line. Styled after the founders' own
// household card: burgundy tiles for the adults, sand for the children, so the
// two groups separate at a glance.
function HouseholdRow({ name, tag, detail, isChild, photo }) {
  return (
    <div className="household-row">
      <PersonAvatar doc={photo} name={name} fallback={tag} isChild={isChild} />
      <div className="household-row-text">
        <span className="household-row-name">{name}</span>
        <span className="household-row-detail">
          {tag}
          {detail ? ` · ${detail}` : ""}
        </span>
      </div>
    </div>
  );
}

// A read-only summary of the account holder — whichever parent (Mother or
// Father) actually signed up and is filling this in — plus the rest of the
// household (the other parent, and every child) as a clean list. Editing
// happens on the Application page; this is just "who is this account and
// who's in this family."
export default function ProfilePage() {
  const { user, data, reload } = useApplicationData();
  const parents = data?.parents || [];
  const children = data?.children || [];
  const documentsByOwner = data?.documentsByOwner || {};
  const photoFor = (ownerType, ownerId) =>
    findProfilePhoto(ownerId ? documentsByOwner[`${ownerType}:${ownerId}`] : []);
  const holder = parents.find((p) => p.user_id === user?.id) || parents[0];
  const holderRole = holder?.relationship === "Father" ? "Father" : "Mother";
  const otherRole = holderRole === "Mother" ? "Father" : "Mother";
  const otherParent = parents.find((p) => p.relationship === otherRole);
  const hasHousehold = otherParent?.full_name || children.length > 0;

  // Same readiness the Home card uses.
  const family = data?.family || {};
  const familyAnswers = {
    schoolPriorities: family.school_priorities || [],
    comfortableFeeRange: family.comfortable_fee_range || "",
    budgetStatus: family.budget_status || "",
  };
  const currentSchools = children.map((c) => data?.schoolsByChild?.[c.id] || {});
  const readyArgs = { parents, accountHolderRole: holderRole, children, currentSchools, documentsByOwner, ...familyAnswers };
  const pct = Math.max(0, Math.min(100, getReadinessPct(readyArgs)));
  const missing = getMissingItems(readyArgs);
  const people = parents.filter((p) => p.full_name).length + children.length;
  const since = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })
    : "";

  return (
    <div className="myp">
      <PageHeader
        title="Your family"
        subtitle={`Who is on the application. You are the account holder (${holderRole}). Details are edited in the Application.`}
        action={
          <Link to="/app/form" className="hh-link-btn">
            Edit in Application →
          </Link>
        }
      />

      <div className="myp-body">
        <div className="myp-left">
          <section className="myp-card myp-me">
            <AvatarUpload
              userId={user?.id}
              ownerType="parent"
              ownerId={holder?.id}
              name={holder?.full_name || user?.email}
              fallback={holderRole}
              documents={documentsByOwner[`parent:${holder?.id}`] || []}
              onDocumentsChange={() => reload()}
            />
            <h2>{holder?.full_name || "Name not set yet"}</h2>
            <span className="myp-badge">{holderRole}</span>
            <p className="myp-email">{user?.email}</p>
          </section>

          <section className="myp-card">
            <div className="myp-progress-head">
              <strong>Application {pct}% complete</strong>
              <span>{missing.length ? `${missing.length} left` : "All filled in"}</span>
            </div>
            <div className="myp-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
            <p className="myp-next">
              {missing.length ? `Next: ${missing[0].label}` : "Everything required is filled in."}
            </p>
          </section>

          <div className="myp-tiles">
            <div className="myp-tile"><strong>{people}</strong><span>People on the application</span></div>
            <div className="myp-tile"><strong>{since || "—"}</strong><span>With us since</span></div>
          </div>
        </div>

        <div className="myp-right">
          <section className="myp-card">
            <h3>Your details</h3>
            <div className="profile-details-grid">
              <Row label="Phone" value={holder?.phone} />
              <Row label="Nationality" value={holder?.nationality} />
              <Row label="First language" value={holder?.first_language} />
              <Row label="Second language" value={holder?.second_language} />
              <Row label="Employer" value={holder?.employer_name} />
              <Row label="Job title" value={holder?.occupation_designation} />
            </div>
            <Row label="Home address" value={data?.family?.home_address} />
          </section>

          <section className="myp-card">
            <h3>Household</h3>
            {hasHousehold ? (
              <div className="household-list">
                <HouseholdRow
                  name={holder?.full_name || `${holderRole} (not named yet)`}
                  tag={`${holderRole} · primary contact`}
                  detail={holder?.phone}
                  photo={photoFor("parent", holder?.id)}
                />
                {otherParent?.full_name && (
                  <HouseholdRow
                    name={otherParent.full_name}
                    tag={otherRole}
                    detail={otherParent.phone}
                    photo={photoFor("parent", otherParent.id)}
                  />
                )}
                {children.map((child, i) => (
                  <HouseholdRow
                    key={child.id || i}
                    isChild
                    name={displayNameForChild(child, i)}
                    tag={children.length > 1 ? `Child ${i + 1}` : "Child"}
                    detail={formatDob(child.date_of_birth) || child.year_group_applying_for}
                    photo={photoFor("child", child.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="household-empty-hint">
                Add the other parent and your children in Application to see them here.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
