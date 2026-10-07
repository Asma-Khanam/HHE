import "./PackageMeter.css";

// One row of the package tracker: "Tours  ●●○  2 of 3 used". Filled dots are
// used (darker = already done), empty ones are still to come. Going over the
// allowance shows as "+N extra" rather than breaking the bar.
export default function PackageMeter({ label, used, done = 0, total }) {
  if (!(total > 0)) return null;
  const extra = Math.max(0, used - total);
  const left = Math.max(0, total - used);
  const dots = Array.from({ length: total }, (_, i) => (i < done ? "is-done" : i < used ? "is-booked" : ""));
  return (
    <div className="pkg-meter">
      <div className="pkg-meter-top">
        <span className="pkg-meter-label">{label}</span>
        <span className="pkg-meter-count">
          <strong>{Math.min(used, total)}</strong> of {total} used
          {extra > 0 && <span className="pkg-meter-extra"> · {extra} extra</span>}
        </span>
      </div>
      <div className="pkg-meter-dots" role="img" aria-label={`${used} of ${total} ${label.toLowerCase()} used`}>
        {dots.map((c, i) => (
          <span key={i} className={"pkg-dot " + c} />
        ))}
      </div>
      <div className="pkg-meter-sub">
        {used >= total ? `All ${total} included ${label.toLowerCase()} used` : `${left} left`}
        {done > 0 && used < total ? ` · ${done} done` : ""}
      </div>
    </div>
  );
}
