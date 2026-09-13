import { useRef, useState } from "react";
import { displayNameForChild, expectedChildDocTypes, expectedParentDocTypes } from "../lib/completeness";
import { getSignedUrl, downloadDocument, cleanFileName, uploadDocument, deleteDocument } from "../lib/documents";
import { CHILD_DOCUMENT_TYPES, PARENT_DOCUMENT_TYPES, ACCEPTED_FILE_EXTENSIONS, ACCEPTED_FILES_MESSAGE, isAcceptedFile } from "../data/documentTypes";
import "./panels.css";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// DU-04 (September 2026 change request): "These labels should display
// alongside the file in the admin area, so we can see at a glance which
// reports we hold." Only school_reports ever carries these two columns —
// harmless to check on any document, since it's just blank otherwise.
function reportLabel(doc) {
  return [doc.report_term, doc.report_academic_year].filter(Boolean).join(", ");
}

// One row per document SLOT, not per upload — a slot with nothing in it is
// still worth seeing (that's the whole point of a vault a founder checks
// against). A slot only appears at all if it's actually expected right now
// (expectedChildDocTypes/expectedParentDocTypes — same rules the Dashboard's
// "Outstanding documents" list already uses, so a leaving certificate a
// family said doesn't exist yet, or SEN paperwork for a child with no SEN,
// isn't listed as missing here either) OR if something was uploaded against
// it anyway (an optional extra like an achievement certificate) — in which
// case it's shown, ticked, simply because it's there.
function buildDocumentRows({ parents, children, documentsByOwner, accountHolderRole }) {
  const rows = [];
  function addPerson(ownerType, id, personName, personTag, expectedTypes, allTypes) {
    const docs = id ? documentsByOwner[`${ownerType}:${id}`] || [] : [];
    const expectedKeys = new Set(expectedTypes.map((t) => t.key));
    const slots = allTypes.filter((t) => expectedKeys.has(t.key) || docs.some((d) => d.document_type === t.key));
    slots.forEach((docType) => {
      const matches = docs.filter((d) => d.document_type === docType.key);
      rows.push({
        key: `${ownerType}-${id}-${docType.key}`,
        ownerType,
        ownerId: id,
        docType,
        personName,
        personTag,
        docLabel: docType.label,
        uploaded: matches.length > 0,
        docs: matches,
      });
    });
  }
  (parents || []).forEach((p) => {
    const isHolder = p.relationship === accountHolderRole;
    addPerson(
      "parent",
      p.id,
      p.full_name || p.relationship,
      p.relationship,
      expectedParentDocTypes(p, isHolder),
      PARENT_DOCUMENT_TYPES
    );
  });
  (children || []).forEach((c, i) =>
    addPerson(
      "child",
      c.id,
      displayNameForChild(c, i),
      children.length > 1 ? `Child ${i + 1}` : "Child",
      expectedChildDocTypes(c),
      CHILD_DOCUMENT_TYPES
    )
  );
  return rows;
}

// One slot's worth of upload/replace/remove controls (addendum 35,
// September 2026 change request). A sibling of DocumentUploadRow.jsx on the
// family's own app — same accepted-file rules, same "replace by default /
// multiple appends" behaviour — just triggered by staff, on the family's
// behalf, so `userId` here is always the family's own account_user_id (see
// founders/src/lib/documents.js for why that matters).
function VaultRowControls({ row, userId, onChanged }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const docType = row.docType;
  const acceptExtensions = docType.acceptExtensions || ACCEPTED_FILE_EXTENSIONS;
  const acceptCheck = docType.acceptCheck || isAcceptedFile;
  const acceptMessage = docType.acceptMessage || ACCEPTED_FILES_MESSAGE;
  const maxSizeBytes = docType.maxSizeBytes;
  const maxSizeMessage = docType.maxSizeMessage || "That file is too large.";

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!userId) {
      setError("This family has no account holder on file yet — can't upload for them.");
      return;
    }
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
      await uploadDocument({
        userId,
        ownerType: row.ownerType,
        ownerId: row.ownerId,
        documentType: docType.key,
        file,
        multiple: !!docType.multiple,
      });
      onChanged();
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
      onChanged();
    } catch (err) {
      setError(err.message || "Couldn't remove file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="doc-row-controls">
      {row.docs.map((doc, idx) => (
        <span key={doc.id} className="doc-row-file-actions">
          <button
            type="button"
            className="panel-btn"
            onClick={async () => {
              try {
                window.open(await getSignedUrl(doc.file_url), "_blank", "noopener,noreferrer");
              } catch (err) {
                setError(err.message || "Couldn't open file.");
              }
            }}
            disabled={busy}
          >
            View
          </button>
          <button
            type="button"
            className="panel-btn"
            onClick={async () => {
              try {
                await downloadDocument(doc, cleanFileName(row.personName, row.docLabel, row.docs.length > 1 ? String(idx + 1) : undefined));
              } catch (err) {
                setError(err.message || "Couldn't download file.");
              }
            }}
            disabled={busy}
          >
            Download
          </button>
          <button type="button" className="panel-btn panel-btn-quiet" onClick={() => handleRemove(doc)} disabled={busy}>
            Remove
          </button>
        </span>
      ))}

      {(docType.multiple || row.docs.length === 0) && (
        <button type="button" className="panel-btn panel-btn-primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Uploading..." : row.docs.length ? "Add another" : "Upload"}
        </button>
      )}
      {!docType.multiple && row.docs.length > 0 && (
        <button type="button" className="panel-btn" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Uploading..." : "Replace"}
        </button>
      )}
      <input ref={inputRef} type="file" accept={acceptExtensions} hidden onChange={handleFile} />

      {error && <div className="hh-form-banner hh-form-banner-error doc-row-upload-error">{error}</div>}
    </div>
  );
}

export default function DocumentVaultPanel({ parents, familyChildren, documentsByOwner, accountHolderRole, userId, onChanged }) {
  const rows = buildDocumentRows({ parents, children: familyChildren, documentsByOwner, accountHolderRole });
  const uploadedCount = rows.filter((r) => r.uploaded).length;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          Document vault
          {rows.length > 0 && <span className="panel-count">{rows.length}</span>}
        </h2>
        {rows.length > 0 && (
          <span className="panel-hint">
            {uploadedCount} of {rows.length} uploaded
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="panel-hint">Nothing expected yet.</p>
      ) : (
        <ul className="panel-list">
          {rows.map((row) => (
            <li key={row.key} className="doc-row">
              <span
                className={"doc-row-status" + (row.uploaded ? " is-verified" : " is-missing")}
                title={row.uploaded ? "Uploaded" : "Not uploaded yet"}
              >
                {row.uploaded ? "✓" : "✕"}
              </span>

              <div className="doc-row-info">
                <div className="doc-row-label">{row.docLabel}</div>
                <div className="doc-row-tags">
                  <span className="doc-row-tag">{row.personName}</span>
                  <span className="doc-row-tag doc-row-tag-muted">{row.personTag}</span>
                </div>
                {row.uploaded ? (
                  row.docs.map((doc) => (
                    <div className="doc-row-meta" key={doc.id}>
                      {doc.original_filename}
                      {reportLabel(doc) ? ` · ${reportLabel(doc)}` : ""}
                      {doc.created_at ? ` · uploaded ${formatDate(doc.created_at)}` : ""}
                    </div>
                  ))
                ) : (
                  <div className="doc-row-meta">Not on file yet.</div>
                )}
              </div>

              <VaultRowControls row={row} userId={userId} onChanged={onChanged} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
