'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');

// ---- optional .env (no extra package needed) ----
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach((l) => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !l.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  });
} catch (e) { /* no .env, fine */ }

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// ---- database ----
// Temporary database location for Vercel.
// WARNING: Data is not persistent in this location.
const DATA_DIR = path.join(os.tmpdir(), 'grand-line-admin');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'grandline.db');
const db = new Database(DB_FILE);

db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// ---- helpers ----
const app = express();
app.use(express.json({ limit: '2mb' }));

if (ADMIN_PASSWORD) {
  app.use((req, res, next) => {
    const h = req.headers.authorization || '';
    if (h.startsWith('Basic ')) {
      const [u, ...p] = Buffer.from(h.slice(6), 'base64').toString().split(':');
      if (u === 'admin' && p.join(':') === ADMIN_PASSWORD) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="The Grand Line Admin"').status(401).send('Login required');
  });
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);
const wrap = (fn) => (req, res, next) => { try { fn(req, res); } catch (e) { next(e); } };
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const str = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const num = (v, label) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw bad(`${label} must be a number, 0 or more`);
  return n;
};
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function range(q) {
  const from = isDate(q.from) ? q.from : '0000-01-01';
  const to = isDate(q.to) ? q.to : '9999-12-31';
  return { from, to };
}

// ---- settings: sizes, materials, costs ----
function getSettings() {
  return {
    sizes: db.prepare('SELECT id, name, price, sort FROM sizes ORDER BY sort, id').all(),
    materials: db.prepare('SELECT id, name FROM materials ORDER BY id').all(),
    costs: db.prepare('SELECT size_id, material_id, cost FROM costs').all(),
  };
}
app.get('/api/settings', wrap((req, res) => res.json(getSettings())));

const addSize = db.transaction((name, price) => {
  const r = db.prepare('INSERT INTO sizes (name, price, sort) VALUES (?, ?, (SELECT COALESCE(MAX(sort),0)+1 FROM sizes))').run(name, price);
  db.prepare('INSERT OR IGNORE INTO costs (size_id, material_id, cost) SELECT ?, id, 0 FROM materials').run(r.lastInsertRowid);
  return r.lastInsertRowid;
});
app.post('/api/sizes', wrap((req, res) => {
  const name = str(req.body.name, 40);
  if (!name) throw bad('Size name is required');
  if (db.prepare('SELECT 1 FROM sizes WHERE name = ?').get(name)) throw bad(`Size "${name}" already exists`);
  addSize(name, num(req.body.price ?? 0, 'Price'));
  res.json(getSettings());
}));
app.put('/api/sizes/:id', wrap((req, res) => {
  const row = db.prepare('SELECT * FROM sizes WHERE id = ?').get(req.params.id);
  if (!row) throw new HttpError(404, 'Size not found');
  const name = str(req.body.name ?? row.name, 40);
  if (!name) throw bad('Size name is required');
  const dup = db.prepare('SELECT id FROM sizes WHERE name = ? AND id <> ?').get(name, row.id);
  if (dup) throw bad(`Size "${name}" already exists`);
  db.prepare('UPDATE sizes SET name = ?, price = ? WHERE id = ?').run(name, num(req.body.price ?? row.price, 'Price'), row.id);
  res.json(getSettings());
}));
app.delete('/api/sizes/:id', wrap((req, res) => {
  db.prepare('DELETE FROM sizes WHERE id = ?').run(req.params.id);
  res.json(getSettings());
}));

const addMaterial = db.transaction((name) => {
  const r = db.prepare('INSERT INTO materials (name) VALUES (?)').run(name);
  db.prepare('INSERT OR IGNORE INTO costs (size_id, material_id, cost) SELECT id, ?, 0 FROM sizes').run(r.lastInsertRowid);
});
app.post('/api/materials', wrap((req, res) => {
  const name = str(req.body.name, 40);
  if (!name) throw bad('Material name is required');
  if (db.prepare('SELECT 1 FROM materials WHERE name = ?').get(name)) throw bad(`Material "${name}" already exists`);
  addMaterial(name);
  res.json(getSettings());
}));
app.put('/api/materials/:id', wrap((req, res) => {
  const row = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (!row) throw new HttpError(404, 'Material not found');
  const name = str(req.body.name, 40);
  if (!name) throw bad('Material name is required');
  const dup = db.prepare('SELECT id FROM materials WHERE name = ? AND id <> ?').get(name, row.id);
  if (dup) throw bad(`Material "${name}" already exists`);
  db.prepare('UPDATE materials SET name = ? WHERE id = ?').run(name, row.id);
  res.json(getSettings());
}));
app.delete('/api/materials/:id', wrap((req, res) => {
  db.prepare('DELETE FROM materials WHERE id = ?').run(req.params.id);
  res.json(getSettings());
}));

// body: { costs: [{size_id, material_id, cost}] }
const saveCosts = db.transaction((list) => {
  const up = db.prepare(`INSERT INTO costs (size_id, material_id, cost) VALUES (?, ?, ?)
    ON CONFLICT(size_id, material_id) DO UPDATE SET cost = excluded.cost`);
  for (const c of list) {
    if (!db.prepare('SELECT 1 FROM sizes WHERE id = ?').get(c.size_id)) continue;
    if (!db.prepare('SELECT 1 FROM materials WHERE id = ?').get(c.material_id)) continue;
    up.run(c.size_id, c.material_id, num(c.cost, 'Cost'));
  }
});
app.put('/api/costs', wrap((req, res) => {
  if (!Array.isArray(req.body.costs)) throw bad('costs list required');
  saveCosts(req.body.costs);
  res.json(getSettings());
}));

// ---- bills ----
function getBill(id) {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
  if (!bill) return null;
  bill.items = db.prepare('SELECT id, size, material, qty, unit_price, unit_cost FROM bill_items WHERE bill_id = ? ORDER BY id').all(id);
  bill.total_qty = bill.items.reduce((s, i) => s + i.qty, 0);
  return bill;
}

// Validates the request and works out all the money numbers on the server.
function buildBill(body, existingItems) {
  const sale_date = body.sale_date ? str(body.sale_date, 10) : todayStr();
  if (!isDate(sale_date)) throw bad('Date is not valid');
  if (!Array.isArray(body.items) || !body.items.length) throw bad('Add at least one poster line');

  const items = body.items.map((it, idx) => {
    const n = idx + 1;
    const size = db.prepare('SELECT * FROM sizes WHERE name = ?').get(str(it.size, 40));
    if (!size) throw bad(`Line ${n}: size "${str(it.size, 40)}" does not exist (add it in Settings)`);
    const mat = db.prepare('SELECT * FROM materials WHERE name = ?').get(str(it.material, 40));
    if (!mat) throw bad(`Line ${n}: material "${str(it.material, 40)}" does not exist (add it in Settings)`);
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) throw bad(`Line ${n}: quantity must be a whole number, 1 or more`);
    const hasPrice = it.price !== undefined && it.price !== null && it.price !== '';
    const unit_price = hasPrice ? num(it.price, `Line ${n}: price`) : size.price;
    // when editing an old bill, keep the cost it was sold with (history must not change)
    const old = (existingItems || []).find((e) => e.size === size.name && e.material === mat.name);
    const c = db.prepare('SELECT cost FROM costs WHERE size_id = ? AND material_id = ?').get(size.id, mat.id);
    return { size: size.name, material: mat.name, qty, unit_price, unit_cost: old ? old.unit_cost : (c ? c.cost : 0) };
  });

  const gross = round2(items.reduce((s, i) => s + i.qty * i.unit_price, 0));
  const cost = round2(items.reduce((s, i) => s + i.qty * i.unit_cost, 0));
  const discount_type = ['none', 'percent', 'amount'].includes(body.discount_type) ? body.discount_type : 'none';
  let discount_value = discount_type === 'none' ? 0 : num(body.discount_value || 0, 'Discount');
  if (discount_type === 'percent' && discount_value > 100) throw bad('Discount percent cannot be more than 100');
  let discount = 0;
  if (discount_type === 'percent') discount = round2((gross * discount_value) / 100);
  if (discount_type === 'amount') discount = round2(Math.min(discount_value, gross));
  const net = round2(gross - discount);
  return {
    sale_date,
    customer: str(body.customer, 100),
    note: str(body.note, 300),
    discount_type,
    discount_value,
    gross_total: gross,
    discount_amount: discount,
    net_total: net,
    cost_total: cost,
    profit: round2(net - cost),
    items,
  };
}

const insertItems = (billId, items) => {
  const st = db.prepare('INSERT INTO bill_items (bill_id, size, material, qty, unit_price, unit_cost) VALUES (?,?,?,?,?,?)');
  items.forEach((i) => st.run(billId, i.size, i.material, i.qty, i.unit_price, i.unit_cost));
};

const createBill = db.transaction((b) => {
  const r = db.prepare(`INSERT INTO bills (customer, note, sale_date, discount_type, discount_value, gross_total, discount_amount, net_total, cost_total, profit)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(b.customer, b.note, b.sale_date, b.discount_type, b.discount_value, b.gross_total, b.discount_amount, b.net_total, b.cost_total, b.profit);
  const id = r.lastInsertRowid;
  db.prepare("UPDATE bills SET bill_no = 'GL-' || printf('%04d', id) WHERE id = ?").run(id);
  insertItems(id, b.items);
  return id;
});

const updateBill = db.transaction((id, b) => {
  db.prepare(`UPDATE bills SET customer=?, note=?, sale_date=?, discount_type=?, discount_value=?, gross_total=?, discount_amount=?,
    net_total=?, cost_total=?, profit=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(b.customer, b.note, b.sale_date, b.discount_type, b.discount_value, b.gross_total, b.discount_amount, b.net_total, b.cost_total, b.profit, id);
  db.prepare('DELETE FROM bill_items WHERE bill_id = ?').run(id);
  insertItems(id, b.items);
});

app.get('/api/bills', wrap((req, res) => {
  const { from, to } = range(req.query);
  const q = str(req.query.q, 100);
  let rows = db.prepare(`SELECT id FROM bills WHERE sale_date BETWEEN ? AND ?
    AND (? = '' OR customer LIKE '%' || ? || '%' OR bill_no LIKE '%' || ? || '%' OR note LIKE '%' || ? || '%')
    ORDER BY sale_date DESC, id DESC LIMIT 1000`).all(from, to, q, q, q, q);
  res.json(rows.map((r) => getBill(r.id)));
}));
app.get('/api/bills/:id', wrap((req, res) => {
  const b = getBill(req.params.id);
  if (!b) throw new HttpError(404, 'Bill not found');
  res.json(b);
}));
app.post('/api/bills', wrap((req, res) => res.json(getBill(createBill(buildBill(req.body))))));
app.put('/api/bills/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const existing = getBill(id);
  if (!existing) throw new HttpError(404, 'Bill not found');
  updateBill(id, buildBill(req.body, existing.items));
  res.json(getBill(id));
}));
app.delete('/api/bills/:id', wrap((req, res) => {
  const r = db.prepare('DELETE FROM bills WHERE id = ?').run(req.params.id);
  if (!r.changes) throw new HttpError(404, 'Bill not found');
  res.json({ ok: true });
}));

// ---- dashboard ----
// A bill discount is shared across its lines in proportion to their value,
// so profit per size / material stays correct even when discounts are given.
app.get('/api/dashboard', wrap((req, res) => {
  const { from, to } = range(req.query);
  const lineNet = `(i.qty * i.unit_price * CASE WHEN b.gross_total > 0 THEN b.net_total / b.gross_total ELSE 1 END)`;
  const group = (col) => db.prepare(`
    SELECT ${col} AS name, SUM(i.qty) AS qty,
      ROUND(SUM(i.qty * i.unit_price), 2) AS gross,
      ROUND(SUM(${lineNet}), 2) AS revenue,
      ROUND(SUM(i.qty * i.unit_cost), 2) AS cost,
      ROUND(SUM(${lineNet}) - SUM(i.qty * i.unit_cost), 2) AS profit
    FROM bill_items i JOIN bills b ON b.id = i.bill_id
    WHERE b.sale_date BETWEEN ? AND ? GROUP BY ${col} ORDER BY profit DESC`).all(from, to);

  const kpi = db.prepare(`SELECT COUNT(*) AS bills, COALESCE(SUM(gross_total),0) AS gross, COALESCE(SUM(discount_amount),0) AS discount,
    COALESCE(SUM(net_total),0) AS revenue, COALESCE(SUM(cost_total),0) AS cost, COALESCE(SUM(profit),0) AS profit
    FROM bills WHERE sale_date BETWEEN ? AND ?`).get(from, to);
  kpi.posters = db.prepare(`SELECT COALESCE(SUM(i.qty),0) AS n FROM bill_items i JOIN bills b ON b.id = i.bill_id
    WHERE b.sale_date BETWEEN ? AND ?`).get(from, to).n;
  Object.keys(kpi).forEach((k) => { kpi[k] = round2(kpi[k]); });

  const bySizeMaterial = db.prepare(`
    SELECT i.size, i.material, SUM(i.qty) AS qty,
      ROUND(SUM(${lineNet}), 2) AS revenue,
      ROUND(SUM(i.qty * i.unit_cost), 2) AS cost,
      ROUND(SUM(${lineNet}) - SUM(i.qty * i.unit_cost), 2) AS profit
    FROM bill_items i JOIN bills b ON b.id = i.bill_id
    WHERE b.sale_date BETWEEN ? AND ? GROUP BY i.size, i.material ORDER BY i.size, i.material`).all(from, to);

  const daily = db.prepare(`SELECT sale_date AS date, ROUND(SUM(net_total),2) AS revenue, ROUND(SUM(profit),2) AS profit
    FROM bills WHERE sale_date BETWEEN ? AND ? GROUP BY sale_date ORDER BY sale_date`).all(from, to);

  const missingCosts = db.prepare(`SELECT COUNT(*) AS n FROM sizes s CROSS JOIN materials m
    LEFT JOIN costs c ON c.size_id = s.id AND c.material_id = m.id WHERE COALESCE(c.cost, 0) = 0`).get().n;

  const stock = db.prepare(`SELECT COALESCE(SUM(CASE WHEN status='available' THEN qty END),0) AS available,
    COALESCE(SUM(CASE WHEN status='sold' THEN qty END),0) AS sold FROM stock`).get();

  res.json({ kpi, bySize: group('i.size'), byMaterial: group('i.material'), bySizeMaterial, daily, missingCosts, stock });
}));

// ---- stock ----
const stockRow = (b, existing) => {
  const name = str(b.name ?? (existing && existing.name), 200);
  if (!name) throw bad('Name is required');
  const qty = Number(b.qty ?? (existing ? existing.qty : 1));
  if (!Number.isInteger(qty) || qty < 0) throw bad('Quantity must be a whole number, 0 or more');
  const status = ['available', 'sold'].includes(b.status) ? b.status : (existing ? existing.status : 'available');
  return {
    name, qty, status,
    size: str(b.size ?? (existing ? existing.size : ''), 40),
    material: str(b.material ?? (existing ? existing.material : ''), 40),
    drive_url: str(b.drive_url ?? (existing ? existing.drive_url : ''), 500),
    notes: str(b.notes ?? (existing ? existing.notes : ''), 300),
  };
};
app.get('/api/stock', wrap((req, res) => {
  const status = ['available', 'sold'].includes(req.query.status) ? req.query.status : '';
  const q = str(req.query.q, 100);
  res.json(db.prepare(`SELECT * FROM stock WHERE (? = '' OR status = ?) AND (? = '' OR name LIKE '%' || ? || '%')
    ORDER BY id DESC LIMIT 2000`).all(status, status, q, q));
}));
app.post('/api/stock', wrap((req, res) => {
  const s = stockRow(req.body);
  const r = db.prepare('INSERT INTO stock (name, size, material, qty, status, drive_url, notes) VALUES (?,?,?,?,?,?,?)')
    .run(s.name, s.size, s.material, s.qty, s.status, s.drive_url, s.notes);
  res.json(db.prepare('SELECT * FROM stock WHERE id = ?').get(r.lastInsertRowid));
}));
const bulkStock = db.transaction((names, base) => {
  const st = db.prepare('INSERT INTO stock (name, size, material, qty, status) VALUES (?,?,?,?,?)');
  names.forEach((n) => st.run(n, base.size, base.material, base.qty, base.status));
});
app.post('/api/stock/bulk', wrap((req, res) => {
  const names = String(req.body.names || '').split(/\r?\n/).map((n) => str(n, 200)).filter(Boolean);
  if (!names.length) throw bad('Paste at least one name');
  if (names.length > 2000) throw bad('Too many lines at once (max 2000)');
  const base = stockRow({ name: 'x', size: req.body.size, material: req.body.material, qty: req.body.qty ?? 1, status: req.body.status });
  bulkStock(names, base);
  res.json({ added: names.length });
}));
app.put('/api/stock/:id', wrap((req, res) => {
  const ex = db.prepare('SELECT * FROM stock WHERE id = ?').get(req.params.id);
  if (!ex) throw new HttpError(404, 'Stock item not found');
  const s = stockRow(req.body, ex);
  db.prepare('UPDATE stock SET name=?, size=?, material=?, qty=?, status=?, drive_url=?, notes=? WHERE id=?')
    .run(s.name, s.size, s.material, s.qty, s.status, s.drive_url, s.notes, ex.id);
  res.json(db.prepare('SELECT * FROM stock WHERE id = ?').get(ex.id));
}));
app.delete('/api/stock/:id', wrap((req, res) => {
  db.prepare('DELETE FROM stock WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---- export / backup ----
const csv = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
app.get('/api/export/bills.csv', wrap((req, res) => {
  const rows = db.prepare(`SELECT b.bill_no, b.sale_date, b.customer, i.size, i.material, i.qty, i.unit_price, i.unit_cost,
    b.discount_type, b.discount_value, b.gross_total, b.discount_amount, b.net_total, b.profit
    FROM bills b JOIN bill_items i ON i.bill_id = b.id ORDER BY b.sale_date, b.id, i.id`).all();
  const head = ['Bill', 'Date', 'Customer', 'Size', 'Material', 'Qty', 'Unit price', 'Unit cost', 'Discount type', 'Discount value', 'Bill gross', 'Bill discount', 'Bill net', 'Bill profit'];
  const lines = [head.map(csv).join(',')].concat(rows.map((r) => Object.values(r).map(csv).join(',')));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="grandline-bills.csv"' });
  res.send('\uFEFF' + lines.join('\r\n'));
}));
app.get('/api/backup', (req, res, next) => {
  const tmp = path.join(os.tmpdir(), `grandline-backup-${Date.now()}.db`);
  db.backup(tmp).then(() => {
    res.download(tmp, `grandline-backup-${todayStr()}.db`, () => fs.unlink(tmp, () => {}));
  }).catch(next);
});

// ---- static site ----
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- errors ----
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request data' });
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong on the server' : err.message });
});

const server = app.listen(PORT, () => {
  console.log(`\n  THE GRAND LINE admin running at  http://localhost:${PORT}`);
  console.log(`  Database file: ${DB_FILE}`);
  console.log(ADMIN_PASSWORD ? '  Login: user "admin" + your ADMIN_PASSWORD\n' : '  No password set (see .env.example)\n');
});
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Change PORT in .env` : e);
  process.exit(1);
});
const shutdown = () => { try { db.close(); } catch (e) { /* ignore */ } process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
