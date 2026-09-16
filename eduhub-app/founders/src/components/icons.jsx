// ---------------------------------------------------------------------------
// Small heading icons (September 2026 change request — "make it easier to
// scan"). Plain inline SVGs rather than a new icon-library dependency; each
// is a generic 16x16 line glyph (briefcase/pin/wallet/people/checkbox), not
// tied to any brand, so a plain <svg> is simplest and keeps the bundle the
// same size. currentColor so they pick up the heading's own color
// automatically (burgundy on every card heading in this app).
// ---------------------------------------------------------------------------
const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "family-detail-card-icon",
};

export function CaseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  );
}

export function AddressIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function BudgetIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M16 14.5h2" />
    </svg>
  );
}

export function HouseholdIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="9" cy="8" r="3" />
      <path d="M2.5 19a6.5 6.5 0 0 1 13 0" />
      <circle cx="17.5" cy="8.5" r="2.5" />
      <path d="M15.5 12.2c2.6.5 4 2.2 4 6.8" />
    </svg>
  );
}

export function TasksIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}

export function TourIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-2 6-6 2 2-6 6-2Z" />
    </svg>
  );
}

export function ApplicationIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  );
}
