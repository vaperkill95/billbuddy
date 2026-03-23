const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

// GET /api/activity - Unified activity feed across all accounts
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;
    const type = req.query.type || "all"; // all, in, out, pending

    let whereClause = "bt.user_id = $1 AND bt.date >= CURRENT_DATE - $2::integer";
    if (type === "in") whereClause += " AND bt.amount < 0";
    else if (type === "out") whereClause += " AND bt.amount > 0";
    else if (type === "pending") whereClause += " AND bt.pending = true";

    const { rows } = await pool.query(
      `SELECT bt.*, ba.name as account_name, ba.mask, ba.account_type, ba.account_subtype,
              pi.institution_name
       FROM bank_transactions bt
       LEFT JOIN bank_accounts ba ON bt.account_id = ba.account_id AND ba.user_id = bt.user_id
       LEFT JOIN plaid_items pi ON ba.plaid_item_id = pi.id
       WHERE ${whereClause}
       ORDER BY bt.date DESC, bt.id DESC
       LIMIT 500`,
      [userId, days]
    );

    // Also get bill payments
    const { rows: billPayments } = await pool.query(
      `SELECT id, bill_name as name, amount, paid_date as date, category, status,
              'bill_payment' as source_type
       FROM payment_history
       WHERE user_id = $1 AND paid_date >= CURRENT_DATE - $2::integer
       ORDER BY paid_date DESC`,
      [userId, days]
    );

    // Build unified activity
    const activity = rows.map(r => ({
      id: `txn-${r.id}`, type: "transaction",
      name: r.name, amount: parseFloat(r.amount),
      date: r.date.toISOString().split("T")[0],
      category: r.category, pending: r.pending,
      accountName: r.account_name || "Unknown", accountType: r.account_type,
      mask: r.mask, institution: r.institution_name,
      isIncome: parseFloat(r.amount) < 0,
    }));

    // Summary stats
    const totalIn = rows.filter(r => parseFloat(r.amount) < 0).reduce((s, r) => s + Math.abs(parseFloat(r.amount)), 0);
    const totalOut = rows.filter(r => parseFloat(r.amount) > 0 && !r.pending).reduce((s, r) => s + parseFloat(r.amount), 0);
    const pendingCount = rows.filter(r => r.pending).length;
    const pendingTotal = rows.filter(r => r.pending).reduce((s, r) => s + parseFloat(r.amount), 0);

    // Group by date
    const grouped = {};
    activity.forEach(a => {
      if (!grouped[a.date]) grouped[a.date] = [];
      grouped[a.date].push(a);
    });

    res.json({
      transactions: activity,
      grouped,
      summary: {
        totalIn: Math.round(totalIn * 100) / 100,
        totalOut: Math.round(totalOut * 100) / 100,
        net: Math.round((totalIn - totalOut) * 100) / 100,
        pendingCount,
        pendingTotal: Math.round(pendingTotal * 100) / 100,
        transactionCount: activity.length,
      },
      days,
    });
  } catch (err) {
    console.error("Activity error:", err);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

module.exports = router;
