import { useRef, useState } from "react";
import { uploadDocument, deleteDocument, getSignedUrl, downloadDocument, cleanFileName } from "../lib/documents";
import { ACCEPTED_FILE_EXTENSIONS, ACCEPTED_FILES_MESSAGE, isAcceptedFile } from "../data/documentTypes";

// One row per checklist slot.
//
// Single-file slots (the default) show a label, the current file (if any)
// with View/Remove, or an Upload button if the slot is still empty.
//
// Multi-file slots (docType.multiple) list every file already uploaded
// under this slot, each with its own View/Remove, plus an "Add another"
// button that's always available — this is how school reports and a
// 2-sided Emirates ID work now.
export default function DocumentUploadRow({
  userId,
  ownerType,
  ownerId,
  docType,
  existing,
  existingList,
  onChange,
  onAdd,
  onRemove,
  missing = false,
  fieldKey,
  personLabel,
}) {
  const multiple = !!docType.multiple;
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isAcceptedFile(file)) {
      setError(ACCEPTED_FILES_MESSAGE);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const doc = await uploadDocument({ userId, ownerType, ownerId, documentType: docType.key, file, multiple });
      if (multiple) onAdd(doc);
      else onChange(doc);
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(doc) {
    setBusy(true);
    setError("");
    try {
      await deleteDocument(doc);
      if (multiple) onRemove(doc);
      else onChange(null);
    } catch (err) {
      setError(err.message || "Couldn't remove file.");
    } finally {
      setBusy(false);
    }
  }

  async function handleView(doc) {
    if (!doc?.file_url) return;
    setError("");
    try {
      const url = await getSignedUrl(doc.file_url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message || "Couldn't open file.");
    }
  }

  const files = multiple ? existingList || [] : existing ? [existing] : [];

  // A predictable "Person_Document type[_2]" name for the actual saved
  // file, no matter what the family's device happened to name it on
  // upload — see lib/documents.js's cleanFileName/downloadDocument. Only
  // multi-file slots get a numeric suffix, and only once there's more than
  // one file to tell apart.
  async function handleDownload(doc, index) {
    setError("");
    try {
      const suffix = multiple && files.length > 1 ? String(index + 1) : undefined;
      await downloadDocument(doc, cleanFileName(personLabel, docType.label, suffix));
    } catch (err) {
      setError(err.message || "Couldn't download file.");
    }
  }

  return (
    <div className={"doc-row" + (missing ? " doc-row-missing" : "")} data-field-key={fieldKey}>
      <div className="doc-row-info">
        <span className="doc-row-label">{docType.label}</span>
        {docType.hint && <span className="doc-row-hint">{docType.hint}</span>}
        {missing && !error && <span className="doc-row-pending">Still needed — upload it once you have it.</span>}
        {error && <span className="doc-row-error">{error}</span>}
      </div>

      <div className="doc-row-action doc-row-action-stack">
        {files.map((doc, index) => (
          <div className="doc-row-file" key={doc.id}>
            <span className="doc-row-filename" title={doc.original_filename}>
              {doc.original_filename}
            </span>
            <button type="button" className="doc-row-btn" onClick={() => handleView(doc)} disabled={busy}>
              View
            </button>
            <button type="button" className="doc-row-btn" onClick={() => handleDownload(doc, index)} disabled={busy}>
              Download
            </button>
            <button type="button" className="doc-row-btn doc-row-btn-ghost" onClick={() => handleRemove(doc)} disabled={busy}>
              Remove
            </button>
          </div>
        ))}

        {(multiple || files.length === 0) && (
          <button
            type="button"
            className="doc-row-btn doc-row-btn-upload"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? "Uploading..." : files.length ? "Add another" : "Upload"}
          </button>
        )}
        <input ref={inputRef} type="file" accept={ACCEPTED_FILE_EXTENSIONS} hidden onChange={handleFile} />
      </div>
    </div>
  );
}
