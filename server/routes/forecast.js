const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

// GET /api/forecast - 30-day balance forecast
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // Get current bank balance
    const { rows: accts } = await pool.query(
      "SELECT COALESCE(SUM(balance_available), 0) as available, COALESCE(SUM(balance_current), 0) as current FROM bank_accounts WHERE user_id = $1",
      [userId]
    );
    const startBalance = parseFloat(accts[0].available) || parseFloat(accts[0].current) || 0;

    // Get unpaid bills
    const { rows: bills } = await pool.query(
      "SELECT * FROM bills WHERE user_id = $1 AND is_paid = false ORDER BY due_date ASC", [userId]
    );

    // Get credit card minimums
    const { rows: cards } = await pool.query(
      "SELECT * FROM credit_cards WHERE user_id = $1 AND balance > 0", [userId]
    );

    // Get income sources
    const { rows: sources } = await pool.query(
      "SELECT * FROM income_sources WHERE user_id = $1 AND is_active = true", [userId]
    );

    // Build 30-day forecast
    const days = [];
    let runningBalance = startBalance;
    const currentDay = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    for (let i = 0; i < 30; i++) {
      const date = new Date(currentYear, currentMonth, currentDay + i);
      const dayOfMonth = date.getDate();
      const dayLabel = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const isToday = i === 0;
      const events = [];

      // Check bills due this day
      for (const bill of bills) {
        if (bill.due_date === dayOfMonth && (i > 0 || bill.due_date >= currentDay)) {
          const amt = parseFloat(bill.amount);
          runningBalance -= amt;
          events.push({ type: "bill", name: bill.name, amount: -amt, category: bill.category });
        }
      }

      // Check credit card payments due
      for (const card of cards) {
        if (card.due_date === dayOfMonth && (i > 0 || card.due_date >= currentDay)) {
          const amt = parseFloat(card.min_payment);
          runningBalance -= amt;
          events.push({ type: "card", name: `${card.name} min payment`, amount: -amt });
        }
      }

      // Check income deposits
      for (const src of sources) {
        const amt = parseFloat(src.amount);
        let isPayDay = false;

        if (src.frequency === "monthly" && src.next_pay_date) {
          const npd = new Date(src.next_pay_date);
          if (npd.getDate() === dayOfMonth) isPayDay = true;
        } else if (src.frequency === "biweekly" && src.next_pay_date) {
          const npd = new Date(src.next_pay_date);
          const diffDays = Math.round((date - npd) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays % 14 === 0) isPayDay = true;
        } else if (src.frequency === "weekly" && src.next_pay_date) {
          const npd = new Date(src.next_pay_date);
          const diffDays = Math.round((date - npd) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays % 7 === 0) isPayDay = true;
        } else if (src.frequency === "semimonthly") {
          if (dayOfMonth === 1 || dayOfMonth === 15) isPayDay = true;
        } else if (src.frequency === "monthly" && !src.next_pay_date) {
          if (dayOfMonth === 1) isPayDay = true;
        }

        if (isPayDay) {
          runningBalance += amt;
          events.push({ type: "income", name: src.name, amount: amt });
        }
      }

      days.push({
        date: date.toISOString().split("T")[0],
        label: dayLabel,
        dayOfMonth,
        balance: Math.round(runningBalance * 100) / 100,
        events,
        isToday,
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      });
    }

    // Find lowest point
    const lowestDay = days.reduce((min, d) => d.balance < min.balance ? d : min, days[0]);

    res.json({
      startBalance,
      days,
      lowestBalance: lowestDay.balance,
      lowestDate: lowestDay.label,
      endBalance: days[days.length - 1].balance,
    });
  } catch (err) {
    console.error("Forecast error:", err);
    res.status(500).json({ error: "Failed to generate forecast" });
  }
});

module.exports = router;
