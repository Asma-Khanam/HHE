import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { apiUrl } from "../lib/native";
import "./DeleteAccountCard.css";

// "Delete my account" -- required inside the app by Apple (5.1.1(v)).
// Asks for confirmation by typing DELETE, then calls /api/delete-account.
export default function DeleteAccountCard() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setBusy(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch(apiUrl("/api/delete-account"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not delete your account");
      await supabase.auth.signOut().catch(() => {});
      navigate("/login", { replace: true });
    } catch (e) {
      setError(e.message || "Could not delete your account");
      setBusy(false);
    }
  }

  return (
    <div className="delete-account-card">
      <h3>Delete account</h3>
      {!open ? (
        <>
          <p>Permanently delete your account and everything you entered or uploaded.</p>
          <button type="button" className="delete-account-open" onClick={() => setOpen(true)}>
            Delete my account
          </button>
        </>
      ) : (
        <>
          <p>
            This removes your login, your details, your children's details and every document you uploaded. It
            can't be undone. We keep invoices and payment records, as the law requires us to for accounting.
          </p>
          <label className="delete-account-label" htmlFor="delete-confirm">
            Type <strong>DELETE</strong> to confirm
          </label>
          <input
            id="delete-confirm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
          />
          {error && <p className="delete-account-error" role="alert">{error}</p>}
          <div className="delete-account-actions">
            <button type="button" className="hh-btn-secondary" onClick={() => { setOpen(false); setText(""); setError(""); }} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="delete-account-confirm" onClick={handleDelete} disabled={busy || text.trim() !== "DELETE"}>
              {busy ? "Deleting…" : "Delete forever"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
