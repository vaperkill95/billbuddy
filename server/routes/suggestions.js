const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");
const Anthropic = require("@anthropic-ai/sdk").default;

router.use(authMiddleware);

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// GET /api/suggestions - AI-powered smart transfer & payment suggestions
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;

    // Gather all financial data
    const [billsRes, cardsRes, accountsRes, incomeRes, goalsRes] = await Promise.all([
      pool.query("SELECT name, amount, due_date, is_paid, category FROM bills WHERE user_id = $1 ORDER BY due_date ASC", [userId]),
      pool.query("SELECT name, balance, credit_limit, apr, min_payment, due_date FROM credit_cards WHERE user_id = $1", [userId]),
      pool.query("SELECT name, balance_current, balance_available, account_type, account_subtype FROM bank_accounts WHERE user_id = $1", [userId]),
      pool.query("SELECT name, amount, frequency, next_pay_date FROM income_sources WHERE user_id = $1 AND is_active = true", [userId]),
      pool.query("SELECT name, target_amount, current_amount, monthly_contribution FROM financial_goals WHERE user_id = $1").catch(() => ({ rows: [] })),
    ]);

    const bills = billsRes.rows;
    const cards = cardsRes.rows;
    const accounts = accountsRes.rows;
    const income = incomeRes.rows;
    const goals = goalsRes.rows;

    // Calculate key metrics
    const checkingAccounts = accounts.filter(a => a.account_type !== "credit");
    const totalBalance = checkingAccounts.reduce((s, a) => s + parseFloat(a.balance_available || a.balance_current || 0), 0);
    const totalDebt = cards.reduce((s, c) => s + parseFloat(c.balance || 0), 0);
    const totalCreditLimit = cards.reduce((s, c) => s + parseFloat(c.credit_limit || 0), 0);
    const unpaidBills = bills.filter(b => !b.is_paid);
    const totalUnpaid = unpaidBills.reduce((s, b) => s + parseFloat(b.amount), 0);

    const today = new Date();
    const dayOfMonth = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - dayOfMonth;

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

    // Generate rule-based suggestions first (fast, no AI needed)
    const suggestions = [];

    // 1. Bills coming due soon with enough balance
    const urgentBills = unpaidBills.filter(b => {
      const dueIn = b.due_date - dayOfMonth;
      return dueIn >= 0 && dueIn <= 5;
    });
    for (const bill of urgentBills) {
      const amt = parseFloat(bill.amount);
      if (totalBalance > amt * 1.5) {
        suggestions.push({
          type: "pay_bill",
          priority: "high",
          icon: "⚡",
          title: `Pay ${bill.name} now`,
          description: `Due in ${bill.due_date - dayOfMonth} day${bill.due_date - dayOfMonth !== 1 ? "s" : ""}. You have ${formatMoney(totalBalance)} available.`,
          amount: amt,
          action: `Pay ${formatMoney(amt)} for ${bill.name}`,
          impact: "Avoid late fees",
        });
      }
    }

    // 2. Credit card: pay more than minimum to save on interest
    for (const card of cards) {
      const balance = parseFloat(card.balance);
      const apr = parseFloat(card.apr || 0);
      const minPay = parseFloat(card.min_payment || 0);
      const limit = parseFloat(card.credit_limit || 0);

      if (balance <= 0 || apr <= 0) continue;

      const monthlyInterest = balance * (apr / 100 / 12);
      const utilization = limit > 0 ? (balance / limit) * 100 : 0;

      // Suggest extra payment if user has spare cash
      const spareAfterBills = totalBalance - totalUnpaid;
      if (spareAfterBills > minPay * 2) {
        const extraPayment = Math.min(Math.round(spareAfterBills * 0.3), balance - minPay);
        if (extraPayment > 10) {
          const interestSaved = extraPayment * (apr / 100 / 12);
          suggestions.push({
            type: "extra_payment",
            priority: utilization > 50 ? "high" : "medium",
            icon: "💳",
            title: `Pay extra ${formatMoney(extraPayment)} on ${card.name}`,
            description: `You're paying ${formatMoney(monthlyInterest)}/mo in interest at ${apr}% APR. An extra payment saves ~${formatMoney(interestSaved)}/mo.`,
            amount: extraPayment + minPay,
            action: `Pay ${formatMoney(extraPayment + minPay)} instead of ${formatMoney(minPay)} minimum`,
            impact: `Save ~${formatMoney(interestSaved * 12)}/year in interest`,
          });
        }
      }

      // High utilization warning
      if (utilization > 70) {
        suggestions.push({
          type: "utilization_warning",
          priority: "medium",
          icon: "📊",
          title: `${card.name} utilization at ${Math.round(utilization)}%`,
          description: `Using ${formatMoney(balance)} of ${formatMoney(limit)} limit. High utilization can hurt your credit score.`,
          amount: null,
          action: `Try to get below 30% (${formatMoney(limit * 0.3)})`,
          impact: "Improve credit score",
        });
      }
    }

    // 3. Safety buffer check
    if (totalBalance < monthlyIncome * 0.5 && totalBalance > 0) {
      suggestions.push({
        type: "low_buffer",
        priority: "high",
        icon: "🚨",
        title: "Low safety buffer",
        description: `Your balance (${formatMoney(totalBalance)}) is less than half your monthly income. Try to build up at least ${formatMoney(monthlyIncome)} as a cushion.`,
        amount: null,
        action: `Target: ${formatMoney(monthlyIncome)} emergency buffer`,
        impact: "Financial security",
      });
    }

    // 4. Savings goal opportunity
    for (const goal of goals) {
      const remaining = parseFloat(goal.target_amount) - parseFloat(goal.current_amount);
      const contribution = parseFloat(goal.monthly_contribution || 0);
      if (remaining > 0 && totalBalance > totalUnpaid + remaining * 0.1) {
        const boostAmount = Math.min(Math.round(remaining * 0.1), Math.round((totalBalance - totalUnpaid) * 0.15));
        if (boostAmount >= 10) {
          suggestions.push({
            type: "goal_boost",
            priority: "low",
            icon: "🎯",
            title: `Boost "${goal.name}" goal by ${formatMoney(boostAmount)}`,
            description: `You're ${formatMoney(remaining)} away from your goal. A small extra contribution gets you there faster.`,
            amount: boostAmount,
            action: `Add ${formatMoney(boostAmount)} to ${goal.name}`,
            impact: contribution > 0 ? `Reach goal ~${Math.round(remaining / (contribution + boostAmount))} months sooner` : "Get closer to your goal",
          });
        }
      }
    }

    // 5. Upcoming income timing optimization
    for (const src of income) {
      if (src.next_pay_date) {
        const payDate = new Date(src.next_pay_date);
        const daysUntilPay = Math.round((payDate - today) / (1000 * 60 * 60 * 24));
        if (daysUntilPay > 0 && daysUntilPay <= 7 && totalBalance < totalUnpaid) {
          suggestions.push({
            type: "timing",
            priority: "medium",
            icon: "📅",
            title: `Wait for ${src.name} paycheck`,
            description: `${formatMoney(parseFloat(src.amount))} coming in ${daysUntilPay} day${daysUntilPay !== 1 ? "s" : ""}. Hold off on non-essential payments until then.`,
            amount: parseFloat(src.amount),
            action: "Delay discretionary spending until payday",
            impact: "Avoid overdraft",
          });
        }
      }
    }

    // Now get AI-powered suggestions if we have enough data and an API key
    let aiSuggestions = [];
    if (client && (cards.length > 0 || accounts.length > 1 || unpaidBills.length > 0)) {
      try {
        const snapshot = `Bank balance: $${totalBalance.toFixed(2)}
Credit cards: ${cards.map(c => c.name + " $" + parseFloat(c.balance).toFixed(2) + "/" + parseFloat(c.credit_limit).toFixed(2) + " " + c.apr + "% APR min $" + parseFloat(c.min_payment).toFixed(2) + " due " + c.due_date + "th").join("; ")}
Unpaid bills: ${unpaidBills.map(b => b.name + " $" + parseFloat(b.amount).toFixed(2) + " due " + b.due_date + "th").join("; ") || "None"}
Monthly income: ~$${monthlyIncome.toFixed(2)}
Next paycheck: ${income[0]?.next_pay_date ? new Date(income[0].next_pay_date).toLocaleDateString() : "unknown"}
Today: ${today.toLocaleDateString()}, day ${dayOfMonth} of month
Goals: ${goals.map(g => g.name + " $" + parseFloat(g.current_amount).toFixed(2) + "/$" + parseFloat(g.target_amount).toFixed(2)).join("; ") || "None"}`;

        const aiResponse = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 600,
          system: `You analyze personal finances and give 1-3 specific, actionable money moves. Respond ONLY in valid JSON array format. Each item must have: type (string: "transfer"|"payment"|"timing"|"savings"), title (string, under 10 words), description (string, 1 sentence with specific dollar amounts), impact (string, quantified benefit). Use their real numbers. No markdown, no explanation, just the JSON array.`,
          messages: [{ role: "user", content: snapshot }],
        });

        const aiText = aiResponse.content[0].text.trim();
        try {
          const parsed = JSON.parse(aiText.replace(/```json|```/g, "").trim());
          if (Array.isArray(parsed)) {
            aiSuggestions = parsed.map(s => ({
              type: s.type || "ai_tip",
              priority: "medium",
              icon: "🤖",
              title: s.title || "Smart move",
              description: s.description || "",
              amount: null,
              action: s.description || "",
              impact: s.impact || "",
              isAI: true,
            }));
          }
        } catch (parseErr) {
          console.error("AI suggestion parse error:", parseErr.message);
        }
      } catch (aiErr) {
        console.error("AI suggestion error:", aiErr.message);
      }
    }

    // Combine and sort by priority
    const allSuggestions = [...suggestions, ...aiSuggestions];
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    allSuggestions.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

    res.json({
      suggestions: allSuggestions.slice(0, 8),
      snapshot: {
        balance: Math.round(totalBalance * 100) / 100,
        debt: Math.round(totalDebt * 100) / 100,
        unpaidBills: Math.round(totalUnpaid * 100) / 100,
        monthlyIncome: Math.round(monthlyIncome * 100) / 100,
        daysLeftInMonth: daysLeft,
      },
    });
  } catch (err) {
    console.error("Suggestions error:", err);
    res.status(500).json({ error: "Failed to generate suggestions" });
  }
});

function formatMoney(n) {
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = router;
