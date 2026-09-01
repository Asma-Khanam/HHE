import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { ensureFamilyExists } from "../lib/ensureFamily";
import { fetchApplicationData } from "../lib/applicationData";

export const ApplicationDataContext = createContext(null);

// Loads everything once at the /app level (who's logged in, their family,
// child, current school, parent) and shares it across Profile / Application /
// Overview so switching tabs doesn't re-fetch, and saving in the form updates
// what Overview shows immediately.
export function ApplicationDataProvider({ children }) {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [familyId, setFamilyId] = useState(null);
  const [data, setData] = useState(null);

  const reload = useCallback(async () => {
    setStatus("loading");
    setError("");

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    setUser(currentUser);

    const { data: family, error: familyError } = await ensureFamilyExists();
    if (familyError) {
      setError(familyError);
      setStatus("error");
      return;
    }

    try {
      const appData = await fetchApplicationData(family.id);
      setFamilyId(family.id);
      setData(appData);
      setStatus("ready");
    } catch (err) {
      setError(err.message || "Couldn't load your application.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <ApplicationDataContext.Provider value={{ status, error, user, familyId, data, reload }}>
      {children}
    </ApplicationDataContext.Provider>
  );
}

export function useApplicationData() {
  const ctx = useContext(ApplicationDataContext);
  if (!ctx) throw new Error("useApplicationData must be used inside ApplicationDataProvider");
  return ctx;
}
