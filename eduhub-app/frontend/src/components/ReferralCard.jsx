import { useState } from "react";
import { updateReferralSource } from "../lib/applicationData";
import "./MoveDetailsCard.css";

const SOURCES = [
  "Google or web search",
  "Instagram",
  "Facebook",
  "LinkedIn",
  "Friend or family recommendation",
  "Recommended by a school",
  "Recommended by a partner or organisation",
  "An event or talk",
  "Other",
];

// Which answers need a little more detail, and what to ask for.
const DETAIL_PROMPT = {
  "Friend or family recommendation": "Who recommended us? (optional)",
  "Recommended by a school": "Which school? (optional)",
  "Recommended by a partner or organisation": "Which partner or organisation?",
  "An event or talk": "Which event? (optional)",
  Other: "Please tell us where",
};

// One of the first questions on the application: where the family heard
// about Heather Harries Relocate. Saves as they choose or leave the box.
export default function ReferralCard({ familyId, family, onFamilyChange }) {
  const [source, setSource] = useState(family?.referral_source || "");
  const [detail, setDetail] = useState(family?.referral_source_detail || "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save(next) {
    setError("");
    try {
      const updated = await updateReferralSource(familyId, next);
      onFamilyChange?.(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError(err.message || "Couldn't save that.");
    }
  }

  return (
    <div className="move-card">
      <div className="move-card-head">
        <h3>How did you hear about us?</h3>
        {saved && <span className="move-card-saved">Saved</span>}
      </div>
      {error && <p className="move-card-error">{error}</p>}
      <div className="move-card-row">
        <label>
          Where did you first hear about us?
          <select
            value={source}
            onChange={(e) => {
              const v = e.target.value;
              setSource(v);
              setDetail("");
              save({ source: v, detail: "" });
            }}
          >
            <option value="">Select an option</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {DETAIL_PROMPT[source] && (
          <label>
            {DETAIL_PROMPT[source]}
            <input
              type="text"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              onBlur={(e) => {
                if ((family?.referral_source_detail || "") !== e.target.value) save({ source, detail: e.target.value });
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
