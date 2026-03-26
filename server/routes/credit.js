const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

// Credit health score estimator based on actual financial data
function estimateCreditHealth(data) {
  let score = 700; // Start at average
  const factors = [];

  // 1. Credit utilization (35% of score impact)
  const utilization = data.totalLimit > 0 ? (data.totalDebt / data.totalLimit) * 100 : 0;
  if (utilization === 0 && data.totalLimit > 0) { score += 40; factors.push({ name: "Credit Utilization", rating: "Excellent", detail: "0% utilization - perfect", impact: "+40", color: "#10B981" }); }
  else if (utilization < 10) { score += 30; factors.push({ name: "Credit Utilization", rating: "Excellent", detail: utilization.toFixed(0) + "% - very low", impact: "+30", color: "#10B981" }); }
  else if (utilization < 30) { score += 15; factors.push({ name: "Credit Utilization", rating: "Good", detail: utilization.toFixed(0) + "% - under 30%", impact: "+15", color: "#10B981" }); }
  else if (utilization < 50) { score -= 10; factors.push({ name: "Credit Utilization", rating: "Fair", detail: utilization.toFixed(0) + "% - try to get under 30%", impact: "-10", color: "#F59E0B" }); }
  else if (utilization < 75) { score -= 30; factors.push({ name: "Credit Utilization", rating: "Poor", detail: utilization.toFixed(0) + "% - high usage hurts score", impact: "-30", color: "#EF4444" }); }
  else { score -= 50; factors.push({ name: "Credit Utilization", rating: "Very Poor", detail: utilization.toFixed(0) + "% - maxed out", impact: "-50", color: "#EF4444" }); }

  // 2. Payment history (35% impact) - based on bills paid on time
  const onTimeRate = data.totalBills > 0 ? (data.paidBills / data.totalBills) * 100 : 100;
  if (onTimeRate >= 95) { score += 35; factors.push({ name: "Payment History", rating: "Excellent", detail: "Bills paid on time", impact: "+35", color: "#10B981" }); }
  else if (onTimeRate >= 80) { score += 15; factors.push({ name: "Payment History", rating: "Good", detail: "Most bills paid", impact: "+15", color: "#10B981" }); }
  else { score -= 20; factors.push({ name: "Payment History", rating: "Needs Work", detail: "Some bills overdue", impact: "-20", color: "#EF4444" }); }

  // 3. Available credit (10% impact)
  const available = data.totalLimit - data.totalDebt;
  if (available > 5000) { score += 10; factors.push({ name: "Available Credit", rating: "Good", detail: "$" + available.toFixed(0) + " available", impact: "+10", color: "#10B981" }); }
  else if (available > 1000) { score += 5; factors.push({ name: "Available Credit", rating: "Fair", detail: "$" + available.toFixed(0) + " available", impact: "+5", color: "#F59E0B" }); }
  else { score -= 10; factors.push({ name: "Available Credit", rating: "Low", detail: "$" + available.toFixed(0) + " available", impact: "-10", color: "#EF4444" }); }

  // 4. Debt-to-income ratio (10% impact)
  const dti = data.monthlyIncome > 0 ? ((data.totalDebt * 0.02 + data.monthlyBills) / data.monthlyIncome) * 100 : 50;
  if (dti < 20) { score += 15; factors.push({ name: "Debt-to-Income", rating: "Excellent", detail: dti.toFixed(0) + "% DTI ratio", impact: "+15", color: "#10B981" }); }
  else if (dti < 36) { score += 5; factors.push({ name: "Debt-to-Income", rating: "Good", detail: dti.toFixed(0) + "% DTI ratio", impact: "+5", color: "#10B981" }); }
  else if (dti < 50) { score -= 5; factors.push({ name: "Debt-to-Income", rating: "Fair", detail: dti.toFixed(0) + "% - try to lower", impact: "-5", color: "#F59E0B" }); }
  else { score -= 20; factors.push({ name: "Debt-to-Income", rating: "High", detail: dti.toFixed(0) + "% - too much debt", impact: "-20", color: "#EF4444" }); }

  // 5. Account mix (10% impact)
  const accountTypes = data.accountCount;
  if (accountTypes >= 3) { score += 10; factors.push({ name: "Account Mix", rating: "Good", detail: accountTypes + " accounts linked", impact: "+10", color: "#10B981" }); }
  else if (accountTypes >= 1) { score += 5; factors.push({ name: "Account Mix", rating: "Fair", detail: accountTypes + " account(s)", impact: "+5", color: "#F59E0B" }); }
  else { factors.push({ name: "Account Mix", rating: "Unknown", detail: "No accounts linked", impact: "0", color: "#6B7280" }); }

  score = Math.max(300, Math.min(850, score));
  let grade, gradeColor;
  if (score >= 800) { grade = "Excellent"; gradeColor = "#10B981"; }
  else if (score >= 740) { grade = "Very Good"; gradeColor = "#10B981"; }
  else if (score >= 670) { grade = "Good"; gradeColor = "#3B82F6"; }
  else if (score >= 580) { grade = "Fair"; gradeColor = "#F59E0B"; }
  else { grade = "Poor"; gradeColor = "#EF4444"; }

  return { score, grade, gradeColor, factors, utilization: Math.round(utilization) };
}

// GET /api/credit - Credit health report
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const [cardsRes, billsRes, accountsRes, incomeRes, historyRes] = await Promise.all([
      pool.query("SELECT balance, credit_limit FROM credit_cards WHERE user_id = $1", [userId]),
      pool.query("SELECT is_paid, amount FROM bills WHERE user_id = $1", [userId]),
      pool.query("SELECT id, account_type FROM bank_accounts WHERE user_id = $1", [userId]),
      pool.query("SELECT amount, frequency FROM income_sources WHERE user_id = $1 AND is_active = true", [userId]),
      pool.query("SELECT score, checked_at FROM credit_scores WHERE user_id = $1 ORDER BY checked_at DESC LIMIT 12", [userId]).catch(() => ({ rows: [] })),
    ]);

    const totalDebt = cardsRes.rows.reduce((s, c) => s + parseFloat(c.balance), 0);
    const totalLimit = cardsRes.rows.reduce((s, c) => s + parseFloat(c.credit_limit), 0);
    const totalBills = billsRes.rows.length;
    const paidBills = billsRes.rows.filter(b => b.is_paid).length;
    const monthlyBills = billsRes.rows.reduce((s, b) => s + parseFloat(b.amount), 0);
    const bankAccountCount = accountsRes.rows.filter(a => a.account_type !== 'credit').length;
    const accountCount = accountsRes.rows.length + cardsRes.rows.length;
    const monthlyIncome = incomeRes.rows.reduce((s, src) => {
      const amt = parseFloat(src.amount);
      switch (src.frequency) { case "weekly": return s + amt * 4.33; case "biweekly": return s + amt * 2.17; case "semimonthly": return s + amt * 2; case "yearly": return s + amt / 12; default: return s + amt; }
    }, 0);

    const health = estimateCreditHealth({ totalDebt, totalLimit, totalBills, paidBills, monthlyBills, monthlyIncome, accountCount });

    // Save score to history
    try { await pool.query("INSERT INTO credit_scores (user_id, score, grade) VALUES ($1, $2, $3)", [userId, health.score, health.grade]); } catch(e) {}

    // Get score history for trend
    const scoreHistory = historyRes.rows.map(r => ({ score: r.score, date: r.checked_at })).reverse();

    res.json({
      ...health,
      scoreHistory,
      summary: { totalDebt, totalLimit, totalBills, paidBills, monthlyIncome, monthlyBills, accountCount },
    });
  } catch (err) {
    console.error("Credit health error:", err.message);
    res.status(500).json({ error: "Failed to get credit health", detail: err.message });
  }
});

module.exports = router;
