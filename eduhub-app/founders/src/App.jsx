import { Routes, Route, Navigate } from "react-router-dom";
import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import TodayPage from "./pages/TodayPage";
import InsightsPage from "./pages/InsightsPage";
import FamiliesListPage from "./pages/FamiliesListPage";
import FamilyDetailPage from "./pages/FamilyDetailPage";
import CalendarPage from "./pages/CalendarPage";
import TeamPage from "./pages/TeamPage";
import SchoolsPage from "./pages/SchoolsPage";
import SchoolDetailPage from "./pages/SchoolDetailPage";
import SettingsPage from "./pages/SettingsPage";
import RequireStaff from "./components/RequireStaff";
import StaffShell from "./components/StaffShell";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/staff"
        element={
          <RequireStaff>
            <StaffShell />
          </RequireStaff>
        }
      >
        <Route index element={<Navigate to="/staff/today" replace />} />
        <Route path="today" element={<TodayPage />} />
        <Route path="dashboard" element={<InsightsPage />} />
        <Route path="families" element={<FamiliesListPage />} />
        <Route path="families/:familyId" element={<FamilyDetailPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="schools" element={<SchoolsPage />} />
        <Route path="schools/:schoolId" element={<SchoolDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default App;
