import { isNativeApp } from "./native.js";

// Opens a document (a signed storage URL) for viewing.
//
// On the website it opens a new tab, as before. Inside the iPhone/Android app
// window.open() after an await is silently ignored (the app's web view only
// allows pop-ups that come straight from a tap), which is why "View" did
// nothing there. So in the app the file opens in our own full-screen viewer
// (components/FileViewer.jsx), which stays inside the app and can be closed.
export function openFile(url, { name } = {}) {
  if (!url) return;
  if (!isNativeApp) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.dispatchEvent(new CustomEvent("hh-open-file", { detail: { url, name } }));
}

// A ready-made HTML page (invoice / receipt) for the same viewer.
export function openHtml(html, { name } = {}) {
  window.dispatchEvent(new CustomEvent("hh-open-file", { detail: { html, name } }));
}
