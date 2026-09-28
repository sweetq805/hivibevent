PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS app_store (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  store_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  is_system INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS category_memory (
  id TEXT PRIMARY KEY NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('vendor_name', 'seller_tax_id')),
  match_key TEXT NOT NULL,
  display_value TEXT NOT NULL,
  category_name TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  UNIQUE (match_type, match_key)
);

CREATE TABLE IF NOT EXISTS report_months (
  id TEXT PRIMARY KEY NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('activity_cost', 'fragrance_cost', 'activity_advance', 'fragrance_advance', 'receipts')),
  month_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  UNIQUE (report_type, month_key)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS cost_entries (
  id TEXT PRIMARY KEY NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('activity', 'fragrance')),
  report_month_id TEXT NOT NULL,
  invoice_type TEXT NOT NULL,
  invoice_no TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  buyer_tax_id TEXT NOT NULL DEFAULT '',
  seller_tax_id TEXT NOT NULL DEFAULT '',
  category_name TEXT NOT NULL DEFAULT '',
  vendor_name TEXT NOT NULL DEFAULT '',
  amount_ntd INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  FOREIGN KEY (report_month_id) REFERENCES report_months(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS advance_entries (
  id TEXT PRIMARY KEY NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('activity', 'fragrance')),
  report_month_id TEXT NOT NULL,
  date TEXT NOT NULL,
  payee TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  amount_ntd INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '未結清',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  FOREIGN KEY (report_month_id) REFERENCES report_months(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS revenue_entries (
  id TEXT PRIMARY KEY NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('activity', 'fragrance')),
  date TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  original_price_ntd INTEGER NOT NULL DEFAULT 0,
  discount_input TEXT NOT NULL DEFAULT '1',
  discounted_price_ntd INTEGER NOT NULL DEFAULT 0,
  base_amount_ntd INTEGER NOT NULL DEFAULT 0,
  tax_mode TEXT NOT NULL DEFAULT '未稅',
  final_amount_ntd INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '待收款',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS revenue_items (
  id TEXT PRIMARY KEY NOT NULL,
  revenue_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  item_name TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL DEFAULT 1,
  amount_ntd INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  FOREIGN KEY (revenue_id) REFERENCES revenue_entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS supply_items (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  date TEXT NOT NULL,
  item TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL DEFAULT 0,
  size TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  price_ntd INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '待採購',
  checked TEXT NOT NULL DEFAULT '未檢查',
  toolbox_no TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS stock_trades (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL,
  ticker TEXT NOT NULL DEFAULT '',
  stock_name TEXT NOT NULL DEFAULT '',
  shares REAL NOT NULL DEFAULT 0,
  buy_price_ntd INTEGER NOT NULL DEFAULT 0,
  sell_price_ntd INTEGER NOT NULL DEFAULT 0,
  realized_profit_ntd INTEGER NOT NULL DEFAULT 0,
  dividend_ntd INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS receipt_files (
  id TEXT PRIMARY KEY NOT NULL,
  report_month_id TEXT NOT NULL,
  date TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  category_name TEXT NOT NULL DEFAULT '',
  amount_ntd INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  r2_object_key TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  r2_etag TEXT NOT NULL DEFAULT '',
  upload_status TEXT NOT NULL DEFAULT 'pending' CHECK (upload_status IN ('pending', 'ready', 'failed', 'deleting')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  FOREIGN KEY (report_month_id) REFERENCES report_months(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS audit_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete', 'restore', 'import')),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  group_id TEXT,
  before_json TEXT,
  after_json TEXT,
  actor_id TEXT,
  client_mutation_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  undone_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cost_entries_module_month ON cost_entries(module, report_month_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_advance_entries_module_month ON advance_entries(module, report_month_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_revenue_entries_module_date ON revenue_entries(module, date, deleted_at);
CREATE INDEX IF NOT EXISTS idx_revenue_items_revenue ON revenue_items(revenue_id, sort_order, deleted_at);
CREATE INDEX IF NOT EXISTS idx_supply_items_project ON supply_items(project_id, date, deleted_at);
CREATE INDEX IF NOT EXISTS idx_stock_trades_date ON stock_trades(date, deleted_at);
CREATE INDEX IF NOT EXISTS idx_receipt_files_month ON receipt_files(report_month_id, date, deleted_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id, sequence);

INSERT OR IGNORE INTO app_settings (key, value_json, updated_at, version)
VALUES ('company', '{"name":"心引力有限公司","currency":"NTD","taxRate":0.05}', unixepoch('now') * 1000, 1);

INSERT OR IGNORE INTO app_store (id, store_json, updated_at, version)
VALUES (1, '{"dashboard":[],"activityCost":[],"activityRevenue":[],"activityAdvance":[],"fragranceCost":[],"fragranceRevenue":[],"fragranceAdvance":[],"supplies":[],"stocks":[],"receipts":[],"memory":[]}', unixepoch('now') * 1000, 1);
