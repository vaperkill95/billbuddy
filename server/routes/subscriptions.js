const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

// GET /api/subscriptions/detect - Detect recurring charges from bank transactions
router.get("/detect", async (req, res) => {
  try {
    const userId = req.user.id;

    // Find transactions that appear 2+ times with similar amounts in last 90 days
    const { rows: recurring } = await pool.query(
      `SELECT name, 
              ROUND(AVG(amount)::numeric, 2) as avg_amount,
              MIN(amount) as min_amount, MAX(amount) as max_amount,
              COUNT(*) as occurrences,
              MAX(date) as last_date,
              MIN(date) as first_date,
              ARRAY_AGG(DISTINCT date ORDER BY date DESC) as dates
       FROM bank_transactions 
       WHERE user_id = $1 AND amount > 0 AND pending = false 
         AND date >= CURRENT_DATE - 90
       GROUP BY name
       HAVING COUNT(*) >= 2 AND MAX(amount) - MIN(amount) < GREATEST(AVG(amount) * 0.3, 5)
       ORDER BY avg_amount DESC`,
      [userId]
    );

    // Get existing bills to exclude
    const { rows: bills } = await pool.query("SELECT name FROM bills WHERE user_id = $1", [userId]);
    const billNames = bills.map(b => b.name.toLowerCase().replace(/[^a-z0-9]/g, ""));

    const detected = [];
    for (const r of recurring) {
      const normalizedName = r.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const alreadyTracked = billNames.some(bn => normalizedName.includes(bn) || bn.includes(normalizedName));
      
      if (alreadyTracked) continue;

      // Determine frequency
      const dates = r.dates.map(d => new Date(d));
      let frequency = "monthly";
      if (dates.length >= 2) {
        const gaps = [];
        for (let i = 0; i < dates.length - 1; i++) {
          gaps.push(Math.round((dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24)));
        }
        const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
        if (avgGap <= 10) frequency = "weekly";
        else if (avgGap <= 18) frequency = "biweekly";
        else if (avgGap <= 45) frequency = "monthly";
        else frequency = "other";
      }

      // Guess the due date from most common day of month
      const dayOfMonth = dates.length > 0 ? dates[0].getDate() : 1;

      detected.push({
        name: r.name,
        amount: parseFloat(r.avg_amount),
        occurrences: parseInt(r.occurrences),
        frequency,
        lastDate: r.last_date.toISOString().split("T")[0],
        suggestedDueDate: dayOfMonth,
        alreadyTracked: false,
        category: guessCategory(r.name),
      });
    }

    res.json({ detected, count: detected.length });
  } catch (err) {
    console.error("Subscription detect error:", err);
    res.status(500).json({ error: "Failed to detect subscriptions" });
  }
});

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/netflix|hulu|disney|hbo|spotify|apple music|youtube|paramount|peacock|crunchyroll|audible/.test(n)) return "Subscriptions";
  if (/verizon|at.t|t-mobile|sprint|mint mobile|cricket|boost/.test(n)) return "Phone/Internet";
  if (/comcast|spectrum|xfinity|cox|frontier|att internet/.test(n)) return "Phone/Internet";
  if (/geico|progressive|allstate|state farm|liberty|usaa|nationwide/.test(n)) return "Insurance";
  if (/electric|power|gas|water|sewer|energy|national grid|con ed|pseg/.test(n)) return "Utilities";
  if (/gym|fitness|planet|equinox|la fitness|ymca|peloton/.test(n)) return "Health/Fitness";
  if (/amazon prime|amazon|walmart|costco|sam.s club/.test(n)) return "Shopping";
  if (/doordash|uber eats|grubhub|instacart|seamless/.test(n)) return "Food";
  return "Other";
}

module.exports = router;
