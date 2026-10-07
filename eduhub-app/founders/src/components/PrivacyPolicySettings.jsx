import { useEffect, useState } from "react";
import AutosaveField from "./Autosave";
import { getSitePage, saveSitePage, friendlyError } from "../lib/staffData";
import "./panels.css";

// The wording of the public Privacy policy (addendum 93). Saves itself like
// every other field. The Client website shows it at /privacy, with no login,
// so the same link can go on the App Store and Google Play listings.
export default function PrivacyPolicySettings() {
  const [page, setPage] = useState(undefined); // undefined = loading, null = table missing
  const [error, setError] = useState("");

  useEffect(() => {
    getSitePage("privacy").then(setPage);
  }, []);

  async function save(fields) {
    try {
      setError("");
      const saved = await saveSitePage("privacy", {
        title: page?.title || "Privacy policy",
        body: page?.body || "",
        ...fields,
      });
      setPage((p) => ({ ...p, ...saved }));
      return true;
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that. Only a team admin can edit the privacy policy."));
      return false;
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Privacy policy</h2>
      </div>
      <p className="panel-hint">
        This is the public page the App Store and Google Play ask for. It saves as you type, and the page on the
        Client website updates straight away. Please have it checked before the apps go live, and fill in anything
        that is specific to the company.
      </p>
      <p className="panel-hint">
        How to write it: start a line with <strong>## </strong> for a heading, <strong>- </strong> for a bullet, and leave a
        blank line between paragraphs.
      </p>

      {page === undefined && <p className="panel-hint">Loading…</p>}
      {page === null && (
        <p className="panel-hint">The privacy policy page isn't set up yet. Ask Asma to run addendum 93 in Supabase.</p>
      )}
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {page && (
        <>
          <AutosaveField label="Title" value={page.title} onSave={(v) => save({ title: v || "Privacy policy" })} />
          <AutosaveField label="Wording" value={page.body} multiline rows={26} onSave={(v) => save({ body: v || "" })} />
          <p className="panel-hint" style={{ marginTop: 10 }}>
            Public link to give the app stores: <strong>your Client website address</strong>/privacy
          </p>
        </>
      )}
    </section>
  );
}
