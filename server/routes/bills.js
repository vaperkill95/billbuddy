const express = require("express");
const router = express.Router();
const pool = require("../db/pool");

// GET all bills
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM bills ORDER BY due_date ASC"
    );
    const bills = rows.map((r) => ({
      id: r.id,
      name: r.name,
      amount: parseFloat(r.amount),
      dueDate: r.due_date,
      category: r.category,
      isPaid: r.is_paid,
      isRecurring: r.is_recurring,
      reminder: r.reminder,
      createdAt: r.created_at,
    }));
    res.json(bills);
  } catch (err) {
    console.error("GET /bills error:", err);
    res.status(500).json({ error: "Failed to fetch bills" });
  }
});

// POST create a new bill
router.post("/", async (req, res) => {
  try {
    const { name, amount, dueDate, category, isRecurring, reminder } = req.body;
    if (!name || !amount || !dueDate) {
      return res.status(400).json({ error: "name, amount, and dueDate are required" });
    }
    const { rows } = await pool.query(
      `INSERT INTO bills (name, amount, due_date, category, is_recurring, reminder)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, amount, dueDate, category || "Other", isRecurring ?? true, reminder || "none"]
    );
    const r = rows[0];
    res.status(201).json({
      id: r.id,
      name: r.name,
      amount: parseFloat(r.amount),
      dueDate: r.due_date,
      category: r.category,
      isPaid: r.is_paid,
      isRecurring: r.is_recurring,
      reminder: r.reminder,
    });
  } catch (err) {
    console.error("POST /bills error:", err);
    res.status(500).json({ error: "Failed to create bill" });
  }
});

// PATCH update a bill (toggle paid, update reminder, etc.)
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    if (updates.name !== undefined) { fields.push(`name = $${idx++}`); values.push(updates.name); }
    if (updates.amount !== undefined) { fields.push(`amount = $${idx++}`); values.push(updates.amount); }
    if (updates.dueDate !== undefined) { fields.push(`due_date = $${idx++}`); values.push(updates.dueDate); }
    if (updates.category !== undefined) { fields.push(`category = $${idx++}`); values.push(updates.category); }
    if (updates.isPaid !== undefined) { fields.push(`is_paid = $${idx++}`); values.push(updates.isPaid); }
    if (updates.isRecurring !== undefined) { fields.push(`is_recurring = $${idx++}`); values.push(updates.isRecurring); }
    if (updates.reminder !== undefined) { fields.push(`reminder = $${idx++}`); values.push(updates.reminder); }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE bills SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Bill not found" });
    }

    const r = rows[0];
    res.json({
      id: r.id,
      name: r.name,
      amount: parseFloat(r.amount),
      dueDate: r.due_date,
      category: r.category,
      isPaid: r.is_paid,
      isRecurring: r.is_recurring,
      reminder: r.reminder,
    });
  } catch (err) {
    console.error(`PATCH /bills/${req.params.id} error:`, err);
    res.status(500).json({ error: "Failed to update bill" });
  }
});

// DELETE a bill
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query("DELETE FROM bills WHERE id = $1", [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: "Bill not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(`DELETE /bills/${req.params.id} error:`, err);
    res.status(500).json({ error: "Failed to delete bill" });
  }
});

// POST reset bills for new month (mark all as unpaid)
router.post("/reset-month", async (req, res) => {
  try {
    await pool.query("UPDATE bills SET is_paid = false, updated_at = NOW()");
    res.json({ success: true, message: "All bills reset for new month" });
  } catch (err) {
    console.error("POST /bills/reset-month error:", err);
    res.status(500).json({ error: "Failed to reset bills" });
  }
});

module.exports = router;
