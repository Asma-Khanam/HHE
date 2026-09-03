import { useEffect, useState } from "react";
import { getSignedUrl } from "../lib/documents";

// Two initials for a full name, one for a single name — the fallback whenever
// there's no photo, which is most of the time.
export function initialsFor(name, fallback) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return (fallback || "?").charAt(0).toUpperCase();
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Finds a person's profile photo among the documents already loaded for them —
// no extra fetch, since fetchApplicationData pulls every document per owner
// anyway.
export function findProfilePhoto(documents) {
  return (documents || []).find((d) => d.document_type === "profile_photo") || null;
}

// A family member's avatar: their photo if they've added one, their initials
// if not. The bucket is private, so a photo needs a short-lived signed URL
// rather than a plain link — that's fetched here, per avatar, and the initials
// show until it arrives (and stay if it fails, rather than leaving a hole).
export default function PersonAvatar({ doc, name, fallback, isChild = false, className = "" }) {
  const path = doc?.file_url || null;
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl(null);
      return undefined;
    }
    getSignedUrl(path)
      .then((signed) => alive && setUrl(signed))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [path]);

  const classes = ["hh-avatar", isChild ? "is-child" : "", url ? "has-photo" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      {url ? <img src={url} alt="" /> : initialsFor(name, fallback)}
    </span>
  );
}
