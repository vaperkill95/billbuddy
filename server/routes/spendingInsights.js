const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");
const Anthropic = require("@anthropic-ai/sdk").default;

router.use(authMiddleware);

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

// GET /api/spending-insights - AI-powered spending analysis
router.get("/", async (req, res) => {
  try {
    if (!client) return res.status(400).json({ error: "AI not configured" });

    const userId = req.user.id;

    // Gather all financial data
    const [billsRes, cardsRes, accountsRes, txnsRes, incomeRes, prevTxnsRes] = await Promise.all([
      pool.query("SELECT name, amount, due_date, is_paid, category FROM bills WHERE user_id = $1", [userId]),
      pool.query("SELECT name, balance, credit_limit, apr, min_payment FROM credit_cards WHERE user_id = $1", [userId]),
      pool.query("SELECT name, balance_current, balance_available, account_type FROM bank_accounts WHERE user_id = $1", [userId]),
      pool.query("SELECT name, amount, date, category, pending FROM bank_transactions WHERE user_id = $1 AND date >= CURRENT_DATE - 30 AND amount > 0 AND pending = false ORDER BY amount DESC LIMIT 50", [userId]),
      pool.query("SELECT name, amount, frequency FROM income_sources WHERE user_id = $1 AND is_active = true", [userId]),
      pool.query("SELECT name, amount, category FROM bank_transactions WHERE user_id = $1 AND date >= CURRENT_DATE - 60 AND date < CURRENT_DATE - 30 AND amount > 0 AND pending = false ORDER BY amount DESC LIMIT 50", [userId]),
    ]);

    const bills = billsRes.rows;
    const cards = cardsRes.rows;
    const accounts = accountsRes.rows;
    const txns = txnsRes.rows;
    const income = incomeRes.rows;
    const prevTxns = prevTxnsRes.rows;

    const totalBalance = accounts.filter(a => a.account_type !== 'credit').reduce((s, a) => s + parseFloat(a.balance_current || 0), 0);
    const totalDebt = cards.reduce((s, c) => s + parseFloat(c.balance || 0), 0);
    const totalBills = bills.reduce((s, b) => s + parseFloat(b.amount || 0), 0);
    const thisMonthSpend = txns.reduce((s, t) => s + parseFloat(t.amount || 0), 0);
    const lastMonthSpend = prevTxns.reduce((s, t) => s + parseFloat(t.amount || 0), 0);

    // Categorize spending
    const categories = {};
    txns.forEach(t => {
      const cat = t.category || "Other";
      if (!categories[cat]) categories[cat] = 0;
      categories[cat] += parseFloat(t.amount);
    });

    const topSpending = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cat, amt]) => cat + ": $" + amt.toFixed(2));
    const topTransactions = txns.slice(0, 15).map(t => t.name + " $" + parseFloat(t.amount).toFixed(2) + " (" + (t.date ? t.date.toISOString().split("T")[0] : "") + ")");

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

    const prompt = `You are a friendly, practical financial advisor analyzing someone's spending. Be specific, use their actual numbers, and give actionable advice. Keep it conversational, not lecture-y.

Here's their financial snapshot:
- Bank balance: $${totalBalance.toFixed(2)}
- Credit card debt: $${totalDebt.toFixed(2)} across ${cards.length} cards
${cards.map(c => "  - " + c.name + ": $" + parseFloat(c.balance).toFixed(2) + " / $" + parseFloat(c.credit_limit).toFixed(2) + " (" + c.apr + "% APR)").join("\n")}
- Monthly bills: $${totalBills.toFixed(2)} (${bills.length} bills)
- Monthly income: ~$${monthlyIncome.toFixed(2)}
- This month spending: $${thisMonthSpend.toFixed(2)}
- Last month spending: $${lastMonthSpend.toFixed(2)}
- Spending change: ${thisMonthSpend > lastMonthSpend ? "UP" : "DOWN"} $${Math.abs(thisMonthSpend - lastMonthSpend).toFixed(2)}

Top spending categories this month:
${topSpending.join("\n")}

Recent large transactions:
${topTransactions.join("\n")}

Give exactly 5 insights as a JSON array. Each insight should have:
- "title": short catchy title (4-6 words)
- "insight": 2-3 sentences of specific, actionable advice using their real numbers
- "type": one of "warning", "tip", "positive", "goal"
- "savings": estimated monthly savings in dollars if they follow the advice (number, 0 if not applicable)

Respond ONLY with the JSON array, no markdown, no backticks.`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].text.trim();
    let insights;
    try {
      insights = JSON.parse(text);
    } catch {
      // Try to extract JSON from response
      const match = text.match(/\[[\s\S]*\]/);
      insights = match ? JSON.parse(match[0]) : [{ title: "Analysis Complete", insight: text, type: "tip", savings: 0 }];
    }

    res.json({
      insights,
      summary: {
        balance: totalBalance,
        debt: totalDebt,
        monthlyBills: totalBills,
        monthlyIncome: monthlyIncome,
        thisMonthSpend: thisMonthSpend,
        lastMonthSpend: lastMonthSpend,
        potentialSavings: insights.reduce((s, i) => s + (i.savings || 0), 0),
      },
    });
  } catch (err) {
    console.error("Spending insights error:", err.message);
    res.status(500).json({ error: "Failed to generate insights", detail: err.message });
  }
});

module.exports = router;
