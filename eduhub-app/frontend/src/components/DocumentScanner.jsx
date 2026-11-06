import { useEffect, useRef, useState } from "react";
import { preparePage, pagesToPdf } from "../lib/scanDocument";
import "./DocumentScanner.css";

// A small sheet that opens after the first photo: look at the pages, add another,
// retake, remove, then use them. Several pages become one PDF; an image-only slot gets one JPEG.
export default function DocumentScanner({ label, firstFile, imageOnly, onCancel, onDone }) {
  const [pages, setPages] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const addRef = useRef(null);
  const retakeRef = useRef(null);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  async function add(file, replaceLast = false) {
    setBusy(true);
    setError("");
    try {
      const page = await preparePage(file);
      setPages((list) => {
        if (imageOnly || replaceLast) {
          const drop = imageOnly ? list : list.slice(-1);
          drop.forEach((p) => URL.revokeObjectURL(p.url));
          return [...(imageOnly ? [] : list.slice(0, -1)), page];
        }
        return [...list, page];
      });
    } catch (err) {
      setError(err.message || "That photo couldn't be used.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    add(firstFile);
    return () => pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(e, replaceLast) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) add(file, replaceLast);
  }

  function remove(i) {
    setPages((list) => {
      URL.revokeObjectURL(list[i].url);
      return list.filter((_, n) => n !== i);
    });
  }

  async function use() {
    if (!pages.length) return;
    setBusy(true);
    setError("");
    try {
      const base = String(label || "Document").replace(/[^\w\- ]+/g, "").trim() || "Document";
      if (imageOnly) {
        onDone(new File([pages[0].blob], `${base}.jpg`, { type: "image/jpeg" }));
      } else {
        const pdf = await pagesToPdf(pages);
        onDone(new File([pdf], `${base}.pdf`, { type: "application/pdf" }));
      }
    } catch (err) {
      setError(err.message || "Couldn't put the pages together.");
      setBusy(false);
    }
  }

  return (
    <div className="scan-backdrop" role="dialog" aria-modal="true" aria-label={`Scan ${label}`}>
      <div className="scan-sheet">
        <h3>Scan {label}</h3>
        <p className="scan-hint">
          {imageOnly ? "Check the photo is clear, then use it." : "Lay the page flat in good light. Add every page, then use them."}
        </p>

        <div className="scan-pages">
          {pages.map((p, i) => (
            <div className="scan-page" key={p.url}>
              <img src={p.url} alt={`Page ${i + 1}`} />
              <span className="scan-num">{i + 1}</span>
              <button type="button" className="scan-x" aria-label={`Remove page ${i + 1}`} onClick={() => remove(i)} disabled={busy}>
                ×
              </button>
            </div>
          ))}
          {busy && <div className="scan-page scan-wait">Preparing…</div>}
        </div>

        {error && <p className="scan-error">{error}</p>}

        <div className="scan-actions">
          {!imageOnly && (
            <label className={"doc-row-btn" + (busy ? " is-disabled" : "")}>
              Add page
              <input ref={addRef} type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => pick(e, false)} />
            </label>
          )}
          <label className={"doc-row-btn" + (busy || !pages.length ? " is-disabled" : "")}>
            Retake {imageOnly ? "" : "last"}
            <input ref={retakeRef} type="file" accept="image/*" capture="environment" hidden disabled={busy || !pages.length} onChange={(e) => pick(e, true)} />
          </label>
          <button type="button" className="doc-row-btn doc-row-btn-upload" onClick={use} disabled={busy || !pages.length}>
            {imageOnly ? "Use this photo" : `Use ${pages.length || ""} page${pages.length === 1 ? "" : "s"}`}
          </button>
          <button type="button" className="doc-row-btn doc-row-btn-ghost" onClick={onCancel} disabled={busy && !pages.length}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
