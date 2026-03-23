const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRouter = require("./routes/auth");
const billsRouter = require("./routes/bills");
const historyRouter = require("./routes/history");
const insightsRouter = require("./routes/insights");
const cardsRouter = require("./routes/cards");
const incomeRouter = require("./routes/income");
const calendarRouter = require("./routes/calendar");
const plaidRouter = require("./routes/plaid");
const dashboardRouter = require("./routes/dashboard");
const pool = require("./db/pool");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Make checkMonthlyReset available to routes
app.use((req, res, next) => {
  req.checkMonthlyReset = checkMonthlyReset;
  next();
});

// Routes
app.use("/api/auth", authRouter);
app.use("/api/bills", billsRouter);
app.use("/api/history", historyRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/cards", cardsRouter);
app.use("/api/income", incomeRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/plaid", plaidRouter);
app.use("/api/dashboard", dashboardRouter);

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

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        name VARCHAR(255) NOT NULL,
        google_id VARCHAR(255),
        avatar_url TEXT,
        auth_provider VARCHAR(20) NOT NULL DEFAULT 'email',
        calendar_token VARCHAR(255) UNIQUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bills (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bill_name VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        category VARCHAR(100) NOT NULL,
        paid_date DATE NOT NULL DEFAULT CURRENT_DATE,
        month_label VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'on-time',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills(user_id);
      CREATE INDEX IF NOT EXISTS idx_history_user_id ON payment_history(user_id);

      CREATE TABLE IF NOT EXISTS credit_cards (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
        credit_limit DECIMAL(12, 2) NOT NULL DEFAULT 0,
        apr DECIMAL(5, 2) NOT NULL DEFAULT 0,
        min_payment DECIMAL(10, 2) NOT NULL DEFAULT 0,
        due_date INTEGER NOT NULL CHECK (due_date >= 1 AND due_date <= 31),
        goal_date DATE,
        show_in_history BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS card_payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        card_id INTEGER NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
        amount DECIMAL(10, 2) NOT NULL,
        paid_date DATE NOT NULL DEFAULT CURRENT_DATE,
        month_label VARCHAR(50) NOT NULL,
        note VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_cards_user_id ON credit_cards(user_id);
      CREATE INDEX IF NOT EXISTS idx_card_payments_user_id ON card_payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_card_payments_card_id ON card_payments(card_id);

      CREATE TABLE IF NOT EXISTS income_sources (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
        next_pay_date DATE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS income_entries (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_id INTEGER REFERENCES income_sources(id) ON DELETE SET NULL,
        source_name VARCHAR(255) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        received_date DATE NOT NULL DEFAULT CURRENT_DATE,
        month_label VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_income_sources_user ON income_sources(user_id);
      CREATE INDEX IF NOT EXISTS idx_income_entries_user ON income_entries(user_id);
      CREATE INDEX IF NOT EXISTS idx_income_entries_date ON income_entries(received_date);

      CREATE TABLE IF NOT EXISTS plaid_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        access_token TEXT NOT NULL,
        item_id VARCHAR(255) NOT NULL,
        institution_name VARCHAR(255),
        institution_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bank_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plaid_item_id INTEGER REFERENCES plaid_items(id) ON DELETE CASCADE,
        account_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        official_name VARCHAR(255),
        account_type VARCHAR(50),
        account_subtype VARCHAR(50),
        balance_current DECIMAL(12, 2) DEFAULT 0,
        balance_available DECIMAL(12, 2) DEFAULT 0,
        mask VARCHAR(10),
        last_synced TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bank_transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id VARCHAR(255) NOT NULL,
        transaction_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        date DATE NOT NULL,
        category VARCHAR(255),
        pending BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_plaid_items_user ON plaid_items(user_id);
      CREATE INDEX IF NOT EXISTS idx_bank_accounts_user ON bank_accounts(user_id);
      CREATE INDEX IF NOT EXISTS idx_bank_transactions_user ON bank_transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(date);
      CREATE INDEX IF NOT EXISTS idx_bank_transactions_tid ON bank_transactions(transaction_id);
    `);

    // Migrations for existing databases
    const migrations = [
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_token VARCHAR(255) UNIQUE",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reset_month VARCHAR(10)",
    ];
    for (const sql of migrations) {
      try { await pool.query(sql); } catch (e) { /* column may already exist */ }
    }

    console.log("✅ Database tables ready");
  } catch (err) {
    console.error("⚠️  Database init warning:", err.message);
  }
}

// ─── Auto-reset recurring bills at start of new month ───
async function checkMonthlyReset(userId) {
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const { rows } = await pool.query("SELECT last_reset_month FROM users WHERE id = $1", [userId]);
    const lastReset = rows[0]?.last_reset_month;

    if (lastReset !== currentMonth) {
      // New month! Reset all recurring bills to unpaid
      await pool.query(
        "UPDATE bills SET is_paid = false, updated_at = NOW() WHERE user_id = $1 AND is_recurring = true",
        [userId]
      );
      // Update the user's last reset month
      await pool.query(
        "UPDATE users SET last_reset_month = $1 WHERE id = $2",
        [currentMonth, userId]
      );
      console.log(`🔄 Monthly reset for user ${userId} — bills reset for ${currentMonth}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error("Monthly reset error:", err.message);
    return false;
  }
}

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 BillBuddy server running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health\n`);
  });
});
