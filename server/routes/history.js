const express = require("express");
const router = express.Router();
const pool = require("../db/pool");

const FULL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// GET all payment history
router.get("/", async (req, res) => {
  try {
    const { month } = req.query;
    let query = "SELECT * FROM payment_history ORDER BY paid_date DESC, id DESC";
    let values = [];

    if (month && month !== "all") {
      query = "SELECT * FROM payment_history WHERE month_label = $1 ORDER BY paid_date DESC, id DESC";
      values = [month];
    }

    const { rows } = await pool.query(query, values);
    const history = rows.map((r) => ({
      id: r.id,
      billName: r.bill_name,
      amount: parseFloat(r.amount),
      category: r.category,
      paidDate: r.paid_date.toISOString().split("T")[0],
      month: r.month_label,
      status: r.status,
    }));
    res.json(history);
  } catch (err) {
    console.error("GET /history error:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// POST record a payment
router.post("/", async (req, res) => {
  try {
    const { billName, amount, category, dueDate } = req.body;
    if (!billName || !amount || !category) {
      return res.status(400).json({ error: "billName, amount, and category are required" });
    }

    const today = new Date();
    const paidDate = today.toISOString().split("T")[0];
    const monthLabel = `${FULL_MONTHS[today.getMonth()]} ${today.getFullYear()}`;
    const isLate = dueDate && today.getDate() > dueDate;
    const status = isLate ? "late" : "on-time";

    const { rows } = await pool.query(
      `INSERT INTO payment_history (bill_name, amount, category, paid_date, month_label, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [billName, amount, category, paidDate, monthLabel, status]
    );

    const r = rows[0];
    res.status(201).json({
      id: r.id,
      billName: r.bill_name,
      amount: parseFloat(r.amount),
      category: r.category,
      paidDate: r.paid_date.toISOString().split("T")[0],
      month: r.month_label,
      status: r.status,
    });
  } catch (err) {
    console.error("POST /history error:", err);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

// GET distinct months for filtering
router.get("/months", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT month_label FROM payment_history ORDER BY month_label DESC"
    );
    res.json(rows.map((r) => r.month_label));
  } catch (err) {
    console.error("GET /history/months error:", err);
    res.status(500).json({ error: "Failed to fetch months" });
  }
});

// GET summary stats
router.get("/stats", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total_payments,
        COALESCE(SUM(amount), 0) as total_paid,
        COUNT(*) FILTER (WHERE status = 'late') as late_count,
        COUNT(*) FILTER (WHERE status = 'on-time') as ontime_count
      FROM payment_history
    `);
    const stats = rows[0];
    res.json({
      totalPayments: parseInt(stats.total_payments),
      totalPaid: parseFloat(stats.total_paid),
      lateCount: parseInt(stats.late_count),
      onTimeCount: parseInt(stats.ontime_count),
    });
  } catch (err) {
    console.error("GET /history/stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

module.exports = router;
