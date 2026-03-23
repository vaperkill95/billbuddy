const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");
const { cacheMiddleware } = require("../middleware/cache");

const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

router.use(authMiddleware);

// GET /api/dashboard - Unified financial snapshot
router.get("/", cacheMiddleware(req => `user:${req.user.id}:dashboard`, 120), async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const dayOfMonth = now.getDate();
    const thisMonth = `${FULL_MONTHS[now.getMonth()]} ${now.getFullYear()}`;

    // Run monthly reset check
    if (req.checkMonthlyReset) await req.checkMonthlyReset(userId);

    // Fetch all data in parallel
    const [billsRes, cardsRes, accountsRes, incomeRes, historyRes] = await Promise.all([
      pool.query("SELECT * FROM bills WHERE user_id = $1 ORDER BY due_date ASC", [userId]),
      pool.query("SELECT * FROM credit_cards WHERE user_id = $1", [userId]),
      pool.query("SELECT * FROM bank_accounts ba JOIN plaid_items pi ON ba.plaid_item_id = pi.id WHERE ba.user_id = $1", [userId]),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM income_entries WHERE user_id = $1 AND month_label = $2", [userId, thisMonth]),
      pool.query("SELECT * FROM payment_history WHERE user_id = $1 ORDER BY paid_date DESC, id DESC LIMIT 10", [userId]),
    ]);

    const bills = billsRes.rows;
    const cards = cardsRes.rows;
    const accounts = accountsRes.rows;
    const incomeThisMonth = parseFloat(incomeRes.rows[0].total);

    // Bills breakdown
    const totalMonthlyBills = bills.reduce((s, b) => s + parseFloat(b.amount), 0);
    const paidBills = bills.filter(b => b.is_paid);
    const unpaidBills = bills.filter(b => !b.is_paid);
    const totalPaid = paidBills.reduce((s, b) => s + parseFloat(b.amount), 0);
    const totalUnpaid = unpaidBills.reduce((s, b) => s + parseFloat(b.amount), 0);

    // Upcoming (next 7 days)
    const upcoming = unpaidBills.filter(b => {
      const d = b.due_date - dayOfMonth;
      return d >= 0 && d <= 7;
    }).map(b => ({ id: b.id, name: b.name, amount: parseFloat(b.amount), dueDate: b.due_date, category: b.category, daysUntil: b.due_date - dayOfMonth }));

    // Overdue
    const overdue = unpaidBills.filter(b => b.due_date < dayOfMonth).map(b => ({
      id: b.id, name: b.name, amount: parseFloat(b.amount), dueDate: b.due_date, category: b.category, daysOverdue: dayOfMonth - b.due_date,
    }));

    // Bank balances
    const totalBankBalance = accounts.reduce((s, a) => s + parseFloat(a.balance_current || 0), 0);
    const totalAvailable = accounts.reduce((s, a) => s + parseFloat(a.balance_available || 0), 0);

    // Credit cards
    const totalCardDebt = cards.reduce((s, c) => s + parseFloat(c.balance), 0);
    const totalCardMin = cards.reduce((s, c) => s + parseFloat(c.min_payment), 0);

    // Income sources
    const { rows: incomeSources } = await pool.query(
      "SELECT * FROM income_sources WHERE user_id = $1 AND is_active = true", [userId]
    );
    let estimatedMonthlyIncome = 0;
    incomeSources.forEach(s => {
      const amt = parseFloat(s.amount);
      switch (s.frequency) {
        case "weekly": estimatedMonthlyIncome += amt * 4.33; break;
        case "biweekly": estimatedMonthlyIncome += amt * 2.17; break;
        case "semimonthly": estimatedMonthlyIncome += amt * 2; break;
        case "yearly": estimatedMonthlyIncome += amt / 12; break;
        default: estimatedMonthlyIncome += amt;
      }
    });

    // Leftover after all expenses
    const totalExpenses = totalMonthlyBills + totalCardMin;
    const leftoverEstimated = estimatedMonthlyIncome - totalExpenses;
    const leftoverFromBank = totalBankBalance - totalUnpaid;

    // Recent activity
    const recentActivity = historyRes.rows.slice(0, 5).map(r => ({
      id: r.id, billName: r.bill_name, amount: parseFloat(r.amount),
      category: r.category, paidDate: r.paid_date.toISOString().split("T")[0],
      status: r.status,
    }));

    // Onboarding status
    const hasBank = accounts.length > 0;
    const hasBills = bills.length > 0;
    const hasIncome = incomeSources.length > 0;
    const onboardingComplete = hasBank && hasBills && hasIncome;
    const onboardingSteps = [
      { key: "bills", label: "Add your bills", done: hasBills },
      { key: "bank", label: "Connect your bank", done: hasBank },
      { key: "income", label: "Set up your income", done: hasIncome },
    ];

    res.json({
      // Bills
      totalMonthlyBills, totalPaid, totalUnpaid,
      paidCount: paidBills.length, totalBills: bills.length,
      upcoming, overdue,
      // Bank
      totalBankBalance, totalAvailable, accountCount: accounts.length,
      // Cards
      totalCardDebt, totalCardMin, cardCount: cards.length,
      // Income
      incomeThisMonth, estimatedMonthlyIncome: Math.round(estimatedMonthlyIncome * 100) / 100,
      // Summary
      totalExpenses, leftoverEstimated: Math.round(leftoverEstimated * 100) / 100,
      leftoverFromBank: Math.round(leftoverFromBank * 100) / 100,
      // Recent
      recentActivity,
      // Onboarding
      onboardingComplete, onboardingSteps,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

module.exports = router;

