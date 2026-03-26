const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

// GET /api/smart-savings - Calculate round-ups, savings potential, autopilot recommendations
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const [txnsRes, incomeRes, billsRes, cardsRes, accountsRes, goalsRes] = await Promise.all([
      pool.query("SELECT name, amount, date FROM bank_transactions WHERE user_id = $1 AND date >= CURRENT_DATE - 30 AND amount > 0 AND pending = false ORDER BY date DESC", [userId]),
      pool.query("SELECT amount, frequency FROM income_sources WHERE user_id = $1 AND is_active = true", [userId]),
      pool.query("SELECT amount FROM bills WHERE user_id = $1", [userId]),
      pool.query("SELECT balance, min_payment FROM credit_cards WHERE user_id = $1", [userId]),
      pool.query("SELECT balance_current, account_type FROM bank_accounts WHERE user_id = $1", [userId]),
      pool.query("SELECT * FROM financial_goals WHERE user_id = $1", [userId]).catch(() => ({ rows: [] })),
    ]);

    const transactions = txnsRes.rows;
    const totalBalance = accountsRes.rows.filter(a => a.account_type !== 'credit').reduce((s, a) => s + (parseFloat(a.balance_available || 0) > 0 ? parseFloat(a.balance_available) : parseFloat(a.balance_current || 0)), 0);
    const monthlyBills = billsRes.rows.reduce((s, b) => s + parseFloat(b.amount), 0);
    const monthlyMinPayments = cardsRes.rows.reduce((s, c) => s + parseFloat(c.min_payment || 0), 0);
    const monthlyIncome = incomeRes.rows.reduce((s, src) => {
      const amt = parseFloat(src.amount);
      switch (src.frequency) { case "weekly": return s + amt * 4.33; case "biweekly": return s + amt * 2.17; case "semimonthly": return s + amt * 2; case "yearly": return s + amt / 12; default: return s + amt; }
    }, 0);

    // 1. Round-up calculations
    let totalRoundUps = 0;
    const roundUpDetails = [];
    transactions.forEach(tx => {
      const amount = parseFloat(tx.amount);
      const roundedUp = Math.ceil(amount);
      const roundUp = roundedUp - amount;
      if (roundUp > 0 && roundUp < 1) {
        totalRoundUps += roundUp;
        roundUpDetails.push({ name: tx.name, amount, roundUp: Math.round(roundUp * 100) / 100 });
      }
    });

    // Project monthly and yearly
    const monthlyRoundUps = Math.round(totalRoundUps * 100) / 100;
    const yearlyRoundUps = Math.round(monthlyRoundUps * 12 * 100) / 100;

    // 2. Smart savings recommendations
    const discretionary = monthlyIncome - monthlyBills - monthlyMinPayments;
    const savingsRules = [];

    // 50/30/20 rule
    const needsBudget = monthlyIncome * 0.5;
    const wantsBudget = monthlyIncome * 0.3;
    const savingsBudget = monthlyIncome * 0.2;
    savingsRules.push({
      name: "50/30/20 Rule",
      description: "50% needs, 30% wants, 20% savings",
      recommended: Math.round(savingsBudget * 100) / 100,
      perPaycheck: Math.round((savingsBudget / 2) * 100) / 100,
    });

    // 10% rule
    savingsRules.push({
      name: "10% Rule",
      description: "Save 10% of every paycheck",
      recommended: Math.round(monthlyIncome * 0.1 * 100) / 100,
      perPaycheck: Math.round((monthlyIncome * 0.1 / 2) * 100) / 100,
    });

    // Aggressive
    if (discretionary > 500) {
      savingsRules.push({
        name: "Aggressive Saver",
        description: "Save everything after bills + $500 buffer",
        recommended: Math.round(Math.max(0, discretionary - 500) * 100) / 100,
        perPaycheck: Math.round(Math.max(0, discretionary - 500) / 2 * 100) / 100,
      });
    }

    // 3. Autopilot suggestion based on spending patterns
    const dailySpend = transactions.reduce((s, t) => s + parseFloat(t.amount), 0) / 30;
    const weeklySpend = dailySpend * 7;
    const safeAutoSave = Math.max(0, Math.round((discretionary * 0.15) * 100) / 100); // 15% of discretionary

    // 4. Goals progress
    const goals = goalsRes.rows.map(g => ({
      id: g.id, name: g.name, icon: g.icon,
      target: parseFloat(g.target_amount), current: parseFloat(g.current_amount),
      monthly: parseFloat(g.monthly_contribution || 0),
      pct: parseFloat(g.target_amount) > 0 ? Math.round((parseFloat(g.current_amount) / parseFloat(g.target_amount)) * 1000) / 10 : 0,
    }));

    res.json({
      roundUps: { monthly: monthlyRoundUps, yearly: yearlyRoundUps, txnCount: roundUpDetails.length, topRoundUps: roundUpDetails.sort((a, b) => b.roundUp - a.roundUp).slice(0, 10) },
      autopilot: { recommended: safeAutoSave, daily: Math.round(safeAutoSave / 30 * 100) / 100, weekly: Math.round(safeAutoSave / 4 * 100) / 100, monthly: safeAutoSave },
      savingsRules,
      snapshot: { balance: totalBalance, monthlyIncome, monthlyBills, monthlyMinPayments, discretionary: Math.round(discretionary * 100) / 100, dailySpend: Math.round(dailySpend * 100) / 100 },
      goals,
    });
  } catch (err) {
    console.error("Smart savings error:", err.message);
    res.status(500).json({ error: "Failed", detail: err.message });
  }
});

module.exports = router;
