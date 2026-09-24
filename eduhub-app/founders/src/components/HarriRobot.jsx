// Harri's face -- a small hand-drawn SVG robot. Moods:
//   idle     gentle bob, blinks every few seconds, antenna glows softly
//   thinking eyes dart side to side, antenna blinks fast
//   talking  mouth moves
//   happy    smiling eyes and mouth (after a good answer / on hover)
export default function HarriRobot({ mood = "idle", size = 64, waving = false }) {
  return (
    <svg
      className={`harri-bot is-${mood}${waving ? " is-waving" : ""}`}
      viewBox="0 0 120 130"
      width={size}
      height={(size * 130) / 120}
      role="img"
      aria-label="Harri the robot"
    >
      {/* antenna */}
      <line x1="60" y1="8" x2="60" y2="26" stroke="#b89a5a" strokeWidth="4" strokeLinecap="round" />
      <circle className="harri-bulb" cx="60" cy="8" r="7" fill="#f4c96b" />

      {/* ears */}
      <rect x="6" y="46" width="12" height="26" rx="6" fill="#b89a5a" />
      <rect x="102" y="46" width="12" height="26" rx="6" fill="#b89a5a" />

      {/* head */}
      <rect x="14" y="24" width="92" height="72" rx="24" fill="#7a1743" />
      <rect x="14" y="24" width="92" height="72" rx="24" fill="none" stroke="#530126" strokeWidth="3" />
      {/* visor */}
      <rect x="26" y="38" width="68" height="44" rx="16" fill="#fbf7f4" />

      {/* eyes */}
      <g className="harri-eyes">
        <g className="harri-eye harri-eye-l">
          <ellipse cx="46" cy="56" rx="7" ry="8" fill="#2a1119" />
          <circle cx="48.5" cy="53" r="2.2" fill="#fff" />
        </g>
        <g className="harri-eye harri-eye-r">
          <ellipse cx="74" cy="56" rx="7" ry="8" fill="#2a1119" />
          <circle cx="76.5" cy="53" r="2.2" fill="#fff" />
        </g>
      </g>
      {/* happy eyes */}
      <g className="harri-happy-eyes" fill="none" stroke="#2a1119" strokeWidth="4" strokeLinecap="round">
        <path d="M39 58 Q46 49 53 58" />
        <path d="M67 58 Q74 49 81 58" />
      </g>

      {/* cheeks */}
      <ellipse cx="35" cy="68" rx="5" ry="3" fill="#f2a7bd" opacity="0.8" />
      <ellipse cx="85" cy="68" rx="5" ry="3" fill="#f2a7bd" opacity="0.8" />

      {/* mouth */}
      <rect className="harri-mouth" x="52" y="68" width="16" height="5" rx="2.5" fill="#530126" />
      <path className="harri-smile" d="M50 68 Q60 78 70 68" fill="none" stroke="#530126" strokeWidth="4" strokeLinecap="round" />

      {/* body */}
      <rect x="34" y="98" width="52" height="28" rx="12" fill="#530126" />
      <circle cx="60" cy="112" r="6" fill="#f4c96b" className="harri-heart" />
      {/* arms */}
      <rect x="20" y="100" width="12" height="22" rx="6" fill="#7a1743" />
      <g className="harri-arm-r">
        <rect x="88" y="100" width="12" height="22" rx="6" fill="#7a1743" />
      </g>
    </svg>
  );
}
