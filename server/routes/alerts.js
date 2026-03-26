const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

// GET /api/alerts - Smart spending alerts
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const alerts = [];

    // Get this month's transactions by category
    const { rows: thisMonth } = await pool.query(
      `SELECT category, SUM(amount) as total, COUNT(*) as count FROM bank_transactions
       WHERE user_id = $1 AND amount > 0 AND pending = false AND date >= date_trunc('month', CURRENT_DATE)
       GROUP BY category ORDER BY total DESC`,
      [userId]
    );

    // Get last month's transactions by category
    const { rows: lastMonth } = await pool.query(
      `SELECT category, SUM(amount) as total, COUNT(*) as count FROM bank_transactions
       WHERE user_id = $1 AND amount > 0 AND pending = false
       AND date >= date_trunc('month', CURRENT_DATE) - interval '1 month'
       AND date < date_trunc('month', CURRENT_DATE)
       GROUP BY category ORDER BY total DESC`,
      [userId]
    );

    const lastMonthMap = {};
    lastMonth.forEach(r => { lastMonthMap[r.category] = { total: parseFloat(r.total), count: parseInt(r.count) }; });

    // Compare categories month over month
    for (const cat of thisMonth) {
      const thisTotal = parseFloat(cat.total);
      const last = lastMonthMap[cat.category];

      if (last && last.total > 0) {
        const diff = thisTotal - last.total;
        const pctChange = (diff / last.total) * 100;

        if (pctChange > 30 && diff > 20) {
          alerts.push({
            type: "spending_increase",
            icon: "📈",
            title: `${cat.category} spending up ${Math.round(pctChange)}%`,
            desc: `You've spent $${thisTotal.toFixed(2)} on ${cat.category} this month vs $${last.total.toFixed(2)} last month — that's $${diff.toFixed(2)} more.`,
            severity: pctChange > 100 ? "high" : "medium",
            category: cat.category,
            amount: diff,
          });
        } else if (pctChange < -30 && Math.abs(diff) > 20) {
          alerts.push({
            type: "spending_decrease",
            icon: "📉",
            title: `${cat.category} spending down ${Math.abs(Math.round(pctChange))}%`,
            desc: `Nice! You spent $${thisTotal.toFixed(2)} on ${cat.category} this month vs $${last.total.toFixed(2)} last month — saving $${Math.abs(diff).toFixed(2)}.`,
            severity: "positive",
            category: cat.category,
            amount: diff,
          });
        }
      }
    }

    // Check for large individual transactions
    const { rows: largeTxns } = await pool.query(
      `SELECT * FROM bank_transactions WHERE user_id = $1 AND amount > 100 AND pending = false
       AND date >= CURRENT_DATE - 7 ORDER BY amount DESC LIMIT 5`,
      [userId]
    );
    for (const txn of largeTxns) {
      alerts.push({
        type: "large_transaction",
        icon: "💸",
        title: `Large charge: $${parseFloat(txn.amount).toFixed(2)}`,
        desc: `${txn.name} on ${txn.date.toISOString().split("T")[0]}`,
        severity: parseFloat(txn.amount) > 500 ? "high" : "low",
      });
    }

    // Check for recurring charges that seem new
    const { rows: recentRecurring } = await pool.query(
      `SELECT name, COUNT(*) as occurrences, AVG(amount) as avg_amount FROM bank_transactions
       WHERE user_id = $1 AND amount > 0 AND pending = false AND date >= CURRENT_DATE - 60
       GROUP BY name HAVING COUNT(*) >= 2 ORDER BY avg_amount DESC LIMIT 10`,
      [userId]
    );
    // Check which ones don't match existing bills
    const { rows: bills } = await pool.query("SELECT name FROM bills WHERE user_id = $1", [userId]);
    const billNames = bills.map(b => b.name.toLowerCase());
    const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");

    for (const rec of recentRecurring) {
      const recName = normalize(rec.name);
      const matchesBill = billNames.some(bn => recName.includes(normalize(bn)) || normalize(bn).includes(recName));
      if (!matchesBill && parseFloat(rec.avg_amount) > 5) {
        alerts.push({
          type: "untracked_recurring",
          icon: "🔄",
          title: `Possible untracked bill: ${rec.name}`,
          desc: `This charge of ~$${parseFloat(rec.avg_amount).toFixed(2)} appears ${rec.occurrences} times recently but isn't in your bills. Want to add it?`,
          severity: "medium",
          suggestedBill: { name: rec.name, amount: parseFloat(rec.avg_amount) },
        });
      }
    }

    // Low balance warning
    const { rows: balRows } = await pool.query(
      "SELECT COALESCE(SUM(balance_available), 0) as total FROM bank_accounts WHERE user_id = $1 AND account_type != 'credit'", [userId]
    );
    const totalAvailable = parseFloat(balRows[0].total);
    const { rows: upcomingBills } = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM bills
       WHERE user_id = $1 AND is_paid = false AND due_date BETWEEN EXTRACT(DAY FROM CURRENT_DATE) AND EXTRACT(DAY FROM CURRENT_DATE) + 7`,
      [userId]
    );
    const upcomingTotal = parseFloat(upcomingBills[0].total);

    if (totalAvailable > 0 && upcomingTotal > totalAvailable * 0.8) {
      alerts.push({
        type: "low_balance_warning",
        icon: "⚠️",
        title: "Bills may exceed your balance",
        desc: `You have $${totalAvailable.toFixed(2)} available but $${upcomingTotal.toFixed(2)} in bills due this week. Make sure you have enough to cover them.`,
        severity: "high",
      });
    }

    // Bill due reminders — bills due in next 3 days or overdue
    const dayOfMonth = new Date().getDate();
    const { rows: allBills } = await pool.query(
      "SELECT * FROM bills WHERE user_id = $1 AND is_paid = false ORDER BY due_date ASC", [userId]
    );
    for (const bill of allBills) {
      const dueDay = bill.due_date;
      const daysUntil = dueDay - dayOfMonth;
      if (daysUntil >= 0 && daysUntil <= 3) {
        alerts.push({
          type: "bill_due_soon",
          icon: "📅",
          title: daysUntil === 0 ? `${bill.name} is due TODAY` : `${bill.name} due in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`,
          desc: `$${parseFloat(bill.amount).toFixed(2)} · ${bill.category}${daysUntil === 0 ? " — don't forget to pay!" : ""}`,
          severity: daysUntil === 0 ? "high" : "medium",
          billId: bill.id,
        });
      } else if (daysUntil < 0 && daysUntil >= -5) {
        alerts.push({
          type: "bill_overdue",
          icon: "🚨",
          title: `${bill.name} is ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? "s" : ""} overdue`,
          desc: `$${parseFloat(bill.amount).toFixed(2)} · ${bill.category} — pay now to avoid late fees`,
          severity: "high",
          billId: bill.id,
        });
      }
    }

    // Sort: high severity first
    const severityOrder = { high: 0, medium: 1, low: 2, positive: 3 };
    alerts.sort((a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2));

    res.json({ alerts, alertCount: alerts.length });
  } catch (err) {
    console.error("Smart alerts error:", err);
    res.status(500).json({ error: "Failed to generate alerts", alerts: [] });
  }
});

module.exports = router;
