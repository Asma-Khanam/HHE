import { useNavigate } from "react-router-dom";
import { IconCheckCircle, IconAlertCircle, IconChevronRight } from "./icons";
import "./WhatsLeftCard.css";

// The other half of the draft/submit split — Save draft means a family can
// leave required things unfinished, so Overview needs to actually say what's
// still outstanding rather than just showing a percentage. Clicking an item
// jumps straight to the step it lives on.
const MAX_SHOWN = 8;

export default function WhatsLeftCard({ items }) {
  const navigate = useNavigate();

  if (!items.length) {
    return (
      <div className="whats-left-card whats-left-card-done">
        <IconCheckCircle size={22} />
        <div>
          <h3>Everything required is filled in</h3>
          <p>Head to the Application tab to hit "Submit application" whenever you're ready.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="whats-left-card">
      <div className="whats-left-header">
        <IconAlertCircle size={18} />
        <h3>
          What's left <span className="whats-left-count">({items.length})</span>
        </h3>
      </div>
      <p className="whats-left-note">These are only required before you submit — your draft is already saved.</p>
      <ul className="whats-left-list">
        {items.slice(0, MAX_SHOWN).map((item, i) => (
          <li key={i}>
            <button type="button" onClick={() => navigate("/app/form", { state: { stepKey: item.stepKey } })}>
              <span>{item.label}</span>
              <IconChevronRight size={16} />
            </button>
          </li>
        ))}
      </ul>
      {items.length > MAX_SHOWN && (
        <p className="whats-left-more">+ {items.length - MAX_SHOWN} more — the rest will show as you complete these.</p>
      )}
    </div>
  );
}
