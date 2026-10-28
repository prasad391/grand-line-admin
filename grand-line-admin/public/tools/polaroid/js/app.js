/* Polaroid Studio — no dependencies. All processing happens in your browser. */
(() => {
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const PI = Math.PI;

/* ------------------------------------------------------------------ data */
const PRESETS = {
  wide:    { label: 'Wide · 6.8 × 5.4 cm (photo 6.2 × 5.2)',    w: 6.8,  h: 5.4, pw: 6.2, ph: 5.2, top: 0.1 },
  classic: { label: 'Classic · 7.2 × 8.6 cm (photo 6.2 × 6.2)', w: 7.2,  h: 8.6, pw: 6.2, ph: 6.2, top: 0.5 },
  mini:    { label: 'Mini · 5.4 × 8.6 cm (photo 4.6 × 6.2)',    w: 5.4,  h: 8.6, pw: 4.6, ph: 6.2, top: 0.5 },
  instaxw: { label: 'Wide card · 10.8 × 8.6 cm (photo 9.9 × 6.2)', w: 10.8, h: 8.6, pw: 9.9, ph: 6.2, top: 0.5 },
  custom:  { label: 'Custom size…' },
};

const FONTS = [
  { label: 'Caveat (handwriting)',   css: "'Caveat','Segoe Print','Bradley Hand',cursive" },
  { label: 'Reenie Beanie',          css: "'Reenie Beanie','Segoe Print',cursive" },
  { label: 'Patrick Hand',           css: "'Patrick Hand','Segoe Print',cursive" },
  { label: 'Shadows Into Light',     css: "'Shadows Into Light','Segoe Print',cursive" },
  { label: 'Homemade Apple',         css: "'Homemade Apple','Brush Script MT',cursive" },
  { label: 'Permanent Marker',       css: "'Permanent Marker','Marker Felt',fantasy" },
  { label: 'Special Elite (typewriter)', css: "'Special Elite','Courier New',monospace" },
  { label: 'Classic serif',          css: "Georgia,'Times New Roman',serif" },
  { label: 'Clean sans',             css: "Inter,Helvetica,Arial,sans-serif" },
];

const FILTER_PRESETS = {
  none:     { label: 'Original',  v: {} },
  bw:       { label: 'B&W',       v: { grayscale: 100, contrast: 115 } },
  sepia:    { label: 'Sepia',     v: { sepia: 80, contrast: 105, brightness: 102 } },
  vintage:  { label: 'Vintage',   v: { sepia: 35, contrast: 92, saturate: 85, fade: 22, vignette: 35, brightness: 104 } },
  warm:     { label: 'Warm',      v: { sepia: 20, saturate: 120, brightness: 104, hue: -8 } },
  cool:     { label: 'Cool',      v: { saturate: 95, hue: 12, brightness: 102, contrast: 104 } },
  vivid:    { label: 'Vivid',     v: { saturate: 150, contrast: 112 } },
  dramatic: { label: 'Dramatic',  v: { contrast: 140, saturate: 90, brightness: 92, vignette: 45 } },
  fade:     { label: 'Faded',     v: { fade: 40, contrast: 90, saturate: 90, brightness: 106 } },
};
const FILTER_KEYS = ['brightness','contrast','saturate','sepia','grayscale','hue','blur','fade','vignette'];
const FILTER_DEFAULT = { brightness:100, contrast:100, saturate:100, sepia:0, grayscale:0, hue:0, blur:0, fade:0, vignette:0 };
const FRAME_KEYS = ['w','h','pw','ph','top'];

const PAPERS = { a4:[21,29.7], a3:[29.7,42], a5:[14.8,21], letter:[21.59,27.94], '4x6':[10.16,15.24], '5x7':[12.7,17.78], '6x8':[15.24,20.32] };

const PHOTO_SLIDERS  = [['zoom','Zoom',0.2,5,0.01,'×'],['panX','Move left / right',-8,8,0.01,' cm'],['panY','Move up / down',-8,8,0.01,' cm'],['rot','Rotate',-180,180,0.5,'°']];
const FILTER_SLIDERS = [['brightness','Brightness',0,200,1,'%'],['contrast','Contrast',0,200,1,'%'],['saturate','Saturation',0,300,1,'%'],['sepia','Warm / sepia',0,100,1,'%'],['grayscale','Black & white',0,100,1,'%'],['hue','Hue shift',-180,180,1,'°'],['blur','Soften',0,10,0.1,' mm'],['fade','Faded film',0,100,1,'%'],['vignette','Vignette',0,100,1,'%']];
const FRAME_SLIDERS  = [['radius','Card corner radius',0,1,0.01,' cm'],['photoRadius','Photo corner radius',0,1,0.01,' cm']];
const CAP_SLIDERS    = [['capSize','Text size',0.2,1.5,0.01,' cm'],['capY','Vertical nudge',-1,1,0.01,' cm']];
const SWATCHES = ['#fbfaf6','#ffffff','#f3e9d2','#f6d9d9','#d8e6f3','#d9efd9','#2b2b2b','#111111'];

const state = { items: [], cur: -1, view: 1, k: 1 };
let uid = 0;

const E = {   // export options
  format:'png', quality:0.95, dpi:300, bg:'transparent', bgColor:'#ffffff', pad:0, shadow:false,
  pattern:'polaroid-{n}', bundle:'zip',
  paper:'a4', orient:'portrait', sheetScope:'all', copies:1, margin:1, gap:0.5, marks:true, sheetFormat:'pdf',
};

function newItem(o = {}) {
  const p = PRESETS.wide;
  uid++;
  return Object.assign({
    id: uid, name: 'Polaroid ' + uid, file: null, prev: null, iw: 0, ih: 0,
    frame: 'wide', w: p.w, h: p.h, pw: p.pw, ph: p.ph, top: p.top,
    fit: 'fill', zoom: 1, panX: 0, panY: 0, rot: 0, flipH: false, flipV: false, photoBg: '#e8e4dc',
    preset: 'none',
    caption: '', font: FONTS[0].css, capSize: 0.5, capColor: '#2b2b2b', capY: 0,
    frameColor: '#fbfaf6', radius: 0.12, photoRadius: 0, paper: true, edge: true,
  }, FILTER_DEFAULT, o);
}
const cur = () => state.items[state.cur] || null;

/* --------------------------------------------------------------- drawing */
function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (r <= 0) { ctx.rect(x, y, w, h); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const FILTER_OK = (() => { try { return 'filter' in document.createElement('canvas').getContext('2d'); } catch { return false; } })();

function filterString(it, k) {
  const parts = [];
  if (it.brightness !== 100) parts.push(`brightness(${it.brightness}%)`);
  if (it.contrast   !== 100) parts.push(`contrast(${it.contrast}%)`);
  if (it.saturate   !== 100) parts.push(`saturate(${it.saturate}%)`);
  if (it.sepia)     parts.push(`sepia(${it.sepia}%)`);
  if (it.grayscale) parts.push(`grayscale(${it.grayscale}%)`);
  if (it.hue)       parts.push(`hue-rotate(${it.hue}deg)`);
  if (it.blur)      parts.push(`blur(${(it.blur / 10 * k).toFixed(2)}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

/* k = pixels per cm.  o = { src, placeholder, shadow(cm) } */
function drawPolaroid(ctx, it, k, o = {}) {
  const W = it.w * k, H = it.h * k;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // card
  if (o.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = o.shadow * k;
    ctx.shadowOffsetY = o.shadow * k * 0.35;
  }
  ctx.fillStyle = it.frameColor;
  rr(ctx, 0, 0, W, H, it.radius * k); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  if (it.paper) {
    ctx.save();
    rr(ctx, 0, 0, W, H, it.radius * k); ctx.clip();
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(255,255,255,.38)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,.06)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // photo area
  const px = (it.w - it.pw) / 2 * k, py = it.top * k, pw = it.pw * k, ph = it.ph * k;
  const pr = it.photoRadius * k;
  ctx.save();
  rr(ctx, px, py, pw, ph, pr); ctx.clip();
  ctx.fillStyle = it.photoBg; ctx.fillRect(px, py, pw, ph);

  const src = o.src || it.prev;
  if (src && it.iw) {
    ctx.save();
    ctx.translate(px + pw / 2 + it.panX * k, py + ph / 2 + it.panY * k);
    ctx.rotate(it.rot * PI / 180);
    ctx.scale(it.flipH ? -1 : 1, it.flipV ? -1 : 1);
    let s;
    if (it.fit === 'fit') {
      s = Math.min(pw / it.iw, ph / it.ih);
    } else {
      const a = Math.abs(it.rot * PI / 180), c = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
      const bw = pw * c + ph * sn, bh = pw * sn + ph * c;
      s = Math.max(bw / it.iw, bh / it.ih);
    }
    s *= it.zoom;
    if (FILTER_OK) ctx.filter = filterString(it, k);
    ctx.drawImage(src, -it.iw * s / 2, -it.ih * s / 2, it.iw * s, it.ih * s);
    ctx.restore();
    if (FILTER_OK) ctx.filter = 'none';

    if (it.fade) {
      ctx.fillStyle = `rgba(255,244,226,${(it.fade / 100 * 0.45).toFixed(3)})`;
      ctx.fillRect(px, py, pw, ph);
    }
    if (it.vignette) {
      const cx = px + pw / 2, cy = py + ph / 2, rad = Math.hypot(pw, ph) / 2;
      const g = ctx.createRadialGradient(cx, cy, rad * 0.35, cx, cy, rad);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${(it.vignette / 100 * 0.7).toFixed(3)})`);
      ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph);
    }
  } else if (o.placeholder) {
    ctx.fillStyle = '#e2ddd2'; ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2;
    ctx.strokeRect(px + 10, py + 10, pw - 20, ph - 20); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = Math.max(10, Math.min(pw, ph) * 0.07);
    ctx.font = `600 ${fs}px Inter,sans-serif`;
    ctx.fillText('Photo area', px + pw / 2, py + ph / 2 - fs * 0.8);
    ctx.font = `${fs * 0.85}px Inter,sans-serif`;
    ctx.fillText(`${it.pw} × ${it.ph} cm`, px + pw / 2, py + ph / 2 + fs * 0.6);
    ctx.fillText('drop or add an image', px + pw / 2, py + ph / 2 + fs * 1.8);
  }
  ctx.restore();

  if (it.edge && (src || o.placeholder)) {
    ctx.save();
    rr(ctx, px, py, pw, ph, pr);
    ctx.lineWidth = Math.max(1, 0.015 * k); ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.stroke();
    ctx.restore();
  }

  // caption
  const bottom = it.h - (it.top + it.ph);
  if (it.caption && bottom >= 0.5) {
    let size = it.capSize * k;
    ctx.font = `${size}px ${it.font}`;
    const maxW = W * 0.88, m = ctx.measureText(it.caption).width;
    if (m > maxW) { size *= maxW / m; ctx.font = `${size}px ${it.font}`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = it.capColor;
    ctx.fillText(it.caption, W / 2, (it.top + it.ph + bottom / 2 + it.capY) * k);
  }
  ctx.restore();
}

/* ------------------------------------------------------------ rendering */
let raf = 0;
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderStage(); }); }

function renderStage() {
  const it = cur();
  const cv = $('#stage');
  $('#emptyState').hidden = !!it;
  cv.hidden = !it;
  $('#idx').textContent = `${it ? state.cur + 1 : 0} / ${state.items.length}`;
  $$('.panel').forEach(p => p.classList.toggle('disabled', !it));
  if (!it) return;
  const wrap = $('#stageWrap');
  const aw = Math.max(80, wrap.clientWidth - 60), ah = Math.max(80, wrap.clientHeight - 60);
  const fit = Math.min(aw / it.w, ah / it.h);
  const k = fit * state.view;
  state.k = k;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cw = Math.round(it.w * k * dpr), ch = Math.round(it.h * k * dpr);
  const lim = Math.min(1, 4096 / Math.max(cw, ch));
  cw = Math.round(cw * lim); ch = Math.round(ch * lim);
  cv.style.width = (it.w * k) + 'px';
  cv.style.height = (it.h * k) + 'px';
  if (cv.width !== cw) cv.width = cw;
  if (cv.height !== ch) cv.height = ch;
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  drawPolaroid(ctx, it, cw / it.w, { placeholder: true });
  cv.classList.toggle('grab', !!it.prev);
  markThumbDirty(it);
  updateExportInfo();
}

const thumbDirty = new Set();
let thumbRaf = 0;
function markThumbDirty(it) {
  thumbDirty.add(it.id);
  if (!thumbRaf) thumbRaf = requestAnimationFrame(() => {
    thumbRaf = 0;
    thumbDirty.forEach(id => {
      const item = state.items.find(x => x.id === id);
      const cv = document.querySelector(`.item[data-id="${id}"] canvas`);
      if (item && cv) paintThumb(cv, item);
    });
    thumbDirty.clear();
  });
}
function paintThumb(cv, it) {
  const kk = Math.min(58 / it.w, 58 / it.h) * 2; // 2x for sharpness
  cv.width = Math.round(it.w * kk); cv.height = Math.round(it.h * kk);
  cv.style.width = (cv.width / 2) + 'px'; cv.style.height = (cv.height / 2) + 'px';
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  drawPolaroid(ctx, it, kk, { placeholder: true });
}

/* ---------------------------------------------------------------- list */
function buildList() {
  const ul = $('#list');
  ul.innerHTML = '';
  state.items.forEach((it, i) => {
    const li = document.createElement('li');
    li.className = 'item' + (i === state.cur ? ' active' : '');
    li.dataset.id = it.id; li.draggable = true;
    li.innerHTML = `<canvas></canvas><div class="meta"><div class="nm"></div><div class="sz"></div></div>
      <div class="acts"><button data-a="dup" title="Duplicate">⧉</button><button data-a="del" title="Remove">✕</button></div>`;
    $('.nm', li).textContent = `${i + 1}. ${it.name}`;
    $('.sz', li).textContent = `${it.w} × ${it.h} cm`;
    paintThumb($('canvas', li), it);
    li.addEventListener('click', e => {
      const a = e.target.dataset.a;
      if (a === 'del') return removeItem(i);
      if (a === 'dup') return dupItem(i);
      select(i);
    });
    li.addEventListener('dragstart', e => { li.classList.add('dragging'); e.dataTransfer.setData('text/x-idx', String(i)); e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-idx')) e.preventDefault(); });
    li.addEventListener('drop', e => {
      const from = parseInt(e.dataTransfer.getData('text/x-idx'), 10);
      if (isNaN(from)) return;
      e.preventDefault(); e.stopPropagation();
      const curId = cur() && cur().id;
      const [m] = state.items.splice(from, 1);
      state.items.splice(i, 0, m);
      state.cur = state.items.findIndex(x => x.id === curId);
      buildList(); schedule();
    });
    ul.appendChild(li);
  });
}
function highlightList() {
  $$('#list .item').forEach((li, i) => li.classList.toggle('active', i === state.cur));
  const a = $('#list .item.active'); if (a) a.scrollIntoView({ block: 'nearest' });
}
function select(i) {
  if (i < 0 || i >= state.items.length) return;
  state.cur = i; highlightList(); syncControls(); schedule();
  if (!$('#modal').hidden && modalMode === 'single') renderModal();
}
function removeItem(i) {
  state.items.splice(i, 1);
  state.cur = Math.min(state.cur, state.items.length - 1);
  if (state.items.length && state.cur < 0) state.cur = 0;
  buildList(); syncControls(); schedule();
}
function dupItem(i) {
  const c = Object.assign({}, state.items[i], { id: ++uid });
  c.name = c.name + ' copy';
  state.items.splice(i + 1, 0, c);
  state.cur = i + 1; buildList(); syncControls(); schedule();
}

/* ------------------------------------------------------------ loading */
async function decodeFull(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) {
    return await new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(url), 2000); };
      im.onerror = () => rej(new Error('Could not read ' + file.name));
      im.src = url;
    });
  }
}
const dimsOf = s => ({ w: s.width || s.naturalWidth, h: s.height || s.naturalHeight });

async function loadFile(file) {
  const bmp = await decodeFull(file);
  const { w, h } = dimsOf(bmp);
  const sc = Math.min(1, 2400 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
  x.drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return { prev: c, iw: w, ih: h };
}
const baseName = n => n.replace(/\.[^.]+$/, '');

async function addFiles(files) {
  files = [...files].filter(f => f.type.startsWith('image/') || /\.(heic|heif|avif|webp|png|jpe?g|gif|bmp)$/i.test(f.name));
  if (!files.length) return toast('No image files found', 0, 1800);
  // new photos inherit the frame/style of the current polaroid (if any)
  const base = cur();
  const inherit = base ? Object.fromEntries([...FRAME_KEYS, 'frame', 'frameColor', 'radius', 'photoRadius', 'paper', 'edge', 'font', 'capColor', 'capSize'].map(k => [k, base[k]])) : {};
  let first = -1, n = 0;
  for (const f of files) {
    toast(`Loading photos… ${++n}/${files.length}`, n / files.length);
    try {
      const d = await loadFile(f);
      const it = newItem(Object.assign({ name: baseName(f.name), file: f }, inherit, d));
      state.items.push(it);
      if (first < 0) first = state.items.length - 1;
    } catch (e) { console.warn(e); }
  }
  toastHide();
  buildList();
  if (first >= 0) select(first);
}
function addEmpty() {
  const base = cur();
  const inherit = base ? Object.fromEntries([...FRAME_KEYS, 'frame', 'frameColor', 'radius', 'photoRadius', 'paper', 'edge', 'font', 'capColor', 'capSize'].map(k => [k, base[k]])) : {};
  state.items.push(newItem(inherit));
  buildList(); select(state.items.length - 1);
}
async function replaceImage(file) {
  const it = cur(); if (!it || !file) return;
  const d = await loadFile(file);
  Object.assign(it, d, { file, zoom: 1, panX: 0, panY: 0 });
  if (!it.name || /^Polaroid \d+$/.test(it.name)) it.name = baseName(file.name);
  buildList(); syncControls(); schedule();
}

/* ------------------------------------------------------------- controls */
function mkSlider(container, spec) {
  const [k, label, min, max, step, unit] = spec;
  const row = document.createElement('label');
  row.className = 'row';
  row.innerHTML = `<span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}"><output data-o="${k}" data-u="${unit}"></output>`;
  container.appendChild(row);
}
function fmt(v, step) {
  const d = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  return (+v).toFixed(d);
}

function syncControls() {
  const it = cur();
  if (!it) return;
  $$('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (!(k in it)) return;
    if (el.type === 'checkbox') el.checked = !!it[k];
    else if (el.tagName === 'SELECT' && k === 'font') el.value = it.font;
    else el.value = it[k];
    const out = $(`[data-o="${k}"]`);
    if (out) out.textContent = fmt(it[k], el.step || 1) + out.dataset.u;
  });
  $('#framePreset').value = it.frame;
  $$('#chips .chip').forEach(c => c.classList.toggle('active', c.dataset.p === it.preset));
  $('#frameWarn').hidden = !(it.pw > it.w + 1e-6 || it.top + it.ph > it.h + 1e-6);
  $('#capHint').hidden = (it.h - it.top - it.ph) >= 0.5;
  $('#stageFoot').textContent = it.prev ? 'Drag the photo to move it · scroll wheel to zoom' : 'Add an image to this polaroid (Photo tab → Replace image, or drop a file on the list)';
  $('.item.active .nm') && ($('.item.active .nm').textContent = `${state.cur + 1}. ${it.name}`);
  $('.item.active .sz') && ($('.item.active .sz').textContent = `${it.w} × ${it.h} cm`);
}

function onInput(e) {
  const el = e.target, k = el.dataset.k, it = cur();
  if (!k || !it) return;
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'number' || el.type === 'range') { v = parseFloat(el.value); if (!isFinite(v)) return; }
  else v = el.value;
  if (FRAME_KEYS.includes(k)) { if (v <= 0 && k !== 'top') return; if (v < 0) return; }
  it[k] = v;
  if (FRAME_KEYS.includes(k)) it.frame = 'custom';
  if (FILTER_KEYS.includes(k)) it.preset = 'custom';
  syncControls(); schedule();
}

function applyFilterPreset(key) {
  const it = cur(); if (!it) return;
  Object.assign(it, FILTER_DEFAULT, FILTER_PRESETS[key].v);
  it.preset = key; syncControls(); schedule();
}
function setFramePreset(it, key) {
  it.frame = key;
  if (key !== 'custom') { const p = PRESETS[key]; FRAME_KEYS.forEach(k => it[k] = p[k]); }
}

function bindUI() {
  // sliders
  PHOTO_SLIDERS.forEach(s => mkSlider($('#photoSliders'), s));
  FILTER_SLIDERS.forEach(s => mkSlider($('#filterSliders'), s));
  FRAME_SLIDERS.forEach(s => mkSlider($('#frameSliders'), s));
  CAP_SLIDERS.forEach(s => mkSlider($('#capSliders'), s));
  $('#framePreset').innerHTML = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('');
  $('#fontSel').innerHTML = FONTS.map(f => `<option value="${f.css.replace(/"/g, '&quot;')}">${f.label}</option>`).join('');
  $('#chips').innerHTML = Object.entries(FILTER_PRESETS).map(([k, p]) => `<button class="chip" data-p="${k}">${p.label}</button>`).join('');
  $('#swatches').innerHTML = SWATCHES.map(c => `<span class="sw" data-c="${c}" style="background:${c}" title="${c}"></span>`).join('');
  if (!FILTER_OK) $('#filterNote').hidden = false;

  $('#controls').addEventListener('input', e => { if (e.target.dataset.k) onInput(e); });
  $('#controls').addEventListener('change', e => { if (e.target.dataset.k && e.target.tagName === 'SELECT') onInput(e); });

  $('#chips').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) applyFilterPreset(c.dataset.p); });
  $('#swatches').addEventListener('click', e => { const c = e.target.dataset.c; if (c && cur()) { cur().frameColor = c; syncControls(); schedule(); } });
  $('#framePreset').addEventListener('change', e => {
    const it = cur(); if (!it) return;
    setFramePreset(it, e.target.value); syncControls(); schedule();
  });

  // tabs
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === t));
    $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === t.dataset.tab));
  }));

  // photo buttons
  const mod = fn => () => { const it = cur(); if (it) { fn(it); syncControls(); schedule(); } };
  $('#rotL').onclick = mod(it => it.rot = norm180(it.rot - 90));
  $('#rotR').onclick = mod(it => it.rot = norm180(it.rot + 90));
  $('#flipH').onclick = mod(it => it.flipH = !it.flipH);
  $('#flipV').onclick = mod(it => it.flipV = !it.flipV);
  $('#btnFitPhoto').onclick = mod(it => { it.zoom = 1; it.panX = 0; it.panY = 0; it.rot = 0; it.flipH = it.flipV = false; });
  $('#resetFilters').onclick = mod(it => { Object.assign(it, FILTER_DEFAULT); it.preset = 'none'; });
  $('#swapFrame').onclick = mod(it => {
    const bottom = it.h - it.top - it.ph;
    [it.w, it.h] = [it.h, it.w]; [it.pw, it.ph] = [it.ph, it.pw];
    it.top = Math.max(0, (it.h - it.ph - Math.max(0, bottom)) / 2 > 0 ? it.top : 0.1);
    it.frame = 'custom';
  });
  $('#btnReplace').onclick = () => $('#replaceInput').click();
  $('#replaceInput').onchange = e => { replaceImage(e.target.files[0]); e.target.value = ''; };

  // apply-to-all
  const all = (keys, label) => () => {
    const it = cur(); if (!it) return;
    state.items.forEach(o => keys.forEach(k => o[k] = it[k]));
    buildList(); syncControls(); schedule(); toast(label, 0, 1600);
  };
  $('#applyFilters').onclick = all([...FILTER_KEYS, 'preset'], 'Filters applied to all');
  $('#applyFrame').onclick = all([...FRAME_KEYS, 'frame'], 'Frame size applied to all');
  $('#applyStyle').onclick = all(['frameColor', 'radius', 'photoRadius', 'paper', 'edge'], 'Style applied to all');
  $('#applyCaption').onclick = all(['font', 'capColor', 'capSize', 'capY'], 'Caption style applied to all');
  $('#capFromName').onclick = mod(it => it.caption = it.name);
  $('#capNumber').onclick = () => { state.items.forEach((it, i) => it.caption = String(i + 1)); syncControls(); schedule(); };

  // add / list
  const pick = () => $('#fileInput').click();
  $('#btnAdd').onclick = pick; $('#btnAdd2').onclick = pick; $('#dropzone').onclick = pick;
  $('#fileInput').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  $('#btnEmpty').onclick = addEmpty;
  $('#btnClear').onclick = () => { if (state.items.length && confirm('Remove all polaroids?')) { state.items = []; state.cur = -1; buildList(); syncControls(); schedule(); } };

  // nav
  $('#btnPrev').onclick = () => select((state.cur - 1 + state.items.length) % state.items.length);
  $('#btnNext').onclick = () => select((state.cur + 1) % state.items.length);
  $('#stageZoom').oninput = e => { state.view = parseFloat(e.target.value); schedule(); };
  $('#btnFitView').onclick = () => { state.view = 1; $('#stageZoom').value = 1; schedule(); };
  $('#btnTheme').onclick = () => {
    const d = document.documentElement; d.dataset.theme = d.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('ps-theme', d.dataset.theme); } catch {}
  };
  try { const t = localStorage.getItem('ps-theme'); if (t) document.documentElement.dataset.theme = t; } catch {}

  // export options
  $$('[data-e]').forEach(el => {
    const k = el.dataset.e;
    if (el.type === 'checkbox') el.checked = !!E[k]; else el.value = E[k];
    const upd = () => {
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'number' || el.type === 'range') { v = parseFloat(el.value); if (!isFinite(v)) return; }
      else v = el.value;
      E[k] = v;
      const o = $(`[data-eo="${k}"]`); if (o) o.textContent = Math.round(v * 100) + '%';
      $('#bgColorRow').hidden = E.bg !== 'custom';
      $('#qualRow').style.display = (E.format === 'jpeg' || E.format === 'webp' || E.format === 'pdf') ? '' : 'none';
      updateExportInfo();
    };
    el.addEventListener('input', upd); el.addEventListener('change', upd); upd();
  });
  $('#dpiSel').onchange = e => {
    const custom = e.target.value === 'custom';
    $('#dpiCustomRow').hidden = !custom;
    E.dpi = custom ? parseFloat($('#dpiCustom').value) || 300 : parseFloat(e.target.value);
    updateExportInfo();
  };
  $('#dpiCustom').oninput = e => { E.dpi = Math.max(50, Math.min(2400, parseFloat(e.target.value) || 300)); updateExportInfo(); };

  $('#btnExportCur').onclick = $('#expCur').onclick = () => exportCurrent();
  $('#btnExportAll').onclick = $('#expAll').onclick = () => exportAll();
  $('#sheetPreview').onclick = () => openModal('sheet');
  $('#sheetExport').onclick = () => exportSheet();

  // preview modal
  $('#btnPreview').onclick = () => cur() && openModal('single');
  $('#btnGrid').onclick = () => state.items.length && openModal('grid');
  $('#mClose').onclick = closeModal;
  $('#mPrev').onclick = () => { $('#btnPrev').click(); };
  $('#mNext').onclick = () => { $('#btnNext').click(); };
  $('#mGrid').onclick = () => openModal('grid');
  $('#mExport').onclick = () => exportCurrent();

  bindStage();
  bindGlobal();
  window.addEventListener('resize', schedule);
}
const norm180 = v => { v = ((v + 180) % 360 + 360) % 360 - 180; return v === -180 ? 180 : v; };

/* ----------------------------------------------------- stage interaction */
function bindStage() {
  const cv = $('#stage');
  let drag = null;
  const inPhoto = (it, ev) => {
    const r = cv.getBoundingClientRect(), k = state.k;
    const x = (ev.clientX - r.left) / k, y = (ev.clientY - r.top) / k;
    const x0 = (it.w - it.pw) / 2;
    return x >= x0 && x <= x0 + it.pw && y >= it.top && y <= it.top + it.ph;
  };
  cv.addEventListener('pointerdown', e => {
    const it = cur(); if (!it || !it.prev || !inPhoto(it, e)) return;
    drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); cv.classList.add('grabbing');
  });
  cv.addEventListener('pointermove', e => {
    const it = cur(); if (!drag || !it) return;
    it.panX += (e.clientX - drag.x) / state.k; it.panY += (e.clientY - drag.y) / state.k;
    it.panX = Math.max(-8, Math.min(8, it.panX)); it.panY = Math.max(-8, Math.min(8, it.panY));
    drag.x = e.clientX; drag.y = e.clientY; it.preset = it.preset; syncControls(); schedule();
  });
  const end = () => { drag = null; cv.classList.remove('grabbing'); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', e => {
    const it = cur(); if (!it || !it.prev || !inPhoto(it, e)) return;
    e.preventDefault();
    it.zoom = Math.max(0.2, Math.min(5, it.zoom * Math.exp(-e.deltaY * 0.0015)));
    syncControls(); schedule();
  }, { passive: false });
  cv.addEventListener('dblclick', e => { const it = cur(); if (it && inPhoto(it, e)) { it.zoom = 1; it.panX = it.panY = 0; syncControls(); schedule(); } });
}

function bindGlobal() {
  // drag & drop files anywhere
  let depth = 0;
  window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { depth++; $('#dragOver').hidden = false; } });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) $('#dragOver').hidden = true; });
  window.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', e => {
    depth = 0; $('#dragOver').hidden = true;
    if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); }
  });
  window.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) addFiles(files);
  });
  window.addEventListener('keydown', e => {
    const t = e.target;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
    if (e.key === 'Escape' && !$('#modal').hidden) return closeModal();
    if (e.key === 'ArrowLeft' && state.items.length) { e.preventDefault(); $('#btnPrev').click(); }
    if (e.key === 'ArrowRight' && state.items.length) { e.preventDefault(); $('#btnNext').click(); }
  });
}

/* ------------------------------------------------------------------ modal */
let modalMode = 'single';
function openModal(mode) { modalMode = mode; $('#modal').hidden = false; renderModal(); }
function closeModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; }

async function renderModal() {
  const body = $('#modalBody'), title = $('#modalTitle');
  body.innerHTML = '';
  const single = modalMode === 'single';
  $('#mPrev').hidden = $('#mNext').hidden = $('#mExport').hidden = !single;
  $('#mGrid').hidden = modalMode === 'grid';
  if (modalMode === 'single') {
    const it = cur(); if (!it) return closeModal();
    title.textContent = `Preview · ${state.cur + 1}/${state.items.length} · ${it.name} · ${it.w} × ${it.h} cm`;
    const k = Math.min((window.innerWidth - 120) / it.w, (window.innerHeight - 190) / it.h);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cv = document.createElement('canvas');
    cv.width = Math.round(it.w * k * dpr); cv.height = Math.round(it.h * k * dpr);
    cv.style.width = it.w * k + 'px'; cv.style.height = it.h * k + 'px';
    drawPolaroid(cv.getContext('2d'), it, cv.width / it.w, {});
    body.appendChild(cv);
  } else if (modalMode === 'grid') {
    title.textContent = `All polaroids (${state.items.length}) — click one to open it`;
    const wrap = document.createElement('div'); wrap.className = 'gridview';
    const k = 26, dpr = 2;
    state.items.forEach((it, i) => {
      const cell = document.createElement('div'); cell.className = 'gcell' + (i === state.cur ? ' cur' : '');
      const cv = document.createElement('canvas');
      cv.width = Math.round(it.w * k * dpr); cv.height = Math.round(it.h * k * dpr);
      cv.style.width = it.w * k + 'px'; cv.style.height = it.h * k + 'px';
      drawPolaroid(cv.getContext('2d'), it, cv.width / it.w, { placeholder: true });
      const s = document.createElement('small'); s.textContent = `${i + 1}. ${it.name}`;
      cell.append(cv, s);
      cell.onclick = () => { state.cur = i; highlightList(); syncControls(); schedule(); openModal('single'); };
      wrap.appendChild(cell);
    });
    body.appendChild(wrap);
  } else {
    title.textContent = 'Print sheet preview';
    const items = sheetItems();
    if (!items.length) { body.textContent = 'Nothing to preview.'; return; }
    const pages = layoutSheet(items);
    title.textContent = `Print sheet preview · ${pages.length} page${pages.length > 1 ? 's' : ''} · ${E.paper.toUpperCase()} ${E.orient}`;
    const wrap = document.createElement('div'); wrap.className = 'sheets';
    const dpi = 90;
    for (const pg of pages) wrap.appendChild(await renderSheetPage(pg, dpi, false));
    body.appendChild(wrap);
  }
}

/* ------------------------------------------------------------- exporting */
function pxSize(it, dpi, pad) {
  const k = dpi / 2.54;
  return [Math.round((it.w + 2 * pad) * k), Math.round((it.h + 2 * pad) * k)];
}
function effPad() { return E.shadow ? Math.max(E.pad, 0.5) : E.pad; }

function updateExportInfo() {
  const it = cur(), box = $('#exportInfo');
  if (!box) return;
  if (!it) { box.textContent = 'Add a photo to see the export size.'; return; }
  const [w, h] = pxSize(it, E.dpi, effPad());
  const mp = (w * h / 1e6).toFixed(1);
  const warn = (w > 16000 || h > 16000 || w * h > 150e6) ? ' <b style="color:#d1481f">· too large, will be reduced</b>' : '';
  box.innerHTML = `Current: <b>${w} × ${h} px</b> (${mp} MP) at ${E.dpi} DPI · prints at <b>${(it.w + 2 * effPad()).toFixed(2)} × ${(it.h + 2 * effPad()).toFixed(2)} cm</b>${warn}`;
}

function safeDpi(it, dpi, pad) {
  let [w, h] = pxSize(it, dpi, pad);
  const f = Math.min(1, 16000 / Math.max(w, h), Math.sqrt(150e6 / (w * h)));
  return f < 1 ? dpi * f : dpi;
}

async function ensureFont(it) {
  if (!it.caption) return;
  try { await document.fonts.load(`40px ${it.font}`, it.caption); } catch {}
}

async function renderExport(it) {
  await ensureFont(it);
  const pad = effPad();
  const dpi = safeDpi(it, E.dpi, pad);
  const k = dpi / 2.54;
  const [W, H] = pxSize(it, dpi, pad);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const opaque = E.format === 'jpeg' || E.format === 'pdf';
  let bg = E.bg === 'transparent' ? null : (E.bg === 'white' ? '#ffffff' : E.bgColor);
  if (!bg && opaque) bg = '#ffffff';
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
  let src = null;
  if (it.file) { try { src = await decodeFull(it.file); } catch { src = null; } }
  ctx.save();
  ctx.translate(pad * k, pad * k);
  drawPolaroid(ctx, it, k, { src: src || undefined, shadow: E.shadow ? 0.25 : 0 });
  ctx.restore();
  if (src && src.close) src.close();
  return { cv, dpi, pad };
}

const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const EXT = { png: 'png', jpeg: 'jpg', webp: 'webp', pdf: 'pdf' };
const toBlob = (cv, type, q) => new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('Export failed (image too large?)')), type, q));

async function encodeCanvas(cv, dpi, fmt = E.format, physW = null, physH = null) {
  if (fmt === 'pdf') {
    const jpg = new Uint8Array(await (await toBlob(cv, 'image/jpeg', Math.max(0.9, E.quality))).arrayBuffer());
    const wpt = (physW != null ? physW : cv.width / dpi * 2.54) / 2.54 * 72;
    const hpt = (physH != null ? physH : cv.height / dpi * 2.54) / 2.54 * 72;
    return { bytes: buildPdf([{ jpg, w: cv.width, h: cv.height, wpt, hpt }]), type: 'application/pdf' };
  }
  const blob = await toBlob(cv, MIME[fmt], E.quality);
  let bytes = new Uint8Array(await blob.arrayBuffer());
  if (fmt === 'png') bytes = setPngDpi(bytes, dpi);
  else if (fmt === 'jpeg') setJpegDpi(bytes, dpi);
  return { bytes, type: MIME[fmt] };
}

function fileName(it, i) {
  const size = `${it.w}x${it.h}cm`;
  const clean = s => s.replace(/[\\/:*?"<>|]+/g, '_').trim();
  let n = (E.pattern || 'polaroid-{n}')
    .replace('{n}', String(i + 1).padStart(String(state.items.length).length, '0'))
    .replace('{name}', it.name).replace('{size}', size);
  return clean(n) || 'polaroid';
}

function download(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

let busy = false;
async function exportCurrent() {
  const it = cur(); if (!it || busy) return;
  busy = true;
  try {
    toast('Rendering…', 0.3);
    const { cv, dpi, pad } = await renderExport(it);
    const out = await encodeCanvas(cv, dpi, E.format, it.w + 2 * pad, it.h + 2 * pad);
    download(out.bytes, `${fileName(it, state.cur)}.${EXT[E.format]}`, out.type);
    toast('Saved ✓', 1, 1500);
  } catch (e) { alert(e.message); toastHide(); }
  busy = false;
}

async function exportAll() {
  if (!state.items.length || busy) return;
  busy = true;
  try {
    const files = [], used = new Set();
    for (let i = 0; i < state.items.length; i++) {
      const it = state.items[i];
      toast(`Rendering ${i + 1} / ${state.items.length}…`, i / state.items.length);
      const { cv, dpi, pad } = await renderExport(it);
      const out = await encodeCanvas(cv, dpi, E.format, it.w + 2 * pad, it.h + 2 * pad);
      let nm = fileName(it, i), n = nm, c = 2;
      while (used.has(n)) n = `${nm}-${c++}`;
      used.add(n);
      files.push({ name: `${n}.${EXT[E.format]}`, data: out.bytes, type: out.type });
      cv.width = cv.height = 1;
      await new Promise(r => setTimeout(r));
    }
    if (E.bundle === 'zip' && files.length > 1) {
      toast('Creating ZIP…', 0.95);
      download(makeZip(files), 'polaroids.zip');
    } else {
      for (const f of files) { download(f.data, f.name, f.type); await new Promise(r => setTimeout(r, 350)); }
    }
    toast(`Exported ${files.length} file${files.length > 1 ? 's' : ''} ✓`, 1, 2000);
  } catch (e) { alert(e.message); toastHide(); }
  busy = false;
}

/* ------------------------------------------------------------ print sheet */
function sheetItems() {
  const src = E.sheetScope === 'current' ? (cur() ? [cur()] : []) : state.items;
  const out = [];
  src.forEach(it => { for (let c = 0; c < Math.max(1, E.copies | 0); c++) out.push(it); });
  return out;
}
function layoutSheet(items) {
  let [pw, ph] = PAPERS[E.paper];
  if (E.orient === 'landscape' && pw < ph) [pw, ph] = [ph, pw];
  if (E.orient === 'portrait' && pw > ph) [pw, ph] = [ph, pw];
  const m = E.margin, gap = E.marks ? Math.max(E.gap, 0.5) : E.gap;
  const usableW = pw - 2 * m, usableH = ph - 2 * m;
  // rows
  const rows = []; let row = { items: [], w: 0, h: 0 };
  items.forEach(it => {
    const add = (row.items.length ? gap : 0) + it.w;
    if (row.items.length && row.w + add > usableW + 1e-6) { rows.push(row); row = { items: [], w: 0, h: 0 }; }
    row.w += (row.items.length ? gap : 0) + it.w; row.h = Math.max(row.h, it.h); row.items.push(it);
  });
  if (row.items.length) rows.push(row);
  // pages
  const pages = []; let page = null, y = 0;
  rows.forEach(r => {
    if (!page || (page.rows.length && y + r.h > usableH + 1e-6)) { page = { pw, ph, rows: [] }; pages.push(page); y = 0; }
    page.rows.push({ row: r, y }); y += r.h + gap;
  });
  const place = pages.map(pg => {
    const list = [];
    const totalH = pg.rows.reduce((s, r, i) => s + r.row.h + (i ? gap : 0), 0);
    const oy = m + Math.max(0, (usableH - totalH) / 2);
    pg.rows.forEach(({ row, y }) => {
      let x = m + Math.max(0, (usableW - row.w) / 2);
      row.items.forEach(it => { list.push({ it, x, y: oy + y + (row.h - it.h) / 2 }); x += it.w + gap; });
    });
    return { pw: pg.pw, ph: pg.ph, list };
  });
  return place;
}
async function renderSheetPage(pg, dpi, full) {
  const k = dpi / 2.54;
  const cv = document.createElement('canvas');
  cv.width = Math.round(pg.pw * k); cv.height = Math.round(pg.ph * k);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  const cache = new Map();
  for (const p of pg.list) {
    let src;
    if (full && p.it.file) {
      if (!cache.has(p.it.id)) { try { cache.set(p.it.id, await decodeFull(p.it.file)); } catch { cache.set(p.it.id, null); } }
      src = cache.get(p.it.id) || undefined;
    }
    if (full) await ensureFont(p.it);
    ctx.save(); ctx.translate(p.x * k, p.y * k);
    drawPolaroid(ctx, p.it, k, { src });
    ctx.restore();
    if (E.marks) {
      ctx.save(); ctx.strokeStyle = '#444'; ctx.lineWidth = Math.max(1, 0.012 * k);
      const L = 0.3 * k, o = 0.1 * k, x0 = p.x * k, y0 = p.y * k, x1 = (p.x + p.it.w) * k, y1 = (p.y + p.it.h) * k;
      ctx.beginPath();
      [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]].forEach(([x, y, dx, dy]) => {
        ctx.moveTo(x + dx * o, y); ctx.lineTo(x + dx * (o + L), y);
        ctx.moveTo(x, y + dy * o); ctx.lineTo(x, y + dy * (o + L));
      });
      ctx.stroke(); ctx.restore();
    }
  }
  cache.forEach(b => b && b.close && b.close());
  return cv;
}
async function exportSheet() {
  if (busy) return;
  const items = sheetItems(); if (!items.length) return toast('Add polaroids first', 0, 1500);
  busy = true;
  try {
    const pages = layoutSheet(items);
    const dpi = Math.min(E.dpi, 600);
    const fmt = E.sheetFormat;
    const outs = [];
    for (let i = 0; i < pages.length; i++) {
      toast(`Rendering sheet ${i + 1} / ${pages.length}…`, i / pages.length);
      const cv = await renderSheetPage(pages[i], dpi, true);
      if (fmt === 'pdf') {
        const jpg = new Uint8Array(await (await toBlob(cv, 'image/jpeg', Math.max(0.92, E.quality))).arrayBuffer());
        outs.push({ jpg, w: cv.width, h: cv.height, wpt: pages[i].pw / 2.54 * 72, hpt: pages[i].ph / 2.54 * 72 });
      } else {
        const blob = await toBlob(cv, MIME[fmt], E.quality);
        let bytes = new Uint8Array(await blob.arrayBuffer());
        if (fmt === 'png') bytes = setPngDpi(bytes, dpi); else setJpegDpi(bytes, dpi);
        outs.push({ name: `print-sheet-${i + 1}.${EXT[fmt]}`, data: bytes });
      }
      cv.width = cv.height = 1;
      await new Promise(r => setTimeout(r));
    }
    if (fmt === 'pdf') download(buildPdf(outs), 'polaroid-print-sheet.pdf');
    else if (outs.length === 1) download(outs[0].data, outs[0].name, MIME[fmt]);
    else download(makeZip(outs), 'polaroid-print-sheets.zip');
    toast('Sheet exported ✓', 1, 1800);
  } catch (e) { alert(e.message); toastHide(); }
  busy = false;
}

/* ------------------------------------------------- binary helpers (no libs) */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  files.forEach(f => {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  });
  let cdSize = 0; central.forEach(c => cdSize += c.length);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

function setPngDpi(u8, dpi) {
  const ppm = Math.round(dpi / 0.0254);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const chunks = []; let p = 8;
  while (p < u8.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
    if (type !== 'pHYs') chunks.push(u8.subarray(p, p + 12 + len));
    p += 12 + len;
  }
  const body = new Uint8Array(13);
  const bdv = new DataView(body.buffer);
  body.set([0x70, 0x48, 0x59, 0x73], 0); bdv.setUint32(4, ppm); bdv.setUint32(8, ppm); body[12] = 1;
  const chunk = new Uint8Array(21), cdv = new DataView(chunk.buffer);
  cdv.setUint32(0, 9); chunk.set(body, 4); cdv.setUint32(17, crc32(body));
  const out = [u8.subarray(0, 8), chunks[0], chunk, ...chunks.slice(1)];
  let n = 0; out.forEach(c => n += c.length);
  const res = new Uint8Array(n); let o = 0; out.forEach(c => { res.set(c, o); o += c.length; });
  return res;
}
function setJpegDpi(u8, dpi) {
  // JFIF APP0: FFD8 FFE0 len 'JFIF\0' ver(2) units(1) Xd(2) Yd(2)
  if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF && u8[3] === 0xE0 && u8[6] === 0x4A && u8[7] === 0x46 && u8[8] === 0x49 && u8[9] === 0x46) {
    const d = Math.min(65535, Math.round(dpi));
    u8[13] = 1; u8[14] = d >> 8; u8[15] = d & 255; u8[16] = d >> 8; u8[17] = d & 255;
  }
}

function buildPdf(pages) {
  const enc = new TextEncoder(), parts = [], offs = {};
  let off = 0;
  const push = d => { const u = typeof d === 'string' ? enc.encode(d) : d; parts.push(u); off += u.length; };
  const obj = (id, head, stream) => {
    offs[id] = off; push(`${id} 0 obj\n${head}\n`);
    if (stream) { push('stream\n'); push(stream); push('\nendstream\n'); }
    push('endobj\n');
  };
  push('%PDF-1.4\n');
  const n = pages.length;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] /Count ${n} >>`);
  pages.forEach((p, i) => {
    const pg = 3 + 3 * i, ct = pg + 1, im = pg + 2;
    const W = p.wpt.toFixed(2), H = p.hpt.toFixed(2);
    obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`);
    const c = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(ct, `<< /Length ${c.length} >>`, enc.encode(c));
    obj(im, `<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>`, p.jpg);
  });
  const total = 3 * n + 3, xref = off;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id++) x += String(offs[id]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}

/* ---------------------------------------------------------------- toast */
let toastTimer = 0;
function toast(text, p = 0, hideAfter = 0) {
  $('#toast').hidden = false; $('#toastText').textContent = text; $('#toastBar').style.width = Math.round(p * 100) + '%';
  clearTimeout(toastTimer);
  if (hideAfter) toastTimer = setTimeout(toastHide, hideAfter);
}
function toastHide() { $('#toast').hidden = true; }

/* ---------------------------------------------------------------- start */
bindUI();
buildList();
syncControls();
renderStage();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { schedule(); });
window.__polaroid = { state, drawPolaroid, layoutSheet, makeZip, setPngDpi, setJpegDpi, buildPdf, crc32 }; // handy for debugging
})();
