import { useLocation } from "react-router-dom";
import { useApplicationData } from "../context/ApplicationDataContext";
import ApplicationForm from "../components/ApplicationForm";
import { PageError, PageLoading } from "../components/StatePanels";
import "./ApplicationPage.css";

export default function ApplicationPage() {
  const { status, error, user, familyId, data, reload } = useApplicationData();
  // Overview's "What's left" list links straight to the step that has the
  // missing item, via navigate("/app/form", { state: { stepKey } }) — this
  // is where that gets picked back up.
  const location = useLocation();

  if (status === "loading") return <PageLoading label="Loading your application…" />;

  if (status === "error") {
    return <PageError title="We couldn’t load your application" message={error} onRetry={reload} />;
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
