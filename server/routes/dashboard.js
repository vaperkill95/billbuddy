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

    // Bank balances (exclude credit card accounts)
    const totalBankBalance = accounts.filter(a => a.account_type !== 'credit').reduce((s, a) => s + parseFloat(a.balance_current || 0), 0);
    const totalAvailable = accounts.filter(a => a.account_type !== 'credit').reduce((s, a) => s + parseFloat(a.balance_available || 0), 0);

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

// ─── Paycheck Forecast: bills due between paychecks ───

router.get("/paycheck-forecast", async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const dayOfMonth = now.getDate();

    const { rows: incomeSources } = await pool.query(
      "SELECT * FROM income_sources WHERE user_id = $1 AND is_active = true ORDER BY amount DESC", [userId]
    );

    const { rows: acctRows } = await pool.query(
      "SELECT COALESCE(SUM(balance_current), 0) as total FROM bank_accounts WHERE user_id = $1 AND account_type != 'credit'", [userId]
    );
    const bankBalance = parseFloat(acctRows[0].total);

    const { rows: bills } = await pool.query(
      "SELECT * FROM bills WHERE user_id = $1 AND is_paid = false ORDER BY due_date ASC", [userId]
    );

    if (!incomeSources.length) {
      return res.json({ hasIncome: false, message: "Add income sources to forecast bills between paychecks" });
    }

    const primary = incomeSources[0];
    const freq = primary.frequency;
    const payAmount = parseFloat(primary.amount);

    function getNextPayDates(frequency, nextPayDate, count) {
      const dates = [];
      let base;
      if (nextPayDate) {
        base = new Date(nextPayDate);
        while (base <= now) {
          switch (frequency) {
            case "weekly": base.setDate(base.getDate() + 7); break;
            case "biweekly": base.setDate(base.getDate() + 14); break;
            case "semimonthly": base.setDate(base.getDate() + 15); break;
            default: base.setMonth(base.getMonth() + 1);
          }
        }
      } else {
        base = new Date(now);
        switch (frequency) {
          case "weekly": base.setDate(base.getDate() + (7 - base.getDay())); break;
          case "biweekly": base.setDate(base.getDate() + 14); break;
          case "semimonthly":
            if (dayOfMonth <= 15) { base.setDate(15); } else { base.setMonth(base.getMonth() + 1); base.setDate(1); }
            break;
          default: base.setMonth(base.getMonth() + 1); base.setDate(1);
        }
      }
      for (let i = 0; i < count; i++) {
        dates.push(new Date(base));
        switch (frequency) {
          case "weekly": base.setDate(base.getDate() + 7); break;
          case "biweekly": base.setDate(base.getDate() + 14); break;
          case "semimonthly": base.setDate(base.getDate() + 15); break;
          default: base.setMonth(base.getMonth() + 1);
        }
      }
      return dates;
    }

    const payDates = getNextPayDates(freq, primary.next_pay_date, 3);
    const periods = [];
    const boundaries = [now, ...payDates];

    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1];
      const startDay = start.getDate();
      const endDay = end.getDate();

      const periodBills = bills.filter(b => {
        const due = b.due_date;
        if (i === 0) return due >= startDay && due < endDay;
        if (startDay < endDay) return due >= startDay && due < endDay;
        return due >= startDay || due < endDay;
      });

      periods.push({
        label: i === 0 ? "Before Next Paycheck" : "Paycheck " + i + " to " + (i + 1),
        startDate: start.toISOString().split("T")[0],
        endDate: end.toISOString().split("T")[0],
        paycheckDate: end.toISOString().split("T")[0],
        paycheckAmount: payAmount,
        bills: periodBills.map(b => ({ id: b.id, name: b.name, amount: parseFloat(b.amount), dueDate: b.due_date, category: b.category })),
        totalDue: periodBills.reduce((s, b) => s + parseFloat(b.amount), 0),
        daysUntilPaycheck: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
      });
    }

    let runningBalance = bankBalance;
    for (let i = 0; i < periods.length; i++) {
      const period = periods[i];
      // For periods after the first, add the paycheck received at the start of this period
      if (i > 0) {
        runningBalance += periods[i - 1].paycheckAmount;
      }
      period.balanceBefore = Math.round(runningBalance * 100) / 100;
      period.balanceAfter = Math.round((runningBalance - period.totalDue) * 100) / 100;
      period.covered = runningBalance >= period.totalDue;
      period.shortfall = period.covered ? 0 : Math.round((period.totalDue - runningBalance) * 100) / 100;
      runningBalance = runningBalance - period.totalDue;
    }

    res.json({
      hasIncome: true, bankBalance, paySource: primary.name, payFrequency: freq,
      payAmount, nextPayDate: payDates[0].toISOString().split("T")[0], periods,
    });
  } catch (err) {
    console.error("Paycheck forecast error:", err);
    res.status(500).json({ error: "Failed to generate forecast" });
  }
});

module.exports = router;

