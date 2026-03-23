const express = require("express");
const router = express.Router();
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

const client = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// POST /api/negotiate/:billId - Generate negotiation script for a bill
router.post("/:billId", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "AI not configured" });
    }

    const { rows } = await pool.query(
      "SELECT * FROM bills WHERE id = $1 AND user_id = $2", [req.params.billId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Bill not found" });
    const bill = rows[0];

    const prompt = `You are a bill negotiation expert. Help this user negotiate a lower rate for their bill.

BILL DETAILS:
- Provider: ${bill.name}
- Category: ${bill.category}
- Monthly Amount: $${parseFloat(bill.amount).toFixed(2)}
- Recurring: ${bill.is_recurring ? "Yes" : "No"}

Generate a complete negotiation guide with:
1. A phone script they can read word-for-word when they call
2. Key phrases that work with this type of provider
3. What to ask for specifically (discount amount, competitor match, loyalty discount, etc.)
4. What to say if they say no (escalation tactics)
5. Estimated potential savings

Respond ONLY with a JSON object:
{
  "providerPhone": "the customer service number if you know it, or 'Check your bill or provider website'",
  "estimatedSavings": "monthly dollar amount they might save",
  "savingsPercent": "percentage they might save",
  "difficulty": "easy/medium/hard",
  "bestTimeToCall": "recommended time",
  "script": {
    "opener": "exact words to say when connected",
    "mainAsk": "the specific ask/negotiation",
    "ifTheyResist": "what to say if they push back",
    "escalation": "how to escalate if needed",
    "closer": "how to wrap up"
  },
  "tips": ["tip 1", "tip 2", "tip 3"],
  "alternativeProviders": ["competitor 1 with price", "competitor 2 with price"]
}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].text.trim().replace(/```json|```/g, "").trim();
    const result = JSON.parse(text);

    res.json({
      billName: bill.name,
      currentAmount: parseFloat(bill.amount),
      ...result,
    });
  } catch (err) {
    console.error("Negotiate error:", err);
    res.status(500).json({ error: "Failed to generate negotiation guide" });
  }
});

// GET /api/negotiate/opportunities - Find bills worth negotiating
router.get("/opportunities", async (req, res) => {
  try {
    const { rows: bills } = await pool.query(
      "SELECT * FROM bills WHERE user_id = $1 AND is_recurring = true ORDER BY amount DESC", [req.user.id]
    );

    // Categories where negotiation typically works
    const negotiable = ["Phone/Internet", "Insurance", "Utilities", "Subscriptions"];
    const opportunities = bills
      .filter(b => negotiable.includes(b.category) || parseFloat(b.amount) > 100)
      .map(b => ({
        id: b.id,
        name: b.name,
        amount: parseFloat(b.amount),
        category: b.category,
        potentialSavings: Math.round(parseFloat(b.amount) * 0.15 * 100) / 100, // Estimate 15% savings
        difficulty: parseFloat(b.amount) > 200 ? "medium" : "easy",
      }));

    const totalPotential = opportunities.reduce((s, o) => s + o.potentialSavings, 0);

    res.json({ opportunities, totalPotentialMonthlySavings: totalPotential, totalPotentialYearlySavings: totalPotential * 12 });
  } catch (err) {
    res.status(500).json({ error: "Failed to find opportunities" });
  }
});

module.exports = router;
