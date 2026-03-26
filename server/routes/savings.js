const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const Anthropic = require("@anthropic-ai/sdk");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// GET /api/savings/advisor - AI-powered savings advice
router.get("/advisor", async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const thisMonth = `${FULL_MONTHS[now.getMonth()]} ${now.getFullYear()}`;

    // Get income
    const { rows: sources } = await pool.query(
      "SELECT * FROM income_sources WHERE user_id = $1 AND is_active = true", [userId]
    );
    let monthlyIncome = 0;
    let payFrequency = "monthly";
    sources.forEach(s => {
      const amt = parseFloat(s.amount);
      payFrequency = s.frequency;
      switch (s.frequency) {
        case "weekly": monthlyIncome += amt * 4.33; break;
        case "biweekly": monthlyIncome += amt * 2.17; break;
        case "semimonthly": monthlyIncome += amt * 2; break;
        case "yearly": monthlyIncome += amt / 12; break;
        default: monthlyIncome += amt;
      }
    });

    // Get bills
    const { rows: bills } = await pool.query("SELECT * FROM bills WHERE user_id = $1", [userId]);
    const monthlyBills = bills.reduce((s, b) => s + parseFloat(b.amount), 0);

    // Get credit card mins
    const { rows: cards } = await pool.query("SELECT * FROM credit_cards WHERE user_id = $1", [userId]);
    const monthlyCardMins = cards.reduce((s, c) => s + parseFloat(c.min_payment), 0);

    // Get average spending from transactions (non-bill spending)
    const { rows: spendingRows } = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM bank_transactions
       WHERE user_id = $1 AND amount > 0 AND pending = false AND date >= CURRENT_DATE - 30`,
      [userId]
    );
    const monthlySpending = parseFloat(spendingRows[0].total);

    // Get bank balance
    const { rows: balRows } = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN balance_available > 0 THEN balance_available ELSE balance_current END), 0) as total FROM bank_accounts WHERE user_id = $1 AND account_type != 'credit'", [userId]
    );
    const bankBalance = parseFloat(balRows[0].total);

    // Calculate savings potential
    const totalFixedExpenses = monthlyBills + monthlyCardMins;
    const discretionarySpending = Math.max(0, monthlySpending - totalFixedExpenses);
    const canSaveMonthly = Math.max(0, monthlyIncome - monthlySpending);
    const conservativeSave = Math.round(canSaveMonthly * 0.5 * 100) / 100; // 50% of surplus
    const aggressiveSave = Math.round(canSaveMonthly * 0.8 * 100) / 100; // 80% of surplus

    // Break down by pay frequency
    let perPaycheck = 0;
    let paycheckLabel = "per month";
    switch (payFrequency) {
      case "weekly": perPaycheck = conservativeSave / 4.33; paycheckLabel = "per week"; break;
      case "biweekly": perPaycheck = conservativeSave / 2.17; paycheckLabel = "per paycheck"; break;
      case "semimonthly": perPaycheck = conservativeSave / 2; paycheckLabel = "per paycheck"; break;
      default: perPaycheck = conservativeSave; paycheckLabel = "per month";
    }
    perPaycheck = Math.round(perPaycheck * 100) / 100;

    // Savings goals
    const { rows: goals } = await pool.query(
      "SELECT * FROM savings_goals WHERE user_id = $1", [userId]
    );

    res.json({
      income: { monthly: Math.round(monthlyIncome * 100) / 100, frequency: payFrequency, sources: sources.length },
      expenses: {
        bills: Math.round(monthlyBills * 100) / 100,
        cardMins: Math.round(monthlyCardMins * 100) / 100,
        total: Math.round(totalFixedExpenses * 100) / 100,
        discretionary: Math.round(discretionarySpending * 100) / 100,
        totalSpending: Math.round(monthlySpending * 100) / 100,
      },
      savings: {
        potential: Math.round(canSaveMonthly * 100) / 100,
        conservative: conservativeSave,
        aggressive: aggressiveSave,
        perPaycheck,
        paycheckLabel,
      },
      bankBalance: Math.round(bankBalance * 100) / 100,
      goals: goals.map(g => ({
        id: g.id, name: g.name, target: parseFloat(g.target_amount),
        current: parseFloat(g.current_amount), accountType: g.account_type,
        progress: parseFloat(g.target_amount) > 0 ? Math.round((parseFloat(g.current_amount) / parseFloat(g.target_amount)) * 100) : 0,
      })),
    });
  } catch (err) {
    console.error("Savings advisor error:", err);
    res.status(500).json({ error: "Failed to calculate savings" });
  }
});

// POST /api/savings/goals - Create a savings goal
router.post("/goals", async (req, res) => {
  try {
    const { name, targetAmount, accountType } = req.body;
    const { rows } = await pool.query(
      "INSERT INTO savings_goals (user_id, name, target_amount, account_type) VALUES ($1, $2, $3, $4) RETURNING *",
      [req.user.id, name, targetAmount, accountType || "general"]
    );
    res.json({ id: rows[0].id, name, targetAmount, currentAmount: 0 });
  } catch (err) { res.status(500).json({ error: "Failed to create goal" }); }
});

// PATCH /api/savings/goals/:id - Update savings goal progress
router.patch("/goals/:id", async (req, res) => {
  try {
    const { addAmount } = req.body;
    await pool.query(
      "UPDATE savings_goals SET current_amount = current_amount + $1 WHERE id = $2 AND user_id = $3",
      [addAmount, req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to update goal" }); }
});

// DELETE /api/savings/goals/:id
router.delete("/goals/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM savings_goals WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to delete goal" }); }
});

module.exports = router;
