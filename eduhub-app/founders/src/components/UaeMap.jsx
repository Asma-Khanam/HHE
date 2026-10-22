import { UAE_VIEWBOX, UAE_EMIRATE_SHAPES } from "../data/uaeShapes";
import { EMIRATES } from "../data/emirates";

// The UAE drawn as its seven emirates. Each emirate is shaded by the chosen
// number (darker = more) and carries a count bubble. The northern emirates are
// tiny at full size, so they get their own zoomed panel beside the big map.
// Click an emirate (or its bubble) to select it; click again to clear.

const LIGHT = [246, 236, 240];
const DARK = [122, 23, 67];
const mix = (a, b, t) => Math.round(a + (b - a) * t);
function shade(t) {
  return `rgb(${mix(LIGHT[0], DARK[0], t)}, ${mix(LIGHT[1], DARK[1], t)}, ${mix(LIGHT[2], DARK[2], t)})`;
}

const NORTH = ["Ras Al Khaimah", "Umm Al Quwain", "Ajman", "Sharjah", "Dubai", "Fujairah"];
// Where each name sits next to its bubble in the zoomed panel: [dx, dy, anchor]
const NAME_POS = {
  Dubai: [0, 36, "middle"],
  Sharjah: [20, 5, "start"],
  Ajman: [0, 31, "middle"],
  "Umm Al Quwain": [0, -22, "middle"],
  "Ras Al Khaimah": [-20, 5, "end"],
  Fujairah: [0, 32, "middle"],
};

function Shapes({ values, max, selected, onSelect, only }) {
  // Draw the selected emirate last so its gold outline is never covered by a neighbour.
  const names = [...(only || EMIRATES)].sort((a, b) => (a === selected) - (b === selected));
  return names.map((name) => {
    const shape = UAE_EMIRATE_SHAPES[name];
    const v = values[name] || 0;
    const t = v ? Math.max(0.14, v / (max || 1)) : 0;
    return (
      <path
        key={name}
        d={shape.d}
        className={"uae-shape" + (selected === name ? " is-selected" : "") + (v ? "" : " is-empty")}
        style={{ fill: v ? shade(t) : undefined }}
        onClick={() => onSelect(selected === name ? null : name)}
      >
        <title>{`${name}: ${v}`}</title>
      </path>
    );
  });
}

function Bubble({ name, value, selected, onSelect, r, showName, big }) {
  const shape = UAE_EMIRATE_SHAPES[name];
  const [dx, dy, anchor] = NAME_POS[name] || [0, 0, "middle"];
  return (
    <g className={"uae-bubble" + (selected === name ? " is-selected" : "")} onClick={() => onSelect(selected === name ? null : name)}>
      <circle cx={shape.cx} cy={shape.cy} r={r} />
      <text x={shape.cx} y={shape.cy + (big ? 7 : 5)} textAnchor="middle" className={big ? "uae-bubble-num is-big" : "uae-bubble-num"}>
        {value}
      </text>
      {showName && (
        <text x={shape.cx + dx} y={shape.cy + dy} textAnchor={anchor} className="uae-name">
          {name}
        </text>
      )}
    </g>
  );
}

export default function UaeMap({ values, selected, onSelect }) {
  const max = Math.max(1, ...EMIRATES.map((e) => values[e] || 0));
  return (
    <div className={"uae-maps" + (selected ? " has-selection" : "")}>
      <div className="uae-map-main">
        <svg viewBox={UAE_VIEWBOX} role="img" aria-label="Map of the UAE by emirate">
          <Shapes values={values} max={max} selected={selected} onSelect={onSelect} />
          <rect x="690" y="0" width="310" height="345" rx="10" className="uae-zoombox" />
          <Bubble name="Abu Dhabi" value={values["Abu Dhabi"] || 0} selected={selected} onSelect={onSelect} r={38} big />
          <text x={UAE_EMIRATE_SHAPES["Abu Dhabi"].cx} y={UAE_EMIRATE_SHAPES["Abu Dhabi"].cy + 62} textAnchor="middle" className="uae-name is-big">
            Abu Dhabi
          </text>
        </svg>
      </div>
      <div className="uae-map-zoom">
        <span className="uae-zoom-title">Northern Emirates</span>
        <svg viewBox="700 0 300 345" role="img" aria-label="Zoomed map of the northern emirates">
          <Shapes values={values} max={max} selected={selected} onSelect={onSelect} only={NORTH} />
          {NORTH.map((n) => (
            <Bubble key={n} name={n} value={values[n] || 0} selected={selected} onSelect={onSelect} r={14} showName />
          ))}
        </svg>
      </div>
    </div>
  );
}
