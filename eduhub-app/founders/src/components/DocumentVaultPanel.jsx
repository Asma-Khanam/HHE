import { useState } from "react";
import { updateDocumentReview } from "../lib/staffData";
import { displayNameForChild } from "../lib/completeness";
import { getSignedUrl, downloadDocument, cleanFileName } from "../lib/documents";
import { CHILD_DOCUMENT_TYPES, PARENT_DOCUMENT_TYPES } from "../data/documentTypes";
import { DOCUMENT_STATUSES, documentStatusLabel, isExpiring, daysUntil } from "../lib/workflow";
import "./panels.css";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Every uploaded document across the whole family, flattened into one list —
// same idea as the client app's own DocumentVaultCard, but built from every
// person in the family rather than just "me", and with the staff review
// controls attached.
function buildDocumentRows({ parents, children, documentsByOwner }) {
  const rows = [];
  function addPerson(ownerType, id, personName, personTag, docTypes) {
    const docs = id ? documentsByOwner[`${ownerType}:${id}`] || [] : [];
    docTypes.forEach((docType) => {
      const matches = docs.filter((d) => d.document_type === docType.key);
      matches.forEach((doc, idx) => {
        rows.push({
          key: `${ownerType}-${id}-${docType.key}-${doc.id}`,
          personName,
          personTag,
          docLabel: docType.label,
          doc,
          suffix: matches.length > 1 ? String(idx + 1) : undefined,
        });
      });
    });
  }
  (parents || []).forEach((p) => addPerson("parent", p.id, p.full_name || p.relationship, p.relationship, PARENT_DOCUMENT_TYPES));
  (children || []).forEach((c, i) =>
    addPerson("child", c.id, displayNameForChild(c, i), children.length > 1 ? `Child ${i + 1}` : "Child", CHILD_DOCUMENT_TYPES)
  );
  return rows;
}

function expiryTag(expiresAt) {
  const d = daysUntil(expiresAt);
  if (d === null) return null;
  if (d < 0) return `Expired ${formatDate(expiresAt)}`;
  return `Expires ${formatDate(expiresAt)}`;
}

export default function DocumentVaultPanel({ parents, familyChildren, documentsByOwner }) {
  const [rows, setRows] = useState(() => buildDocumentRows({ parents, children: familyChildren, documentsByOwner }));
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState(null);

  const verified = rows.filter((r) => r.doc.status === "verified").length;

  async function handleView(doc) {
    setError("");
    try {
      const url = await getSignedUrl(doc.file_url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message || "Couldn't open file.");
    }
  }

  async function handleDownload(row) {
    setError("");
    setBusyKey(row.key);
    try {
      await downloadDocument(row.doc, cleanFileName(row.personName, row.docLabel, row.suffix));
    } catch (err) {
      setError(err.message || "Couldn't download file.");
    } finally {
      setBusyKey(null);
    }
  }

  // Optimistic, same as everywhere else — the pill changes colour instantly,
  // and rolls back with a message if the write is refused.
  async function review(row, changes) {
    const previous = rows;
    setRows((list) => list.map((r) => (r.key === row.key ? { ...r, doc: { ...r.doc, ...changes } } : r)));
    try {
      await updateDocumentReview(row.doc.id, changes);
    } catch (err) {
      setError(err.message || "Couldn't save that.");
      setRows(previous);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          Document vault
          {rows.length > 0 && <span className="panel-count">{rows.length}</span>}
        </h2>
        {rows.length > 0 && (
          <span className="panel-hint">
            {verified} of {rows.length} verified
          </span>
        )}
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {rows.length === 0 ? (
        <p className="panel-hint">Nothing uploaded yet.</p>
      ) : (
        <ul className="panel-list">
          {rows.map((row) => {
            const status = row.doc.status;
            const expiring = isExpiring(row.doc.expires_at);
            return (
              <li key={row.key} className="doc-row">
                <span
                  className={
                    "doc-row-status" +
                    (status === "verified" ? " is-verified" : "") +
                    (status === "chasing" ? " is-chasing" : "")
                  }
                  title={documentStatusLabel(status)}
                >
                  {status === "verified" ? "✓" : status === "chasing" ? "!" : ""}
                </span>

                <div className="doc-row-info">
                  <div className="doc-row-label">{row.docLabel}</div>
                  <div className="doc-row-tags">
                    <span className="doc-row-tag">{row.personName}</span>
                    <span className="doc-row-tag doc-row-tag-muted">{row.personTag}</span>
                    {row.doc.expires_at && (
                      <span className={"doc-row-tag" + (expiring ? " doc-row-tag-expiring" : " doc-row-tag-muted")}>
                        {expiryTag(row.doc.expires_at)}
                      </span>
                    )}
                  </div>
                  <div className="doc-row-meta">
                    {row.doc.original_filename}
                    {row.doc.created_at ? ` · uploaded ${formatDate(row.doc.created_at)}` : ""}
                    {row.doc.reviewed_at ? ` · reviewed ${formatDate(row.doc.reviewed_at)}` : ""}
                  </div>
                </div>

                <div className="doc-row-controls">
                  <select
                    className="panel-select"
                    value={status || "received"}
                    onChange={(e) => review(row, { status: e.target.value })}
                    title="Review status"
                  >
                    {DOCUMENT_STATUSES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    className="panel-input"
                    value={row.doc.expires_at || ""}
                    onChange={(e) => review(row, { expires_at: e.target.value })}
                    title="Expiry date, if this document has one"
                  />
                  <button type="button" className="panel-btn" onClick={() => handleView(row.doc)}>
                    View
                  </button>
                  <button
                    type="button"
                    className="panel-btn"
                    onClick={() => handleDownload(row)}
                    disabled={busyKey === row.key}
                  >
                    {busyKey === row.key ? "…" : "Download"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
