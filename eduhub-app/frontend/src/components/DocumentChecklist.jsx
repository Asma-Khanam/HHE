import DocumentUploadRow from "./DocumentUploadRow";
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
  function handleChange(docKey, doc) {
    const next = (documents || []).filter((d) => d.document_type !== docKey);
    if (doc) next.push(doc);
    onDocumentsChange(next);
  }

  // Multi-file slot: every upload/removal just adds to or trims the list.
  function handleAdd(doc) {
    onDocumentsChange([...(documents || []), doc]);
  }
  function handleRemoveOne(doc) {
    onDocumentsChange((documents || []).filter((d) => d.id !== doc.id));
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
          onChange={(doc) => handleChange(docType.key, doc)}
          onAdd={handleAdd}
          onRemove={handleRemoveOne}
          missing={missingDocKeys?.has(docType.key)}
          fieldKey={fieldKeyPrefix ? `${fieldKeyPrefix}-${docType.key}` : undefined}
          personLabel={personLabel}
        />
      ))}
    </div>
  );
}
