const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

router.use(authMiddleware);

// GET all credit cards
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM credit_cards WHERE user_id = $1 ORDER BY balance DESC", [req.user.id]
    );
    res.json(rows.map(r => ({
      id: r.id, name: r.name, balance: parseFloat(r.balance),
      creditLimit: parseFloat(r.credit_limit), apr: parseFloat(r.apr),
      minPayment: parseFloat(r.min_payment), dueDate: r.due_date,
      goalDate: r.goal_date, showInHistory: r.show_in_history,
    })));
  } catch (err) { console.error("GET /cards error:", err); res.status(500).json({ error: "Failed to fetch cards" }); }
});

// POST create a card
router.post("/", async (req, res) => {
  try {
    const { name, balance, creditLimit, apr, minPayment, dueDate, goalDate, showInHistory } = req.body;
    if (!name || balance === undefined || !dueDate) return res.status(400).json({ error: "name, balance, and dueDate are required" });
    const { rows } = await pool.query(
      `INSERT INTO credit_cards (user_id, name, balance, credit_limit, apr, min_payment, due_date, goal_date, show_in_history)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, name, balance || 0, creditLimit || 0, apr || 0, minPayment || 0, dueDate, goalDate || null, showInHistory !== false]
    );
    const r = rows[0];
    res.status(201).json({
      id: r.id, name: r.name, balance: parseFloat(r.balance),
      creditLimit: parseFloat(r.credit_limit), apr: parseFloat(r.apr),
      minPayment: parseFloat(r.min_payment), dueDate: r.due_date,
      goalDate: r.goal_date, showInHistory: r.show_in_history,
    });
  } catch (err) { console.error("POST /cards error:", err); res.status(500).json({ error: "Failed to create card" }); }
});

// PATCH update a card
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const u = req.body;
    const f = [], v = [];
    let i = 1;
    if (u.name !== undefined) { f.push(`name=$${i++}`); v.push(u.name); }
    if (u.balance !== undefined) { f.push(`balance=$${i++}`); v.push(u.balance); }
    if (u.creditLimit !== undefined) { f.push(`credit_limit=$${i++}`); v.push(u.creditLimit); }
    if (u.apr !== undefined) { f.push(`apr=$${i++}`); v.push(u.apr); }
    if (u.minPayment !== undefined) { f.push(`min_payment=$${i++}`); v.push(u.minPayment); }
    if (u.dueDate !== undefined) { f.push(`due_date=$${i++}`); v.push(u.dueDate); }
    if (u.goalDate !== undefined) { f.push(`goal_date=$${i++}`); v.push(u.goalDate || null); }
    if (u.showInHistory !== undefined) { f.push(`show_in_history=$${i++}`); v.push(u.showInHistory); }
    if (!f.length) return res.status(400).json({ error: "No fields to update" });
    f.push(`updated_at=NOW()`);
    v.push(req.user.id, id);
    const { rows } = await pool.query(`UPDATE credit_cards SET ${f.join(",")} WHERE user_id=$${i} AND id=$${i+1} RETURNING *`, v);
    if (!rows.length) return res.status(404).json({ error: "Card not found" });
    const r = rows[0];
    res.json({
      id: r.id, name: r.name, balance: parseFloat(r.balance),
      creditLimit: parseFloat(r.credit_limit), apr: parseFloat(r.apr),
      minPayment: parseFloat(r.min_payment), dueDate: r.due_date,
      goalDate: r.goal_date, showInHistory: r.show_in_history,
    });
  } catch (err) { console.error("PATCH /cards error:", err); res.status(500).json({ error: "Failed to update card" }); }
});

// DELETE a card
router.delete("/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM credit_cards WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: "Card not found" });
    res.json({ success: true });
  } catch (err) { console.error("DELETE /cards error:", err); res.status(500).json({ error: "Failed to delete card" }); }
});

// POST make a payment on a card
router.post("/:id/pay", async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, note } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "amount is required and must be positive" });

    // Get card and verify ownership
    const { rows: cards } = await pool.query("SELECT * FROM credit_cards WHERE id=$1 AND user_id=$2", [id, req.user.id]);
    if (!cards.length) return res.status(404).json({ error: "Card not found" });
    const card = cards[0];

    const today = new Date();
    const paidDate = today.toISOString().split("T")[0];
    const monthLabel = `${FULL_MONTHS[today.getMonth()]} ${today.getFullYear()}`;

    // Record payment
    await pool.query(
      `INSERT INTO card_payments (user_id, card_id, amount, paid_date, month_label, note) VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.user.id, id, amount, paidDate, monthLabel, note || null]
    );

    // Update balance
    const newBalance = Math.max(0, parseFloat(card.balance) - amount);
    await pool.query("UPDATE credit_cards SET balance=$1, updated_at=NOW() WHERE id=$2", [newBalance, id]);

    // Optionally add to bill history
    if (card.show_in_history) {
      await pool.query(
        `INSERT INTO payment_history (user_id, bill_name, amount, category, paid_date, month_label, status)
         VALUES ($1,$2,$3,'Credit Card',$4,$5,'on-time')`,
        [req.user.id, `${card.name} Payment`, amount, paidDate, monthLabel]
      );
    }

    res.json({ success: true, newBalance, paymentAmount: amount });
  } catch (err) { console.error("POST /cards/:id/pay error:", err); res.status(500).json({ error: "Failed to process payment" }); }
});

// GET payments for a card
router.get("/:id/payments", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM card_payments WHERE card_id=$1 AND user_id=$2 ORDER BY paid_date DESC LIMIT 50",
      [req.params.id, req.user.id]
    );
    res.json(rows.map(r => ({
      id: r.id, amount: parseFloat(r.amount), paidDate: r.paid_date.toISOString().split("T")[0],
      month: r.month_label, note: r.note,
    })));
  } catch (err) { res.status(500).json({ error: "Failed to fetch payments" }); }
});

// GET payoff calculator for a card
router.get("/:id/payoff", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM credit_cards WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: "Card not found" });
    const card = rows[0];
    const balance = parseFloat(card.balance);
    const apr = parseFloat(card.apr);
    const minPay = parseFloat(card.min_payment);
    const monthlyRate = apr / 100 / 12;

    // Calculate payoff scenarios
    const scenarios = [];

    // Scenario 1: Minimum payments
    if (minPay > 0 && balance > 0) {
      const minResult = calcPayoff(balance, monthlyRate, minPay);
      scenarios.push({ label: "Minimum Payments", monthlyPayment: minPay, ...minResult });
    }

    // Scenario 2: Goal date
    if (card.goal_date && balance > 0) {
      const goalDate = new Date(card.goal_date);
      const today = new Date();
      const monthsToGoal = Math.max(1, (goalDate.getFullYear() - today.getFullYear()) * 12 + goalDate.getMonth() - today.getMonth());
      const goalPayment = calcMonthlyForGoal(balance, monthlyRate, monthsToGoal);
      scenarios.push({ label: "Goal Date", monthlyPayment: Math.ceil(goalPayment * 100) / 100, months: monthsToGoal, totalInterest: Math.round((goalPayment * monthsToGoal - balance) * 100) / 100, totalPaid: Math.round(goalPayment * monthsToGoal * 100) / 100 });
    }

    // Scenario 3: Double minimum
    if (minPay > 0 && balance > 0) {
      const dblResult = calcPayoff(balance, monthlyRate, minPay * 2);
      scenarios.push({ label: "Double Minimum", monthlyPayment: minPay * 2, ...dblResult });
    }

    // Scenario 4: Pay in 12 months
    if (balance > 0) {
      const pay12 = calcMonthlyForGoal(balance, monthlyRate, 12);
      scenarios.push({ label: "12-Month Payoff", monthlyPayment: Math.ceil(pay12 * 100) / 100, months: 12, totalInterest: Math.round((pay12 * 12 - balance) * 100) / 100, totalPaid: Math.round(pay12 * 12 * 100) / 100 });
    }

    res.json({ balance, apr, minPayment: minPay, goalDate: card.goal_date, scenarios });
  } catch (err) { console.error("GET /cards/:id/payoff error:", err); res.status(500).json({ error: "Failed to calculate payoff" }); }
});

// GET debt strategy overview (snowball vs avalanche)
router.get("/strategy", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM credit_cards WHERE user_id=$1 AND balance > 0 ORDER BY balance ASC", [req.user.id]);
    if (!rows.length) return res.json({ snowball: [], avalanche: [], totalDebt: 0, totalMinPayments: 0 });

    const cards = rows.map(r => ({
      id: r.id, name: r.name, balance: parseFloat(r.balance),
      apr: parseFloat(r.apr), minPayment: parseFloat(r.min_payment),
    }));

    const totalDebt = cards.reduce((s, c) => s + c.balance, 0);
    const totalMin = cards.reduce((s, c) => s + c.minPayment, 0);

    // Snowball: lowest balance first
    const snowball = [...cards].sort((a, b) => a.balance - b.balance).map((c, i) => ({ ...c, order: i + 1 }));

    // Avalanche: highest APR first
    const avalanche = [...cards].sort((a, b) => b.apr - a.apr).map((c, i) => ({ ...c, order: i + 1 }));

    res.json({ snowball, avalanche, totalDebt, totalMinPayments: totalMin, cardCount: cards.length });
  } catch (err) { console.error("GET /cards/strategy error:", err); res.status(500).json({ error: "Failed to calculate strategy" }); }
});

// Helper: calculate months and interest for fixed payment
function calcPayoff(balance, monthlyRate, payment) {
  if (payment <= balance * monthlyRate) return { months: Infinity, totalInterest: Infinity, totalPaid: Infinity };
  let b = balance, months = 0, totalInterest = 0;
  while (b > 0 && months < 600) {
    const interest = b * monthlyRate;
    totalInterest += interest;
    b = b + interest - payment;
    months++;
    if (b <= 0) break;
  }
  return { months, totalInterest: Math.round(totalInterest * 100) / 100, totalPaid: Math.round((balance + totalInterest) * 100) / 100 };
}

// Helper: calculate monthly payment needed for goal
function calcMonthlyForGoal(balance, monthlyRate, months) {
  if (monthlyRate === 0) return balance / months;
  return (balance * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
}

module.exports = router;
