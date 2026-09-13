import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
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

  // Bug fix (September 2026, take 3): "every time I choose an option from
  // a dropdown, it goes back to the application page — without me even
  // pressing Next." The actual cause had nothing to do with form
  // submission — it was this reload function. Autosave calls onSaved()
  // (this same reload) after every single field change, and reload used
  // to flip status to "loading" every time it ran. ApplicationPage renders
  // a bare "Loading your application..." message whenever status is
  // "loading" — in place of ApplicationForm, not alongside it — so every
  // autosave tick was unmounting the whole form and remounting it fresh a
  // moment later. On that fresh mount, ApplicationForm has no memory of
  // which step you were on (there's no url state pointing at one unless
  // you arrived via a "missing field" deep link), so it defaulted straight
  // back to the overview. It looked exactly like every dropdown kicking
  // you back to the start.
  //
  // The loading screen is only meant to cover the very first load, before
  // there's anything on screen to show. `hasLoadedRef` tracks that: once
  // the first load succeeds, every later reload (autosave included) just
  // swaps `data` in once the fetch resolves, with the form staying mounted
  // and exactly where the family left it the whole time.
  const hasLoadedRef = useRef(false);

  const reload = useCallback(async () => {
    if (!hasLoadedRef.current) setStatus("loading");
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
      hasLoadedRef.current = true;
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
