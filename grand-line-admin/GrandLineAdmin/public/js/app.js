'use strict';
/* THE GRAND LINE admin: single page app (no build step) */

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const int = (n) => Number(n || 0).toLocaleString('en-IN');
const cls = (n) => (n < 0 ? 'neg' : n > 0 ? 'pos' : '');
const pad = (n) => String(n).padStart(2, '0');
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dstr(new Date());
const prettyDate = (s) => { const [y, m, d] = s.split('-'); return `${d}-${m}-${y}`; };

let toastTimer;
function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, isErr ? 5000 : 2200);
}

async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new Error('Cannot reach the server. Is it still running?');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
  return data;
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

function confirmBox(title, text, okLabel = 'Delete') {
  return new Promise((resolve) => {
    const dlg = $('#dlg');
    dlg.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row"><button class="btn ghost" value="no">Cancel</button><button class="btn danger" value="yes">${esc(okLabel)}</button></div>`;
    dlg.onclick = (e) => { const v = e.target.value; if (v) { dlg.close(); resolve(v === 'yes'); } };
    dlg.oncancel = () => resolve(false);
    dlg.showModal();
  });
}

let settings = { sizes: [], materials: [], costs: [] };
async function loadSettings() { settings = await api('GET', '/api/settings'); }
const costOf = (sizeName, matName) => {
  const s = settings.sizes.find((x) => x.name === sizeName);
  const m = settings.materials.find((x) => x.name === matName);
  if (!s || !m) return 0;
  const c = settings.costs.find((x) => x.size_id === s.id && x.material_id === m.id);
  return c ? c.cost : 0;
};
const sizeOpts = (sel) => settings.sizes.map((s) => `<option ${s.name === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
const matOpts = (sel) => settings.materials.map((m) => `<option ${m.name === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');

// ---------- router ----------
const pages = { dashboard: pageDashboard, billing: pageBilling, stock: pageStock, enhancer: pageEnhancer, settings: pageSettings };
let charts = [];
async function route() {
  const page = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
  const isTool = page === 'polaroid' || page === 'pdf';
  view.hidden = isTool;
  document.body.classList.toggle('tool-mode', isTool);
  ['polaroid', 'pdf'].forEach((t) => {
    const sec = $('#tool-' + t);
    sec.hidden = page !== t;
    const f = $('iframe', sec);
    if (page === t && !f.src) f.src = f.dataset.src; // load once, keep alive so work isn't lost
  });
  if (isTool) return;
  charts.forEach((c) => c.destroy());
  charts = [];
  try {
    await loadSettings();
    await (pages[page] || pages.dashboard)();
  } catch (e) {
    view.innerHTML = `<div class="card"><h2>Could not load this page</h2><p>${esc(e.message)}</p></div>`;
  }
}
window.addEventListener('hashchange', route);
try { if (localStorage.getItem('gl-collapsed') === '1') document.body.classList.add('collapsed'); } catch (e) { /* ignore */ }
$('#collapse').addEventListener('click', () => {
  const c = document.body.classList.toggle('collapsed');
  $('#collapse').textContent = c ? '▶' : '◀';
  try { localStorage.setItem('gl-collapsed', c ? '1' : '0'); } catch (e) { /* ignore */ }
});
if (document.body.classList.contains('collapsed')) $('#collapse').textContent = '▶';

// ---------- date range ----------
const rangeState = { preset: 'month', from: '', to: '' };
function presetRange(p) {
  const now = new Date();
  if (p === 'today') return [today(), today()];
  if (p === '7') { const d = new Date(now); d.setDate(d.getDate() - 6); return [dstr(d), today()]; }
  if (p === 'month') return [dstr(new Date(now.getFullYear(), now.getMonth(), 1)), today()];
  if (p === 'all') return ['', ''];
  return [rangeState.from, rangeState.to];
}
function rangeBar() {
  const chip = (k, l) => `<button class="chip ${rangeState.preset === k ? 'on' : ''}" data-p="${k}">${l}</button>`;
  return `<div class="row"><div class="chips">${chip('today', 'Today')}${chip('7', 'Last 7 days')}${chip('month', 'This month')}${chip('all', 'All time')}${chip('custom', 'Custom')}</div>
    <label class="f">From<input type="date" id="rf" value="${rangeState.from}"></label>
    <label class="f">To<input type="date" id="rt" value="${rangeState.to}"></label></div>`;
}
function bindRange(root, reload) {
  root.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
    rangeState.preset = b.dataset.p;
    if (b.dataset.p !== 'custom') [rangeState.from, rangeState.to] = presetRange(b.dataset.p);
    reload();
  }));
  ['rf', 'rt'].forEach((id) => $('#' + id, root).addEventListener('change', () => {
    rangeState.preset = 'custom';
    rangeState.from = $('#rf', root).value;
    rangeState.to = $('#rt', root).value;
    reload();
  }));
}
[rangeState.from, rangeState.to] = presetRange('month');
const rangeQS = () => `from=${rangeState.from}&to=${rangeState.to}`;

// ---------- dashboard ----------
async function pageDashboard() {
  const d = await api('GET', '/api/dashboard?' + rangeQS());
  const k = d.kpi;
  const profitTable = (title, rows, label) => `<div class="card"><h2>${title}</h2><div class="tbl-wrap"><table>
    <tr><th>${label}</th><th class="n">Sold</th><th class="n">Revenue</th><th class="n">Cost</th><th class="n">Profit</th><th class="n">Margin</th></tr>
    ${rows.length ? rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${int(r.qty)}</td><td class="n">${money(r.revenue)}</td><td class="n">${money(r.cost)}</td>
      <td class="n ${cls(r.profit)}">${money(r.profit)}</td><td class="n">${r.revenue ? Math.round((r.profit / r.revenue) * 100) + '%' : '-'}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">No sales in this period</td></tr>'}
    </table></div></div>`;
  view.innerHTML = `
    <div class="page-head"><div><h1>Dashboard</h1><p>Sales and profit overview</p></div></div>
    <div class="card">${rangeBar()}</div>
    ${d.missingCosts ? `<div class="warn">⚠ Cost price is not set for ${d.missingCosts} size/material combination(s), so profit may look too high. <a href="#/settings">Set cost prices</a></div>` : ''}
    <div class="grid kpis">
      <div class="kpi gold"><div class="l">Revenue</div><div class="v">${money(k.revenue)}</div></div>
      <div class="kpi"><div class="l">Posters sold</div><div class="v">${int(k.posters)}</div></div>
      <div class="kpi green"><div class="l">Profit</div><div class="v">${money(k.profit)}</div></div>
      <div class="kpi"><div class="l">Cost</div><div class="v">${money(k.cost)}</div></div>
      <div class="kpi"><div class="l">Discounts given</div><div class="v">${money(k.discount)}</div></div>
      <div class="kpi"><div class="l">Bills</div><div class="v">${int(k.bills)}</div></div>
      <div class="kpi"><div class="l">In stock (available)</div><div class="v">${int(d.stock.available)}</div></div>
    </div>
    <div class="grid two">
      <div class="card"><h2>Revenue and profit by day</h2><div class="chart-box"><canvas id="c1"></canvas></div></div>
      <div class="card"><h2>Profit by size</h2><div class="chart-box"><canvas id="c2"></canvas></div></div>
    </div>
    <div class="grid two">
      ${profitTable('Profit by size', d.bySize, 'Size')}
      ${profitTable('Profit by material', d.byMaterial, 'Material')}
    </div>
    <div class="card"><h2>Size and material</h2><div class="tbl-wrap"><table>
      <tr><th>Size</th><th>Material</th><th class="n">Sold</th><th class="n">Revenue</th><th class="n">Cost</th><th class="n">Profit</th></tr>
      ${d.bySizeMaterial.length ? d.bySizeMaterial.map((r) => `<tr><td>${esc(r.size)}</td><td>${esc(r.material)}</td><td class="n">${int(r.qty)}</td><td class="n">${money(r.revenue)}</td><td class="n">${money(r.cost)}</td><td class="n ${cls(r.profit)}">${money(r.profit)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">No sales in this period</td></tr>'}
    </table></div></div>`;
  bindRange(view, guard(pageDashboard));

  if (window.Chart) {
    Chart.defaults.color = '#8e8e98';
    Chart.defaults.borderColor = 'rgba(255,255,255,.08)';
    const opt = { responsive: true, maintainAspectRatio: false };
    charts.push(new Chart($('#c1'), {
      type: 'line',
      data: { labels: d.daily.map((r) => prettyDate(r.date)), datasets: [
        { label: 'Revenue', data: d.daily.map((r) => r.revenue), borderColor: '#ff7a1a', backgroundColor: '#ff7a1a', tension: .25 },
        { label: 'Profit', data: d.daily.map((r) => r.profit), borderColor: '#2dd4e0', backgroundColor: '#2dd4e0', tension: .25 }] },
      options: opt,
    }));
    charts.push(new Chart($('#c2'), {
      type: 'bar',
      data: { labels: d.bySize.map((r) => r.name), datasets: [{ label: 'Profit', data: d.bySize.map((r) => r.profit), backgroundColor: '#ff7a1a' }] },
      options: { ...opt, plugins: { legend: { display: false } } },
    }));
  }
}

// ---------- billing ----------
let bill = null; // current form state
let billMat = ''; // material chosen for the tap buttons
const newBill = () => ({ id: null, bill_no: '', sale_date: today(), customer: '', note: '', discount_type: 'none', discount_value: 0, lines: [] });
const normName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
const sizePrice = (name) => (settings.sizes.find((s) => s.name === name) || {}).price || 0;
function curMat() {
  if (!settings.materials.some((m) => m.name === billMat)) billMat = (settings.materials[0] || {}).name || '';
  return billMat;
}

function addLine(size, material, qty) {
  const ex = bill.lines.find((l) => l.size === size && l.material === material);
  if (ex) ex.qty = (Number(ex.qty) || 0) + qty;
  else bill.lines.push({ size, material, qty, price: sizePrice(size) });
}
function setLineQty(size, material, qty) {
  const i = bill.lines.findIndex((l) => l.size === size && l.material === material);
  if (qty <= 0) { if (i >= 0) bill.lines.splice(i, 1); }
  else if (i >= 0) bill.lines[i].qty = qty;
  else bill.lines.push({ size, material, qty, price: sizePrice(size) });
}

function parseQuick(text, material) {
  const unknown = [];
  const found = [];
  text.split(/[,;\n]+/).map((t) => t.trim()).filter(Boolean).forEach((tok) => {
    const m = tok.match(/^(.*?)[\s:x×=*-]*(\d+)$/i);
    const size = m && settings.sizes.find((s) => normName(s.name) === normName(m[1]));
    if (!m || !m[1].trim()) unknown.push(tok);
    else if (!size) unknown.push(m[1].trim());
    else found.push([size.name, material, parseInt(m[2], 10)]);
  });
  return { found, unknown };
}

function billTotals() {
  let gross = 0, cost = 0, qty = 0;
  bill.lines.forEach((l) => {
    const q = Number(l.qty) || 0;
    gross += q * (Number(l.price) || 0);
    cost += q * costOf(l.size, l.material);
    qty += q;
  });
  let disc = 0;
  const dv = Number(bill.discount_value) || 0;
  if (bill.discount_type === 'percent') disc = (gross * Math.min(dv, 100)) / 100;
  if (bill.discount_type === 'amount') disc = Math.min(dv, gross);
  const net = gross - disc;
  return { qty, gross, disc, net, cost, profit: net - cost };
}

function renderSummary() {
  const t = billTotals();
  $('#sum').innerHTML = `<div><span>Total posters</span><b>${int(t.qty)}</b></div><div><span>Amount</span><span>${money(t.gross)}</span></div>
    <div><span>Discount</span><span>- ${money(t.disc)}</span></div><div class="big"><span>To pay</span><span>${money(t.net)}</span></div>
    <div><span>Cost</span><span>${money(t.cost)}</span></div><div><span>Profit</span><b class="${cls(t.profit)}">${money(t.profit)}</b></div>`;
}

// big tap buttons: one tile per size for the chosen material
function renderTiles() {
  const box = $('#tiles');
  if (!box) return;
  const mat = curMat();
  box.innerHTML = settings.sizes.map((s) => {
    const l = bill.lines.find((x) => x.size === s.name && x.material === mat);
    const q = l ? Number(l.qty) || 0 : 0;
    return `<div class="tile ${q ? 'on' : ''}" data-size="${esc(s.name)}"><div class="t-name">${esc(s.name)}</div><div class="t-price">${money(s.price)} each</div>
      <div class="step"><button type="button" data-d="-1" aria-label="less">−</button><input type="number" inputmode="numeric" min="0" step="1" value="${q}" aria-label="${esc(s.name)} quantity"><button type="button" data-d="1" aria-label="more">+</button></div>
      <div class="t-plus"><button type="button" data-d="5">+5</button><button type="button" data-d="10">+10</button></div></div>`;
  }).join('') || '<div class="empty">Add sizes in Settings first</div>';
}

function renderLines() {
  const body = $('#lines');
  if (!bill.lines.length) { body.innerHTML = '<tr><td colspan="6" class="empty">Nothing added yet. Tap + on a size above.</td></tr>'; renderSummary(); return; }
  body.innerHTML = bill.lines.map((l, i) => `<tr data-i="${i}">
    <td data-label="Size"><select data-k="size">${settings.sizes.some((x) => x.name === l.size) ? '' : `<option selected>${esc(l.size)}</option>`}${sizeOpts(l.size)}</select></td>
    <td data-label="Material"><select data-k="material">${settings.materials.some((x) => x.name === l.material) ? '' : `<option selected>${esc(l.material)}</option>`}${matOpts(l.material)}</select></td>
    <td data-label="Qty" style="width:90px"><input type="number" inputmode="numeric" min="1" step="1" data-k="qty" value="${l.qty}"></td>
    <td data-label="Price each" style="width:100px"><input type="number" inputmode="decimal" min="0" step="any" data-k="price" value="${l.price}"></td>
    <td class="n" data-label="Total" data-t>${money((Number(l.qty) || 0) * (Number(l.price) || 0))}</td>
    <td class="act"><button class="btn danger small" data-del>Remove</button></td></tr>`).join('');
  renderSummary();
}

async function pageBilling() {
  if (!bill) bill = newBill();
  const mats = settings.materials;
  const mat = curMat();
  view.innerHTML = `
    <div class="page-head"><div><h1>Billing</h1><p>Tap to add posters. The bill is saved in the database.</p></div></div>
    <div class="bill-grid">
      <div class="card ${bill.id ? 'editing' : ''}" id="billcard">
        <h2>${bill.id ? `Editing ${esc(bill.bill_no)}` : 'New bill'}</h2>
        <div class="row">
          <label class="f">Date<input type="date" id="b-date" value="${bill.sale_date}"></label>
          <label class="f grow">Customer (optional)<input id="b-cust" maxlength="100" value="${esc(bill.customer)}"></label>
        </div>
        ${mats.length > 1 ? `<h3>Material</h3><div class="chips" id="b-mats">${mats.map((m) => `<button type="button" class="chip ${m.name === mat ? 'on' : ''}" data-m="${esc(m.name)}">${esc(m.name)}</button>`).join('')}</div>` : ''}
        <h3>Posters</h3>
        <div class="tiles" id="tiles"></div>
        <div class="row" style="margin-top:12px">
          <label class="f grow">Or type it (A4 20, A5 10, Polaroid 5)<input id="b-quick" placeholder="A4 20, A5 10"></label>
          <button class="btn" id="b-qadd" type="button">Add</button>
        </div>
        <h3>Bill items</h3>
        <div class="tbl-wrap"><table class="stack">
          <tr class="hd"><th>Size</th><th>Material</th><th>Qty</th><th>Price each</th><th class="n">Total</th><th></th></tr>
          <tbody id="lines"></tbody></table></div>
        <div class="row" style="margin-top:16px">
          <label class="f">Discount<select id="b-dt"><option value="none">None</option><option value="percent">Percent %</option><option value="amount">Amount ₹</option></select></label>
          <label class="f" style="width:120px">Discount value<input type="number" inputmode="decimal" min="0" step="any" id="b-dv" value="${bill.discount_value}"></label>
          <label class="f grow">Note<input id="b-note" maxlength="300" value="${esc(bill.note)}"></label>
        </div>
      </div>
      <div class="card bill-side"><h2>Summary</h2><div class="sum" id="sum"></div>
        <div class="actions">
          <button class="btn big" id="b-save">${bill.id ? 'Update bill' : 'Save bill'}</button>
          ${bill.id ? '<button class="btn ghost big" id="b-cancel">Cancel</button>' : '<button class="btn ghost big" id="b-clear">Clear</button>'}
        </div></div>
    </div>
    <div class="card"><h2>All bills</h2>
      ${rangeBar()}
      <div class="row" style="margin:12px 0"><label class="f grow">Search<input id="b-search" placeholder="Bill no, customer or note"></label></div>
      <div class="tbl-wrap" id="bills"></div></div>`;

  $('#b-dt').value = bill.discount_type;
  renderLines();
  renderTiles();

  const sync = () => {
    bill.sale_date = $('#b-date').value;
    bill.customer = $('#b-cust').value;
    bill.note = $('#b-note').value;
    bill.discount_type = $('#b-dt').value;
    bill.discount_value = $('#b-dv').value;
  };
  ['b-date', 'b-cust', 'b-note', 'b-dt', 'b-dv'].forEach((id) => $('#' + id).addEventListener('input', () => { sync(); renderSummary(); }));
  $('#b-dt').addEventListener('change', () => { if ($('#b-dt').value === 'none') $('#b-dv').value = 0; sync(); renderSummary(); });

  // material chips
  const chips = $('#b-mats');
  if (chips) chips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    billMat = b.dataset.m;
    chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
    renderTiles();
  });

  // tap tiles: - / + / +5 / +10 / type a number
  const tiles = $('#tiles');
  const tileSet = (tile, q) => {
    q = Math.max(0, Math.min(100000, q || 0));
    setLineQty(tile.dataset.size, curMat(), q);
    tile.classList.toggle('on', q > 0);
    renderLines();
    return q;
  };
  tiles.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-d]');
    if (!b) return;
    const tile = b.closest('.tile');
    const inp = $('input', tile);
    inp.value = tileSet(tile, (parseInt(inp.value, 10) || 0) + parseInt(b.dataset.d, 10));
  });
  tiles.addEventListener('input', (e) => {
    if (e.target.tagName === 'INPUT') tileSet(e.target.closest('.tile'), parseInt(e.target.value, 10) || 0);
  });
  tiles.addEventListener('focusin', (e) => { if (e.target.tagName === 'INPUT') e.target.select(); });

  const quickAdd = () => {
    const { found, unknown } = parseQuick($('#b-quick').value, curMat());
    if (unknown.length) return toast(`Size not found: ${unknown.join(', ')}. Add it in Settings first.`, true);
    if (!found.length) return toast('Type something like: A4 20, A5 10', true);
    found.forEach(([s, m, q]) => addLine(s, m, q));
    $('#b-quick').value = '';
    renderLines();
    renderTiles();
  };
  $('#b-qadd').addEventListener('click', quickAdd);
  $('#b-quick').addEventListener('keydown', (e) => { if (e.key === 'Enter') quickAdd(); });

  const lines = $('#lines');
  lines.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    const l = bill.lines[tr.dataset.i];
    const k = e.target.dataset.k;
    l[k] = e.target.value;
    if (k === 'size') { l.price = sizePrice(l.size); $('[data-k=price]', tr).value = l.price; }
    $('[data-t]', tr).textContent = money((Number(l.qty) || 0) * (Number(l.price) || 0));
    renderSummary();
    renderTiles();
  });
  lines.addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    bill.lines.splice(b.closest('tr').dataset.i, 1);
    renderLines();
    renderTiles();
  });

  $('#b-save').addEventListener('click', guard(async () => {
    sync();
    const payload = {
      sale_date: bill.sale_date, customer: bill.customer, note: bill.note,
      discount_type: bill.discount_type, discount_value: Number(bill.discount_value) || 0,
      items: bill.lines.map((l) => ({ size: l.size, material: l.material, qty: Number(l.qty), price: l.price === '' ? undefined : Number(l.price) })),
    };
    const saved = bill.id ? await api('PUT', '/api/bills/' + bill.id, payload) : await api('POST', '/api/bills', payload);
    toast(`${saved.bill_no} saved: ${saved.total_qty} posters, ${money(saved.net_total)}`);
    bill = newBill();
    await pageBilling();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  const reset = guard(async () => { bill = newBill(); await pageBilling(); });
  if ($('#b-cancel')) $('#b-cancel').addEventListener('click', reset);
  if ($('#b-clear')) $('#b-clear').addEventListener('click', reset);

  // history
  const loadBills = guard(async () => {
    const q = encodeURIComponent($('#b-search').value);
    const list = await api('GET', `/api/bills?${rangeQS()}&q=${q}`);
    const tot = list.reduce((a, b) => ({ q: a.q + b.total_qty, n: a.n + b.net_total, p: a.p + b.profit }), { q: 0, n: 0, p: 0 });
    $('#bills').innerHTML = list.length ? `<table class="stack">
      <tr class="hd"><th>Bill</th><th>Date</th><th>Customer</th><th>Items</th><th class="n">Posters</th><th class="n">Discount</th><th class="n">Total</th><th class="n">Profit</th><th></th></tr>
      ${list.map((b) => `<tr data-id="${b.id}"><td data-label="Bill">${esc(b.bill_no)}</td><td data-label="Date">${prettyDate(b.sale_date)}</td><td data-label="Customer">${esc(b.customer) || '-'}</td>
        <td data-label="Items">${b.items.map((i) => `${esc(i.size)}${settings.materials.length > 1 ? ' ' + esc(i.material) : ''} × ${i.qty}`).join(', ')}</td>
        <td class="n" data-label="Posters">${int(b.total_qty)}</td><td class="n" data-label="Discount">${b.discount_amount ? money(b.discount_amount) : '-'}</td><td class="n" data-label="Total">${money(b.net_total)}</td>
        <td class="n ${cls(b.profit)}" data-label="Profit">${money(b.profit)}</td>
        <td class="act"><button class="btn ghost small" data-edit>Edit</button> <button class="btn danger small" data-rm>Delete</button></td></tr>`).join('')}
      <tr class="total"><td colspan="4">Total (${list.length} bills)</td><td class="n" data-label="Posters">${int(tot.q)}</td><td></td><td class="n" data-label="Total">${money(tot.n)}</td><td class="n" data-label="Profit">${money(tot.p)}</td><td></td></tr></table>`
      : '<div class="empty">No bills found</div>';
    $('#bills').onclick = guard(async (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const b = list.find((x) => x.id === Number(tr.dataset.id));
      if (e.target.closest('[data-edit]')) {
        bill = { id: b.id, bill_no: b.bill_no, sale_date: b.sale_date, customer: b.customer, note: b.note, discount_type: b.discount_type, discount_value: b.discount_value,
          lines: b.items.map((i) => ({ size: i.size, material: i.material, qty: i.qty, price: i.unit_price })) };
        bill.lines.forEach((l) => {
          if (!settings.sizes.find((s) => s.name === l.size)) toast(`Size "${l.size}" no longer exists in Settings. Pick another size for that line before saving.`, true);
        });
        await pageBilling();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (e.target.closest('[data-rm]')) {
        if (!(await confirmBox('Delete bill?', `${b.bill_no} (${money(b.net_total)}) will be removed for good.`))) return;
        await api('DELETE', '/api/bills/' + b.id);
        if (bill && bill.id === b.id) bill = newBill();
        toast(`${b.bill_no} deleted`);
        await pageBilling();
      }
    });
  });
  bindRange($('#bills').parentElement, async () => { await pageBilling(); });
  let st;
  $('#b-search').addEventListener('input', () => { clearTimeout(st); st = setTimeout(loadBills, 250); });
  loadBills();
}

// ---------- image enhancer ----------
const ENHANCER_URL = 'https://deepai.org/machine-learning-model/waifu2x';
async function pageEnhancer() {
  view.innerHTML = `
    <div class="page-head"><div><h1>Image Enhancer</h1><p>Make small or blurry anime art sharp and bigger before printing (waifu2x on DeepAI)</p></div></div>
    <div class="card">
      <p style="margin-top:0">Upload your image on DeepAI, wait for the result, then download it. Use the enhanced file in the Polaroid Maker or UPS PDF Maker.</p>
      <div class="row"><a class="btn big" href="${ENHANCER_URL}" target="_blank" rel="noopener">Open image enhancer ↗</a>
        <button class="btn ghost big" id="en-try" type="button">Try it inside this page</button></div>
      <p class="muted" style="margin-bottom:0">Some websites refuse to be shown inside other pages. If the box below stays blank, use the orange button, which always works.</p>
      <div id="en-box"></div>
    </div>`;
  $('#en-try').addEventListener('click', () => {
    $('#en-box').innerHTML = `<iframe class="embed" title="Image Enhancer" src="${ENHANCER_URL}" allow="clipboard-read; clipboard-write"></iframe>`;
  });
}

// ---------- stock ----------
const stockState = { status: 'available', q: '' };
async function pageStock() {
  const list = await api('GET', `/api/stock?status=${stockState.status}&q=${encodeURIComponent(stockState.q)}`);
  const chip = (k, l) => `<button class="chip ${stockState.status === k ? 'on' : ''}" data-s="${k}">${l}</button>`;
  view.innerHTML = `
    <div class="page-head"><div><h1>Stock</h1><p>Only keep the posters you want to work with here. Mark sold ones as sold.</p></div>
      <a class="btn ghost" target="_blank" href="https://drive.google.com/drive/folders/1FZvZbodq0U52ComuQ1XBcQaxeFslptvO">Open Drive folder ↗</a></div>
    <div class="grid two">
      <div class="card"><h2>Add one item</h2>
        <div class="row"><label class="f grow">Name<input id="s-name" maxlength="200"></label>
          <label class="f">Size<select id="s-size"><option value="">-</option>${sizeOpts()}</select></label>
          <label class="f">Material<select id="s-mat"><option value="">-</option>${matOpts()}</select></label>
          <label class="f" style="width:80px">Qty<input type="number" min="0" step="1" id="s-qty" value="1"></label></div>
        <div class="row" style="margin-top:10px"><label class="f grow">Drive link (optional)<input id="s-url" maxlength="500"></label>
          <button class="btn" id="s-add">Add</button></div></div>
      <div class="card"><h2>Add many (paste file names, one per line)</h2>
        <textarea id="s-bulk" rows="3" style="width:100%" placeholder="Luffy Gear 5&#10;Zoro Wano&#10;..."></textarea>
        <div class="row" style="margin-top:10px"><label class="f">Size<select id="s-bsize"><option value="">-</option>${sizeOpts()}</select></label>
          <label class="f">Material<select id="s-bmat"><option value="">-</option>${matOpts()}</select></label>
          <button class="btn" id="s-badd">Add all</button></div></div>
    </div>
    <div class="card"><div class="row"><div class="chips">${chip('available', 'Available')}${chip('sold', 'Sold')}${chip('', 'All')}</div>
      <label class="f grow">Search<input id="s-search" value="${esc(stockState.q)}"></label></div>
      <div class="tbl-wrap" style="margin-top:12px">${list.length ? `<table class="stack">
        <tr class="hd"><th>Name</th><th>Size</th><th>Material</th><th class="n">Qty</th><th>Status</th><th>Notes</th><th></th></tr>
        ${list.map((s) => `<tr data-id="${s.id}"><td data-label="Name">${s.drive_url ? `<a target="_blank" href="${esc(s.drive_url)}">${esc(s.name)}</a>` : esc(s.name)}</td>
          <td data-label="Size">${esc(s.size) || '-'}</td><td data-label="Material">${esc(s.material) || '-'}</td><td class="n" data-label="Qty">${int(s.qty)}</td>
          <td data-label="Status"><span class="badge ${s.status}">${s.status}</span></td><td data-label="Notes">${esc(s.notes)}</td>
          <td class="act"><button class="btn ghost small" data-toggle>${s.status === 'sold' ? 'Mark available' : 'Mark sold'}</button>
            <button class="btn ghost small" data-edit>Edit</button> <button class="btn danger small" data-rm>Delete</button></td></tr>`).join('')}
      </table>` : '<div class="empty">Nothing here yet</div>'}</div>
      <p class="muted" style="margin:10px 0 0">${list.length} item(s), ${int(list.reduce((a, s) => a + s.qty, 0))} posters shown</p></div>`;

  document.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', guard(async () => { stockState.status = b.dataset.s; await pageStock(); })));
  let st;
  $('#s-search').addEventListener('input', (e) => { clearTimeout(st); st = setTimeout(guard(async () => { stockState.q = e.target.value; await pageStock(); $('#s-search').focus(); $('#s-search').setSelectionRange(99, 99); }), 300); });
  $('#s-add').addEventListener('click', guard(async () => {
    await api('POST', '/api/stock', { name: $('#s-name').value, size: $('#s-size').value, material: $('#s-mat').value, qty: Number($('#s-qty').value), drive_url: $('#s-url').value });
    toast('Added'); await pageStock();
  }));
  $('#s-badd').addEventListener('click', guard(async () => {
    const r = await api('POST', '/api/stock/bulk', { names: $('#s-bulk').value, size: $('#s-bsize').value, material: $('#s-bmat').value, qty: 1 });
    toast(`${r.added} items added`); await pageStock();
  }));
  $('table', view) && $('table', view).addEventListener('click', guard(async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const s = list.find((x) => x.id === Number(tr.dataset.id));
    if (e.target.closest('[data-toggle]')) {
      await api('PUT', '/api/stock/' + s.id, { status: s.status === 'sold' ? 'available' : 'sold' });
      await pageStock();
    } else if (e.target.closest('[data-rm]')) {
      if (!(await confirmBox('Delete item?', `"${s.name}" will be removed from stock.`))) return;
      await api('DELETE', '/api/stock/' + s.id); toast('Deleted'); await pageStock();
    } else if (e.target.closest('[data-edit]')) editStock(s);
  }));
}

function editStock(s) {
  const dlg = $('#dlg');
  const withCur = (opts, cur) => (cur && !opts.includes(`>${esc(cur)}<`) ? `<option selected>${esc(cur)}</option>` : '');
  dlg.innerHTML = `<h2>Edit stock item</h2>
    <label class="f">Name<input id="e-name" value="${esc(s.name)}" maxlength="200"></label>
    <div class="row"><label class="f grow">Size<select id="e-size"><option value="">-</option>${withCur(sizeOpts(), s.size)}${sizeOpts(s.size)}</select></label>
      <label class="f grow">Material<select id="e-mat"><option value="">-</option>${withCur(matOpts(), s.material)}${matOpts(s.material)}</select></label>
      <label class="f" style="width:90px">Qty<input type="number" min="0" id="e-qty" value="${s.qty}"></label></div>
    <div class="row"><label class="f grow">Status<select id="e-status"><option ${s.status === 'available' ? 'selected' : ''}>available</option><option ${s.status === 'sold' ? 'selected' : ''}>sold</option></select></label>
      <label class="f grow">Drive link<input id="e-url" value="${esc(s.drive_url)}"></label></div>
    <label class="f" style="margin-top:10px">Notes<input id="e-notes" value="${esc(s.notes)}" maxlength="300"></label>
    <div class="row"><button class="btn ghost" id="e-cancel">Cancel</button><button class="btn" id="e-save">Save</button></div>`;
  $('#e-cancel').onclick = () => dlg.close();
  $('#e-save').onclick = guard(async () => {
    await api('PUT', '/api/stock/' + s.id, { name: $('#e-name').value, size: $('#e-size').value, material: $('#e-mat').value, qty: Number($('#e-qty').value),
      status: $('#e-status').value, drive_url: $('#e-url').value, notes: $('#e-notes').value });
    dlg.close(); toast('Saved'); await pageStock();
  });
  dlg.onclick = null; dlg.oncancel = null;
  dlg.showModal();
}

// ---------- settings ----------
async function pageSettings() {
  const { sizes, materials } = settings;
  view.innerHTML = `<div id="set-root">
    <div class="page-head"><div><h1>Settings</h1><p>Selling prices, materials and original (cost) prices</p></div></div>
    <div class="grid two">
      <div class="card"><h2>Sizes and selling price</h2><div class="tbl-wrap"><table>
        <tr><th>Size</th><th>Price</th><th></th></tr>
        ${sizes.map((s) => `<tr data-id="${s.id}"><td><input data-k="name" value="${esc(s.name)}" maxlength="40"></td><td><input type="number" min="0" step="any" data-k="price" value="${s.price}"></td>
          <td class="act"><button class="btn small" data-save>Save</button> <button class="btn danger small" data-rm>Delete</button></td></tr>`).join('')}
        <tr id="new-size"><td><input id="ns-name" placeholder="New size (e.g. A3)" maxlength="40"></td><td><input type="number" min="0" step="any" id="ns-price" placeholder="Price"></td><td class="act"><button class="btn small" id="ns-add">Add</button></td></tr>
      </table></div><p class="muted">Old bills keep the price they were sold at, even if you change it here.</p></div>
      <div class="card"><h2>Materials</h2><div class="tbl-wrap"><table>
        <tr><th>Material</th><th></th></tr>
        ${materials.map((m) => `<tr data-mid="${m.id}"><td><input data-k="name" value="${esc(m.name)}" maxlength="40"></td>
          <td class="act"><button class="btn small" data-msave>Save</button> <button class="btn danger small" data-mrm>Delete</button></td></tr>`).join('')}
        <tr><td><input id="nm-name" placeholder="New material" maxlength="40"></td><td class="act"><button class="btn small" id="nm-add">Add</button></td></tr>
      </table></div></div>
    </div>
    <div class="card"><h2>Original (cost) price for each size and material</h2>
      <p class="muted" style="margin-top:0">What one poster costs you to make. Profit = selling price - this. Applies to new bills.</p>
      <div class="tbl-wrap"><table><tr><th>Size</th>${materials.map((m) => `<th>${esc(m.name)}</th>`).join('')}</tr>
        ${sizes.map((s) => `<tr><td>${esc(s.name)}</td>${materials.map((m) => {
          const c = settings.costs.find((x) => x.size_id === s.id && x.material_id === m.id);
          return `<td style="width:130px"><input type="number" min="0" step="any" data-cs="${s.id}" data-cm="${m.id}" value="${c ? c.cost : 0}"></td>`;
        }).join('')}</tr>`).join('')}</table></div>
      <div class="row" style="margin-top:14px"><button class="btn" id="cost-save">Save cost prices</button></div></div>
    <div class="card"><h2>Backup and export</h2><div class="row">
      <a class="btn ghost" href="/api/backup">Download database backup</a>
      <a class="btn ghost" href="/api/export/bills.csv">Export all bills (CSV for Excel)</a></div>
      <p class="muted">Your data lives in the file <code>data/grandline.db</code>. Take a backup regularly.</p></div></div>`;

  const reload = async (msg) => { if (msg) toast(msg); await loadSettings(); await pageSettings(); };
  $('#set-root').addEventListener('click', guard(async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr && e.target.closest('[data-save]')) {
      await api('PUT', '/api/sizes/' + tr.dataset.id, { name: $('[data-k=name]', tr).value, price: Number($('[data-k=price]', tr).value) });
      await reload('Size saved');
    } else if (tr && e.target.closest('[data-rm]')) {
      if (!(await confirmBox('Delete size?', 'Old bills keep their record. This size will no longer be available for new bills.'))) return;
      await api('DELETE', '/api/sizes/' + tr.dataset.id); await reload('Size deleted');
    }
    const mr = e.target.closest('tr[data-mid]');
    if (mr && e.target.closest('[data-msave]')) {
      await api('PUT', '/api/materials/' + mr.dataset.mid, { name: $('[data-k=name]', mr).value }); await reload('Material saved');
    } else if (mr && e.target.closest('[data-mrm]')) {
      if (!(await confirmBox('Delete material?', 'Old bills keep their record. Its cost prices will be removed.'))) return;
      await api('DELETE', '/api/materials/' + mr.dataset.mid); await reload('Material deleted');
    }
  }));
  $('#ns-add').addEventListener('click', guard(async () => {
    await api('POST', '/api/sizes', { name: $('#ns-name').value, price: Number($('#ns-price').value || 0) }); await reload('Size added');
  }));
  $('#nm-add').addEventListener('click', guard(async () => {
    await api('POST', '/api/materials', { name: $('#nm-name').value }); await reload('Material added');
  }));
  $('#cost-save').addEventListener('click', guard(async () => {
    const costs = [...document.querySelectorAll('[data-cs]')].map((i) => ({ size_id: Number(i.dataset.cs), material_id: Number(i.dataset.cm), cost: Number(i.value || 0) }));
    await api('PUT', '/api/costs', { costs }); await reload('Cost prices saved');
  }));
}

route();
