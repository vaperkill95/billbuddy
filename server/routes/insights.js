const express = require("express");
const router = express.Router();
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

const client = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// POST /api/insights - Generate AI insights for user's bills
router.post("/", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "AI insights not configured" });
    }

    // Fetch user's bills
    const { rows: bills } = await pool.query(
      "SELECT * FROM bills WHERE user_id = $1 ORDER BY due_date ASC",
      [req.user.id]
    );

    // Fetch recent payment history
    const { rows: history } = await pool.query(
      "SELECT * FROM payment_history WHERE user_id = $1 ORDER BY paid_date DESC LIMIT 30",
      [req.user.id]
    );

    if (bills.length === 0) {
      return res.json({
        suggestions: [
          {
            icon: "➕",
            title: "Add Your First Bill",
            desc: "Start by adding your monthly bills so I can give you personalized money-saving tips and reminders.",
            priority: "high",
            category: "getting-started",
          },
        ],
      });
    }

    // Build context for Claude
    const today = new Date();
    const dayOfMonth = today.getDate();
    const monthName = today.toLocaleString("en-US", { month: "long" });

    const billsSummary = bills.map((b) => ({
      name: b.name,
      amount: parseFloat(b.amount),
      dueDate: b.due_date,
      category: b.category,
      isPaid: b.is_paid,
      isRecurring: b.is_recurring,
      reminder: b.reminder,
    }));

    const totalMonthly = bills.reduce((s, b) => s + parseFloat(b.amount), 0);
    const paidTotal = bills.filter((b) => b.is_paid).reduce((s, b) => s + parseFloat(b.amount), 0);
    const unpaidTotal = totalMonthly - paidTotal;
    const unpaidBills = bills.filter((b) => !b.is_paid);
    const overdueBills = unpaidBills.filter((b) => b.due_date < dayOfMonth);
    const upcomingBills = unpaidBills.filter((b) => b.due_date >= dayOfMonth && b.due_date <= dayOfMonth + 7);

    const latePayments = history.filter((h) => h.status === "late").length;
    const totalPayments = history.length;
    const onTimeRate = totalPayments > 0 ? Math.round(((totalPayments - latePayments) / totalPayments) * 100) : 100;

    const categorySummary = {};
    bills.forEach((b) => {
      if (!categorySummary[b.category]) categorySummary[b.category] = 0;
      categorySummary[b.category] += parseFloat(b.amount);
    });

    const noReminderBills = bills.filter((b) => !b.reminder || b.reminder === "none");

    const prompt = `You are BillBuddy's AI financial assistant. Analyze this user's bill data and provide specific, actionable, personalized suggestions.

TODAY: ${monthName} ${dayOfMonth}, ${today.getFullYear()}

BILLS:
${JSON.stringify(billsSummary, null, 2)}

SUMMARY:
- Total monthly bills: $${totalMonthly.toFixed(2)}
- Paid so far this month: $${paidTotal.toFixed(2)}
- Still owed this month: $${unpaidTotal.toFixed(2)}
- Overdue bills: ${overdueBills.length} (${overdueBills.map((b) => b.name).join(", ") || "none"})
- Due in next 7 days: ${upcomingBills.length} (${upcomingBills.map((b) => `${b.name} on the ${b.due_date}th`).join(", ") || "none"})
- Bills without reminders: ${noReminderBills.length} (${noReminderBills.map((b) => b.name).join(", ") || "none"})

SPENDING BY CATEGORY:
${Object.entries(categorySummary).map(([cat, amt]) => `- ${cat}: $${amt.toFixed(2)} (${((amt / totalMonthly) * 100).toFixed(1)}%)`).join("\n")}

PAYMENT HISTORY:
- Total payments tracked: ${totalPayments}
- Late payments: ${latePayments}
- On-time rate: ${onTimeRate}%

Respond ONLY with a JSON array of 4-6 suggestion objects. Each object must have:
- "icon": a single relevant emoji
- "title": short title (3-6 words)
- "desc": specific, personalized advice referencing their actual bill names and amounts (2-3 sentences max)
- "priority": "high", "medium", or "low"
- "category": one of "urgent", "saving", "optimization", "reminder", "insight"

Rules:
- Reference SPECIFIC bill names and dollar amounts from their data
- If bills are overdue, that's always the #1 priority
- Look for bills that seem high for their category and suggest negotiation
- If subscriptions total over $30, suggest an audit with specific names
- Look at their on-time rate and comment on it
- Suggest optimal bill payment ordering (highest interest/penalty bills first)
- If they have no reminders set on upcoming bills, flag that
- Compare their spending ratios to common benchmarks
- Be encouraging and specific, not generic

Respond with ONLY the JSON array, no other text.`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].text.trim();

    // Parse JSON from response (handle potential markdown fences)
    const clean = text.replace(/```json|```/g, "").trim();
    const suggestions = JSON.parse(clean);

    res.json({ suggestions });
  } catch (err) {
    console.error("AI insights error:", err);

    // Fallback to basic suggestions if AI fails
    res.json({
      suggestions: [
        {
          icon: "⚠️",
          title: "AI Temporarily Unavailable",
          desc: "Smart insights couldn't load right now. Check back in a moment — in the meantime, review your upcoming bills on the Dashboard.",
          priority: "low",
          category: "insight",
        },
      ],
    });
  }
});

module.exports = router;
