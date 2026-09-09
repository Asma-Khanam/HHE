import "./KeyDatesCard.css";

const KIND_LABEL = {
  deadline: "Deadline",
  reminder: "Reminder",
  team_event: "Event",
  other: "Date",
};

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Read-only, on purpose — these are dates a founder chose to share (the
// "Show on the family's dashboard" checkbox on their own calendar), not
// something a family can add to or change from here. Nothing here is ever
// past events or cancelled ones; those would just be noise on a dashboard
// that's about what's coming up.
export default function KeyDatesCard({ events }) {
  const upcoming = (events || []).filter((e) => e.status !== "cancelled" && e.status !== "done");

  return (
    <div className="key-dates-card">
      <div className="key-dates-head">
        <h3>Key dates</h3>
      </div>

      {upcoming.length === 0 ? (
        <p className="key-dates-hint">Nothing on the calendar for you yet.</p>
      ) : (
        <ul className="key-dates-list">
          {upcoming.map((e) => (
            <li key={e.id} className="key-dates-row">
              <div className="key-dates-date">{formatDate(e.starts_at)}</div>
              <div className="key-dates-row-text">
                <div className="key-dates-title">{e.title}</div>
                <div className="key-dates-tags">
                  <span className="key-dates-tag">{KIND_LABEL[e.kind] || "Date"}</span>
                </div>
                {e.notes && <div className="key-dates-notes">{e.notes}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
