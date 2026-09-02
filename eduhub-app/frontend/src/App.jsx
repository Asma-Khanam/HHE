import { Routes, Route, Navigate } from "react-router-dom";
import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import ProfilePage from "./pages/ProfilePage";
import ApplicationPage from "./pages/ApplicationPage";
import DashboardPage from "./pages/DashboardPage";
import RequireAuth from "./components/RequireAuth";
import AppShell from "./components/AppShell";
import { ApplicationDataProvider, useApplicationData } from "./context/ApplicationDataContext";

// Where /app lands you, which depends on how far along you are.
//
// A family part-way through their application wants the form — that's the
// work in front of them. A family who has already submitted wants the
// Dashboard, since there's nothing left to fill in and what they actually
// come back for is "where are we up to" (founder request, 2026-09-02).
//
// While the family's data is still loading there's no honest answer yet, so
// this waits rather than guessing and bouncing them a moment later.
function AppLanding() {
  const { status, data } = useApplicationData();
  if (status === "loading") return <p className="dashboard-status">Loading...</p>;
  const submitted = data?.family?.intake_status === "submitted";
  return <Navigate to={submitted ? "/app/dashboard" : "/app/form"} replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/signup" replace />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Login />} />
      {/* Old links some may still have bookmarked — send them somewhere real. */}
      <Route path="/dashboard" element={<Navigate to="/app" replace />} />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <ApplicationDataProvider>
              <AppShell />
            </ApplicationDataProvider>
          </RequireAuth>
        }
      >
        <Route index element={<AppLanding />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="form" element={<ApplicationPage />} />
        <Route path="profile" element={<ProfilePage />} />
        {/* The Dashboard replaced the Overview tab on 2026-09-02. */}
        <Route path="overview" element={<Navigate to="/app/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
