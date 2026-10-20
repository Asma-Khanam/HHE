import { useEffect, useRef, useState } from "react";
import "./Viz.css";

// Chart pieces shared by the Dashboard and the Accounting analytics.
// Plain SVG/HTML, no chart library. Rules: thin marks, a 2-3px gap between
// touching fills, hairline solid grid, values on hover and in each card's
// Table view, text never takes the data colour.
//
// Colours: three categorical hues validated together (colour-blind safe,
// >= 3:1 on white): rose, blue, green. Everything else is a single burgundy
// ramp, light to dark, so the page stays calm and on brand.

export const CAT = { rose: "#b23a6a", blue: "#3a7bd5", green: "#1fa37f" };
export const RAMP = ["#530126", "#7a1743", "#a8446f", "#c97c9c", "#e2b3c6", "#efd3de"];
const OTHER = "#cfc3c8";
const GOLD = "#b89a5a";

export function compact(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(Math.abs(v) >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(Math.round(v));
}

// Keep the biggest n, fold the rest into "Other" (never more colours than the ramp has).
export function topN(list, n = 5) {
  const clean = list.filter((d) => !d.isOther);
  const other = list.filter((d) => d.isOther).reduce((t, d) => t + d.value, 0);
  const head = clean.slice(0, n);
  const tail = clean.slice(n).reduce((t, d) => t + d.value, 0) + other;
  return tail ? [...head, { label: "Other", value: tail, isOther: true }] : head;
}

function Empty({ children = "Not enough data yet." }) {
  return <p className="vz-empty">{children}</p>;
}

function useWidth(fallback = 600) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function useUid() {
  const r = useRef(null);
  if (r.current === null) r.current = "vz" + Math.random().toString(36).slice(2, 8);
  return r.current;
}

function niceMax(max) {
  if (max <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  const m = [1, 2, 4, 6, 8, 10].find((s) => n <= s) || 10;
  return m * pow;
}

// Smooth curve through the points (Catmull-Rom turned into beziers).
function smooth(pts, floor) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = 0.17;
    // Keep each curve between its two points so sparse data never swings past them.
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const c1y = Math.min(floor, Math.max(lo, Math.min(hi, p1[1] + (p2[1] - p0[1]) * t)));
    const c2y = Math.min(floor, Math.max(lo, Math.min(hi, p2[1] - (p3[1] - p1[1]) * t)));
    d += ` C${p1[0] + (p2[0] - p0[0]) * t},${c1y} ${p2[0] - (p3[0] - p1[0]) * t},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// ------------------------------------------------------------------ trend
// One or more smooth lines over time, with an optional soft area under any
// series, a hover crosshair and a tooltip listing every series.
export function TrendChart({ labels, series, height = 230, format = (v) => v }) {
  const [ref, W] = useWidth();
  const [hi, setHi] = useState(null);
  const uid = useUid();
  const n = labels.length;
  const all = series.flatMap((s) => s.values);
  if (!n || !all.some(Boolean)) return <Empty />;
  const pad = { l: 42, r: 16, t: 14, b: 28 };
  const nm = niceMax(Math.max(...all, 1));
  const iw = W - pad.l - pad.r;
  const x = (i) => pad.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (v) => pad.t + (height - pad.t - pad.b) * (1 - Math.min(v, nm) / nm);
  const base = y(0);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 60))));
  const idxAt = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.round(((e.clientX - box.left) / iw) * (n - 1))));
  };
  return (
    <div className="vz-plot" ref={ref}>
      <svg viewBox={`0 0 ${W} ${height}`} height={height} className="vz-svg" role="img">
        <defs>
          {series.map((s, si) => (
            <linearGradient key={si} id={`${uid}-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>
        {[0, nm / 2, nm].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="vz-grid" />
            <text x={pad.l - 8} y={y(t) + 4} className="vz-axis" textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={height - 8} className="vz-axis" textAnchor="middle">
              {l}
            </text>
          ) : null
        )}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => [x(i), y(v)]);
          const line = smooth(pts, base);
          return (
            <g key={si}>
              {s.area && n > 1 && (
                <path d={`${line} L${x(n - 1)},${base} L${x(0)},${base} Z`} fill={`url(#${uid}-${si})`} />
              )}
              <path d={line} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={x(n - 1)} cy={y(s.values[n - 1])} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />
            </g>
          );
        })}
        {hi !== null && (
          <g pointerEvents="none">
            <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={base} className="vz-cross" />
            {series.map((s, si) => (
              <circle key={si} cx={x(hi)} cy={y(s.values[hi])} r="5" fill={s.color} stroke="#fff" strokeWidth="2" />
            ))}
          </g>
        )}
        <rect x={pad.l} y={pad.t} width={iw} height={base - pad.t} fill="transparent" onMouseMove={(e) => setHi(idxAt(e))} onMouseLeave={() => setHi(null)} />
      </svg>
      {hi !== null && (
        <div className="vz-tip" style={{ left: Math.min(Math.max(x(hi), 80), W - 80), top: 4 }}>
          <b>{labels[hi]}</b>
          {series.map((s) => (
            <span key={s.label}>
              <i style={{ background: s.color }} />
              {s.label}: {format(s.values[hi])}
            </span>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="vz-legend">
          {series.map((s) => (
            <span key={s.label}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ donut
export function Donut({ data, size = 176, thickness = 22, center, format = (v) => v }) {
  const [hover, setHover] = useState(null);
  const total = data.reduce((t, d) => t + d.value, 0);
  if (!total) return <Empty />;
  const r = (size - thickness - 6) / 2;
  const C = 2 * Math.PI * r;
  const gap = data.length > 1 ? 3 : 0;
  let acc = 0;
  const segs = data.map((d, i) => {
    const len = (d.value / total) * C;
    const s = { d, i, len, off: acc, color: d.color || (d.isOther ? OTHER : RAMP[i % RAMP.length]) };
    acc += len;
    return s;
  });
  const active = hover !== null ? data[hover] : null;
  return (
    <div className="vz-donut">
      <div className="vz-donut-plot" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img">
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f4eef1" strokeWidth={thickness} />
            {segs.map((s) => (
              <circle
                key={s.i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === s.i ? thickness + 5 : thickness}
                strokeDasharray={`${Math.max(s.len - gap, 0.5)} ${C}`}
                strokeDashoffset={-s.off}
                style={{ transition: "stroke-width 120ms ease", cursor: "pointer" }}
                onMouseEnter={() => setHover(s.i)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </g>
        </svg>
        <div className="vz-donut-center">
          <b className={String(active ? format(active.value) : center?.big ?? format(total)).length > 6 ? "is-long" : ""}>
            {active ? format(active.value) : center?.big ?? format(total)}
          </b>
          <small>{active ? active.label : center?.small || "total"}</small>
        </div>
      </div>
      <ul className="vz-donut-legend">
        {segs.map((s) => (
          <li key={s.i} onMouseEnter={() => setHover(s.i)} onMouseLeave={() => setHover(null)} className={hover === s.i ? "is-hot" : ""}>
            <i style={{ background: s.color }} />
            <span>{s.d.label}</span>
            <b>{format(s.d.value)}</b>
            <em>{Math.round((s.d.value / total) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ ring gauge
export function Ring({ pct, size = 140, thickness = 12, light, children }) {
  const uid = useUid();
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className="vz-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${Math.round(p)} percent`}>
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={light ? "#e6cf94" : "#7a1743"} />
            <stop offset="100%" stopColor={light ? "#fff" : GOLD} />
          </linearGradient>
        </defs>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={light ? "rgba(255,255,255,0.16)" : "#f1e8ec"} strokeWidth={thickness} />
          {p > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={`url(#${uid})`}
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={`${(p / 100) * C} ${C}`}
            />
          )}
        </g>
      </svg>
      <div className={"vz-ring-center" + (light ? " is-light" : "")}>{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ sparkline
export function Spark({ values, w = 120, h = 34, light }) {
  if (!values || values.length < 2 || !values.some(Boolean)) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [3 + ((w - 6) * i) / (values.length - 1), h - 4 - (h - 8) * (v / max)]);
  const d = smooth(pts, h);
  const last = pts[pts.length - 1];
  const c = light ? "#e6cf94" : RAMP[1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="vz-spark" aria-hidden="true">
      <path d={d} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill={c} stroke={light ? "#530126" : "#fff"} strokeWidth="2" />
    </svg>
  );
}

// ------------------------------------------------------------------ tapered funnel
export function TaperFunnel({ steps }) {
  if (!steps[0]?.value) return <Empty />;
  const top = steps[0].value;
  return (
    <ol className="vz-funnel">
      {steps.map((s, i) => {
        const next = steps[i + 1];
        const w = Math.max(14, (s.value / top) * 100);
        const nw = next ? Math.max(10, (next.value / top) * 100) : w * 0.82;
        const cut = ((w - nw) / 2 / w) * 100;
        const conv = i === 0 ? null : steps[i - 1].value ? Math.round((s.value / steps[i - 1].value) * 100) : 0;
        const dark = i <= 2;
        return (
          <li key={s.label}>
            <span className="vz-funnel-label">{s.label}</span>
            <span className="vz-funnel-stage">
              <span
                className="vz-funnel-shape"
                style={{
                  width: `${w}%`,
                  background: RAMP[Math.min(i, RAMP.length - 1)],
                  clipPath: `polygon(0 0, 100% 0, ${100 - cut}% 100%, ${cut}% 100%)`,
                  color: dark ? "#fff" : "var(--hh-ink)",
                }}
              >
                {s.value}
              </span>
            </span>
            <span className={"vz-funnel-conv" + (conv !== null && conv < 50 ? " is-low" : "")}>{conv === null ? "" : `${conv}%`}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ treemap
function layout(items, x, y, w, h, out) {
  if (items.length === 1) {
    out.push({ ...items[0], x, y, w, h });
    return;
  }
  const total = items.reduce((t, i) => t + i.value, 0);
  let acc = 0;
  let k = 0;
  for (; k < items.length - 1; k++) {
    acc += items[k].value;
    if (acc >= total / 2) break;
  }
  k = Math.min(k, items.length - 2);
  const a = items.slice(0, k + 1);
  const b = items.slice(k + 1);
  const sa = a.reduce((t, i) => t + i.value, 0) / total;
  if (w >= h) {
    layout(a, x, y, w * sa, h, out);
    layout(b, x + w * sa, y, w * (1 - sa), h, out);
  } else {
    layout(a, x, y, w, h * sa, out);
    layout(b, x, y + h * sa, w, h * (1 - sa), out);
  }
}

export function Treemap({ data, height = 230 }) {
  const [ref, W] = useWidth();
  const items = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  if (!items.length) return <Empty />;
  const tiles = [];
  layout(items, 0, 0, W, height, tiles);
  const total = items.reduce((t, d) => t + d.value, 0);
  return (
    <div className="vz-treemap" ref={ref} style={{ height }}>
      {tiles.map((t, i) => {
        const rank = Math.min(i, RAMP.length - 1);
        const fits = t.w > 84 && t.h > 46;
        return (
          <div
            key={t.label}
            className="vz-tile"
            style={{ left: t.x, top: t.y, width: t.w, height: t.h, background: t.isOther ? OTHER : RAMP[rank], color: rank <= 2 && !t.isOther ? "#fff" : "var(--hh-ink)" }}
            title={`${t.label}: ${t.value} (${Math.round((t.value / total) * 100)}%)`}
          >
            {fits && (
              <>
                <span>{t.label}</span>
                <b>{t.value}</b>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ lollipop list
export function Lollipop({ data, unit = "", format = (v) => v }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="vz-lolli">
      {data.map((d) => (
        <li key={d.label} title={`${d.label}: ${format(d.value)}${unit}`}>
          <span className="vz-lolli-label">{d.label}</span>
          <span className="vz-lolli-track">
            <i className="vz-lolli-stem" style={{ width: `${(d.value / max) * 100}%`, background: d.isOther ? OTHER : RAMP[1] }} />
            <i className="vz-lolli-dot" style={{ left: `${(d.value / max) * 100}%`, background: d.isOther ? OTHER : RAMP[1] }} />
          </span>
          <b>
            {format(d.value)}
            {unit}
          </b>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ segmented ribbon
export function SegBar({ segments, format = (v) => v }) {
  const total = segments.reduce((t, s) => t + s.value, 0);
  if (!total) return <Empty />;
  return (
    <div className="vz-seg">
      <div className="vz-seg-bar">
        {segments.map((s, i) =>
          s.value > 0 ? (
            <i key={s.label} title={`${s.label}: ${format(s.value)}`} style={{ flexGrow: s.value, background: s.color || RAMP[Math.min(i, RAMP.length - 1)] }} />
          ) : null
        )}
      </div>
      <ul className="vz-seg-legend">
        {segments.map((s, i) => (
          <li key={s.label}>
            <i style={{ background: s.color || RAMP[Math.min(i, RAMP.length - 1)] }} />
            <span>{s.label}</span>
            <b>{format(s.value)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A small stat: label, big number, a line of context.
export function Stat({ label, value, sub, light }) {
  return (
    <div className={"vz-stat" + (light ? " is-light" : "")}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}
