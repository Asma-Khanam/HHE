import { Routes, Route, Navigate } from "react-router-dom";
import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import TodayPage from "./pages/TodayPage";
import FamiliesListPage from "./pages/FamiliesListPage";
import FamilyDetailPage from "./pages/FamilyDetailPage";
import RequireStaff from "./components/RequireStaff";
import StaffShell from "./components/StaffShell";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Login />} />

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
        <Route path="families" element={<FamiliesListPage />} />
        <Route path="families/:familyId" element={<FamilyDetailPage />} />
      </Route>
    </Routes>
  );
}

export default App;
