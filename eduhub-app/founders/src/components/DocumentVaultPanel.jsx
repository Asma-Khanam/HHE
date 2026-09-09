import { displayNameForChild, expectedChildDocTypes, expectedParentDocTypes } from "../lib/completeness";
import { getSignedUrl, downloadDocument, cleanFileName } from "../lib/documents";
import { CHILD_DOCUMENT_TYPES, PARENT_DOCUMENT_TYPES } from "../data/documentTypes";
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

export default function DocumentVaultPanel({ parents, familyChildren, documentsByOwner, accountHolderRole }) {
  const rows = buildDocumentRows({ parents, children: familyChildren, documentsByOwner, accountHolderRole });
  const uploadedCount = rows.filter((r) => r.uploaded).length;

  async function handleView(doc) {
    try {
      const url = await getSignedUrl(doc.file_url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      window.alert(err.message || "Couldn't open file.");
    }
  }

  async function handleDownload(row, doc, suffix) {
    try {
      await downloadDocument(doc, cleanFileName(row.personName, row.docLabel, suffix));
    } catch (err) {
      window.alert(err.message || "Couldn't download file.");
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
                  row.docs.map((doc, idx) => (
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

              {row.uploaded && (
                <div className="doc-row-controls">
                  {row.docs.map((doc, idx) => (
                    <span key={doc.id} className="doc-row-file-actions">
                      <button type="button" className="panel-btn" onClick={() => handleView(doc)}>
                        View
                      </button>
                      <button
                        type="button"
                        className="panel-btn"
                        onClick={() => handleDownload(row, doc, row.docs.length > 1 ? String(idx + 1) : undefined)}
                      >
                        Download
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
