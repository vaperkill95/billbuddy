const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");
const Anthropic = require("@anthropic-ai/sdk").default;

router.use(authMiddleware);

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// POST /api/advisor - AI financial advisor chat
router.post("/", async (req, res) => {
  try {
    if (!client) return res.status(400).json({ error: "AI not configured" });

    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });

    const userId = req.user.id;

    // Gather comprehensive financial snapshot
    const [billsRes, cardsRes, accountsRes, txnsRes, incomeRes, goalsRes, upcomingRes] = await Promise.all([
      pool.query("SELECT name, amount, due_date, is_paid, category, reminder, frequency FROM bills WHERE user_id = $1", [userId]),
      pool.query("SELECT name, balance, credit_limit, apr, min_payment, due_date FROM credit_cards WHERE user_id = $1", [userId]),
      pool.query("SELECT name, balance_current, balance_available, account_type FROM bank_accounts WHERE user_id = $1", [userId]),
      pool.query("SELECT name, amount, date, category FROM bank_transactions WHERE user_id = $1 AND date >= CURRENT_DATE - 30 AND amount > 0 AND pending = false ORDER BY date DESC LIMIT 50", [userId]),
      pool.query("SELECT name, amount, frequency, next_pay_date FROM income_sources WHERE user_id = $1 AND is_active = true", [userId]),
      pool.query("SELECT name, target_amount, current_amount, monthly_contribution, target_date FROM financial_goals WHERE user_id = $1", [userId]).catch(() => ({ rows: [] })),
      pool.query("SELECT name, amount, due_date, is_paid FROM bills WHERE user_id = $1 AND is_paid = false ORDER BY due_date ASC", [userId]),
    ]);

    const bills = billsRes.rows;
    const cards = cardsRes.rows;
    const accounts = accountsRes.rows;
    const txns = txnsRes.rows;
    const income = incomeRes.rows;
    const goals = goalsRes.rows;
    const upcoming = upcomingRes.rows;

    const totalBalance = accounts.filter(a => a.account_type !== 'credit').reduce((s, a) => s + (parseFloat(a.balance_available || 0) > 0 ? parseFloat(a.balance_available) : parseFloat(a.balance_current || 0)), 0);
    const totalAvailable = accounts.filter(a => a.account_type !== 'credit').reduce((s, a) => s + parseFloat(a.balance_available || 0), 0);
    const totalDebt = cards.reduce((s, c) => s + parseFloat(c.balance || 0), 0);
    const totalCreditLimit = cards.reduce((s, c) => s + parseFloat(c.credit_limit || 0), 0);
    const monthlyBills = bills.reduce((s, b) => s + parseFloat(b.amount || 0), 0);
    const unpaidBills = upcoming.reduce((s, b) => s + parseFloat(b.amount || 0), 0);
    const thisMonthSpend = txns.reduce((s, t) => s + parseFloat(t.amount || 0), 0);

    const monthlyIncome = income.reduce((s, src) => {
      const amt = parseFloat(src.amount);
      switch (src.frequency) {
        case "weekly": return s + amt * 4.33;
        case "biweekly": return s + amt * 2.17;
        case "semimonthly": return s + amt * 2;
        case "yearly": return s + amt / 12;
        default: return s + amt;
      }
    }, 0);

    const today = new Date();
    const dayOfMonth = today.getDate();

    const snapshot = `FINANCIAL SNAPSHOT (as of ${today.toLocaleDateString()}):
- Bank balance: $${totalBalance.toFixed(2)} (available: $${totalAvailable.toFixed(2)})
- Credit card debt: $${totalDebt.toFixed(2)} across ${cards.length} cards (limit: $${totalCreditLimit.toFixed(2)})
${cards.map(c => "  - " + c.name + ": $" + parseFloat(c.balance).toFixed(2) + " / $" + parseFloat(c.credit_limit).toFixed(2) + " (" + c.apr + "% APR, min $" + parseFloat(c.min_payment).toFixed(2) + ", due " + c.due_date + "th)").join("\n")}
- Monthly income: ~$${monthlyIncome.toFixed(2)}
${income.map(s => "  - " + s.name + ": $" + parseFloat(s.amount).toFixed(2) + " (" + s.frequency + ")" + (s.next_pay_date ? " next: " + new Date(s.next_pay_date).toLocaleDateString() : "")).join("\n")}
- Monthly bills: $${monthlyBills.toFixed(2)} (${bills.length} bills)
${bills.map(b => "  - " + b.name + ": $" + parseFloat(b.amount).toFixed(2) + " due " + b.due_date + "th (" + (b.is_paid ? "PAID" : "UNPAID") + ") " + b.category + " " + b.frequency).join("\n")}
- Unpaid bills remaining: $${unpaidBills.toFixed(2)}
- Spending this month: $${thisMonthSpend.toFixed(2)}
- Today is the ${dayOfMonth}th of the month
${goals.length > 0 ? "- Financial goals:\n" + goals.map(g => "  - " + g.name + ": $" + parseFloat(g.current_amount).toFixed(2) + " / $" + parseFloat(g.target_amount).toFixed(2) + (g.monthly_contribution ? " (saving $" + parseFloat(g.monthly_contribution).toFixed(2) + "/mo)" : "")).join("\n") : ""}
- Recent transactions (last 30 days, top by amount):
${txns.slice(0, 15).map(t => "  - " + t.name + ": $" + parseFloat(t.amount).toFixed(2) + " on " + new Date(t.date).toLocaleDateString() + " [" + (t.category || "Other") + "]").join("\n")}`;

    const systemPrompt = `You are BillBuddy AI Advisor, a friendly and practical personal finance assistant. You have access to the user's real financial data below.

${snapshot}

RULES:
- Be conversational, warm, and concise. Use their actual numbers.
- When they ask "can I afford X" - calculate it using their real balance, upcoming bills, and income timing.
- When they ask about payment plans (e.g. "$250/month for a TV"), calculate if they can handle it alongside existing bills.
- If something is a stretch, say so honestly but helpfully. Suggest when they COULD afford it.
- Consider their upcoming bills and pay dates when advising on timing.
- If they want to add a new recurring expense, mention they can add it as a bill in BillBuddy.
- Keep responses under 200 words unless they ask for detail.
- Use dollar amounts and specific dates from their data.
- Never make up financial data - only use what's provided above.`;

    // Build conversation messages
    const messages = [];
    if (history && Array.isArray(history)) {
      history.slice(-10).forEach(h => {
        messages.push({ role: h.role, content: h.content });
      });
    }
    messages.push({ role: "user", content: message });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      system: systemPrompt,
      messages,
    });

    const reply = response.content[0].text.trim();

    res.json({ reply });
  } catch (err) {
    console.error("Advisor error:", err.message);
    res.status(500).json({ error: "Advisor failed", detail: err.message });
  }
});

module.exports = router;
