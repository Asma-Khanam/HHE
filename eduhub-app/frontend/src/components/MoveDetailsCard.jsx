import { useState } from "react";
import { updateMoveDetails } from "../lib/applicationData";
import "./MoveDetailsCard.css";

// Where the family is moving from and to — set here, once, by the family
// themselves. Founders just read family.origin/family.destination on their
// own Case panel; there's no separate sync, it's the same two columns.
export default function MoveDetailsCard({ familyId, family, onFamilyChange }) {
  const [origin, setOrigin] = useState(family?.origin || "");
  const [destination, setDestination] = useState(family?.destination || "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save(patch) {
    setError("");
    try {
      const updated = await updateMoveDetails(familyId, {
        origin: patch.origin ?? origin,
        destination: patch.destination ?? destination,
      });
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
        <h3>Your move</h3>
        {saved && <span className="move-card-saved">Saved</span>}
      </div>
      {error && <p className="move-card-error">{error}</p>}
      <div className="move-card-row">
        <label>
          Moving from
          <input
            type="text"
            placeholder="e.g. London, UK"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            onBlur={(e) => {
              if ((family?.origin || "") !== e.target.value) save({ origin: e.target.value });
            }}
          />
        </label>
        <label>
          Destination
          <input
            type="text"
            placeholder="e.g. Dubai, UAE"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            onBlur={(e) => {
              if ((family?.destination || "") !== e.target.value) save({ destination: e.target.value });
            }}
          />
        </label>
      </div>
    </div>
  );
}
