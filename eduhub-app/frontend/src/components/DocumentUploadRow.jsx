import { useRef, useState } from "react";
import { uploadDocument, deleteDocument, getSignedUrl, downloadDocument, cleanFileName, updateDocumentLabels } from "../lib/documents";
import { ACCEPTED_FILE_EXTENSIONS, ACCEPTED_FILES_MESSAGE, isAcceptedFile } from "../data/documentTypes";

// DU-04 (September 2026 change request) — the two labels shown next to each
// school report so staff can tell them apart "at a glance" without opening
// every file. A closed list rather than free text for both, so the labels
// stay consistent across every family's uploads. Academic year runs from
// this year back six, newest first — school reports are always about a
// PAST year, unlike the forward-looking ACADEMIC_YEARS list elsewhere in
// the app (which is about a still-to-come year of entry).
export const REPORT_TERM_OPTIONS = ["Autumn", "Spring", "Summer", "Full year"];
export const REPORT_ACADEMIC_YEAR_OPTIONS = (() => {
  const startYear = new Date().getFullYear();
  const years = [];
  for (let y = startYear; y >= startYear - 6; y--) years.push(`${y} to ${y + 1}`);
  return years;
})();

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
  onLabelChange,
  missing = false,
  fieldKey,
  personLabel,
}) {
  const multiple = !!docType.multiple;
  // DU-04 — only the school reports slot gets the term/academic-year labels;
  // everything else keeps the same plain file row it always had.
  const labeled = docType.key === "school_reports";
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [labelBusyId, setLabelBusyId] = useState(null);

  // SEN-03 (September 2026 change request): a docType can override the
  // accepted file types and/or set its own max size (this slot is the only
  // one that needs either right now) — everything else keeps behaving
  // exactly as before, since these all default to the same values used
  // everywhere else in the checklist.
  const acceptExtensions = docType.acceptExtensions || ACCEPTED_FILE_EXTENSIONS;
  const acceptCheck = docType.acceptCheck || isAcceptedFile;
  const acceptMessage = docType.acceptMessage || ACCEPTED_FILES_MESSAGE;
  const maxSizeBytes = docType.maxSizeBytes;
  const maxSizeMessage = docType.maxSizeMessage || "That file is too large.";

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!acceptCheck(file)) {
      setError(acceptMessage);
      return;
    }
    if (maxSizeBytes && file.size > maxSizeBytes) {
      setError(maxSizeMessage);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const doc = await uploadDocument({ userId, ownerType, ownerId, documentType: docType.key, file, multiple });
      // DU-01 (September 2026 change request): the raw File is passed
      // alongside the saved doc row so the passport-photo slot can also use
      // it to set the profile picture (see DocumentChecklist.jsx) — nothing
      // else currently reads this second argument.
      if (multiple) onAdd(doc, file);
      else onChange(doc, file);
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  // DU-04 — updates one file's term or academic year label in place. Kept
  // per-field (not a combined save) so picking one doesn't have to wait on
  // the other also being set.
  async function handleLabelChange(doc, field, value) {
    setLabelBusyId(doc.id);
    setError("");
    try {
      const updated = await updateDocumentLabels(doc.id, { [field]: value || null });
      onLabelChange?.(updated);
    } catch (err) {
      setError(err.message || "Couldn't save that label.");
    } finally {
      setLabelBusyId(null);
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

  // Visual "have they uploaded this or not" reminder (September 2026,
  // Heather via WhatsApp): a green tick once at least one file is sitting
  // in this slot, a red cross while it's still empty -- purely a glance-
  // able reminder, not a validation state, so it shows on every slot
  // (including ones nothing ever marked "required").
  const uploaded = files.length > 0;

  return (
    <div className={"doc-row" + (missing ? " doc-row-missing" : "") + (uploaded ? " doc-row-uploaded" : "")} data-field-key={fieldKey}>
      <span
        className={"doc-row-status" + (uploaded ? " is-uploaded" : " is-missing")}
        aria-label={uploaded ? "Uploaded" : "Not uploaded yet"}
        title={uploaded ? "Uploaded" : "Not uploaded yet"}
      >
        {uploaded ? "✓" : "✕"}
      </span>
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
            {labeled && (
              <span className="doc-row-file-labels">
                <select
                  value={doc.report_term || ""}
                  onChange={(e) => handleLabelChange(doc, "report_term", e.target.value)}
                  disabled={labelBusyId === doc.id}
                  aria-label="Term"
                >
                  <option value="">Term</option>
                  {REPORT_TERM_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <select
                  value={doc.report_academic_year || ""}
                  onChange={(e) => handleLabelChange(doc, "report_academic_year", e.target.value)}
                  disabled={labelBusyId === doc.id}
                  aria-label="Academic year"
                >
                  <option value="">Academic year</option>
                  {REPORT_ACADEMIC_YEAR_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </span>
            )}
            {/* Grouped so View/Download/Remove wrap onto their own line as one
                unit on a narrow screen, rather than each button finding its
                own ragged spot. */}
            <span className="doc-row-file-actions">
              <button type="button" className="doc-row-btn" onClick={() => handleView(doc)} disabled={busy}>
                View
              </button>
              <button type="button" className="doc-row-btn" onClick={() => handleDownload(doc, index)} disabled={busy}>
                Download
              </button>
              <button type="button" className="doc-row-btn doc-row-btn-ghost" onClick={() => handleRemove(doc)} disabled={busy}>
                Remove
              </button>
            </span>
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
        <input ref={inputRef} type="file" accept={acceptExtensions} hidden onChange={handleFile} />
      </div>
    </div>
  );
}
