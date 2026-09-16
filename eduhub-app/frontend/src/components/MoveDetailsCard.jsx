import { useState } from "react";
import { updateMoveDetails } from "../lib/applicationData";
import "./MoveDetailsCard.css";

// Where the family is moving from and to, plus when they'll actually be in
// Dubai — all set here, once, by the family themselves. Founders just read
// family.origin/destination/dubai_available_from/until on their own Case
// bar; there's no separate sync, it's the same columns.
export default function MoveDetailsCard({ familyId, family, onFamilyChange }) {
  const [origin, setOrigin] = useState(family?.origin || "");
  const [destination, setDestination] = useState(family?.destination || "");
  const [availableFrom, setAvailableFrom] = useState(family?.dubai_available_from || "");
  const [availableUntil, setAvailableUntil] = useState(family?.dubai_available_until || "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save(patch) {
    setError("");
    try {
      const updated = await updateMoveDetails(familyId, {
        origin: patch.origin ?? origin,
        destination: patch.destination ?? destination,
        dubaiAvailableFrom: patch.dubaiAvailableFrom ?? availableFrom,
        dubaiAvailableUntil: patch.dubaiAvailableUntil ?? availableUntil,
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

      <div className="move-card-subhead">When will you be in Dubai?</div>
      <p className="move-card-hint">
        Helps us line up school tours and interviews with dates you're actually here.
      </p>
      <div className="move-card-row">
        <label>
          Available from
          <input
            type="date"
            value={availableFrom}
            onChange={(e) => setAvailableFrom(e.target.value)}
            onBlur={(e) => {
              if ((family?.dubai_available_from || "") !== e.target.value) {
                save({ dubaiAvailableFrom: e.target.value });
              }
            }}
          />
        </label>
        <label>
          Available until
          <input
            type="date"
            value={availableUntil}
            onChange={(e) => setAvailableUntil(e.target.value)}
            onBlur={(e) => {
              if ((family?.dubai_available_until || "") !== e.target.value) {
                save({ dubaiAvailableUntil: e.target.value });
              }
            }}
          />
        </label>
      </div>
    </div>
  );
}
