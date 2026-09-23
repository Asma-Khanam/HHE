import { useState } from "react";
import { useApplicationData } from "../context/ApplicationDataContext";
import DocumentChecklist from "../components/DocumentChecklist";
import { CHILD_DOCUMENT_TYPES, PARENT_DOCUMENT_TYPES } from "../data/documentTypes";
import { displayNameForChild, expectedChildDocTypes, expectedParentDocTypes } from "../lib/completeness";
import { IconChevronDown } from "../components/icons";
import "./DocumentsPage.css";

// Documents (September 2026) -- every document, per person, in one place.
// Green tick = on file, red cross = still to upload (same look as the
// consultant site's document vault). Uploading here saves straight away,
// exactly like the upload slots inside the Application form.
const NEVER_OPTIONAL = ["leaving_certificate", "sen_supporting_documents"];

export default function DocumentsPage() {
  const { status, user, data, reload } = useApplicationData();
  // Instant update after an upload, while the full reload catches up.
  const [overrides, setOverrides] = useState({});

  if (status === "loading") return <p className="dashboard-status">Loading...</p>;

  const parents = data?.parents || [];
  const children = data?.children || [];
  const documentsByOwner = data?.documentsByOwner || {};
  const holder = parents.find((p) => p.user_id === user?.id) || parents[0];
  const holderRole = holder?.relationship === "Father" ? "Father" : "Mother";

  const people = [];
  ["Mother", "Father"].forEach((role) => {
    const p = parents.find((x) => x.relationship === role);
    if (!p?.id) return;
    const expected = expectedParentDocTypes(p, role === holderRole);
    if (!expected.length) return;
    people.push({
      key: `parent:${p.id}`,
      ownerType: "parent",
      ownerId: p.id,
      name: p.full_name || role,
      tag: role,
      expected,
      optional: PARENT_DOCUMENT_TYPES.filter((d) => !d.expected),
    });
  });
  children.forEach((c, i) => {
    const expected = expectedChildDocTypes(c);
    const expectedKeys = expected.map((d) => d.key);
    people.push({
      key: `child:${c.id}`,
      ownerType: "child",
      ownerId: c.id,
      name: displayNameForChild(c, i),
      tag: children.length > 1 ? `Child ${i + 1}` : "Child",
      expected,
      optional: CHILD_DOCUMENT_TYPES.filter((d) => !expectedKeys.includes(d.key) && !NEVER_OPTIONAL.includes(d.key)),
    });
  });

  const docsFor = (key) => overrides[key] ?? documentsByOwner[key] ?? [];
  const has = (key, type) => docsFor(key).some((d) => d.document_type === type);

  let total = 0;
  let done = 0;
  people.forEach((p) =>
    p.expected.forEach((t) => {
      total += 1;
      if (has(p.key, t.key)) done += 1;
    })
  );
  const pct = total ? Math.round((done / total) * 100) : 0;

  function onChange(key, next) {
    setOverrides((m) => ({ ...m, [key]: next }));
    reload();
  }

  return (
    <div className="docs-page">
      <header className="page-head">
        <h1>Documents</h1>
        <p>Everything we need from each of you. Nothing here stops you submitting — upload whenever you have it.</p>
      </header>

      <div className="docs-summary">
        <div className="docs-summary-text">
          <strong>
            {done} of {total}
          </strong>{" "}
          needed documents uploaded
        </div>
        <div className="docs-summary-bar">
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      {people.length === 0 && (
        <p className="docs-empty">Add your family's details in Application first — their document lists appear here after that.</p>
      )}

      {people.map((p) => {
        const got = p.expected.filter((t) => has(p.key, t.key)).length;
        const complete = got === p.expected.length;
        return (
          <section className="docs-person" key={p.key}>
            <div className="docs-person-head">
              <div>
                <h2>{p.name}</h2>
                <span className="docs-person-tag">{p.tag}</span>
              </div>
              <span className={"docs-person-count" + (complete ? " is-done" : "")}>
                {complete ? "All in ✓" : `${got} of ${p.expected.length}`}
              </span>
            </div>

            <DocumentChecklist
              userId={user?.id}
              ownerType={p.ownerType}
              ownerId={p.ownerId}
              docTypes={p.expected}
              documents={docsFor(p.key)}
              onDocumentsChange={(next) => onChange(p.key, next)}
              personLabel={p.name}
            />

            {p.optional.length > 0 && (
              <details className="docs-optional">
                <summary>
                  Optional documents <IconChevronDown size={14} />
                </summary>
                <DocumentChecklist
                  userId={user?.id}
                  ownerType={p.ownerType}
                  ownerId={p.ownerId}
                  docTypes={p.optional}
                  documents={docsFor(p.key)}
                  onDocumentsChange={(next) => onChange(p.key, next)}
                  personLabel={p.name}
                />
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
