import { useState } from "react";
import { downloadDocument, cleanFileName, getSignedUrl } from "../lib/documents";
import { CHILD_DOCUMENT_TYPES, PARENT_DOCUMENT_TYPES } from "../data/documentTypes";
import { IconDocument, IconCheckCircle } from "./icons";
import "./DocumentVaultCard.css";

// Every document that's actually been uploaded, across the whole family,
// flattened into one list — styled after the "Document Vault" panel from
// the reference screenshots (a clean row per file: label, who it belongs
// to, a green "on file" status, View/Download). Deliberately UPLOADED
// documents only — what's still missing already has its own card on the
// Dashboard, so this one stays single-purpose: "here's
// everything you've successfully submitted, come back and grab a copy any
// time." No search box, no staff actions — just this family's own files.
function buildRecords({ mother, father, children, documentsByOwner, displayNameForChild }) {
  const records = [];

  function addPerson(ownerType, ownerId, personName, personTag, docTypes) {
    const docs = ownerId ? documentsByOwner[`${ownerType}:${ownerId}`] || [] : [];
    docTypes.forEach((docType) => {
      const matches = docs.filter((d) => d.document_type === docType.key);
      matches.forEach((doc, idx) => {
        records.push({
          key: `${ownerType}-${ownerId}-${docType.key}-${doc.id}`,
          personName,
          personTag,
          docLabel: docType.label,
          doc,
          suffix: matches.length > 1 ? String(idx + 1) : undefined,
        });
      });
    });
  }

  addPerson("parent", mother?.id, mother?.full_name || "Mother", "Mother", PARENT_DOCUMENT_TYPES);
  addPerson("parent", father?.id, father?.full_name || "Father", "Father", PARENT_DOCUMENT_TYPES);
  children.forEach((child, i) => {
    const name = displayNameForChild(child, i);
    const tag = children.length > 1 ? `Child ${i + 1}` : "Child";
    addPerson("child", child.id, name, tag, CHILD_DOCUMENT_TYPES);
  });

  return records;
}

export default function DocumentVaultCard({ mother, father, children, documentsByOwner, displayNameForChild }) {
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState("");

  const records = buildRecords({ mother, father, children, documentsByOwner, displayNameForChild });

  async function handleView(doc) {
    setError("");
    try {
      const url = await getSignedUrl(doc.file_url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message || "Couldn't open file.");
    }
  }

  async function handleDownload(record) {
    setError("");
    setBusyKey(record.key);
    try {
      await downloadDocument(record.doc, cleanFileName(record.personName, record.docLabel, record.suffix));
    } catch (err) {
      setError(err.message || "Couldn't download file.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="doc-vault-card">
      <div className="doc-vault-header">
        <IconDocument size={18} />
        <h3>Documents on file</h3>
        {records.length > 0 && <span className="doc-vault-count">{records.length}</span>}
      </div>

      {error && <p className="hh-error-text">{error}</p>}

      {records.length === 0 ? (
        <p className="doc-vault-hint">
          Nothing uploaded yet — documents live inside each person's own section in Application, and show up here the
          moment they're on file.
        </p>
      ) : (
        <ul className="doc-vault-list">
          {records.map((record) => (
            <li key={record.key} className="doc-vault-row">
              <div className="doc-vault-row-info">
                <span className="doc-vault-row-label">{record.docLabel}</span>
                <span className="doc-vault-row-tags">
                  <span className="doc-vault-row-tag">{record.personName}</span>
                  <span className="doc-vault-row-tag doc-vault-row-tag-muted">{record.personTag}</span>
                  <span className="doc-vault-row-status">
                    <IconCheckCircle size={12} />
                    On file
                  </span>
                </span>
                <span className="doc-vault-row-meta">
                  {record.doc.original_filename}
                  {record.doc.created_at
                    ? ` · uploaded ${new Date(record.doc.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
                    : ""}
                </span>
              </div>
              <div className="doc-vault-row-actions">
                <button type="button" className="doc-row-btn" onClick={() => handleView(record.doc)}>
                  View
                </button>
                <button
                  type="button"
                  className="doc-row-btn"
                  onClick={() => handleDownload(record)}
                  disabled={busyKey === record.key}
                >
                  {busyKey === record.key ? "Downloading..." : "Download"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
