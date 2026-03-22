const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM bills WHERE user_id = $1 ORDER BY due_date ASC", [req.user.id]);
    res.json(rows.map(r => ({ id: r.id, name: r.name, amount: parseFloat(r.amount), dueDate: r.due_date, category: r.category, isPaid: r.is_paid, isRecurring: r.is_recurring, reminder: r.reminder })));
  } catch (err) { console.error("GET /bills error:", err); res.status(500).json({ error: "Failed to fetch bills" }); }
});

router.post("/", async (req, res) => {
  try {
    const { name, amount, dueDate, category, isRecurring, reminder } = req.body;
    if (!name || !amount || !dueDate) return res.status(400).json({ error: "name, amount, and dueDate are required" });
    const { rows } = await pool.query(
      `INSERT INTO bills (user_id, name, amount, due_date, category, is_recurring, reminder) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.id, name, amount, dueDate, category || "Other", isRecurring ?? true, reminder || "none"]
    );
    const r = rows[0];
    res.status(201).json({ id: r.id, name: r.name, amount: parseFloat(r.amount), dueDate: r.due_date, category: r.category, isPaid: r.is_paid, isRecurring: r.is_recurring, reminder: r.reminder });
  } catch (err) { console.error("POST /bills error:", err); res.status(500).json({ error: "Failed to create bill" }); }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const u = req.body;
    const f = [], v = [];
    let i = 1;
    if (u.name !== undefined) { f.push(`name=$${i++}`); v.push(u.name); }
    if (u.amount !== undefined) { f.push(`amount=$${i++}`); v.push(u.amount); }
    if (u.dueDate !== undefined) { f.push(`due_date=$${i++}`); v.push(u.dueDate); }
    if (u.category !== undefined) { f.push(`category=$${i++}`); v.push(u.category); }
    if (u.isPaid !== undefined) { f.push(`is_paid=$${i++}`); v.push(u.isPaid); }
    if (u.isRecurring !== undefined) { f.push(`is_recurring=$${i++}`); v.push(u.isRecurring); }
    if (u.reminder !== undefined) { f.push(`reminder=$${i++}`); v.push(u.reminder); }
    if (!f.length) return res.status(400).json({ error: "No fields to update" });
    f.push(`updated_at=NOW()`);
    v.push(req.user.id, id);
    const { rows } = await pool.query(`UPDATE bills SET ${f.join(",")} WHERE user_id=$${i} AND id=$${i+1} RETURNING *`, v);
    if (!rows.length) return res.status(404).json({ error: "Bill not found" });
    const r = rows[0];
    res.json({ id: r.id, name: r.name, amount: parseFloat(r.amount), dueDate: r.due_date, category: r.category, isPaid: r.is_paid, isRecurring: r.is_recurring, reminder: r.reminder });
  } catch (err) { console.error("PATCH error:", err); res.status(500).json({ error: "Failed to update bill" }); }
});

router.delete("/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM bills WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: "Bill not found" });
    res.json({ success: true });
  } catch (err) { console.error("DELETE error:", err); res.status(500).json({ error: "Failed to delete bill" }); }
});

router.post("/reset-month", async (req, res) => {
  try {
    await pool.query("UPDATE bills SET is_paid=false, updated_at=NOW() WHERE user_id=$1", [req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to reset" }); }
});

module.exports = router;
