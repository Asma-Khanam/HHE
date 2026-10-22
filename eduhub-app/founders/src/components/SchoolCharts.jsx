import { useState } from "react";

// Extra hand-drawn charts for the Schools analytics (no chart library).

const PALETTE = ["#7a1743", "#b89a5a", "#d98aa5", "#3a8f85", "#5b6b8c", "#d9c7a0", "#c9bcc1"];

// ---------------------------------------------------------------- donut
export function Donut({ data, unit = "" }) {
  const [hover, setHover] = useState(null);
  const total = data.reduce((t, d) => t + d.value, 0);
  if (!total) return <p className="in-empty">Not enough data yet.</p>;
  const size = 180;
  const c = size / 2;
  const R = 82;
  const r = 54;
  let a = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const a0 = a;
    const a1 = a + (sweep >= Math.PI * 2 - 1e-6 ? Math.PI * 2 - 0.0001 : sweep);
    a += sweep;
    const pt = (rad, ang) => [c + rad * Math.cos(ang), c + rad * Math.sin(ang)];
    const [x0, y0] = pt(R, a0);
    const [x1, y1] = pt(R, a1);
    const [x2, y2] = pt(r, a1);
    const [x3, y3] = pt(r, a0);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const path = `M${x0} ${y0}A${R} ${R} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${large} 0 ${x3} ${y3}Z`;
    return { ...d, path, color: d.isOther ? PALETTE[6] : PALETTE[i % 6] };
  });
  const shown = hover !== null ? arcs[hover] : null;
  return (
    <div className="sc-donut">
      <svg viewBox={`0 0 ${size} ${size}`} role="img">
        {arcs.map((s, i) => (
          <path
            key={s.label}
            d={s.path}
            fill={s.color}
            className={"sc-slice" + (hover === i ? " is-on" : "")}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        <text x={c} y={c - 2} textAnchor="middle" className="sc-donut-num">
          {shown ? shown.value : total}
        </text>
        <text x={c} y={c + 16} textAnchor="middle" className="sc-donut-sub">
          {shown ? (shown.label.length > 16 ? shown.label.slice(0, 15) + "…" : shown.label) : unit || "total"}
        </text>
      </svg>
      <ul className="sc-legend">
        {arcs.map((s, i) => (
          <li key={s.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={hover === i ? "is-on" : ""}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{s.value}</b>
            <em>{Math.round((s.value / total) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- area trend
// A smooth filled line over months. `future` marks how many months at the end
// are still to come (drawn dashed and lighter).
export function AreaTrend({ data, future = 0 }) {
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = 210;
  const pad = { l: 30, r: 14, t: 16, b: 26 };
  const max = Math.max(4, ...data.map((d) => d.value));
  const top = Math.ceil(max / 4) * 4;
  const x = (i) => pad.l + ((W - pad.l - pad.r) * i) / Math.max(1, data.length - 1);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const pts = data.map((d, i) => [x(i), y(d.value)]);
  const curve = (arr) => {
    if (arr.length < 2) return "";
    let d = `M${arr[0][0]} ${arr[0][1]}`;
    for (let i = 0; i < arr.length - 1; i++) {
      const p0 = arr[i - 1] || arr[i];
      const p1 = arr[i];
      const p2 = arr[i + 1];
      const p3 = arr[i + 2] || p2;
      d += `C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
    }
    return d;
  };
  const line = curve(pts);
  const split = data.length - 1 - future; // index of the last month that has already happened
  const pastLine = curve(pts.slice(0, split + 1));
  const futureLine = future ? curve(pts.slice(split)) : "";
  const area = `${line}L${pts[pts.length - 1][0]} ${y(0)}L${pts[0][0]} ${y(0)}Z`;
  const ticks = [0, 1, 2, 3, 4].map((t) => Math.round((top / 4) * t));
  return (
    <div className="sc-trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        <defs>
          <linearGradient id="sc-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7a1743" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#7a1743" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="in-gridline" />
            <text x={pad.l - 6} y={y(t) + 4} className="in-axis" textAnchor="end">{t}</text>
          </g>
        ))}
        <path d={area} fill="url(#sc-area-grad)" />
        <path d={pastLine} className="sc-trend-line" />
        {futureLine && <path d={futureLine} className="sc-trend-line is-future" />}
        {data.map((d, i) => (
          <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={x(i) - 18} y={pad.t} width="36" height={H - pad.t - pad.b} fill="transparent" />
            <circle cx={x(i)} cy={y(d.value)} r={hover === i ? 6 : i === split ? 5 : 3.5} className={"sc-trend-dot" + (i > split ? " is-future" : "")} />
            <text x={x(i)} y={H - 7} textAnchor="middle" className="in-axis">{d.label}</text>
            {hover === i && (
              <g>
                <rect x={Math.min(W - 112, Math.max(2, x(i) - 56))} y={y(d.value) - 40} width="112" height="28" rx="6" className="sc-trend-tip" />
                <text x={Math.min(W - 56, Math.max(58, x(i)))} y={y(d.value) - 22} textAnchor="middle" className="sc-trend-tip-text">
                  {d.fullLabel}: {d.value}
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
