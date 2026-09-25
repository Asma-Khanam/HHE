import { useState } from "react";
import { downloadTourIcs, tourDetails, tourDetailsText } from "../lib/tourDetails";
import "./TourDetailsCard.css";

// One booked school tour, laid out exactly as the founders asked
// (25 Sept 2026): School / Date / Time / Arrival / Entrance / Parking /
// Location, then Who to ask for, then What to bring. Lines with nothing to
// say are left out rather than shown blank.
export default function TourDetailsCard({ tour, showHeading = true }) {
  const d = tourDetails(tour);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(tourDetailsText(tour)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  const main = [
    ["School", d.school],
    ["Date", d.date],
    ["Time", d.time || "To be confirmed"],
    ["Arrival", d.arrival],
    ["Entrance / gate", d.entrance],
    ["Parking", d.parking],
  ].filter(([, v]) => v);

  return (
    <div className="tdc">
      {showHeading && <p className="tdc-title">School Tour Details</p>}
      <dl className="tdc-list">
        {main.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div>
          <dt>Location</dt>
          <dd>
            <a href={d.mapsUrl} target="_blank" rel="noopener noreferrer">
              {d.hasOwnMapsLink ? "Open in Google Maps" : d.address ? `${d.address} — open map` : "Open map"} ↗
            </a>
          </dd>
        </div>
      </dl>

      {(d.contact || d.onArrival) && (
        <>
          <p className="tdc-sub">Who to ask for</p>
          <dl className="tdc-list">
            {d.contact && (
              <div>
                <dt>Contact</dt>
                <dd>{d.contact}</dd>
              </div>
            )}
            {d.onArrival && (
              <div>
                <dt>On arrival</dt>
                <dd>{d.onArrival}</dd>
              </div>
            )}
          </dl>
        </>
      )}

      <p className="tdc-sub">What to bring</p>
      <p className="tdc-bring">{d.bring}</p>

      <div className="tdc-actions">
        <button type="button" className="tdc-btn tdc-btn-primary" onClick={() => downloadTourIcs(tour)}>
          Add to calendar
        </button>
        <a className="tdc-btn" href={d.mapsUrl} target="_blank" rel="noopener noreferrer">
          Directions
        </a>
        <button type="button" className="tdc-btn" onClick={copy}>
          {copied ? "Copied ✓" : "Copy details"}
        </button>
      </div>
    </div>
  );
}
