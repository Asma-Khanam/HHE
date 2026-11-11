import { useEffect, useState } from "react";
import "./FileViewer.css";

// Full-screen document viewer used inside the iPhone/Android app (see
// lib/openFile.js). Mounted once at the top of the app. Shows PDFs and photos
// directly, and offers Share / Save for anything else (Word files and so on).
const TYPE_BY_EXT = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", heic: "image/heic" };

function guessType(url, blobType) {
  if (blobType && blobType !== "application/octet-stream") return blobType;
  const ext = String(url || "").split("?")[0].split(".").pop().toLowerCase();
  return TYPE_BY_EXT[ext] || blobType || "";
}

export default function FileViewer() {
  const [doc, setDoc] = useState(null); // { name, html } | { name, blobUrl, type, blob }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let made = null;
    async function onOpen(e) {
      const { url, html, name } = e.detail || {};
      setError("");
      if (html) {
        setDoc({ name: name || "Document", html });
        return;
      }
      setDoc({ name: name || "Document" });
      setLoading(true);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("The file could not be loaded.");
        const blob = await res.blob();
        if (cancelled) return;
        const type = guessType(url, blob.type);
        const typed = blob.type === type ? blob : new Blob([blob], { type });
        made = URL.createObjectURL(typed);
        setDoc({ name: name || "Document", blobUrl: made, type, blob: typed });
      } catch (err) {
        if (!cancelled) setError(err.message || "The file could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    window.addEventListener("hh-open-file", onOpen);
    return () => {
      cancelled = true;
      window.removeEventListener("hh-open-file", onOpen);
      if (made) URL.revokeObjectURL(made);
    };
  }, []);

  // Freed when closed, and the page behind doesn't scroll while it's open.
  useEffect(() => {
    if (!doc) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      if (doc.blobUrl) URL.revokeObjectURL(doc.blobUrl);
    };
  }, [doc]);

  if (!doc) return null;

  const isImage = doc.type?.startsWith("image/");
  const isPdf = doc.type === "application/pdf";

  async function shareOrSave() {
    if (!doc.blob) return;
    const file = new File([doc.blob], doc.name.includes(".") ? doc.name : `${doc.name}.${isPdf ? "pdf" : (doc.type || "").split("/")[1] || "file"}`, { type: doc.type });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: doc.name });
        return;
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
    const a = document.createElement("a");
    a.href = doc.blobUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="fv" role="dialog" aria-modal="true" aria-label={doc.name}>
      <header className="fv-bar">
        <span className="fv-title">{doc.name}</span>
        {doc.blob && (
          <button type="button" className="fv-btn" onClick={shareOrSave}>
            Share / Save
          </button>
        )}
        <button type="button" className="fv-btn is-close" onClick={() => setDoc(null)} aria-label="Close">
          Done
        </button>
      </header>
      <div className="fv-body">
        {loading && <p className="fv-msg">Opening…</p>}
        {error && <p className="fv-msg is-error">{error}</p>}
        {doc.html && <iframe className="fv-frame" title={doc.name} srcDoc={doc.html} />}
        {doc.blobUrl && isImage && <img className="fv-img" src={doc.blobUrl} alt={doc.name} />}
        {doc.blobUrl && isPdf && <iframe className="fv-frame" title={doc.name} src={doc.blobUrl} />}
        {doc.blobUrl && !isImage && !isPdf && (
          <p className="fv-msg">
            This kind of file can't be previewed here. Tap <strong>Share / Save</strong> to open it in another app.
          </p>
        )}
      </div>
    </div>
  );
}
