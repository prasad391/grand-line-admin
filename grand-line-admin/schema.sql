-- THE GRAND LINE admin: raw SQL schema (SQLite). Safe to run repeatedly.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sizes (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  price REAL NOT NULL DEFAULT 0,          -- selling price
  sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS materials (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

-- original (cost) price for each size + material combination
CREATE TABLE IF NOT EXISTS costs (
  size_id     INTEGER NOT NULL REFERENCES sizes(id)     ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  cost        REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (size_id, material_id)
);

CREATE TABLE IF NOT EXISTS bills (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_no         TEXT,
  customer        TEXT NOT NULL DEFAULT '',
  note            TEXT NOT NULL DEFAULT '',
  sale_date       TEXT NOT NULL,                 -- YYYY-MM-DD
  discount_type   TEXT NOT NULL DEFAULT 'none',  -- none | percent | amount
  discount_value  REAL NOT NULL DEFAULT 0,
  gross_total     REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  net_total       REAL NOT NULL DEFAULT 0,
  cost_total      REAL NOT NULL DEFAULT 0,
  profit          REAL NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(sale_date);

-- size/material names + prices are copied into each line, so old bills never change
CREATE TABLE IF NOT EXISTS bill_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id    INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  size       TEXT NOT NULL,
  material   TEXT NOT NULL,
  qty        INTEGER NOT NULL CHECK (qty > 0),
  unit_price REAL NOT NULL,
  unit_cost  REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_items_bill ON bill_items(bill_id);

CREATE TABLE IF NOT EXISTS stock (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  size       TEXT NOT NULL DEFAULT '',
  material   TEXT NOT NULL DEFAULT '',
  qty        INTEGER NOT NULL DEFAULT 1,
  status     TEXT NOT NULL DEFAULT 'available',  -- available | sold
  drive_url  TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- starting data (only inserted if missing)
INSERT OR IGNORE INTO sizes (name, price, sort) VALUES ('A4', 60, 1), ('A5', 30, 2), ('A6', 20, 3), ('Polaroid', 10, 4);
INSERT OR IGNORE INTO materials (name) VALUES ('Matte'), ('Glossy');
INSERT OR IGNORE INTO costs (size_id, material_id, cost)
  SELECT s.id, m.id, 0 FROM sizes s CROSS JOIN materials m;
