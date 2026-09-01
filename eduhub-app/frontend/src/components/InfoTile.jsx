import "./InfoTile.css";

// A plain fact card — icon, one value, one caption. No gauge, no percentage.
// Overview uses this for anything that isn't the single headline readiness
// number, on purpose: a page with one gauge can never look "out of sync"
// with itself the way stacking several separately-computed percentages did.
export default function InfoTile({ icon, label, value, detail, accent = "burgundy" }) {
  return (
    <div className={"info-tile" + (accent === "gold" ? " info-tile-accent-gold" : "")}>
      <div className="info-tile-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="info-tile-text">
        <span className="info-tile-label">{label}</span>
        <span className="info-tile-value">{value}</span>
        {detail && <span className="info-tile-detail">{detail}</span>}
      </div>
    </div>
  );
}
