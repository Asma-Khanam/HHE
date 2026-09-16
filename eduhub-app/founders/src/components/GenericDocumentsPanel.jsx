import { useEffect, useRef, useState } from "react";
import { getSignedUrl, downloadDocument, uploadDocument, deleteDocument, listDocuments, slugifyLabel, labelFromSlug } from "../lib/documents";
import "./panels.css";
import "./GenericDocumentsPanel.css";

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Generic document upload, addendum 55 -- deliberately NOT the checklist
// pattern DocumentVaultPanel uses (one fixed slot per document_type,
// required/optional derived from the family's own answers). This is for
// documents that don't map to a slot at all: a tour schedule Heather built
// by hand for one family, an A-Level/GCSE options booklet for one school.
// Staff type their own short label per upload instead of picking from a
// fixed list, and uploading again never replaces a previous file (every
// upload here goes through uploadDocument's multiple:true path) since
// there's no single "current" version of a generic document the way there
// is for, say, a passport copy.
export default function GenericDocumentsPanel({ ownerType, ownerId, uploadUserId, title, uploadHint }) {
  const [docs, setDocs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const inputRef = useRef(null);

  function load() {
    return listDocuments(ownerType, ownerId)
      .then(setDocs)
      .catch((err) => setError(err.message || "Couldn't load documents."))
      .finally(() => setLoaded(true));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerType, ownerId]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!uploadUserId) {
      setError("Can't upload yet -- no account holder on file for this record.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const label = labelDraft.trim() || file.name.replace(/\.[^./]+$/, "");
      await uploadDocument({
        userId: uploadUserId,
        ownerType,
        ownerId,
        documentType: slugifyLabel(label),
        file,
        multiple: true,
      });
      setLabelDraft("");
      await load();
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
      await load();
    } catch (err) {
      setError(err.message || "Couldn't remove file.");
    } finally {
      setBusy(false);
    }
  }

  async function handleView(doc) {
    try {
      window.open(await getSignedUrl(doc.file_url), "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message || "Couldn't open file.");
    }
  }

  async function handleDownload(doc) {
    try {
      await downloadDocument(doc, labelFromSlug(doc.document_type).replace(/\s+/g, "_"));
    } catch (err) {
      setError(err.message || "Couldn't download file.");
    }
  }

  return (
    <div className="gdp">
      {title && <h3 className="gdp-heading">{title}</h3>}
      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {!loaded ? (
        <p className="family-detail-hint">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="family-detail-hint">No documents uploaded yet.</p>
      ) : (
        <ul className="gdp-list">
          {docs.map((doc) => (
            <li key={doc.id} className="gdp-row">
              <span className="gdp-row-label">
                {labelFromSlug(doc.document_type)}
                <span className="gdp-row-meta">
                  {doc.original_filename ? ` · ${doc.original_filename}` : ""} · {formatDateTime(doc.created_at)}
                </span>
              </span>
              <span className="gdp-row-actions">
                <button type="button" className="panel-btn" onClick={() => handleView(doc)} disabled={busy}>
                  View
                </button>
                <button type="button" className="panel-btn" onClick={() => handleDownload(doc)} disabled={busy}>
                  Download
                </button>
                <button type="button" className="panel-btn panel-btn-quiet" onClick={() => handleRemove(doc)} disabled={busy}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="gdp-upload">
        <input
          type="text"
          className="panel-input gdp-upload-label"
          placeholder="Label this document (optional)…"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          disabled={busy}
        />
        <button type="button" className="panel-btn panel-btn-primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Uploading…" : "Upload a document"}
        </button>
        <input ref={inputRef} type="file" style={{ display: "none" }} onChange={handleFile} />
      </div>
      {uploadHint && <p className="gdp-upload-hint">{uploadHint}</p>}
    </div>
  );
}
