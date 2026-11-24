import "./SchoolFacts.css";

// "Still to fill in" at the top of a school: every empty field on the record, so nobody has to
// open Edit and scroll the whole form to find the gaps. Each chip opens the exact field.
export default function SchoolGapsBox({ gaps, onGo }) {
  const { forSuggestions, other } = gaps;
  const total = forSuggestions.length + other.length;
  if (!total) {
    return <div className="sgap is-done">✓ Everything on this school is filled in and checked</div>;
  }
  const chips = (items, important) =>
    items.map((g) => (
      <button key={g.label} type="button" className={"sgap-chip" + (important ? " is-key" : "")} onClick={() => onGo(g)}>
        {g.label}
      </button>
    ));
  return (
    <section className="sgap" aria-label="Still to fill in">
      <div className="sgap-head">
        <h2>Still to fill in</h2>
        <span className="sgap-count">{total}</span>
      </div>
      {forSuggestions.length > 0 && (
        <div className="sgap-row">
          <span className="sgap-label">Used for suggestions</span>
          <div className="sgap-chips">{chips(forSuggestions, true)}</div>
        </div>
      )}
      {other.length > 0 && (
        <div className="sgap-row">
          <span className="sgap-label">Other details</span>
          <div className="sgap-chips">{chips(other, false)}</div>
        </div>
      )}
    </section>
  );
}
