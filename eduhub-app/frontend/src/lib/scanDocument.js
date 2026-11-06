// Document scanning on the phone, with no extra plugin: the camera comes from a normal
// file input (capture="environment"). Each photo is straightened, cropped to the page
// when that is clearly safe, lightened for reading, and several pages are joined into one PDF.

const MAX_SIDE = 1800; // long side in pixels: sharp enough to read, small enough to upload fast

async function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to the <img> route
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That photo couldn't be read. Please try again."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

// Crop to the page only when the page clearly stands out from what is behind it.
// Anything unclear keeps the whole photo, so a page is never cut off.
function pageBox(canvas) {
  const w = 160;
  const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(canvas, 0, 0, w, h);
  const d = sctx.getImageData(0, 0, w, h).data;

  // What is behind the page: the middle value around the photo's edge.
  const edge = [];
  for (let x = 0; x < w; x++) {
    edge.push(lum(d, x * 4), lum(d, ((h - 1) * w + x) * 4));
  }
  for (let y = 0; y < h; y++) {
    edge.push(lum(d, y * w * 4), lum(d, (y * w + w - 1) * 4));
  }
  edge.sort((a, b) => a - b);
  const bg = edge[Math.floor(edge.length / 2)];

  const rows = new Array(h).fill(0);
  const cols = new Array(w).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.abs(lum(d, (y * w + x) * 4) - bg) > 30) {
        rows[y] += 1;
        cols[x] += 1;
      }
    }
  }
  const firstLast = (arr, need) => {
    let a = arr.findIndex((v) => v >= need);
    let b = arr.length - 1 - [...arr].reverse().findIndex((v) => v >= need);
    return a < 0 || b < a ? null : [a, b];
  };
  const ys = firstLast(rows, w * 0.25);
  const xs = firstLast(cols, h * 0.25);
  if (!ys || !xs) return null;
  const share = ((ys[1] - ys[0] + 1) * (xs[1] - xs[0] + 1)) / (w * h);
  if (share < 0.3 || share > 0.97) return null; // too small to trust, or nothing to cut
  const padX = w * 0.02;
  const padY = h * 0.02;
  const x0 = Math.max(0, xs[0] - padX) / w;
  const y0 = Math.max(0, ys[0] - padY) / h;
  const x1 = Math.min(w, xs[1] + 1 + padX) / w;
  const y1 = Math.min(h, ys[1] + 1 + padY) / h;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Stretch the light and dark ends so writing is easier to read. Colour stays.
function lighten(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) hist[Math.round(lum(d, i))] += 1;
  const total = w * h;
  let lo = 0;
  let hi = 255;
  for (let a = 0, s = 0; a < 256; a++) {
    s += hist[a];
    if (s > total * 0.01) {
      lo = a;
      break;
    }
  }
  for (let a = 255, s = 0; a >= 0; a--) {
    s += hist[a];
    if (s > total * 0.01) {
      hi = a;
      break;
    }
  }
  if (hi - lo < 40) return; // already flat or very dark: leave it alone
  const k = 255 / (hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.max(0, Math.min(255, (d[i] - lo) * k));
    d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] - lo) * k));
    d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] - lo) * k));
  }
  ctx.putImageData(img, 0, 0);
}

// One photo in, one tidy page out: { url (preview), blob (JPEG), width, height }.
export async function preparePage(file) {
  const bmp = await loadBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const full = document.createElement("canvas");
  full.width = Math.round(bmp.width * scale);
  full.height = Math.round(bmp.height * scale);
  full.getContext("2d").drawImage(bmp, 0, 0, full.width, full.height);
  bmp.close?.();

  let canvas = full;
  const box = pageBox(full);
  if (box) {
    const cw = Math.round(box.w * full.width);
    const ch = Math.round(box.h * full.height);
    const cropped = document.createElement("canvas");
    cropped.width = cw;
    cropped.height = ch;
    cropped.getContext("2d").drawImage(full, Math.round(box.x * full.width), Math.round(box.y * full.height), cw, ch, 0, 0, cw, ch);
    canvas = cropped;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  lighten(ctx, canvas.width, canvas.height);

  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare that photo."))), "image/jpeg", 0.82)
  );
  return { url: URL.createObjectURL(blob), blob, width: canvas.width, height: canvas.height };
}

// A plain PDF with one JPEG per page, written by hand so no library is needed.
export async function pagesToPdf(pages) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let size = 0;
  const push = (data) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(bytes);
    size += bytes.length;
  };
  const startObj = (n) => {
    offsets[n] = size;
    push(`${n} 0 obj\n`);
  };

  push("%PDF-1.4\n");
  const pageIds = pages.map((_, i) => 3 + i * 3);
  startObj(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObj(2);
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>\nendobj\n`);

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const pageId = 3 + i * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const long = 842;
    const k = long / Math.max(p.width, p.height);
    const pw = Math.round(p.width * k);
    const ph = Math.round(p.height * k);
    const jpeg = new Uint8Array(await p.blob.arrayBuffer());
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;

    startObj(pageId);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
    startObj(contentId);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    startObj(imageId);
    push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    push("\nendstream\nendobj\n");
  }

  const count = 3 + pages.length * 3;
  const xrefAt = size;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(xref + `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);
  return new Blob(chunks, { type: "application/pdf" });
}
