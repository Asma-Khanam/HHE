import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

// Wraps a route so it's only reachable with an active session; otherwise
// bounces to /login. Keeps this check in one place instead of repeating it
// on every page that needs a signed-in user.
export default function RequireAuth({ children }) {
  const [status, setStatus] = useState("checking"); // checking | in | out

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus(session ? "in" : "out");
    });

    // Only an explicit sign-out flips this to "out". A momentary null-session
    // blip on some other event (e.g. a token refresh hiccup) used to send a
    // family mid-application straight to /login, which unmounted the whole
    // app tree and threw away anything they hadn't saved yet — this is the
    // "keeps going blank" bug. Any event that DOES carry a session still
    // confirms "in" as before.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) setStatus("in");
      else if (event === "SIGNED_OUT") setStatus("out");
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (status === "checking") return null;
  if (status === "out") return <Navigate to="/login" replace />;
  return children;
}
