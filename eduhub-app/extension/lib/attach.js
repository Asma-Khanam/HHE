// The function that runs INSIDE the school's page.
//
// This is the whole trick, and it's worth being clear about why it's allowed.
// A web page cannot reach into another site's page — that's the boundary that
// stops any site you visit from attaching your files to a form on your bank.
// An extension is different: the consultant installs it and, by clicking the
// button, grants it access to the tab they're looking at, right then. Chrome's
// `activeTab` permission means this extension can never touch a page the
// consultant hasn't explicitly pointed it at, and holds no standing access to
// any site at all.
//
// It is passed to chrome.scripting.executeScript as `func`, which serialises
// it with Function.prototype.toString(). So it must be entirely
// self-contained: no imports, no closures, nothing from module scope. Every
// helper it needs is defined inside it.

export async function attachFileToPage(base64, filename, mimetype) {
  // ---- turn the bytes back into a real File -------------------------------
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const file = new File([bytes], filename, { type: mimetype || "application/octet-stream" });

  // ---- find the upload fields ---------------------------------------------
  // Hidden inputs are included on purpose: a great many portals hide the real
  // <input type="file"> behind a styled button, so the one that matters is
  // usually the one you can't see. Inputs inside open shadow roots are picked
  // up too, since component-based portals often nest them.
  function collectInputs(root, found) {
    root.querySelectorAll("input[type=file]").forEach((el) => found.push(el));
    root.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) collectInputs(el.shadowRoot, found);
    });
    return found;
  }
  const inputs = collectInputs(document, []);

  if (inputs.length === 0) {
    return { ok: false, reason: "no-input" };
  }

  // What a human would call this field, for the confirmation message. Tries
  // the things portals actually use, in the order most likely to be readable.
  function labelFor(input) {
    const byFor = input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    const text =
      (byFor && byFor.textContent) ||
      (input.closest("label") && input.closest("label").textContent) ||
      input.getAttribute("aria-label") ||
      input.name ||
      input.id ||
      "";
    return text.replace(/\s+/g, " ").trim().slice(0, 60) || "upload field";
  }

  function put(input) {
    const dt = new DataTransfer();
    // A field that accepts several files (its `multiple` attribute) should
    // gain this one alongside whatever is already sitting in it — attaching
    // the passport and then the birth certificate to the same field is the
    // whole point of "multiple". A single-file field still behaves as
    // before: the new file replaces whatever was there.
    if (input.multiple) {
      Array.from(input.files || []).forEach((existing) => dt.items.add(existing));
    }
    dt.items.add(file);
    input.files = dt.files;
    // Both events, because portals listen for different ones — React and
    // Angular forms typically want `input`, plain HTML handlers want `change`,
    // and a field that silently stays empty is the worst possible failure here.
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, field: labelFor(input), count: input.files.length, multiple: !!input.multiple };
  }

  // One field on the page: no ambiguity, just do it.
  if (inputs.length === 1) return put(inputs[0]);

  // ---- several fields: let the consultant point at the right one ----------
  // This is why there's no per-school configuration in this version. Rather
  // than guessing which field is "the passport one" from a mapping that breaks
  // whenever a school redesigns, it asks. One click, and it works on a portal
  // nobody has ever seen before.
  return await new Promise((resolve) => {
    const marks = [];
    const cleanup = () => {
      marks.forEach((m) => m.remove());
      document.removeEventListener("keydown", onKey, true);
      banner.remove();
    };

    const banner = document.createElement("div");
    banner.textContent = `Click the field to put "${filename}" in — Esc to cancel`;
    Object.assign(banner.style, {
      position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)",
      zIndex: "2147483647", background: "#530126", color: "#fff",
      font: "500 14px/1.4 system-ui, sans-serif", padding: "10px 18px",
      borderRadius: "999px", boxShadow: "0 6px 24px rgba(0,0,0,.3)", pointerEvents: "none",
    });
    document.body.appendChild(banner);

    inputs.forEach((input) => {
      // The visible thing is often the input's wrapper, not the input itself,
      // since the input is usually hidden. Fall back outwards until something
      // actually has a size on screen.
      let target = input;
      while (target && target.getBoundingClientRect().width < 8 && target.parentElement) {
        target = target.parentElement;
      }
      const box = target.getBoundingClientRect();
      if (box.width < 8 || box.height < 8) return;

      const mark = document.createElement("div");
      Object.assign(mark.style, {
        position: "fixed",
        top: `${box.top - 3}px`, left: `${box.left - 3}px`,
        width: `${box.width + 6}px`, height: `${box.height + 6}px`,
        border: "2px solid #b89a5a", borderRadius: "6px",
        background: "rgba(184,154,90,.16)", cursor: "pointer",
        zIndex: "2147483646",
      });
      mark.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
        resolve(put(input));
      });
      document.body.appendChild(mark);
      marks.push(mark);
    });

    if (marks.length === 0) {
      cleanup();
      resolve(put(inputs[0]));
      return;
    }

    function onKey(e) {
      if (e.key !== "Escape") return;
      cleanup();
      resolve({ ok: false, reason: "cancelled" });
    }
    document.addEventListener("keydown", onKey, true);
  });
}
