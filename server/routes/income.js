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

// ─── Cleanup duplicate income entries ───

router.post("/cleanup-duplicates", async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM income_entries WHERE id NOT IN (
        SELECT MIN(id) FROM income_entries WHERE user_id = $1 GROUP BY amount, received_date, source_name
      ) AND user_id = $1`,
      [req.user.id]
    );
    res.json({ removed: result.rowCount });
  } catch (err) {
    console.error("POST /income/cleanup-duplicates error:", err);
    res.status(500).json({ error: "Failed to cleanup" });
  }
});

// ─── Detect Income from Bank Transactions ───

router.get("/detect", async (req, res) => {
  try {
    // Get all deposits (negative amounts in Plaid = money in) from last 90 days, bank accounts only
    const { rows: deposits } = await pool.query(
      `SELECT bt.name, bt.amount, bt.date, bt.account_id, ba.name as account_name, ba.account_type
       FROM bank_transactions bt
       JOIN bank_accounts ba ON bt.account_id = ba.account_id AND bt.user_id = ba.user_id
       WHERE bt.user_id = $1 AND bt.amount < 0 AND bt.pending = false
       AND ba.account_type != 'credit'
       AND bt.date >= CURRENT_DATE - 90
       ORDER BY bt.date DESC`,
      [req.user.id]
    );

    // Get existing income sources so we can mark what's already tracked
    const { rows: existingSources } = await pool.query(
      "SELECT name, amount FROM income_sources WHERE user_id = $1", [req.user.id]
    );
    const existingNames = existingSources.map(s => s.name.toLowerCase());

    // Group deposits by normalized name to find patterns
    const normalize = (str) => str.replace(/[^a-zA-Z\s]/g, "").replace(/\s+/g, " ").trim();
    const groups = {};

    for (const dep of deposits) {
      const key = normalize(dep.name).toLowerCase();
      if (!key || key.length < 3) continue;
      if (!groups[key]) {
        groups[key] = { name: dep.name, deposits: [], totalAmount: 0 };
      }
      const amt = Math.abs(parseFloat(dep.amount));
      groups[key].deposits.push({ amount: amt, date: dep.date, account: dep.account_name });
      groups[key].totalAmount += amt;
    }

    // Analyze each group
    const detected = [];
    for (const [key, group] of Object.entries(groups)) {
      const deps = group.deposits;
      if (deps.length === 0) continue;

      const avgAmount = group.totalAmount / deps.length;
      const amounts = deps.map(d => d.amount);
      const minAmt = Math.min(...amounts);
      const maxAmt = Math.max(...amounts);
      const amountVariance = maxAmt > 0 ? (maxAmt - minAmt) / maxAmt : 0;

      // Determine frequency by looking at gaps between deposits
      let frequency = "monthly";
      if (deps.length >= 2) {
        const dates = deps.map(d => new Date(d.date)).sort((a, b) => a - b);
        const gaps = [];
        for (let i = 1; i < dates.length; i++) {
          gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
        }
        const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
        if (avgGap <= 10) frequency = "weekly";
        else if (avgGap <= 18) frequency = "biweekly";
        else if (avgGap <= 35) frequency = "monthly";
        else frequency = "monthly";
      }

      // Check if already tracked
      const alreadyTracked = existingNames.some(en =>
        key.includes(en) || en.includes(key) ||
        existingSources.some(s => Math.abs(parseFloat(s.amount) - avgAmount) / avgAmount < 0.15 && key.includes(s.name.toLowerCase().substring(0, 5)))
      );

      // Only include meaningful deposits (over $50 avg or recurring)
      if (avgAmount >= 50 || deps.length >= 2) {
        detected.push({
          name: group.name,
          avgAmount: Math.round(avgAmount * 100) / 100,
          lastAmount: amounts[0],
          frequency,
          occurrences: deps.length,
          lastDate: deps[0].date,
          account: deps[0].account,
          amountVaries: amountVariance > 0.1,
          alreadyTracked,
          isLikelyPayroll: /payroll|direct dep|paycheck|salary|wages|paychex|adp|gusto|workday/i.test(group.name),
        });
      }
    }

    // Sort: payroll first, then by occurrences, then amount
    detected.sort((a, b) => {
      if (a.isLikelyPayroll !== b.isLikelyPayroll) return b.isLikelyPayroll ? 1 : -1;
      if (a.alreadyTracked !== b.alreadyTracked) return a.alreadyTracked ? 1 : -1;
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      return b.avgAmount - a.avgAmount;
    });

    res.json({ detected, depositCount: deposits.length });
  } catch (err) {
    console.error("GET /income/detect error:", err);
    res.status(500).json({ error: "Failed to detect income" });
  }
});

module.exports = router;
