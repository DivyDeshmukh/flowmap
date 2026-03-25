const sql = `
-- Drop in reverse dependency order so FK constraints don't block drops
DROP TABLE IF EXISTS graph_edges CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;
DROP TABLE IF EXISTS billing_doc_items CASCADE;
DROP TABLE IF EXISTS billing_docs CASCADE;
DROP TABLE IF EXISTS delivery_items CASCADE;
DROP TABLE IF EXISTS deliveries CASCADE;
DROP TABLE IF EXISTS sales_order_items CASCADE;
DROP TABLE IF EXISTS sales_orders CASCADE;
DROP TABLE IF EXISTS plants CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

-- customers
-- Merged from: business_partners + business_partner_addresses
--              + customer_company_assignments + customer_sales_area_assignments
-- WHY MERGED: All four describe the same real-world entity. One table = no JOINs.
CREATE TABLE customers (
  customer_id            TEXT PRIMARY KEY,
  full_name              TEXT NOT NULL,
  industry               TEXT,
  is_blocked             BOOLEAN DEFAULT false,
  city                   TEXT,
  country                TEXT,
  region                 TEXT,
  postal_code            TEXT,
  street_name            TEXT,
  payment_terms          TEXT,
  reconciliation_account TEXT,
  currency               TEXT,
  delivery_priority      TEXT,
  incoterms              TEXT,
  incoterms_location     TEXT,
  shipping_condition     TEXT
);

-- products
-- Merged from: products + product_descriptions (English only)
CREATE TABLE products (
  product_id    TEXT PRIMARY KEY,
  description   TEXT,
  product_type  TEXT,
  base_unit     TEXT,
  gross_weight  NUMERIC,
  net_weight    NUMERIC,
  weight_unit   TEXT,
  product_group TEXT
);

-- plants
CREATE TABLE plants (
  plant_id   TEXT PRIMARY KEY,
  plant_name TEXT
);

-- sales_orders
-- flow_status computed during seeding: healthy | warning | critical | pending
CREATE TABLE sales_orders (
  sales_order_id          TEXT PRIMARY KEY,
  customer_id             TEXT NOT NULL REFERENCES customers(customer_id),
  total_net_amount        NUMERIC,
  currency                TEXT,
  creation_date           DATE,
  requested_delivery_date DATE,
  delivery_status         TEXT,
  billing_status          TEXT,
  billing_block_reason    TEXT,
  delivery_block_reason   TEXT,
  flow_status             TEXT
);

-- sales_order_items
-- Merged with sales_order_schedule_lines for confirmed delivery date
CREATE TABLE sales_order_items (
  sales_order_id          TEXT NOT NULL REFERENCES sales_orders(sales_order_id),
  item_number             TEXT NOT NULL,
  product_id              TEXT REFERENCES products(product_id),
  quantity                NUMERIC,
  quantity_unit           TEXT,
  net_amount              NUMERIC,
  plant_id                TEXT REFERENCES plants(plant_id),
  confirmed_delivery_date DATE,
  confirmed_quantity      NUMERIC,
  PRIMARY KEY (sales_order_id, item_number)
);

-- deliveries
-- goods_movement_date NULL = not yet physically shipped
CREATE TABLE deliveries (
  delivery_id           TEXT PRIMARY KEY,
  shipping_point        TEXT,
  picking_status        TEXT,
  goods_movement_date   DATE,
  pod_status            TEXT,
  creation_date         DATE,
  delivery_block_reason TEXT
);

-- delivery_items
-- KEY JOIN: sales_order_id = outbound_delivery_items.referenceSdDocument
CREATE TABLE delivery_items (
  delivery_id      TEXT NOT NULL REFERENCES deliveries(delivery_id),
  item_number      TEXT NOT NULL,
  sales_order_id   TEXT REFERENCES sales_orders(sales_order_id),
  sales_order_item TEXT,
  actual_quantity  NUMERIC,
  quantity_unit    TEXT,
  plant_id         TEXT REFERENCES plants(plant_id),
  storage_location TEXT,
  PRIMARY KEY (delivery_id, item_number)
);

-- billing_docs
-- accounting_doc_id links forward to journal_entries
CREATE TABLE billing_docs (
  billing_doc_id     TEXT PRIMARY KEY,
  customer_id        TEXT REFERENCES customers(customer_id),
  total_net_amount   NUMERIC,
  currency           TEXT,
  billing_date       DATE,
  creation_date      DATE,
  is_cancelled       BOOLEAN DEFAULT false,
  cancelled_doc_id   TEXT,
  accounting_doc_id  TEXT,
  fiscal_year        TEXT,
  company_code       TEXT
);

-- billing_doc_items
-- KEY JOIN: delivery_id = billing_document_items.referenceSdDocument
CREATE TABLE billing_doc_items (
  billing_doc_id TEXT NOT NULL REFERENCES billing_docs(billing_doc_id),
  item_number    TEXT NOT NULL,
  delivery_id    TEXT REFERENCES deliveries(delivery_id),
  delivery_item  TEXT,
  product_id     TEXT REFERENCES products(product_id),
  quantity       NUMERIC,
  quantity_unit  TEXT,
  net_amount     NUMERIC,
  PRIMARY KEY (billing_doc_id, item_number)
);

-- journal_entries
-- clearing_date NULL = unpaid
CREATE TABLE journal_entries (
  accounting_doc_id TEXT PRIMARY KEY,
  billing_doc_id    TEXT REFERENCES billing_docs(billing_doc_id),
  customer_id       TEXT REFERENCES customers(customer_id),
  amount            NUMERIC,
  currency          TEXT,
  posting_date      DATE,
  clearing_date     DATE,
  clearing_doc_id   TEXT,
  fiscal_year       TEXT,
  gl_account        TEXT,
  profit_center     TEXT
);

-- payments
-- clearing_doc_id matches journal_entries.accounting_doc_id
CREATE TABLE payments (
  payment_id      TEXT PRIMARY KEY,
  customer_id     TEXT REFERENCES customers(customer_id),
  amount          NUMERIC,
  currency        TEXT,
  posting_date    DATE,
  clearing_date   DATE,
  clearing_doc_id TEXT,
  gl_account      TEXT
);

-- graph_edges
-- Precomputed O2C connections for fast graph visualization
-- relationship values: PLACED | FULFILLED_BY | BILLED_AS | POSTED_AS | SETTLED_BY
CREATE TABLE graph_edges (
  id           SERIAL PRIMARY KEY,
  source_id    TEXT NOT NULL,
  source_type  TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  target_type  TEXT NOT NULL,
  relationship TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_so_customer      ON sales_orders(customer_id);
CREATE INDEX idx_so_flow_status   ON sales_orders(flow_status);
CREATE INDEX idx_soi_order        ON sales_order_items(sales_order_id);
CREATE INDEX idx_soi_product      ON sales_order_items(product_id);
CREATE INDEX idx_di_delivery      ON delivery_items(delivery_id);
CREATE INDEX idx_di_sales_order   ON delivery_items(sales_order_id);
CREATE INDEX idx_bdi_billing      ON billing_doc_items(billing_doc_id);
CREATE INDEX idx_bdi_delivery     ON billing_doc_items(delivery_id);
CREATE INDEX idx_bd_customer      ON billing_docs(customer_id);
CREATE INDEX idx_bd_cancelled     ON billing_docs(is_cancelled);
CREATE INDEX idx_je_billing       ON journal_entries(billing_doc_id);
CREATE INDEX idx_je_customer      ON journal_entries(customer_id);
CREATE INDEX idx_je_clearing      ON journal_entries(clearing_doc_id);
CREATE INDEX idx_pay_customer     ON payments(customer_id);
CREATE INDEX idx_pay_clearing     ON payments(clearing_doc_id);
CREATE INDEX idx_edges_source     ON graph_edges(source_id);
CREATE INDEX idx_edges_target     ON graph_edges(target_id);
CREATE INDEX idx_edges_src_type   ON graph_edges(source_type);
CREATE INDEX idx_edges_tgt_type   ON graph_edges(target_type);

-- Disable RLS (no authentication in this app)
ALTER TABLE customers         DISABLE ROW LEVEL SECURITY;
ALTER TABLE products          DISABLE ROW LEVEL SECURITY;
ALTER TABLE plants            DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders      DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries        DISABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_items    DISABLE ROW LEVEL SECURITY;
ALTER TABLE billing_docs      DISABLE ROW LEVEL SECURITY;
ALTER TABLE billing_doc_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries   DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments          DISABLE ROW LEVEL SECURITY;
ALTER TABLE graph_edges       DISABLE ROW LEVEL SECURITY;
`;

console.log(sql);
console.log("─".repeat(60));
console.log("Copy SQL above → Supabase SQL Editor → Run");
console.log("   Then: npx tsx scripts/seed.ts");