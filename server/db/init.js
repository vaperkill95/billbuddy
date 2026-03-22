const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const initSQL = `
-- Bills table
CREATE TABLE IF NOT EXISTS bills (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  due_date INTEGER NOT NULL CHECK (due_date >= 1 AND due_date <= 31),
  category VARCHAR(100) NOT NULL DEFAULT 'Other',
  is_paid BOOLEAN NOT NULL DEFAULT false,
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  reminder VARCHAR(20) NOT NULL DEFAULT 'none',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment history table
CREATE TABLE IF NOT EXISTS payment_history (
  id SERIAL PRIMARY KEY,
  bill_name VARCHAR(255) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  category VARCHAR(100) NOT NULL,
  paid_date DATE NOT NULL DEFAULT CURRENT_DATE,
  month_label VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'on-time',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_bills_due_date ON bills(due_date);
CREATE INDEX IF NOT EXISTS idx_bills_category ON bills(category);
CREATE INDEX IF NOT EXISTS idx_bills_is_paid ON bills(is_paid);
CREATE INDEX IF NOT EXISTS idx_history_paid_date ON payment_history(paid_date);
CREATE INDEX IF NOT EXISTS idx_history_month ON payment_history(month_label);

-- Seed some sample data if bills table is empty
INSERT INTO bills (name, amount, due_date, category, is_paid, is_recurring, reminder)
SELECT * FROM (VALUES
  ('Rent', 1500.00, 1, 'Housing', false, true, '3days'),
  ('Electric', 120.00, 15, 'Utilities', false, true, '1day'),
  ('Netflix', 15.99, 8, 'Subscriptions', true, true, 'none'),
  ('Car Insurance', 180.00, 20, 'Insurance', false, true, '1week'),
  ('Phone Bill', 85.00, 12, 'Phone/Internet', true, true, '1day'),
  ('Spotify', 10.99, 5, 'Subscriptions', true, true, 'none'),
  ('Internet', 65.00, 18, 'Phone/Internet', false, true, '3days'),
  ('Gym', 40.00, 1, 'Health', false, true, '1day')
) AS seed(name, amount, due_date, category, is_paid, is_recurring, reminder)
WHERE NOT EXISTS (SELECT 1 FROM bills LIMIT 1);

-- Seed payment history if empty
INSERT INTO payment_history (bill_name, amount, category, paid_date, month_label, status)
SELECT * FROM (VALUES
  ('Rent', 1500.00, 'Housing', '2026-02-01'::date, 'February 2026', 'on-time'),
  ('Electric', 135.00, 'Utilities', '2026-02-16'::date, 'February 2026', 'late'),
  ('Netflix', 15.99, 'Subscriptions', '2026-02-08'::date, 'February 2026', 'on-time'),
  ('Car Insurance', 180.00, 'Insurance', '2026-02-20'::date, 'February 2026', 'on-time'),
  ('Phone Bill', 85.00, 'Phone/Internet', '2026-02-12'::date, 'February 2026', 'on-time'),
  ('Spotify', 10.99, 'Subscriptions', '2026-02-05'::date, 'February 2026', 'on-time'),
  ('Internet', 65.00, 'Phone/Internet', '2026-02-18'::date, 'February 2026', 'on-time'),
  ('Gym', 40.00, 'Health', '2026-02-01'::date, 'February 2026', 'on-time'),
  ('Rent', 1500.00, 'Housing', '2026-01-01'::date, 'January 2026', 'on-time'),
  ('Electric', 142.00, 'Utilities', '2026-01-15'::date, 'January 2026', 'on-time'),
  ('Netflix', 15.99, 'Subscriptions', '2026-01-08'::date, 'January 2026', 'on-time'),
  ('Car Insurance', 180.00, 'Insurance', '2026-01-22'::date, 'January 2026', 'late'),
  ('Phone Bill', 85.00, 'Phone/Internet', '2026-01-12'::date, 'January 2026', 'on-time'),
  ('Gym', 40.00, 'Health', '2026-01-01'::date, 'January 2026', 'on-time')
) AS seed(bill_name, amount, category, paid_date, month_label, status)
WHERE NOT EXISTS (SELECT 1 FROM payment_history LIMIT 1);
`;

async function init() {
  try {
    console.log("🔌 Connecting to database...");
    await pool.query(initSQL);
    console.log("✅ Database initialized successfully!");
    console.log("   - bills table created");
    console.log("   - payment_history table created");
    console.log("   - indexes created");
    console.log("   - sample data seeded (if empty)");
  } catch (err) {
    console.error("❌ Database initialization failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

init();
