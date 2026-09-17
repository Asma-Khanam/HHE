import DocumentUploadRow from "./DocumentUploadRow";
import OtherDocumentsBlock from "./OtherDocumentsBlock";
import { uploadDocument } from "../lib/documents";
import { PROFILE_PHOTO_TYPE } from "../data/documentTypes";
import "./DocumentChecklist.css";

// One titled checklist for one owner (the parent, or a specific child).
// Uploads happen immediately — they aren't part of the "Save application"
// batch, so they can't be lost by navigating away before saving.
export default function DocumentChecklist({
  title,
  userId,
  ownerType,
  ownerId,
  docTypes,
  documents,
  onDocumentsChange,
  missingDocKeys,
  fieldKeyPrefix,
  personLabel,
  showOther,
}) {
  if (!ownerId) {
    return (
      <div className="doc-checklist doc-checklist-disabled">
        {title && <h4>{title}</h4>}
        <p className="hh-hint-text">Save the application once first, then come back here to upload documents.</p>
      </div>
    );
  }

  const byType = Object.fromEntries((documents || []).map((d) => [d.document_type, d]));

  function groupedByType(key) {
    return (documents || []).filter((d) => d.document_type === key);
  }

  // Single-file slot: re-uploading replaces whatever was there.
  //
  // DU-01 (September 2026 change request): uploading a passport photo also
  // sets it as the child's profile picture, replacing whichever one was
  // there before. This uploads the SAME file a second time, as its own
  // independent copy under the profile_photo slot, rather than pointing two
  // document rows at one storage object — that keeps "keep the original
  // file intact" literally true (the passport document is never touched)
  // and means removing or replacing either one later can never break the
  // other by deleting a file the other still points at.
  async function handleChange(docKey, doc, file) {
    let next = (documents || []).filter((d) => d.document_type !== docKey);
    if (doc) next.push(doc);

    if (doc && docKey === "passport_photo" && file) {
      try {
        const profileDoc = await uploadDocument({ userId, ownerType, ownerId, documentType: PROFILE_PHOTO_TYPE, file });
        next = next.filter((d) => d.document_type !== PROFILE_PHOTO_TYPE);
        next.push(profileDoc);
      } catch (err) {
        console.warn("Couldn't set the profile picture from the passport photo:", err?.message || err);
      }
    }

    onDocumentsChange(next);
  }

  // Multi-file slot: every upload/removal just adds to or trims the list.
  function handleAdd(doc) {
    onDocumentsChange([...(documents || []), doc]);
  }
  function handleRemoveOne(doc) {
    onDocumentsChange((documents || []).filter((d) => d.id !== doc.id));
  }

  // DU-04 — a label edit (term / academic year) replaces just that one
  // document row in place; nothing else about the list changes.
  function handleLabelChange(updatedDoc) {
    onDocumentsChange((documents || []).map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
  }

  return (
    <div className="doc-checklist">
      {title && <h4>{title}</h4>}
      {docTypes.map((docType) => (
        <DocumentUploadRow
          key={docType.key}
          userId={userId}
          ownerType={ownerType}
          ownerId={ownerId}
          docType={docType}
          existing={byType[docType.key]}
          existingList={docType.multiple ? groupedByType(docType.key) : undefined}
          onChange={(doc, file) => handleChange(docType.key, doc, file)}
          onAdd={handleAdd}
          onRemove={handleRemoveOne}
          onLabelChange={handleLabelChange}
          missing={missingDocKeys?.has(docType.key)}
          fieldKey={fieldKeyPrefix ? `${fieldKeyPrefix}-${docType.key}` : undefined}
          personLabel={personLabel}
        />
      ))}
      {showOther && (
        <OtherDocumentsBlock
          userId={userId}
          ownerType={ownerType}
          ownerId={ownerId}
          documents={documents}
          onDocumentsChange={onDocumentsChange}
          knownKeys={docTypes.map((t) => t.key)}
          personLabel={personLabel}
        />
      )}
    </div>
  );
}
