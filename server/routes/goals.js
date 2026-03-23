const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

// GET /api/goals - Get all financial goals
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM financial_goals WHERE user_id = $1 ORDER BY created_at DESC", [req.user.id]
    );

    // Calculate projections for each goal
    const goals = rows.map(g => {
      const target = parseFloat(g.target_amount);
      const current = parseFloat(g.current_amount);
      const monthly = parseFloat(g.monthly_contribution || 0);
      const remaining = target - current;
      const pct = target > 0 ? (current / target) * 100 : 0;

      let projectedDate = null;
      let monthsToGo = null;
      if (monthly > 0 && remaining > 0) {
        monthsToGo = Math.ceil(remaining / monthly);
        const d = new Date();
        d.setMonth(d.getMonth() + monthsToGo);
        projectedDate = d.toISOString().split("T")[0];
      }

      return {
        id: g.id, name: g.name, type: g.goal_type, icon: g.icon || "🎯",
        targetAmount: target, currentAmount: current,
        monthlyContribution: monthly,
        targetDate: g.target_date, projectedDate, monthsToGo,
        pct: Math.round(pct * 10) / 10,
        remaining: Math.round(remaining * 100) / 100,
        status: pct >= 100 ? "completed" : g.target_date && new Date(g.target_date) < new Date() ? "overdue" : "active",
        createdAt: g.created_at,
      };
    });

    res.json(goals);
  } catch (err) {
    console.error("Goals get error:", err.message);
    res.status(500).json({ error: "Failed to get goals" });
  }
});

// POST /api/goals - Create a financial goal
router.post("/", async (req, res) => {
  try {
    const { name, goalType, icon, targetAmount, currentAmount, monthlyContribution, targetDate } = req.body;
    if (!name || !targetAmount) return res.status(400).json({ error: "Name and target amount required" });

    const { rows } = await pool.query(
      `INSERT INTO financial_goals (user_id, name, goal_type, icon, target_amount, current_amount, monthly_contribution, target_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.id, name, goalType || "savings", icon || "🎯", targetAmount, currentAmount || 0, monthlyContribution || 0, targetDate || null]
    );
    res.json({ id: rows[0].id, name: rows[0].name });
  } catch (err) {
    console.error("Goal create error:", err.message);
    res.status(500).json({ error: "Failed to create goal" });
  }
});

// PATCH /api/goals/:id - Update a goal
router.patch("/:id", async (req, res) => {
  try {
    const { currentAmount, monthlyContribution, targetDate, name, targetAmount, icon } = req.body;
    const fields = [];
    const values = [];
    let i = 1;
    if (currentAmount !== undefined) { fields.push(`current_amount=$${i++}`); values.push(currentAmount); }
    if (monthlyContribution !== undefined) { fields.push(`monthly_contribution=$${i++}`); values.push(monthlyContribution); }
    if (targetDate !== undefined) { fields.push(`target_date=$${i++}`); values.push(targetDate); }
    if (name !== undefined) { fields.push(`name=$${i++}`); values.push(name); }
    if (targetAmount !== undefined) { fields.push(`target_amount=$${i++}`); values.push(targetAmount); }
    if (icon !== undefined) { fields.push(`icon=$${i++}`); values.push(icon); }
    if (!fields.length) return res.status(400).json({ error: "Nothing to update" });

    fields.push(`updated_at=NOW()`);
    values.push(req.user.id, req.params.id);
    await pool.query(`UPDATE financial_goals SET ${fields.join(",")} WHERE user_id=$${i++} AND id=$${i}`, values);
    res.json({ success: true });
  } catch (err) {
    console.error("Goal update error:", err.message);
    res.status(500).json({ error: "Failed to update goal" });
  }
});

// POST /api/goals/:id/contribute - Add money to a goal
router.post("/:id/contribute", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "Amount required" });
    const { rows } = await pool.query(
      "UPDATE financial_goals SET current_amount = current_amount + $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING current_amount, target_amount",
      [amount, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Goal not found" });
    res.json({ currentAmount: parseFloat(rows[0].current_amount), targetAmount: parseFloat(rows[0].target_amount) });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// DELETE /api/goals/:id
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM financial_goals WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

module.exports = router;
