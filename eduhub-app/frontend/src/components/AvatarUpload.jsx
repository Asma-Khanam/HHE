import { useRef, useState } from "react";
import PersonAvatar, { findProfilePhoto } from "./PersonAvatar";
import { uploadDocument, deleteDocument } from "../lib/documents";
import {
  PROFILE_PHOTO_TYPE,
  ACCEPTED_IMAGE_EXTENSIONS,
  ACCEPTED_IMAGE_MESSAGE,
  isAcceptedImage,
} from "../data/documentTypes";

// "Let them add profile pics" — a photo per family member, sitting at the top
// of that person's own section.
//
// It rides on the machinery that already exists: the same private storage
// bucket, the same polymorphic documents table, the same single-file upload
// path that replaces whatever was there before. That's why this needed no
// schema change at all. What keeps it from turning into paperwork is that
// `profile_photo` isn't in either document-type list, so it never reaches a
// checklist, the outstanding list, or the Document Vault.
export default function AvatarUpload({ userId, ownerType, ownerId, name, fallback, isChild = false, documents, onDocumentsChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const photo = findProfilePhoto(documents);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isAcceptedImage(file)) {
      setError(ACCEPTED_IMAGE_MESSAGE);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const doc = await uploadDocument({
        userId,
        ownerType,
        ownerId,
        documentType: PROFILE_PHOTO_TYPE,
        file,
      });
      // Single-file slot: uploadDocument has already removed the old photo, so
      // the local list drops it too rather than showing two.
      onDocumentsChange([...(documents || []).filter((d) => d.document_type !== PROFILE_PHOTO_TYPE), doc]);
    } catch (err) {
      setError(err.message || "Couldn't upload that photo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!photo) return;
    setBusy(true);
    setError("");
    try {
      await deleteDocument(photo);
      onDocumentsChange((documents || []).filter((d) => d.id !== photo.id));
    } catch (err) {
      setError(err.message || "Couldn't remove that photo.");
    } finally {
      setBusy(false);
    }
  }

  // Uploads need a saved row to hang off — same rule the document checklists
  // follow, and the application saves itself within a couple of seconds of the
  // first thing being typed, so this is rarely seen for long.
  if (!ownerId) {
    return (
      <div className="avatar-upload">
        <PersonAvatar name={name} fallback={fallback} isChild={isChild} className="hh-avatar-lg" />
        <div className="avatar-upload-text">
          <span className="hh-hint-text">A photo can be added once the application has saved once.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="avatar-upload">
      <PersonAvatar doc={photo} name={name} fallback={fallback} isChild={isChild} className="hh-avatar-lg" />
      <div className="avatar-upload-text">
        <div className="avatar-upload-actions">
          <button type="button" className="hh-link-btn" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? "Uploading..." : photo ? "Change photo" : "Add a photo"}
          </button>
          {photo && !busy && (
            <button type="button" className="hh-link-btn avatar-upload-remove" onClick={handleRemove}>
              Remove
            </button>
          )}
        </div>
        {error ? (
          <span className="hh-error-text">{error}</span>
        ) : (
          <span className="hh-hint-text">Optional — it just makes the account easier to recognise.</span>
        )}
      </div>
      <input ref={inputRef} type="file" accept={ACCEPTED_IMAGE_EXTENSIONS} hidden onChange={handleFile} />
    </div>
  );
}
