import { useNavigate } from "react-router-dom";
import { IconAlertCircle, IconCheckCircle, IconChevronRight } from "./icons";
import "./StillOutstandingCard.css";

// Documents-only companion to WhatsLeftCard — same missing-document items
// getMissingItems() already produces (so this can never disagree with the
// readiness percentage or the Submit gate), just shown as its own list with
// who each one belongs to, matching the reference "Still outstanding"
// panel. Clicking one opens that person's card AND scrolls straight to the
// exact upload row (via fieldKey, the same mechanism a failed Submit uses).
const MAX_SHOWN = 8;

export default function StillOutstandingCard({ items }) {
  const navigate = useNavigate();

  if (!items.length) {
    return (
      <div className="still-outstanding-card still-outstanding-card-done">
        <IconCheckCircle size={20} />
        <div>
          <h3>No documents outstanding</h3>
          <p>Every required document has been uploaded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="still-outstanding-card">
      <div className="still-outstanding-header">
        <IconAlertCircle size={18} />
        <h3>
          Still outstanding <span className="still-outstanding-count">({items.length})</span>
        </h3>
      </div>
      <ul className="still-outstanding-list">
        {items.slice(0, MAX_SHOWN).map((item) => (
          <li key={item.fieldKey}>
            <button
              type="button"
              onClick={() => navigate("/app/form", { state: { stepKey: item.stepKey, fieldKey: item.fieldKey } })}
            >
              <span className="still-outstanding-text">
                <span className="still-outstanding-label">{item.docLabel}</span>
                <span className="still-outstanding-tag">
                  {item.personName} · {item.personTag}
                </span>
              </span>
              <IconChevronRight size={16} />
            </button>
          </li>
        ))}
      </ul>
      {items.length > MAX_SHOWN && (
        <p className="still-outstanding-more">+ {items.length - MAX_SHOWN} more — the rest will show as you complete these.</p>
      )}
    </div>
  );
}
