import { Routes, Route, Navigate } from "react-router-dom";
import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ProfilePage from "./pages/ProfilePage";
import ApplicationPage from "./pages/ApplicationPage";
import DashboardPage from "./pages/DashboardPage";
import TimetablePage from "./pages/TimetablePage";
import BillingPage from "./pages/BillingPage";
import DocumentsPage from "./pages/DocumentsPage";
import RequireAuth from "./components/RequireAuth";
import AppShell from "./components/AppShell";
import { ApplicationDataProvider, useApplicationData } from "./context/ApplicationDataContext";

// Where /app lands you.
//
// Reversed September 2026 (founder feedback: "make the default screen the
// parent overview, not the application screen"). This used to send a
// family who hadn't submitted yet straight to the form instead — but
// "haven't submitted" describes almost every family for almost their whole
// time using this app (there's no rush to submit now that nothing's
// blocked by it), so in practice this was the form being the default
// screen for nearly everyone, nearly always. The Dashboard is the more
// useful landing spot regardless of submission status: it shows what's
// outstanding AND links straight to the form for anything still missing,
// so nothing about reaching the form gets harder, it just isn't the first
// thing every visit.
function AppLanding() {
  const { status } = useApplicationData();
  if (status === "loading") return <p className="dashboard-status">Loading...</p>;
  return <Navigate to="/app/dashboard" replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/signup" replace />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
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
        <Route path="timetable" element={<TimetablePage />} />
        <Route path="form" element={<ApplicationPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="profile" element={<ProfilePage />} />
        {/* The Dashboard replaced the Overview tab on 2026-09-02. */}
        <Route path="overview" element={<Navigate to="/app/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
