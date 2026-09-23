import { useEffect, useRef, useState } from "react";

// Hand-drawn SVG/HTML charts for the Dashboard (no chart library needed).
// Rules followed throughout: one hue for single-series charts, thin marks
// with rounded data ends, hairline solid grid, values on hover AND in a
// "Table" view on every card, text never coloured by the data.

export const SERIES = "var(--in-series)";

// ---------------------------------------------------------------- card
export function ChartCard({ title, subtitle, table, wide, children, footnote }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={"in-card" + (wide ? " is-wide" : "")}>
      <header className="in-card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {table && (
          <button type="button" className="in-card-toggle" onClick={() => setAsTable((v) => !v)}>
            {asTable ? "Chart" : "Table"}
          </button>
        )}
      </header>
      <div className="in-card-body">{asTable && table ? <DataTable {...table} /> : children}</div>
      {footnote && <p className="in-card-foot">{footnote}</p>}
    </section>
  );
}

function DataTable({ columns, rows }) {
  return (
    <table className="in-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((v, j) => (
              <td key={j}>{v ?? "—"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Empty({ children = "Not enough data yet." }) {
  return <p className="in-empty">{children}</p>;
}

// Shared hover tooltip, positioned inside the chart's own box.
function useTip() {
  const [tip, setTip] = useState(null);
  const show = (e, text) => {
    const box = e.currentTarget.closest(".in-plot").getBoundingClientRect();
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text });
  };
  const node = tip ? (
    <div className="in-tip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  ) : null;
  return { show, hide: () => setTip(null), node };
}

// Draw at the real pixel width so axis text stays 11px on any card size.
function useWidth(fallback = 600) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ---------------------------------------------------------------- KPI
export function Kpi({ label, value, sub, tone }) {
  return (
    <div className={"in-kpi" + (tone ? " is-" + tone : "")}>
      <span className="in-kpi-label">{label}</span>
      <strong className="in-kpi-value">{value}</strong>
      {sub && <span className="in-kpi-sub">{sub}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- ranked bars
// Horizontal ranked list: label, bar, count and share. Best for categories.
export function BarList({ data, total, showShare = true, unit = "" }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map((d) => d.value), 1);
  const sum = total ?? data.reduce((t, d) => t + d.value, 0);
  return (
    <ul className="in-bars">
      {data.map((d) => (
        <li key={d.label} className={d.isOther ? "is-other" : ""} title={`${d.label}: ${d.value}`}>
          <span className="in-bars-label">{d.label}</span>
          <span className="in-bars-track">
            <span className="in-bars-fill" style={{ width: `${(d.value / max) * 100}%` }} />
          </span>
          <span className="in-bars-value">
            {d.value}
            {unit}
            {showShare && <em>{sum ? Math.round((d.value / sum) * 100) : 0}%</em>}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- columns
// Vertical columns on one axis, with an optional trend line in the SAME
// unit (e.g. a 3-month moving average) -- never a second axis.
export function Columns({ data, line, lineLabel, height = 190, unit = "" }) {
  const tip = useTip();
  const [ref, W] = useWidth();
  if (!data.some((d) => d.value)) return <Empty />;
  const H = height;
  const pad = { l: 30, r: 8, t: 12, b: 26 };
  const max = Math.max(...data.map((d) => d.value), ...(line || []), 1);
  const niceMax = Math.max(4, Math.ceil(max / 4) * 4);
  const ticks = [0, niceMax / 4, niceMax / 2, (niceMax * 3) / 4, niceMax];
  const bw = (W - pad.l - pad.r) / data.length;
  const barW = Math.min(24, bw * 0.6);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / niceMax);
  const cx = (i) => pad.l + bw * i + bw / 2;
  return (
    <div className="in-plot" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} className="in-svg" role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="in-gridline" />
            <text x={pad.l - 6} y={y(t) + 4} className="in-axis" textAnchor="end">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const h = y(0) - y(d.value);
          return (
            <g key={i}>
              <rect
                x={cx(i) - bw / 2}
                y={pad.t}
                width={bw}
                height={H - pad.t - pad.b}
                fill="transparent"
                onMouseMove={(e) => tip.show(e, `${d.fullLabel || d.label}: ${d.value}${unit}${line ? ` · ${lineLabel} ${line[i].toFixed(1)}` : ""}`)}
                onMouseLeave={tip.hide}
              />
              {d.value > 0 && (
                <g fill={SERIES} pointerEvents="none">
                  <rect x={cx(i) - barW / 2} y={y(d.value)} width={barW} height={h} rx={Math.min(4, h / 2)} />
                  <rect x={cx(i) - barW / 2} y={y(0) - Math.min(4, h / 2)} width={barW} height={Math.min(4, h / 2)} />
                </g>
              )}
              <text x={cx(i)} y={H - 8} className="in-axis" textAnchor="middle">
                {d.label}
              </text>
            </g>
          );
        })}
        {line && (
          <>
            <polyline
              points={line.map((v, i) => `${cx(i)},${y(v)}`).join(" ")}
              fill="none"
              className="in-line"
              pointerEvents="none"
            />
            <circle cx={cx(line.length - 1)} cy={y(line[line.length - 1])} r="4" className="in-line-dot" />
          </>
        )}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="in-baseline" />
      </svg>
      {line && (
        <div className="in-legend">
          <span><i className="in-key is-bar" /> New families</span>
          <span><i className="in-key is-line" /> {lineLabel}</span>
        </div>
      )}
      {tip.node}
    </div>
  );
}

// ---------------------------------------------------------------- funnel
export function Funnel({ steps }) {
  if (!steps[0]?.value) return <Empty />;
  const top = steps[0].value;
  return (
    <ol className="in-funnel">
      {steps.map((s, i) => {
        const conv = i === 0 ? null : steps[i - 1].value ? Math.round((s.value / steps[i - 1].value) * 100) : 0;
        return (
          <li key={s.label}>
            <span className="in-funnel-label">{s.label}</span>
            <span className="in-funnel-track">
              <span className="in-funnel-fill" style={{ width: `${Math.max(2, (s.value / top) * 100)}%` }} />
            </span>
            <span className="in-funnel-value">{s.value}</span>
            <span className={"in-funnel-conv" + (conv !== null && conv < 50 ? " is-low" : "")}>
              {conv === null ? "" : `${conv}% ↓`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- stacked bars
export function StackedBars({ rows, keys }) {
  const tip = useTip();
  if (!rows.length) return <Empty />;
  const max = Math.max(...rows.map((r) => keys.reduce((t, k) => t + (r[k.key] || 0), 0)), 1);
  return (
    <div className="in-plot">
      <div className="in-legend">
        {keys.map((k) => (
          <span key={k.key}>
            <i className="in-key" style={{ background: k.color }} /> {k.label}
          </span>
        ))}
      </div>
      <ul className="in-stack">
        {rows.map((r) => {
          const total = keys.reduce((t, k) => t + (r[k.key] || 0), 0);
          return (
            <li key={r.name}>
              <span className="in-bars-label" title={r.name}>{r.name}</span>
              <span className="in-stack-track">
                <span className="in-stack-bar" style={{ width: `${(total / max) * 100}%` }}>
                  {keys.map((k) =>
                    r[k.key] ? (
                      <span
                        key={k.key}
                        className="in-stack-seg"
                        style={{ flexGrow: r[k.key], background: k.color }}
                        onMouseMove={(e) => tip.show(e, `${r.name} — ${k.label}: ${r[k.key]}`)}
                        onMouseLeave={tip.hide}
                      />
                    ) : null
                  )}
                </span>
              </span>
              <span className="in-bars-value">{total}</span>
            </li>
          );
        })}
      </ul>
      {tip.node}
    </div>
  );
}

// ---------------------------------------------------------------- month heat strip
const HEAT = ["#f7ecf0", "#ecc9d6", "#dc9fb6", "#c46f93", "#a3426d", "#7a1743", "#530126"];
export function MonthHeat({ data }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  if (!max) return <Empty>No arrival dates entered yet.</Empty>;
  const step = (v) => (v ? Math.min(HEAT.length - 1, 1 + Math.floor((v / max) * (HEAT.length - 2))) : 0);
  return (
    <div>
      <div className="in-heat">
        {data.map((d) => (
          <div key={d.label} className="in-heat-cell" title={`${d.label}: ${d.value} families arriving`}>
            <span className="in-heat-box" style={{ background: HEAT[step(d.value)], color: step(d.value) >= 4 ? "#fff" : "var(--hh-ink)" }}>
              {d.value || ""}
            </span>
            <span className="in-heat-label">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="in-heat-scale">
        <span>Fewer</span>
        {HEAT.slice(1).map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- scatter
// Demand (times shortlisted) vs success (offer rate). Bubble size = number
// of applications. Quadrant lines at the medians turn it into a map.
export function Scatter({ points }) {
  const tip = useTip();
  const [ref, W] = useWidth();
  if (points.length < 2) return <Empty>Needs at least two schools with a decision back.</Empty>;
  const H = 300;
  const pad = { l: 40, r: 16, t: 14, b: 34 };
  const xMax = Math.max(...points.map((p) => p.x), 1) + 1;
  const x = (v) => pad.l + ((W - pad.l - pad.r) * v) / xMax;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / 100);
  const rMax = Math.max(...points.map((p) => p.r), 1);
  const rad = (v) => 5 + 9 * Math.sqrt(v / rMax);
  const mx = [...points].map((p) => p.x).sort((a, b) => a - b)[Math.floor(points.length / 2)];
  return (
    <div className="in-plot" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} className="in-svg" role="img">
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="in-gridline" />
            <text x={pad.l - 6} y={y(t) + 4} className="in-axis" textAnchor="end">
              {t}%
            </text>
          </g>
        ))}
        <line x1={x(mx)} x2={x(mx)} y1={pad.t} y2={H - pad.b} className="in-quad" />
        <line x1={pad.l} x2={W - pad.r} y1={y(50)} y2={y(50)} className="in-quad" />
        <text x={W - pad.r - 4} y={pad.t + 12} className="in-quad-label" textAnchor="end">Popular &amp; winning</text>
        <text x={pad.l + 6} y={pad.t + 12} className="in-quad-label">Hidden gems</text>
        <text x={W - pad.r - 4} y={H - pad.b - 6} className="in-quad-label" textAnchor="end">Popular but tough</text>
        <text x={pad.l + 6} y={H - pad.b - 6} className="in-quad-label">Rarely a fit</text>
        {points.map((p) => (
          <circle
            key={p.label}
            cx={x(p.x)}
            cy={y(p.y)}
            r={rad(p.r)}
            className="in-dot"
            onMouseMove={(e) => tip.show(e, `${p.label} — shortlisted ${p.x}×, offer rate ${p.y}%, ${p.r} applications`)}
            onMouseLeave={tip.hide}
          />
        ))}
        {[...points]
          .sort((a, b) => b.r - a.r)
          .slice(0, 5)
          .map((p) => (
            <text
              key={p.label + "-lbl"}
              x={x(p.x) + rad(p.r) + 5}
              y={y(p.y) + 4}
              className="in-dot-label"
              textAnchor={x(p.x) > W * 0.8 ? "end" : "start"}
              dx={x(p.x) > W * 0.8 ? -2 * (rad(p.r) + 5) : 0}
            >
              {p.label}
            </text>
          ))}
        <text x={(pad.l + W - pad.r) / 2} y={H - 6} className="in-axis" textAnchor="middle">
          Times shortlisted →
        </text>
      </svg>
      {tip.node}
    </div>
  );
}
