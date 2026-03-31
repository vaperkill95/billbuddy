const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
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
const forecastRouter = require("./routes/forecast");
const alertsRouter = require("./routes/alerts");
const negotiateRouter = require("./routes/negotiate");
const householdRouter = require("./routes/household");
const pool = require("./db/pool");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = ["https://billbuddy.us", "https://www.billbuddy.us"];
    if (allowed.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.set("trust proxy", 1);

// Global rate limiter for all API routes (200 req/min per user)
const { rateLimiter } = require("./middleware/rateLimit");
app.use("/api", rateLimiter(200, 60000));

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
app.use("/api/forecast", forecastRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/negotiate", negotiateRouter);
app.use("/api/household", householdRouter);
app.use("/api/subscriptions", require("./routes/subscriptions"));
app.use("/api/activity", require("./routes/activity"));
app.use("/api/savings", require("./routes/savings"));
app.use("/api/spending", require("./routes/spending"));
app.use("/api/spending-insights", require("./routes/spendingInsights"));
app.use("/api/goals", require("./routes/goals"));
app.use("/api/credit", require("./routes/credit"));
app.use("/api/report", require("./routes/report"));
app.use("/api/smart-savings", require("./routes/smartSavings"));
app.use("/api/cancel-helper", require("./routes/cancelHelper"));
app.use("/api/advisor", require("./routes/advisor"));
app.use("/api/suggestions", require("./routes/suggestions"));
app.use("/api/2fa", require("./routes/twoFactor"));

app.get("/api/health", async (req, res) => {
  try {
    const dbStart = Date.now();
    await pool.query("SELECT 1");
    const dbLatency = Date.now() - dbStart;
    const stats = pool.getStats ? pool.getStats() : {};
    const memUsage = process.memoryUsage();
    res.json({
      status: "ok", uptime: Math.round(process.uptime()),
      database: { connected: true, latency: dbLatency + "ms" },
      pool: { total: stats.totalCount || 0, idle: stats.idleCount || 0, waiting: stats.waitingCount || 0, queries: stats.totalQueries || 0, errors: stats.errors || 0, slowQueries: stats.slowQueries || 0 },
      memory: { heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + "MB", rss: Math.round(memUsage.rss / 1024 / 1024) + "MB" },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: "error", database: { connected: false, error: err.message } });
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

      CREATE TABLE IF NOT EXISTS households (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL DEFAULT 'My Household',
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invite_code VARCHAR(20) UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS household_members (
        id SERIAL PRIMARY KEY,
        household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) DEFAULT 'member',
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(household_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS household_bills (
        id SERIAL PRIMARY KEY,
        household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        bill_name VARCHAR(255) NOT NULL,
        total_amount DECIMAL(12, 2) NOT NULL,
        due_date INTEGER NOT NULL,
        category VARCHAR(100) DEFAULT 'Other',
        is_recurring BOOLEAN DEFAULT true,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS household_splits (
        id SERIAL PRIMARY KEY,
        household_bill_id INTEGER NOT NULL REFERENCES household_bills(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        split_amount DECIMAL(12, 2) NOT NULL,
        is_paid BOOLEAN DEFAULT false,
        paid_at TIMESTAMP WITH TIME ZONE,
        UNIQUE(household_bill_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_household_bills_hh ON household_bills(household_id);
      CREATE INDEX IF NOT EXISTS idx_household_splits_user ON household_splits(user_id);

      -- Performance indexes
      CREATE INDEX IF NOT EXISTS idx_bills_user_paid ON bills(user_id, is_paid);
      CREATE INDEX IF NOT EXISTS idx_bills_due ON bills(user_id, due_date);
      CREATE INDEX IF NOT EXISTS idx_bank_transactions_user_date ON bank_transactions(user_id, date DESC);
      CREATE INDEX IF NOT EXISTS idx_bank_transactions_acct ON bank_transactions(account_id, date DESC);
      CREATE INDEX IF NOT EXISTS idx_bank_transactions_pending ON bank_transactions(user_id, pending, date DESC);
      CREATE INDEX IF NOT EXISTS idx_bank_accounts_acct_id ON bank_accounts(account_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_credit_cards_user ON credit_cards(user_id);
      CREATE INDEX IF NOT EXISTS idx_payment_history_user_month ON payment_history(user_id, month_label);
      CREATE INDEX IF NOT EXISTS idx_income_entries_user_date ON income_entries(user_id, received_date DESC);
      CREATE INDEX IF NOT EXISTS idx_household_members_hh ON household_members(household_id);
      CREATE INDEX IF NOT EXISTS idx_household_splits_bill ON household_splits(household_bill_id);
    `);

    // Migrations for existing databases
    const migrations = [
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_token VARCHAR(255) UNIQUE",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reset_month VARCHAR(10)",
      // Dark mode persistence
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN DEFAULT false",
      // Flexible bill frequencies
      "ALTER TABLE bills ADD COLUMN IF NOT EXISTS frequency VARCHAR(20) DEFAULT 'monthly'",
      "ALTER TABLE bills ADD COLUMN IF NOT EXISTS end_amount DECIMAL(12,2)",
      "ALTER TABLE bills ADD COLUMN IF NOT EXISTS total_paid_amount DECIMAL(12,2) DEFAULT 0",
      "ALTER TABLE bills ADD COLUMN IF NOT EXISTS next_due_date DATE",
      // Savings goals
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS ez_pass_enabled BOOLEAN DEFAULT false",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS ez_pass_reload_amount DECIMAL(10,2) DEFAULT 50",
      // Household sharing preferences
      "ALTER TABLE household_members ADD COLUMN IF NOT EXISTS share_bank BOOLEAN DEFAULT true",
      "ALTER TABLE household_members ADD COLUMN IF NOT EXISTS share_transactions BOOLEAN DEFAULT true",
      "ALTER TABLE household_members ADD COLUMN IF NOT EXISTS share_bills BOOLEAN DEFAULT true",
      "ALTER TABLE household_members ADD COLUMN IF NOT EXISTS share_cards BOOLEAN DEFAULT false",
      "ALTER TABLE household_members ADD COLUMN IF NOT EXISTS share_income BOOLEAN DEFAULT false",
      // Household mode: 'household' (roommates) or 'joint' (partners)
      "ALTER TABLE households ADD COLUMN IF NOT EXISTS mode VARCHAR(20) DEFAULT 'household'",
    ];
    for (const sql of migrations) {
      try { await pool.query(sql); } catch (e) { /* column may already exist */ }
    }

    // Create savings goals table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS savings_goals (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          target_amount DECIMAL(12,2) NOT NULL,
          current_amount DECIMAL(12,2) DEFAULT 0,
          account_type VARCHAR(50) DEFAULT 'general',
          linked_account_id VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_savings_goals_user ON savings_goals(user_id);
      `);
    } catch (e) { /* already exists */ }

    // Create spending budgets table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS spending_budgets (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          category VARCHAR(100) NOT NULL,
          monthly_limit DECIMAL(12,2) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(user_id, category)
        );
        CREATE INDEX IF NOT EXISTS idx_spending_budgets_user ON spending_budgets(user_id);
      `);
    } catch (e) { /* already exists */ }

    // Financial goals table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS financial_goals (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          goal_type VARCHAR(50) DEFAULT 'savings',
          icon VARCHAR(10) DEFAULT '🎯',
          target_amount DECIMAL(12,2) NOT NULL,
          current_amount DECIMAL(12,2) DEFAULT 0,
          monthly_contribution DECIMAL(12,2) DEFAULT 0,
          target_date DATE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_financial_goals_user ON financial_goals(user_id);
      `);
    } catch (e) {}

    // Credit score history table
    try { await pool.query(`CREATE TABLE IF NOT EXISTS credit_scores (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, score INTEGER NOT NULL, grade VARCHAR(20), checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()); CREATE INDEX IF NOT EXISTS idx_credit_scores_user ON credit_scores(user_id);`); } catch (e) {}

    // 2FA table
    try { await pool.query(`CREATE TABLE IF NOT EXISTS user_2fa (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      secret TEXT NOT NULL,
      enabled BOOLEAN DEFAULT false,
      backup_codes TEXT DEFAULT '[]',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`); } catch (e) {}

    console.log("â Database tables ready");
  } catch (err) {
    console.error("â ï¸  Database init warning:", err.message);
  }
}

// âââ Auto-reset recurring bills at start of new month âââ
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
      console.log(`ð Monthly reset for user ${userId} â bills reset for ${currentMonth}`);
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
    console.log(`\nð BillBuddy server running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health\n`);
  });
});



