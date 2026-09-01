import { useLocation } from "react-router-dom";
import { useApplicationData } from "../context/ApplicationDataContext";
import ApplicationForm from "../components/ApplicationForm";
import "./ApplicationPage.css";

export default function ApplicationPage() {
  const { status, error, user, familyId, data, reload } = useApplicationData();
  // Overview's "What's left" list links straight to the step that has the
  // missing item, via navigate("/app/form", { state: { stepKey } }) — this
  // is where that gets picked back up.
  const location = useLocation();

  if (status === "loading") return <p className="dashboard-status">Loading your application...</p>;

  if (status === "error") {
    return (
      <div className="dashboard-status">
        <div className="hh-form-banner hh-form-banner-error" style={{ maxWidth: 480, margin: "0 auto" }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <ApplicationForm
      familyId={familyId}
      userId={user?.id}
      initialData={data}
      onSaved={reload}
      initialStepKey={location.state?.stepKey}
      initialFieldKey={location.state?.fieldKey}
    />
  );
}
