const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRouter = require("./routes/auth");
const billsRouter = require("./routes/bills");
const historyRouter = require("./routes/history");
const insightsRouter = require("./routes/insights");
const cardsRouter = require("./routes/cards");
const pool = require("./db/pool");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRouter);
app.use("/api/bills", billsRouter);
app.use("/api/history", historyRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/cards", cardsRouter);

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
    `);
    console.log("✅ Database tables ready");
  } catch (err) {
    console.error("⚠️  Database init warning:", err.message);
  }
}

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 BillBuddy server running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health\n`);
  });
});
