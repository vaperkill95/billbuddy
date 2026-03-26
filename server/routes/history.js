const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const { month } = req.query;
    let q = "SELECT * FROM payment_history WHERE user_id=$1 ORDER BY paid_date DESC, id DESC";
    let v = [req.user.id];
    if (month && month !== "all") { q = "SELECT * FROM payment_history WHERE user_id=$1 AND month_label=$2 ORDER BY paid_date DESC, id DESC"; v.push(month); }
    const { rows } = await pool.query(q, v);
    res.json(rows.map(r => ({ id: r.id, billName: r.bill_name, amount: parseFloat(r.amount), category: r.category, paidDate: r.paid_date.toISOString().split("T")[0], month: r.month_label, status: r.status })));
  } catch (err) { console.error("GET /history error:", err); res.status(500).json({ error: "Failed to fetch history" }); }
});

router.post("/", async (req, res) => {
  try {
    const { billName, amount, category, dueDate } = req.body;
    if (!billName || !amount || !category) return res.status(400).json({ error: "billName, amount, and category are required" });
    const today = new Date();
    const paidDate = today.toISOString().split("T")[0];
    const monthLabel = `${FULL_MONTHS[today.getMonth()]} ${today.getFullYear()}`;
    const status = dueDate && today.getDate() > (dueDate + 3) ? "late" : "on-time";
    const { rows } = await pool.query(
      `INSERT INTO payment_history (user_id, bill_name, amount, category, paid_date, month_label, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.id, billName, amount, category, paidDate, monthLabel, status]
    );
    const r = rows[0];
    res.status(201).json({ id: r.id, billName: r.bill_name, amount: parseFloat(r.amount), category: r.category, paidDate: r.paid_date.toISOString().split("T")[0], month: r.month_label, status: r.status });
  } catch (err) { console.error("POST /history error:", err); res.status(500).json({ error: "Failed to record payment" }); }
});

router.get("/months", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT DISTINCT month_label FROM payment_history WHERE user_id=$1 ORDER BY month_label DESC", [req.user.id]);
    res.json(rows.map(r => r.month_label));
  } catch (err) { res.status(500).json({ error: "Failed to fetch months" }); }
});

router.get("/stats", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*) as total, COALESCE(SUM(amount),0) as paid,
      COUNT(*) FILTER (WHERE status='late') as late_count
      FROM payment_history WHERE user_id=$1`, [req.user.id]);
    const s = rows[0];
    res.json({ totalPayments: parseInt(s.total), totalPaid: parseFloat(s.paid), lateCount: parseInt(s.late_count) });
  } catch (err) { res.status(500).json({ error: "Failed to fetch stats" }); }
});

module.exports = router;
