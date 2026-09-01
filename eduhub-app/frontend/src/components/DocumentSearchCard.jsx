import { useMemo, useState } from "react";
import { downloadDocument, cleanFileName, getSignedUrl } from "../lib/documents";
import { CHILD_DOCUMENT_TYPES, PARENT_DOCUMENT_TYPES } from "../data/documentTypes";
import { IconDocument } from "./icons";
import "./DocumentSearchCard.css";

// Every document SLOT across the whole family, flattened into one list —
// one row per uploaded file, plus one row for any REQUIRED slot that's
// still empty (optional-and-empty slots don't show; there's nothing to
// find and nothing blocking). Built directly from documentsByOwner + the
// checklist definitions rather than from getMissingItems, since search
// needs uploaded files too (which getMissingItems never lists) — but the
// "missing" rows use the exact same required-only rule, so this can never
// call something outstanding that the readiness number already counts as
// done, or vice versa.
function buildRecords({ mother, father, children, documentsByOwner, displayNameForChild }) {
  const records = [];

  function addPerson(ownerType, ownerId, personName, personTag, docTypes) {
    const docs = ownerId ? documentsByOwner[`${ownerType}:${ownerId}`] || [] : [];
    docTypes.forEach((docType) => {
      const matches = docs.filter((d) => d.document_type === docType.key);
      if (matches.length) {
        matches.forEach((doc, idx) => {
          records.push({
            key: `${ownerType}-${ownerId}-${docType.key}-${doc.id}`,
            personName,
            personTag,
            docLabel: docType.label,
            status: "uploaded",
            doc,
            suffix: matches.length > 1 ? String(idx + 1) : undefined,
          });
        });
      } else if (docType.required) {
        records.push({
          key: `${ownerType}-${ownerId || "unsaved"}-${docType.key}`,
          personName,
          personTag,
          docLabel: docType.label,
          status: "missing",
        });
      }
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

function matchesQuery(record, tokens) {
  if (!tokens.length) return false;
  const haystack = `${record.personName} ${record.personTag} ${record.docLabel}`.toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

// A light "reading this as X" hint — finds the first checklist label that
// shares a word with the query, purely to reassure someone typing a
// shorthand ("pass", "vacc") that the search understood them. It doesn't
// change what actually matches below; matchesQuery does that on its own.
function guessDocLabel(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const seen = new Set();
  const allTypes = [...CHILD_DOCUMENT_TYPES, ...PARENT_DOCUMENT_TYPES];
  for (const t of allTypes) {
    if (seen.has(t.label)) continue;
    seen.add(t.label);
    const words = t.label.toLowerCase().split(/\s+/);
    if (words.some((w) => w.length > 2 && (w.startsWith(q) || q.startsWith(w)))) {
      return t.label;
    }
  }
  return null;
}

export default function DocumentSearchCard({ mother, father, children, documentsByOwner, displayNameForChild }) {
  const [query, setQuery] = useState("");
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState("");

  const records = useMemo(
    () => buildRecords({ mother, father, children, documentsByOwner, displayNameForChild }),
    [mother, father, children, documentsByOwner, displayNameForChild]
  );

  const chips = useMemo(() => {
    const list = [];
    const child0 = children[0];
    if (child0) list.push(`${displayNameForChild(child0, 0)} passport`);
    const child1 = children[1];
    if (child1) list.push(`${displayNameForChild(child1, 1)} vaccination`);
    list.push("emirates id");
    if (mother?.full_name) list.push(`${mother.full_name.split(" ")[0]} visa`);
    list.push("school report");
    return list.slice(0, 5);
  }, [children, mother, displayNameForChild]);

  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = tokens.length ? records.filter((r) => matchesQuery(r, tokens)) : [];
  const readingAs = tokens.length ? guessDocLabel(query) : null;

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
    <div className="doc-search-card">
      <div className="doc-search-header">
        <IconDocument size={18} />
        <h3>Find a document</h3>
      </div>
      <p className="doc-search-note">
        Search by who it belongs to and what it is — "Asma passport" finds her passport whatever the file's actually
        named.
      </p>

      <div className="doc-search-input-wrap">
        <input
          type="text"
          className="doc-search-input"
          placeholder="e.g. Asma passport"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {chips.length > 0 && (
        <div className="doc-search-chips">
          {chips.map((chip) => (
            <button type="button" key={chip} className="doc-search-chip" onClick={() => setQuery(chip)}>
              {chip}
            </button>
          ))}
        </div>
      )}

      {readingAs && <p className="doc-search-reading-as">Reading this as {readingAs}</p>}
      {error && <p className="hh-error-text">{error}</p>}

      {!tokens.length ? (
        <p className="doc-search-hint">Start typing a name, a document type, or both.</p>
      ) : results.length === 0 ? (
        <p className="doc-search-hint">No documents match "{query}".</p>
      ) : (
        <ul className="doc-search-results">
          {results.map((record) => (
            <li key={record.key} className="doc-search-result">
              <div className="doc-search-result-info">
                <span className="doc-search-result-label">{record.docLabel}</span>
                <span className="doc-search-result-tags">
                  <span className="doc-search-result-tag">{record.personName}</span>
                  <span className="doc-search-result-tag doc-search-result-tag-muted">{record.personTag}</span>
                  {record.status === "missing" && <span className="doc-search-result-tag doc-search-result-tag-missing">Required · missing</span>}
                </span>
                {record.status === "uploaded" ? (
                  <span className="doc-search-result-meta">
                    {record.doc.original_filename}
                    {record.doc.created_at
                      ? ` · uploaded ${new Date(record.doc.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
                      : ""}
                  </span>
                ) : (
                  <span className="doc-search-result-meta">Not uploaded yet.</span>
                )}
              </div>
              {record.status === "uploaded" && (
                <div className="doc-search-result-actions">
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
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
