const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const billsRouter = require("./routes/bills");
const historyRouter = require("./routes/history");
const pool = require("./db/pool");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use("/api/bills", billsRouter);
app.use("/api/history", historyRouter);

// Health check
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: "error", database: "disconnected", error: err.message });
  }
});

// Serve React frontend in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../client/build")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../client/build", "index.html"));
  });
}

// Auto-initialize database tables on startup
async function initDB() {
  try {
    await pool.query(`
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
      CREATE INDEX IF NOT EXISTS idx_bills_due_date ON bills(due_date);
      CREATE INDEX IF NOT EXISTS idx_bills_is_paid ON bills(is_paid);
      CREATE INDEX IF NOT EXISTS idx_history_paid_date ON payment_history(paid_date);
      CREATE INDEX IF NOT EXISTS idx_history_month ON payment_history(month_label);
    `);
    console.log("✅ Database tables ready");
  } catch (err) {
    console.error("⚠️  Database init warning:", err.message);
  }
}

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 BillBuddy server running on port ${PORT}`);
    console.log(`   API:    http://localhost:${PORT}/api/health`);
    console.log(`   Bills:  http://localhost:${PORT}/api/bills`);
    console.log(`   History: http://localhost:${PORT}/api/history\n`);
  });
});
