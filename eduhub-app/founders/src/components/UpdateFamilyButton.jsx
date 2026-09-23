import { useEffect, useState } from "react";
import { createFamilySchoolUpdate, listFamilySchoolUpdates, friendlyError } from "../lib/staffData";
import "./UpdateFamilyButton.css";

// "Update family" (September 2026) -- pick what just happened with this
// school, add an optional line, send. It appears on the family's Dashboard
// under "School updates" as the next lit-up step on that school's timeline.
export const FAMILY_UPDATE_STAGES = [
  { key: "shortlisted", label: "Shortlisted" },
  { key: "toured", label: "Toured" },
  { key: "applied", label: "Application sent" },
  { key: "assessment", label: "Assessment" },
  { key: "offer", label: "Offer received" },
  { key: "waitlisted", label: "Waitlisted" },
  { key: "declined", label: "Declined" },
  { key: "no_place", label: "No place available" },
  { key: "placed", label: "Place confirmed" },
];
const LABEL = Object.fromEntries(FAMILY_UPDATE_STAGES.map((s) => [s.key, s.label]));

// One small shared cache per family, so a list of 10 schools doesn't fire
// 10 identical queries.
const cache = {};
function loadFor(familyId) {
  if (!cache[familyId]) cache[familyId] = listFamilySchoolUpdates(familyId);
  return cache[familyId];
}

function shortDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function UpdateFamilyButton({ familyId, schoolId, childId, suggested = "shortlisted" }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState(suggested);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState([]);

  useEffect(() => {
    if (!familyId) return;
    let alive = true;
    loadFor(familyId).then((rows) => alive && setSent(rows.filter((r) => r.school_id === schoolId)));
    return () => {
      alive = false;
    };
  }, [familyId, schoolId]);

  useEffect(() => setStage(suggested), [suggested]);

  const last = sent.at(-1);

  async function send() {
    setBusy(true);
    setError("");
    try {
      const row = await createFamilySchoolUpdate({ familyId, schoolId, childId, stage, note });
      setSent((l) => [...l, row]);
      delete cache[familyId];
      setNote("");
      setOpen(false);
    } catch (e) {
      setError(friendlyError(e, "Couldn't send that update."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="uf">
      <div className="uf-bar">
        <button type="button" className="panel-btn panel-btn-primary uf-btn" onClick={() => setOpen((o) => !o)}>
          {open ? "Cancel" : "Update family"}
        </button>
        <span className="uf-last">
          {last ? `Last sent: ${LABEL[last.stage]} · ${shortDate(last.created_at)}` : "Family hasn't been updated on this school yet"}
        </span>
      </div>

      {open && (
        <div className="uf-pop">
          <div className="uf-chips">
            {FAMILY_UPDATE_STAGES.map((s) => (
              <button
                key={s.key}
                type="button"
                className={"uf-chip" + (stage === s.key ? " is-on" : "") + (sent.some((r) => r.stage === s.key) ? " is-sent" : "")}
                onClick={() => setStage(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <textarea
            className="panel-input uf-note"
            rows={2}
            placeholder="Optional message for the family (e.g. Tour went well, application opens Monday)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}
          <button type="button" className="panel-btn panel-btn-primary" onClick={send} disabled={busy}>
            {busy ? "Sending…" : `Send "${LABEL[stage]}" to family`}
          </button>
        </div>
      )}
    </div>
  );
}
