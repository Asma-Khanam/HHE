import { Routes, Route, Navigate } from "react-router-dom";
import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import ProfilePage from "./pages/ProfilePage";
import ApplicationPage from "./pages/ApplicationPage";
import OverviewPage from "./pages/OverviewPage";
import RequireAuth from "./components/RequireAuth";
import AppShell from "./components/AppShell";
import { ApplicationDataProvider } from "./context/ApplicationDataContext";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/signup" replace />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<Login />} />
      {/* Old link some may still have bookmarked — send it to the real place. */}
      <Route path="/dashboard" element={<Navigate to="/app/form" replace />} />

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
        <Route index element={<Navigate to="/app/form" replace />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="form" element={<ApplicationPage />} />
        <Route path="overview" element={<OverviewPage />} />
      </Route>
    </Routes>
  );
}

export default App;
