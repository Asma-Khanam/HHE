import "./StatTile.css";

// A radial gauge — a ring filled to the percentage, with the number in the
// middle. This is still a single-value stat (one family's own completeness
// per section), just drawn as a KPI-card gauge instead of a flat bar, since
// that's the more dashboard-like read the user asked for.
export default function StatTile({
  label,
  percent,
  detail,
  hero = false,
  bare = false,
  onDark = false,
  accent = "burgundy",
  icon = null,
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const size = hero ? 132 : 92;
  const strokeWidth = hero ? 12 : 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const center = size / 2;

  const classNames =
    "stat-tile" +
    (hero ? " stat-tile-hero" : "") +
    (bare ? " stat-tile-bare" : "") +
    (onDark ? " stat-tile-on-dark" : "") +
    (accent === "gold" ? " stat-tile-accent-gold" : "");

  return (
    <div className={classNames}>
      <div className="stat-tile-gauge" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle className="stat-tile-track" cx={center} cy={center} r={radius} strokeWidth={strokeWidth} fill="none" />
          <circle
            className="stat-tile-fill"
            cx={center}
            cy={center}
            r={radius}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        </svg>
        <span className="stat-tile-value">{clamped}%</span>
      </div>
      <div className="stat-tile-text">
        <span className="stat-tile-label">
          {icon && (
            <span className="stat-tile-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          {label}
        </span>
        {detail && <span className="stat-tile-detail">{detail}</span>}
      </div>
    </div>
  );
}
