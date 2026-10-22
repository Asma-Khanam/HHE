import { initialsFor } from "./PersonAvatar";

// A teammate's circle: their photo, or their initials on gold when they have none.
export default function StaffAvatar({ person, size = 40, ring = false, className = "" }) {
  const name = person?.full_name || person?.name || person?.email || "";
  return (
    <span
      className={"staff-avatar" + (ring ? " has-ring" : "") + (className ? ` ${className}` : "")}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) }}
      title={name}
    >
      {person?.avatar_url ? <img src={person.avatar_url} alt={name} loading="lazy" /> : initialsFor(name, "?")}
    </span>
  );
}
