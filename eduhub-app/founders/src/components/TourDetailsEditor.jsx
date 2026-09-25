import { useState } from "react";
import AutosaveField from "./Autosave";
import { updateShortlistTour } from "../lib/staffData";

// "School Tour Details" -- what the family sees on their dashboard for a
// booked tour (founders' template, 25 Sept 2026). Every box saves itself.
// Empty boxes fall back to the school's own defaults (School record ->
// tour defaults), so "Use school defaults" only matters if you want to copy
// them in and then tweak them for this one family.

const FIELDS = [
  { key: "tour_arrival_note", label: "Arrival", placeholder: "Please arrive 10 minutes early" },
  { key: "tour_gate", label: "Entrance / gate", placeholder: "e.g. Gate 3, main reception", def: "default_tour_gate" },
  { key: "tour_building", label: "Building", placeholder: "e.g. Secondary block, Admissions office", def: "default_tour_building" },
  { key: "tour_parking", label: "Parking", placeholder: "e.g. Visitor parking opposite Gate 3", def: "default_tour_parking" },
  { key: "tour_maps_url", label: "Location (Google Maps link)", placeholder: "https://maps.app.goo.gl/…", def: "default_tour_maps_url" },
  { key: "tour_ask_for", label: "Contact (who they're meeting)", placeholder: "e.g. Sarah Jones, Admissions", def: "default_tour_ask_for" },
  {
    key: "tour_on_arrival",
    label: "On arrival",
    placeholder: "e.g. Tell reception you are here for a school tour with Admissions",
    def: "default_tour_on_arrival",
  },
  { key: "tour_bring", label: "What to bring", placeholder: "Passport/Emirates ID", def: "default_tour_bring" },
];

export default function TourDetailsEditor({ row, onUpdated }) {
  const [copying, setCopying] = useState(false);
  const school = row.school || {};
  const missingDefaults = FIELDS.filter((f) => f.def && school[f.def] && !row[f.key]);

  async function save(key, value) {
    const updated = await updateShortlistTour(row.id, { [key]: value });
    onUpdated(updated);
  }

  async function copyDefaults() {
    setCopying(true);
    try {
      const patch = Object.fromEntries(missingDefaults.map((f) => [f.key, school[f.def]]));
      onUpdated(await updateShortlistTour(row.id, patch));
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="svt-tour-details">
      <div className="svt-tour-details-head">
        <h3 className="svt-detail-heading">Tour details for the family</h3>
        {missingDefaults.length > 0 && (
          <button type="button" className="panel-btn panel-btn-quiet" onClick={copyDefaults} disabled={copying}>
            {copying ? "Copying…" : "Use school defaults"}
          </button>
        )}
      </div>
      <p className="svt-muted">
        Shown to the family on their Dashboard and Your schools page once a tour date is set. Blank boxes use the
        school&apos;s defaults (shown in grey) or are left off.
      </p>
      <div className="svt-tour-details-grid">
        {FIELDS.map((f) => (
          <AutosaveField
            key={f.key}
            label={f.label}
            value={row[f.key] || ""}
            placeholder={(f.def && school[f.def]) || f.placeholder}
            onSave={(v) => save(f.key, v)}
            multiline={f.key === "tour_on_arrival"}
            rows={2}
          />
        ))}
      </div>
    </div>
  );
}
