const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

router.use(authMiddleware);

// ─── Income Sources (recurring) ───

router.get("/sources", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM income_sources WHERE user_id=$1 ORDER BY amount DESC", [req.user.id]);
    res.json(rows.map(r => ({
      id: r.id, name: r.name, amount: parseFloat(r.amount),
      frequency: r.frequency, nextPayDate: r.next_pay_date,
      isActive: r.is_active,
    })));
  } catch (err) { res.status(500).json({ error: "Failed to fetch income sources" }); }
});

router.post("/sources", async (req, res) => {
  try {
    const { name, amount, frequency, nextPayDate } = req.body;
    if (!name || !amount) return res.status(400).json({ error: "name and amount are required" });
    const { rows } = await pool.query(
      `INSERT INTO income_sources (user_id, name, amount, frequency, next_pay_date)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, name, amount, frequency || "monthly", nextPayDate || null]
    );
    const r = rows[0];
    res.status(201).json({ id: r.id, name: r.name, amount: parseFloat(r.amount), frequency: r.frequency, nextPayDate: r.next_pay_date, isActive: r.is_active });
  } catch (err) { res.status(500).json({ error: "Failed to create income source" }); }
});

router.patch("/sources/:id", async (req, res) => {
  try {
    const u = req.body;
    const f = [], v = [];
    let i = 1;
    if (u.name !== undefined) { f.push(`name=$${i++}`); v.push(u.name); }
    if (u.amount !== undefined) { f.push(`amount=$${i++}`); v.push(u.amount); }
    if (u.frequency !== undefined) { f.push(`frequency=$${i++}`); v.push(u.frequency); }
    if (u.nextPayDate !== undefined) { f.push(`next_pay_date=$${i++}`); v.push(u.nextPayDate || null); }
    if (u.isActive !== undefined) { f.push(`is_active=$${i++}`); v.push(u.isActive); }
    if (!f.length) return res.status(400).json({ error: "No fields" });
    f.push(`updated_at=NOW()`);
    v.push(req.user.id, req.params.id);
    const { rows } = await pool.query(`UPDATE income_sources SET ${f.join(",")} WHERE user_id=$${i} AND id=$${i+1} RETURNING *`, v);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const r = rows[0];
    res.json({ id: r.id, name: r.name, amount: parseFloat(r.amount), frequency: r.frequency, nextPayDate: r.next_pay_date, isActive: r.is_active });
  } catch (err) { res.status(500).json({ error: "Failed to update" }); }
});

router.delete("/sources/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM income_sources WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to delete" }); }
});

// ─── Income Entries (actual received) ───

router.get("/entries", async (req, res) => {
  try {
    const { month } = req.query;
    let q = "SELECT * FROM income_entries WHERE user_id=$1 ORDER BY received_date DESC LIMIT 50";
    let v = [req.user.id];
    if (month && month !== "all") { q = "SELECT * FROM income_entries WHERE user_id=$1 AND month_label=$2 ORDER BY received_date DESC"; v.push(month); }
    const { rows } = await pool.query(q, v);
    res.json(rows.map(r => ({
      id: r.id, sourceId: r.source_id, sourceName: r.source_name,
      amount: parseFloat(r.amount), receivedDate: r.received_date.toISOString().split("T")[0],
      month: r.month_label,
    })));
  } catch (err) { res.status(500).json({ error: "Failed to fetch entries" }); }
});

router.post("/entries", async (req, res) => {
  try {
    const { sourceId, sourceName, amount, receivedDate } = req.body;
    if (!sourceName || !amount) return res.status(400).json({ error: "sourceName and amount required" });
    const date = receivedDate ? new Date(receivedDate) : new Date();
    const paidDate = date.toISOString().split("T")[0];
    const monthLabel = `${FULL_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    const { rows } = await pool.query(
      `INSERT INTO income_entries (user_id, source_id, source_name, amount, received_date, month_label)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, sourceId || null, sourceName, amount, paidDate, monthLabel]
    );
    const r = rows[0];
    res.status(201).json({ id: r.id, sourceId: r.source_id, sourceName: r.source_name, amount: parseFloat(r.amount), receivedDate: r.received_date.toISOString().split("T")[0], month: r.month_label });
  } catch (err) { res.status(500).json({ error: "Failed to record entry" }); }
});

router.delete("/entries/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM income_entries WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to delete" }); }
});

// ─── Summary / Overview ───

router.get("/summary", async (req, res) => {
  try {
    // Get active income sources
    const { rows: sources } = await pool.query(
      "SELECT * FROM income_sources WHERE user_id=$1 AND is_active=true", [req.user.id]
    );

    // Calculate monthly income from all frequencies
    let estimatedMonthly = 0;
    sources.forEach(s => {
      const amt = parseFloat(s.amount);
      switch (s.frequency) {
        case "weekly": estimatedMonthly += amt * 4.33; break;
        case "biweekly": estimatedMonthly += amt * 2.17; break;
        case "semimonthly": estimatedMonthly += amt * 2; break;
        case "monthly": estimatedMonthly += amt; break;
        case "yearly": estimatedMonthly += amt / 12; break;
        default: estimatedMonthly += amt;
      }
    });

    // Get this month's actual income
    const now = new Date();
    const thisMonth = `${FULL_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    const { rows: monthEntries } = await pool.query(
      "SELECT COALESCE(SUM(amount),0) as total FROM income_entries WHERE user_id=$1 AND month_label=$2",
      [req.user.id, thisMonth]
    );
    const actualThisMonth = parseFloat(monthEntries[0].total);

    // Get this month's bills total
    const { rows: billsTotal } = await pool.query(
      "SELECT COALESCE(SUM(amount),0) as total FROM bills WHERE user_id=$1",
      [req.user.id]
    );
    const monthlyBills = parseFloat(billsTotal[0].total);

    // Get this month's card minimum payments
    const { rows: cardMins } = await pool.query(
      "SELECT COALESCE(SUM(min_payment),0) as total FROM credit_cards WHERE user_id=$1",
      [req.user.id]
    );
    const monthlyCardMins = parseFloat(cardMins[0].total);

    const totalExpenses = monthlyBills + monthlyCardMins;
    const leftover = estimatedMonthly - totalExpenses;

    // Get distinct months for entries
    const { rows: monthRows } = await pool.query(
      "SELECT DISTINCT month_label FROM income_entries WHERE user_id=$1 ORDER BY month_label DESC",
      [req.user.id]
    );

    res.json({
      estimatedMonthly: Math.round(estimatedMonthly * 100) / 100,
      actualThisMonth,
      monthlyBills,
      monthlyCardMins,
      totalExpenses,
      leftover: Math.round(leftover * 100) / 100,
      sourceCount: sources.length,
      thisMonth,
      months: monthRows.map(r => r.month_label),
    });
  } catch (err) { console.error("GET /income/summary error:", err); res.status(500).json({ error: "Failed to get summary" }); }
});

module.exports = router;
