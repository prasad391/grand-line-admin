// =====================================================================
//  Sheet Maker – folder of images -> 13 x 19 in PDF with cut marks
//  Images are embedded at ORIGINAL quality (no re-compression):
//    JPEG  -> embedded as-is
//    PNG   -> pixel data embedded as-is (when possible)
//    other -> lossless pixel copy
// =====================================================================
const {
  PDFDocument, PDFName, PDFHexString, cmyk,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix,
  drawObject, rectangle, clip, endPath,
} = PDFLib;

const PT = 72;                  // 1 inch = 72 PDF points
const MARK_GAP = 0.02 * PT;     // tiny space between a cut mark and the image edge
const THUMB_SIZE = 480;         // preview thumbnails only (PDF is NOT affected)

// [columns, rows] for every "images per page" choice
const GRIDS = [
  [1, 1],
  [1, 2], [2, 1],
  [1, 3], [3, 1],
  [2, 2], [1, 4], [4, 1],
  [2, 3], [3, 2],
  [2, 4], [4, 2],
  [3, 3],
  [3, 4], [4, 3],
];

const $ = (id) => document.getElementById(id);
const folderInput = $("folder");
const orientSel = $("orient");
const layoutSel = $("layout");
const marginIn = $("margin");
const gapIn = $("gap");
const copiesIn = $("copies");
const fitSel = $("fit");
const rotateChk = $("rotate");
const makeBtn = $("make");
const statusEl = $("status");
const bar = $("bar");
const again = $("again");

let files = [];     // sorted image files
let thumbs = [];    // preview URLs (same order as files)
let dims = [];      // natural size of each image {w,h} (same order as files)
let lastPdfUrl = null;
let lastPdfName = "";
let loadToken = 0;

// fill the "images per page" dropdown
GRIDS.forEach(([c, r]) => {
  const o = document.createElement("option");
  o.value = `${c}x${r}`;
  o.textContent = `${c * r} per page – ${c} × ${r}`;
  if (c === 2 && r === 2) o.selected = true;
  layoutSel.appendChild(o);
});

// ---------- Settings ----------
function readSettings() {
  const [cols, rows] = layoutSel.value.split("x").map(Number);
  const landscape = orientSel.value === "landscape";
  return {
    W: (landscape ? 19 : 13) * PT,
    H: (landscape ? 13 : 19) * PT,
    cols, rows,
    marginPt: Math.min(Math.max(parseFloat(marginIn.value) || 0.5, 0.25), 2) * PT,
    gapPt: Math.min(Math.max(parseFloat(gapIn.value) || 0, 0), 1) * PT,
    fit: fitSel.value,                       // "fit" | "fill"
    autoRotate: rotateChk.checked,
    copies: Math.min(Math.max(parseInt(copiesIn.value) || 1, 1), 50),
  };
}

// order of images on the sheets: each image repeated `copies` times
function buildSequence(S) {
  const seq = [];
  files.forEach((_, i) => { for (let k = 0; k < S.copies; k++) seq.push(i); });
  return seq;
}

// ---------- Geometry (origin = top-left, units = points) ----------
function getCells(S) {
  const cellW = (S.W - 2 * S.marginPt - S.gapPt * (S.cols - 1)) / S.cols;
  const cellH = (S.H - 2 * S.marginPt - S.gapPt * (S.rows - 1)) / S.rows;
  const cells = [];
  for (let r = 0; r < S.rows; r++) {
    for (let c = 0; c < S.cols; c++) {
      cells.push({
        x: S.marginPt + c * (cellW + S.gapPt),
        y: S.marginPt + r * (cellH + S.gapPt),
        w: cellW,
        h: cellH,
      });
    }
  }
  return cells;
}

// Where the image goes inside its cell. Never stretched.
function placeImage(cell, iw, ih, S) {
  let rot = false;
  if (S.autoRotate) {
    const normal = Math.min(cell.w / iw, cell.h / ih);
    const turned = Math.min(cell.w / ih, cell.h / iw);
    rot = turned > normal * 1.0001;
  }
  const dw = rot ? ih : iw;                    // size as it appears on the page
  const dh = rot ? iw : ih;
  const scale = S.fit === "fill"
    ? Math.max(cell.w / dw, cell.h / dh)
    : Math.min(cell.w / dw, cell.h / dh);
  const w = dw * scale;
  const h = dh * scale;
  const draw = { x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2, w, h };
  const vis = S.fit === "fill" ? { ...cell } : draw;   // the part that is actually visible
  return { rot, draw, vis };
}

// Cut marks start at the page edge and run right up to the real image edge.
// A mark stops at the first image it meets, so it never crosses another image.
function getMarks(rects, S) {
  const EPS = 0.75;
  const seen = new Set();
  const lines = [];
  const add = (x1, y1, x2, y2) => {
    if (Math.abs(x2 - x1) + Math.abs(y2 - y1) < 1) return;
    const key = [x1, y1, x2, y2].map((n) => n.toFixed(2)).join(",");
    if (!seen.has(key)) { seen.add(key); lines.push({ x1, y1, x2, y2 }); }
  };
  const xs = new Set(), ys = new Set();
  rects.forEach((r) => {
    xs.add(+r.x.toFixed(2)); xs.add(+(r.x + r.w).toFixed(2));
    ys.add(+r.y.toFixed(2)); ys.add(+(r.y + r.h).toFixed(2));
  });
  xs.forEach((x) => {
    const hit = rects.filter((r) => x >= r.x - EPS && x <= r.x + r.w + EPS);
    if (!hit.length) return;
    const top = Math.min(...hit.map((r) => r.y));
    const bottom = Math.max(...hit.map((r) => r.y + r.h));
    add(x, 0, x, top - MARK_GAP);
    add(x, bottom + MARK_GAP, x, S.H);
  });
  ys.forEach((y) => {
    const hit = rects.filter((r) => y >= r.y - EPS && y <= r.y + r.h + EPS);
    if (!hit.length) return;
    const left = Math.min(...hit.map((r) => r.x));
    const right = Math.max(...hit.map((r) => r.x + r.w));
    add(0, y, left - MARK_GAP, y);
    add(right + MARK_GAP, y, S.W, y);
  });
  return lines;
}

// ---------- Preview ----------
function drawPreview() {
  const S = readSettings();
  const cells = getCells(S);
  const perPage = cells.length;
  const seq = buildSequence(S);
  const pageCount = seq.length ? Math.ceil(seq.length / perPage) : 1;
  let html = "";

  for (let p = 0; p < pageCount; p++) {
    const count = seq.length ? Math.min(perPage, seq.length - p * perPage) : perPage;
    let svg = `<svg viewBox="0 0 ${S.W} ${S.H}" xmlns="http://www.w3.org/2000/svg">`;
    const rects = [];

    for (let j = 0; j < count; j++) {
      const cell = cells[j];
      const fi = seq[p * perPage + j];
      const url = fi !== undefined ? thumbs[fi] : null;
      const d = fi !== undefined ? dims[fi] : null;
      if (url && d) {
        const pl = placeImage(cell, d.w, d.h, S);
        rects.push(pl.vis);
        const cx = pl.draw.x + pl.draw.w / 2, cy = pl.draw.y + pl.draw.h / 2;
        const img = pl.rot
          ? `<image href="${url}" x="${cx - pl.draw.h / 2}" y="${cy - pl.draw.w / 2}" width="${pl.draw.h}" height="${pl.draw.w}" transform="rotate(90 ${cx} ${cy})" preserveAspectRatio="none"/>`
          : `<image href="${url}" x="${pl.draw.x}" y="${pl.draw.y}" width="${pl.draw.w}" height="${pl.draw.h}" preserveAspectRatio="none"/>`;
        // nested svg clips anything outside the cell (needed for "Fill cell")
        svg += `<svg x="${cell.x}" y="${cell.y}" width="${cell.w}" height="${cell.h}" viewBox="${cell.x} ${cell.y} ${cell.w} ${cell.h}">${img}</svg>`;
      } else {
        rects.push(cell);
        svg += `<rect x="${cell.x}" y="${cell.y}" width="${cell.w}" height="${cell.h}" fill="#cfd8e3"/>`;
      }
    }
    for (const m of getMarks(rects, S)) {
      svg += `<line x1="${m.x1}" y1="${m.y1}" x2="${m.x2}" y2="${m.y2}" stroke="#d92d20" stroke-width="3"/>`;
    }
    svg += `</svg>`;
    html += `<div class="page"><figure>${svg}<figcaption>Page ${p + 1}</figcaption></figure></div>`;
  }
  $("pages").innerHTML = html;
  $("previewTitle").textContent = seq.length
    ? `Page preview – ${pageCount} page${pageCount > 1 ? "s" : ""}`
    : "Page preview";
}

async function buildThumbnails(token) {
  thumbs.forEach((u) => u && URL.revokeObjectURL(u));
  thumbs = [];
  dims = [];
  for (let i = 0; i < files.length; i++) {
    if (token !== loadToken) return;            // a newer folder was chosen
    setStatus(`Loading preview ${i + 1} of ${files.length}…`);
    try {
      const bmp = await createImageBitmap(files[i]);
      dims[i] = { w: bmp.width, h: bmp.height };
      const scale = Math.min(1, THUMB_SIZE / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(bmp.width * scale));
      c.height = Math.max(1, Math.round(bmp.height * scale));
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
      thumbs[i] = URL.createObjectURL(blob);
    } catch (e) {
      thumbs[i] = null;
    }
  }
  if (token !== loadToken) return;
  setStatus("");
  drawPreview();
}

// ---------- Folder selection ----------
folderInput.addEventListener("change", () => {
  files = [...folderInput.files]
    .filter((f) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name))
    .sort((a, b) =>
      (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true })
    );
  makeBtn.disabled = files.length === 0;
  again.hidden = true;
  $("folderInfo").textContent = files.length
    ? `${files.length} images found`
    : "No images found in that folder";
  thumbs = [];
  dims = [];
  drawPreview();
  if (files.length) buildThumbnails(++loadToken);
});

[orientSel, layoutSel, marginIn, gapIn, copiesIn, fitSel, rotateChk].forEach((el) =>
  el.addEventListener("input", drawPreview)
);

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError ? "error" : "";
}
const tick = () => new Promise((r) => setTimeout(r, 0)); // lets the page repaint

// =====================================================================
//  Lossless image embedding
// =====================================================================

// --- JPEG: read the EXIF "orientation" tag (phone photos) ---
function jpegOrientation(b) {
  try {
    if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
    let p = 2;
    while (p + 4 < b.length && b[p] === 0xff) {
      const m = b[p + 1];
      const len = (b[p + 2] << 8) | b[p + 3];
      if (m === 0xe1 && b[p + 4] === 0x45 && b[p + 5] === 0x78 && b[p + 6] === 0x69 && b[p + 7] === 0x66) {
        const t = p + 10;
        const le = b[t] === 0x49;
        const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
        const ifd = t + dv.getUint32(t + 4, le);
        const n = dv.getUint16(ifd, le);
        for (let i = 0; i < n; i++) {
          const e = ifd + 2 + i * 12;
          if (dv.getUint16(e, le) === 0x0112) return dv.getUint16(e + 8, le);
        }
        return 1;
      }
      if (m === 0xda) break;
      p += 2 + len;
    }
  } catch (e) { /* ignore */ }
  return 1;
}

// --- PNG: read chunks so the original pixel data can be reused as-is ---
function parsePng(b) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (b[i] !== sig[i]) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let pos = 8, ihdr = null, plte = null, trns = false;
  const idat = [];
  while (pos + 8 <= b.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7]);
    const data = b.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") ihdr = { w: dv.getUint32(pos + 8), h: dv.getUint32(pos + 12), depth: data[8], ctype: data[9], interlace: data[12] };
    else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = true;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!ihdr || !idat.length || ihdr.interlace !== 0 || trns) return null;
  const { ctype, depth } = ihdr;
  const ok =
    (ctype === 0 && [1, 2, 4, 8, 16].includes(depth)) ||
    (ctype === 2 && (depth === 8 || depth === 16)) ||
    (ctype === 3 && plte);
  if (!ok) return null;                        // alpha / interlaced -> lossless canvas path
  let total = 0;
  idat.forEach((d) => (total += d.length));
  const stream = new Uint8Array(total);
  let off = 0;
  idat.forEach((d) => { stream.set(d, off); off += d.length; });
  return { ...ihdr, plte, stream };
}

async function deflate(u8) {
  const cs = new CompressionStream("deflate");
  const out = new Blob([u8]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function addImageObject(pdf, dict, bytes) {
  dict.Type = "XObject";
  dict.Subtype = "Image";
  dict.Length = bytes.length;
  return pdf.context.register(pdf.context.stream(bytes, dict));
}

// Lossless fallback for transparent PNG, WEBP, GIF, BMP, rotated JPEG, etc.
// Full-size pixels, no downscaling, no JPEG re-compression. Transparency -> white.
async function embedViaCanvas(pdf, file) {
  const bmp = await createImageBitmap(file);   // applies phone-photo rotation
  const w = bmp.width, h = bmp.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const rgba = ctx.getImageData(0, 0, w, h).data;
  canvas.width = canvas.height = 0;
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i]; rgb[j + 1] = rgba[i + 1]; rgb[j + 2] = rgba[i + 2];
  }
  const bytes = await deflate(rgb);
  const ref = addImageObject(pdf, {
    Width: w, Height: h, ColorSpace: "DeviceRGB", BitsPerComponent: 8, Filter: "FlateDecode",
  }, bytes);
  return { ref, w, h, method: "pixels" };
}

// Returns { ref, w, h } for one image file (cached, so copies share one embed)
const embedCache = new Map();
async function embedImage(pdf, file) {
  if (embedCache.has(file)) return embedCache.get(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let info = null;

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (isJpeg && jpegOrientation(bytes) === 1) {
    const img = await pdf.embedJpg(bytes);     // original JPEG bytes, untouched
    info = { ref: img.ref, w: img.width, h: img.height, method: "jpeg-original" };
  } else if (!isJpeg) {
    const png = parsePng(bytes);
    if (png) {
      const n = png.ctype === 2 ? 3 : 1;
      let cs = png.ctype === 2 ? "DeviceRGB" : "DeviceGray";
      if (png.ctype === 3) {
        const hex = [...png.plte].map((v) => v.toString(16).padStart(2, "0")).join("");
        cs = [PDFName.of("Indexed"), PDFName.of("DeviceRGB"), png.plte.length / 3 - 1, PDFHexString.of(hex)];
      }
      const ref = addImageObject(pdf, {
        Width: png.w, Height: png.h, ColorSpace: cs, BitsPerComponent: png.depth,
        Filter: "FlateDecode",
        DecodeParms: { Predictor: 15, Colors: n, BitsPerComponent: png.depth, Columns: png.w },
      }, png.stream);
      info = { ref, w: png.w, h: png.h, method: "png-original" };
    }
  }
  if (!info) info = await embedViaCanvas(pdf, file);
  console.log(file.name, "->", info.method);
  embedCache.set(file, info);
  return info;
}

// ---------- Build the PDF ----------
makeBtn.addEventListener("click", async () => {
  const S = readSettings();
  const cells = getCells(S);
  const perPage = cells.length;
  const seq = buildSequence(S);

  makeBtn.disabled = true;
  again.hidden = true;
  bar.hidden = false;
  bar.value = 0;
  embedCache.clear();
  const pdf = await PDFDocument.create();
  // Ask the print dialog NOT to scale the page (keeps 13 x 19 in exact)
  pdf.catalog.set(PDFName.of("ViewerPreferences"), pdf.context.obj({ PrintScaling: "None" }));
  const failed = [];
  let imgCounter = 0;

  try {
    for (let i = 0; i < seq.length; i += perPage) {
      const page = pdf.addPage([S.W, S.H]);
      const group = seq.slice(i, i + perPage);
      const rects = [];

      for (let j = 0; j < group.length; j++) {
        const n = i + j + 1;
        const file = files[group[j]];
        setStatus(`Processing image ${n} of ${seq.length}…`);
        bar.value = (n / seq.length) * 95;
        await tick();
        const cell = cells[j];
        try {
          const info = await embedImage(pdf, file);
          const pl = placeImage(cell, info.w, info.h, S);
          rects.push(pl.vis);

          const key = PDFName.of("Im" + ++imgCounter);
          page.node.setXObject(key, info.ref);
          const d = pl.draw;
          const X = d.x, Y = S.H - d.y - d.h;            // bottom-left in PDF coordinates
          const ops = [pushGraphicsState()];
          if (S.fit === "fill") {
            ops.push(rectangle(cell.x, S.H - cell.y - cell.h, cell.w, cell.h), clip(), endPath());
          }
          ops.push(pl.rot
            ? concatTransformationMatrix(0, -d.h, d.w, 0, X, Y + d.h)   // turned 90° clockwise
            : concatTransformationMatrix(d.w, 0, 0, d.h, X, Y));
          ops.push(drawObject(key), popGraphicsState());
          page.pushOperators(...ops);
        } catch (e) {
          console.error(file.name, e);
          failed.push(file.name);
          rects.push(cell);
        }
      }

      // Cut marks: single black ink, thin vector lines
      for (const m of getMarks(rects, S)) {
        page.drawLine({
          start: { x: m.x1, y: S.H - m.y1 },
          end: { x: m.x2, y: S.H - m.y2 },
          thickness: 0.5,
          color: cmyk(0, 0, 0, 1),
        });
      }
    }

    setStatus("Saving PDF…");
    bar.value = 98;
    await tick();
    const bytes = await pdf.save();

    if (lastPdfUrl) URL.revokeObjectURL(lastPdfUrl);
    lastPdfUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const folderName = (files[0].webkitRelativePath || "images").split("/")[0];
    lastPdfName = `${folderName}_13x19.pdf`;
    downloadLast();

    bar.value = 100;
    const mb = (bytes.length / 1048576).toFixed(1);
    let msg = `Done. ${pdf.getPageCount()} pages, ${mb} MB.`;
    if (failed.length) msg += ` Could not read: ${failed.join(", ")}`;
    setStatus(msg, failed.length > 0);
    again.hidden = false;
  } catch (e) {
    console.error(e);
    setStatus("Something went wrong: " + e.message, true);
  } finally {
    makeBtn.disabled = files.length === 0;
  }
});

function downloadLast() {
  const a = document.createElement("a");
  a.href = lastPdfUrl;
  a.download = lastPdfName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
again.addEventListener("click", downloadLast);

drawPreview();
