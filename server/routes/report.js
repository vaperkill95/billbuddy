const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// GET /api/report/monthly - Generate monthly financial report data
router.get("/monthly", async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month) : now.getMonth();
    const year = req.query.year ? parseInt(req.query.year) : now.getFullYear();
    const monthLabel = `${FULL_MONTHS[month]} ${year}`;

    const { rows: bills } = await pool.query("SELECT * FROM bills WHERE user_id = $1 ORDER BY due_date ASC", [userId]);
    const totalMonthlyBills = bills.reduce((s, b) => s + parseFloat(b.amount), 0);
    const paidBills = bills.filter(b => b.is_paid).length;

    const { rows: payments } = await pool.query(
      "SELECT * FROM payment_history WHERE user_id = $1 AND month_label = $2 ORDER BY paid_date DESC",
      [userId, monthLabel]
    );
    const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
    const onTimePayments = payments.filter(p => p.status === "on-time").length;

    const { rows: accounts } = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN balance_available > 0 THEN balance_available ELSE balance_current END), 0) as total FROM bank_accounts WHERE user_id = $1 AND account_type != 'credit'",
      [userId]
    );
    const bankBalance = parseFloat(accounts[0].total);

    const { rows: cards } = await pool.query("SELECT * FROM credit_cards WHERE user_id = $1", [userId]);
    const totalDebt = cards.reduce((s, c) => s + parseFloat(c.balance), 0);
    const totalLimit = cards.reduce((s, c) => s + parseFloat(c.credit_limit || 0), 0);

    const { rows: incomeRows } = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM income_entries WHERE user_id = $1 AND month_label = $2",
      [userId, monthLabel]
    );
    const incomeThisMonth = parseFloat(incomeRows[0].total);

    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endDate = month === 11 ? `${year + 1}-01-01` : `${year}-${String(month + 2).padStart(2, "0")}-01`;
    const { rows: spending } = await pool.query(
      `SELECT category, SUM(amount) as total, COUNT(*) as count FROM bank_transactions
       WHERE user_id = $1 AND amount > 0 AND pending = false AND date >= $2 AND date < $3
       GROUP BY category ORDER BY total DESC LIMIT 10`,
      [userId, startDate, endDate]
    );
    const totalSpending = spending.reduce((s, c) => s + parseFloat(c.total), 0);

    const { rows: scoreRows } = await pool.query(
      "SELECT score, grade FROM credit_scores WHERE user_id = $1 ORDER BY checked_at DESC LIMIT 1", [userId]
    );

    const { rows: goals } = await pool.query("SELECT * FROM financial_goals WHERE user_id = $1", [userId]);

    res.json({
      month: monthLabel, monthNum: month, year,
      bankBalance, incomeThisMonth, totalSpending,
      netFlow: incomeThisMonth - totalSpending,
      totalMonthlyBills, billCount: bills.length, paidBills, totalPaid, onTimePayments,
      payments: payments.map(p => ({ name: p.bill_name, amount: parseFloat(p.amount), date: p.paid_date, status: p.status, category: p.category })),
      totalDebt, totalLimit,
      utilization: totalLimit > 0 ? Math.round((totalDebt / totalLimit) * 100) : 0,
      cards: cards.map(c => ({ name: c.name, balance: parseFloat(c.balance), limit: parseFloat(c.credit_limit || 0), apr: parseFloat(c.apr || 0) })),
      spendingByCategory: spending.map(s => ({ category: s.category, total: parseFloat(s.total), count: parseInt(s.count) })),
      creditScore: scoreRows.length > 0 ? { score: scoreRows[0].score, grade: scoreRows[0].grade } : null,
      goalsSummary: { totalSaved: goals.reduce((s, g) => s + parseFloat(g.current_amount), 0), totalTarget: goals.reduce((s, g) => s + parseFloat(g.target_amount), 0), count: goals.length },
      bills: bills.map(b => ({ name: b.name, amount: parseFloat(b.amount), dueDate: b.due_date, category: b.category, isPaid: b.is_paid })),
    });
  } catch (err) {
    console.error("Report error:", err.message);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

module.exports = router;
