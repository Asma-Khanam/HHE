import "./ChildrenBarChart.css";

// A simple, single-hue comparison of each child's overall readiness — only
// shown once there's more than one child, since a bar chart of one bar isn't
// telling anyone anything a stat tile doesn't already say. This is one
// measure (readiness %) across children, not a multi-series comparison, so
// per the dataviz sequential/magnitude rule it stays one hue rather than a
// different color per child.
export default function ChildrenBarChart({ bars }) {
  return (
    <div className="children-bar-chart">
      <div className="children-bar-chart-plot">
        {bars.map((bar, i) => (
          <div className="children-bar-chart-col" key={bar.key ?? i} title={`${bar.name}: ${bar.percent}% ready`}>
            <span className="children-bar-chart-value">{bar.percent}%</span>
            <div className="children-bar-chart-track">
              <div className="children-bar-chart-fill" style={{ height: `${Math.max(0, Math.min(100, bar.percent))}%` }} />
            </div>
            <span className="children-bar-chart-label">{bar.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
