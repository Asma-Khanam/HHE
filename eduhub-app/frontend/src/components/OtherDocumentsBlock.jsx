import { useRef, useState } from "react";
import { uploadDocument, deleteDocument, getSignedUrl, downloadDocument, cleanFileName, slugifyLabel, labelFromSlug } from "../lib/documents";

// Founder feedback (Sept 2026): "let parents add extra documents per
// student — GCSE results, CAT4, certificates, and an 'other' option with
// their own label." The first three are fixed checklist slots (see
// documentTypes.js); this is that fourth "other" case — a document that
// doesn't fit any fixed slot, so the family types their own short label
// instead of picking from a list. Renders as one more block inside
// DocumentChecklist, working off the SAME documents/onDocumentsChange the
// checklist already has rather than a separate fetch, so it stays in sync
// with everything else on the page (autosave, the Dashboard's "documents on
// file" count, etc.) for free.
export default function OtherDocumentsBlock({ userId, ownerType, ownerId, documents, onDocumentsChange, knownKeys, personLabel }) {
  const [labelDraft, setLabelDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const otherDocs = (documents || []).filter((d) => !knownKeys.includes(d.document_type));

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ownerId) {
      setError("Save the application once first, then come back here to upload documents.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const label = labelDraft.trim() || file.name.replace(/\.[^./]+$/, "");
      const doc = await uploadDocument({ userId, ownerType, ownerId, documentType: slugifyLabel(label), file, multiple: true });
      setLabelDraft("");
      onDocumentsChange([...(documents || []), doc]);
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
      onDocumentsChange((documents || []).filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(err.message || "Couldn't remove that file.");
    } finally {
      setBusy(false);
    }
  }

  async function handleView(doc) {
    try {
      window.open(await getSignedUrl(doc.file_url), "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message || "Couldn't open that file.");
    }
  }

  async function handleDownload(doc) {
    try {
      await downloadDocument(doc, cleanFileName(personLabel, labelFromSlug(doc.document_type)));
    } catch (err) {
      setError(err.message || "Couldn't download that file.");
    }
  }

  return (
    <div className="doc-row doc-row-other">
      <div className="doc-row-info">
        <span className="doc-row-label">Other</span>
        <span className="doc-row-hint">Anything else — give it your own label.</span>
        {error && <span className="doc-row-error">{error}</span>}
      </div>
      <div className="doc-row-action doc-row-action-stack">
        {otherDocs.map((doc) => (
          <div className="doc-row-file" key={doc.id}>
            <span className="doc-row-filename" title={doc.original_filename}>
              {labelFromSlug(doc.document_type)} — {doc.original_filename}
            </span>
            <span className="doc-row-file-actions">
              <button type="button" className="doc-row-btn" onClick={() => handleView(doc)} disabled={busy}>
                View
              </button>
              <button type="button" className="doc-row-btn" onClick={() => handleDownload(doc)} disabled={busy}>
                Download
              </button>
              <button type="button" className="doc-row-btn doc-row-btn-ghost" onClick={() => handleRemove(doc)} disabled={busy}>
                Remove
              </button>
            </span>
          </div>
        ))}
        <input
          type="text"
          className="panel-input doc-row-other-label"
          placeholder="Label this document (e.g. Reference letter)"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          disabled={busy}
        />
        <button type="button" className="doc-row-btn doc-row-btn-upload" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Uploading..." : "Upload"}
        </button>
        <input ref={inputRef} type="file" hidden onChange={handleFile} />
      </div>
    </div>
  );
}
