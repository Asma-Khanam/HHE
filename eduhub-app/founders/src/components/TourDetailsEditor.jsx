import { useState } from "react";
import { Link } from "react-router-dom";
import AutosaveField from "./Autosave";
import { updateShortlistTour } from "../lib/staffData";

// "School Tour Details" -- what the family sees for a booked tour.
// Founders (25 Sept 2026): these are the school's own details, so they come
// from the school record by default. A line is only changed here when it's
// different for this one family (a different gate, say), and "Use the
// school's" puts it back.

const FIELDS = [
  { key: "tour_arrival_note", label: "Arrival", standard: "Please arrive 10 minutes early" },
  { key: "tour_gate", label: "Entrance / gate", def: "default_tour_gate", placeholder: "e.g. Gate 3, main reception" },
  { key: "tour_building", label: "Building", def: "default_tour_building", placeholder: "e.g. Secondary block, Admissions office" },
  { key: "tour_parking", label: "Parking", def: "default_tour_parking", placeholder: "e.g. Visitor parking opposite Gate 3" },
  { key: "tour_maps_url", label: "Location", def: "default_tour_maps_url", placeholder: "https://maps.app.goo.gl/…", link: true },
  { key: "tour_ask_for", label: "Contact", def: "default_tour_ask_for", placeholder: "e.g. Sarah Jones, Admissions" },
  {
    key: "tour_on_arrival",
    label: "On arrival",
    def: "default_tour_on_arrival",
    placeholder: "e.g. Tell reception you are here for a school tour with Admissions",
    multiline: true,
  },
  { key: "tour_bring", label: "What to bring", def: "default_tour_bring", standard: "Passport/Emirates ID" },
];

function resolve(field, row, school) {
  const own = (row[field.key] || "").trim();
  if (own) return { value: own, source: "family" };
  const fromSchool = field.def ? (school[field.def] || "").trim() : "";
  if (fromSchool) return { value: fromSchool, source: "school" };
  if (field.standard) return { value: field.standard, source: "standard" };
  return { value: "", source: "none" };
}

const SOURCE_LABEL = {
  family: "Just for this family",
  school: "From school record",
  standard: "Standard",
  none: "Not set",
};

export default function TourDetailsEditor({ row, onUpdated, readOnly = false }) {
  const [editing, setEditing] = useState(null);
  const school = row.school || {};
  const schoolName = school.name || "this school";
  const schoolHasDetails = FIELDS.some((f) => f.def && (school[f.def] || "").trim());
  const hasTour = !!(row.tour_date || row.tour2_date);

  async function save(key, value) {
    const updated = await updateShortlistTour(row.id, { [key]: value });
    onUpdated(updated);
  }

  return (
    <div className="svt-tour-details">
      <div className="svt-tour-details-head">
        <h3 className="svt-detail-heading">What the family sees for the tour</h3>
        {row.school_id && (
          <Link className="panel-btn panel-btn-quiet" to={`/staff/schools/${row.school_id}`}>
            Edit {schoolName}&apos;s tour details
          </Link>
        )}
      </div>
      <p className="svt-muted">
        {hasTour
          ? "On their Dashboard and Your schools page, and in the calendar invite."
          : "Shows on their Dashboard once a tour date is booked."}{" "}
        Comes from the school record, so you only need to change a line if it&apos;s different for this family.
      </p>
      {!schoolHasDetails && (
        <p className="svt-tour-details-warn">
          {schoolName}&apos;s school record has no tour details yet. Add them there once and every family touring{" "}
          {schoolName} gets them.
        </p>
      )}

      <dl className="svt-td-list">
        {FIELDS.map((f) => {
          const r = resolve(f, row, school);
          const isEditing = editing === f.key;
          return (
            <div key={f.key} className={"svt-td-row is-" + r.source}>
              <dt>{f.label}</dt>
              <dd>
                {isEditing ? (
                  <div className="svt-td-edit">
                    <AutosaveField
                      bare
                      value={row[f.key] || ""}
                      placeholder={r.value || f.placeholder || ""}
                      multiline={!!f.multiline}
                      rows={2}
                      onSave={(v) => save(f.key, v)}
                    />
                    <button type="button" className="svt-td-link" onClick={() => setEditing(null)}>
                      Done
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="svt-td-value">
                      {r.value ? (
                        f.link && /^https?:/i.test(r.value) ? (
                          <a href={r.value} target="_blank" rel="noreferrer">
                            Open in Google Maps
                          </a>
                        ) : (
                          r.value
                        )
                      ) : (
                        <span className="svt-td-empty">Left off</span>
                      )}
                    </span>
                    <span className={"svt-td-source is-" + r.source}>{SOURCE_LABEL[r.source]}</span>
                    {!readOnly && (
                      <span className="svt-td-actions">
                        <button type="button" className="svt-td-link" onClick={() => setEditing(f.key)}>
                          {r.source === "family" ? "Edit" : "Change for this family"}
                        </button>
                        {r.source === "family" && (
                          <button type="button" className="svt-td-link" onClick={() => save(f.key, null)}>
                            Use the school&apos;s
                          </button>
                        )}
                      </span>
                    )}
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
