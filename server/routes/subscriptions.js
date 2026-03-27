const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

// ─── Merchant Name Normalization ───
function normalizeMerchant(name) {
  let n = (name || "").toLowerCase().trim();
  n = n.replace(/\s*#\d+.*$/, "");
  n = n.replace(/\s*\d{5,}.*$/, "");
  n = n.replace(/\s*\d{2}\/\d{2}.*$/, "");
  n = n.replace(/\s*(inc|llc|ltd|corp|co|com|net|org|www\.|http\S+)\.?\s*/gi, " ");
  n = n.replace(/[*]+/g, " ").replace(/\s+/g, " ").replace(/[.,;:!]+$/, "").trim();
  return n;
}

function merchantKey(name) {
  return normalizeMerchant(name).replace(/[^a-z0-9]/g, "");
}

// ─── Category Detection ───
function guessCategory(name) {
  const n = name.toLowerCase();
  if (/netflix|hulu|disney|hbo|spotify|apple music|youtube|paramount|peacock|crunchyroll|audible|amazon prime|prime video/.test(n)) return "Subscriptions";
  if (/verizon|at.t|t-mobile|sprint|mint mobile|cricket|boost|visible|google fi|xfinity mobile/.test(n)) return "Phone/Internet";
  if (/comcast|spectrum|xfinity|cox|frontier|att internet|optimum|fios/.test(n)) return "Phone/Internet";
  if (/geico|progressive|allstate|state farm|liberty|usaa|nationwide|travelers|erie|farmers/.test(n)) return "Insurance";
  if (/electric|power|gas|water|sewer|energy|national grid|con ed|pseg|duke energy|dominion/.test(n)) return "Utilities";
  if (/gym|fitness|planet|equinox|la fitness|ymca|peloton|orangetheory|crossfit/.test(n)) return "Health";
  if (/amazon|walmart|costco|sam.s club|bj.s|target/.test(n)) return "Shopping";
  if (/doordash|uber eats|grubhub|instacart|seamless|gopuff/.test(n)) return "Food";
  if (/rent|mortgage|hoa|property|management/.test(n)) return "Housing";
  if (/adobe|microsoft|google storage|icloud|dropbox|notion|slack|zoom|canva|figma|openai|chatgpt/.test(n)) return "Subscriptions";
  return "Other";
}

// ─── Frequency Detection ───
function detectFrequency(dates) {
  if (dates.length < 2) return { frequency: "monthly", confidence: "low", avgGapDays: 30 };
  const sorted = dates.map(d => new Date(d)).sort((a, b) => b - a);
  const gaps = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    gaps.push(Math.round((sorted[i] - sorted[i + 1]) / (1000 * 60 * 60 * 24)));
  }
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const stdDev = Math.sqrt(gaps.reduce((s, g) => s + Math.pow(g - avgGap, 2), 0) / gaps.length);
  const confidence = stdDev < avgGap * 0.3 ? "high" : stdDev < avgGap * 0.5 ? "medium" : "low";
  let frequency = "monthly";
  if (avgGap <= 9) frequency = "weekly";
  else if (avgGap <= 18) frequency = "biweekly";
  else if (avgGap <= 45) frequency = "monthly";
  else if (avgGap <= 100) frequency = "quarterly";
  else frequency = "yearly";
  return { frequency, confidence, avgGapDays: Math.round(avgGap) };
}

function estimateAnnualCost(amount, frequency) {
  const m = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, yearly: 1 };
  return Math.round((amount * (m[frequency] || 12)) * 100) / 100;
}

function detectPriceChange(amounts) {
  if (!amounts || amounts.length < 2) return null;
  const recent = parseFloat(amounts[0]);
  const previous = parseFloat(amounts[1]);
  if (recent === previous) return null;
  const change = recent - previous;
  const pctChange = Math.round((change / previous) * 100);
  if (Math.abs(pctChange) < 1) return null;
  return {
    currentAmount: recent,
    previousAmount: previous,
    change: Math.round(change * 100) / 100,
    percentChange: pctChange,
    direction: change > 0 ? "increase" : "decrease",
  };
}

// ─── GET /api/subscriptions/recurring ───
router.get("/recurring", async (req, res) => {
  try {
    const userId = req.user.id;
    const lookbackDays = parseInt(req.query.days) || 180;

    const { rows: transactions } = await pool.query(
      `SELECT name, amount, date
       FROM bank_transactions
       WHERE user_id = $1 AND amount > 0 AND pending = false
         AND date >= CURRENT_DATE - $2::integer
       ORDER BY date DESC`,
      [userId, lookbackDays]
    );

    const merchantGroups = {};
    for (const tx of transactions) {
      const key = merchantKey(tx.name);
      if (!key) continue;
      if (!merchantGroups[key]) {
        merchantGroups[key] = { displayName: tx.name, transactions: [] };
      }
      merchantGroups[key].transactions.push({
        amount: parseFloat(tx.amount),
        date: tx.date,
      });
    }

    const { rows: bills } = await pool.query(
      "SELECT id, name, amount, category, due_date FROM bills WHERE user_id = $1",
      [userId]
    );
    const billMap = {};
    for (const b of bills) {
      billMap[merchantKey(b.name)] = b;
    }

    const recurring = [];
    const priceChanges = [];

    for (const [key, group] of Object.entries(merchantGroups)) {
      const txns = group.transactions;
      if (txns.length < 2) continue;

      const amounts = txns.map(t => t.amount);
      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const amountStdDev = Math.sqrt(amounts.reduce((s, a) => s + Math.pow(a - avgAmount, 2), 0) / amounts.length);
      if (amountStdDev > Math.max(avgAmount * 0.3, 5)) continue;

      const dates = txns.map(t => t.date);
      const { frequency, confidence, avgGapDays } = detectFrequency(dates);
      if (confidence === "low" && txns.length < 4) continue;

      const sortedByDate = [...txns].sort((a, b) => new Date(b.date) - new Date(a.date));
      const sortedAmounts = sortedByDate.map(t => t.amount);
      const priceChange = detectPriceChange(sortedAmounts);

      const matchedBill = billMap[key] || Object.entries(billMap).find(([bk]) =>
        key.includes(bk) || bk.includes(key)
      )?.[1] || null;

      const lastDate = new Date(Math.max(...dates.map(d => new Date(d))));
      const daysSinceLast = Math.round((Date.now() - lastDate) / (1000 * 60 * 60 * 24));
      const possibleCancellation = daysSinceLast > avgGapDays * 1.5 && txns.length >= 3;

      const item = {
        id: key,
        name: normalizeMerchant(group.displayName),
        rawName: group.displayName,
        amount: Math.round(avgAmount * 100) / 100,
        latestAmount: sortedAmounts[0],
        frequency,
        frequencyConfidence: confidence,
        avgGapDays,
        occurrences: txns.length,
        firstDate: new Date(Math.min(...dates.map(d => new Date(d)))).toISOString().split("T")[0],
        lastDate: lastDate.toISOString().split("T")[0],
        daysSinceLast,
        suggestedDueDate: lastDate.getDate(),
        category: guessCategory(group.displayName),
        annualCost: estimateAnnualCost(avgAmount, frequency),
        priceChange,
        isTracked: !!matchedBill,
        matchedBillId: matchedBill?.id || null,
        possibleCancellation,
        status: possibleCancellation ? "possibly_cancelled" : matchedBill ? "tracked" : "untracked",
      };

      recurring.push(item);
      if (priceChange && Math.abs(priceChange.percentChange) >= 3) {
        priceChanges.push(item);
      }
    }

    recurring.sort((a, b) => {
      const order = { untracked: 0, possibly_cancelled: 1, tracked: 2 };
      const diff = (order[a.status] || 9) - (order[b.status] || 9);
      if (diff !== 0) return diff;
      return b.amount - a.amount;
    });

    const mult = { weekly: 4.33, biweekly: 2.17, monthly: 1, quarterly: 1/3, yearly: 1/12 };
    const active = recurring.filter(r => r.status !== "possibly_cancelled");
    const totalMonthly = active.reduce((s, r) => s + r.amount * (mult[r.frequency] || 1), 0);
    const totalAnnual = active.reduce((s, r) => s + r.annualCost, 0);
    const untracked = recurring.filter(r => r.status === "untracked");
    const untrackedMonthly = untracked.reduce((s, r) => s + r.amount * (mult[r.frequency] || 1), 0);

    res.json({
      recurring,
      priceChanges,
      summary: {
        totalRecurring: recurring.length,
        tracked: recurring.filter(r => r.status === "tracked").length,
        untracked: untracked.length,
        possiblyCancelled: recurring.filter(r => r.status === "possibly_cancelled").length,
        totalMonthlyEstimate: Math.round(totalMonthly * 100) / 100,
        totalAnnualEstimate: Math.round(totalAnnual * 100) / 100,
        untrackedMonthly: Math.round(untrackedMonthly * 100) / 100,
        priceChangeCount: priceChanges.length,
      },
    });
  } catch (err) {
    console.error("Recurring detection error:", err);
    res.status(500).json({ error: "Failed to detect recurring transactions" });
  }
});

// ─── Keep old endpoint for backward compatibility ───
router.get("/detect", async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows: recurring } = await pool.query(
      `SELECT name, ROUND(AVG(amount)::numeric, 2) as avg_amount,
              MIN(amount) as min_amount, MAX(amount) as max_amount,
              COUNT(*) as occurrences, MAX(date) as last_date, MIN(date) as first_date,
              ARRAY_AGG(DISTINCT date ORDER BY date DESC) as dates
       FROM bank_transactions WHERE user_id = $1 AND amount > 0 AND pending = false
         AND date >= CURRENT_DATE - 90
       GROUP BY name HAVING COUNT(*) >= 2 AND MAX(amount) - MIN(amount) < GREATEST(AVG(amount) * 0.3, 5)
       ORDER BY avg_amount DESC`,
      [userId]
    );
    const { rows: bills } = await pool.query("SELECT name FROM bills WHERE user_id = $1", [userId]);
    const billNames = bills.map(b => b.name.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const detected = [];
    for (const r of recurring) {
      const nn = r.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (billNames.some(bn => nn.includes(bn) || bn.includes(nn))) continue;
      const dates = r.dates.map(d => new Date(d));
      let frequency = "monthly";
      if (dates.length >= 2) {
        const gaps = [];
        for (let i = 0; i < dates.length - 1; i++) gaps.push(Math.round((dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24)));
        const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
        if (avgGap <= 10) frequency = "weekly";
        else if (avgGap <= 18) frequency = "biweekly";
        else if (avgGap <= 45) frequency = "monthly";
        else frequency = "other";
      }
      detected.push({
        name: r.name, amount: parseFloat(r.avg_amount), occurrences: parseInt(r.occurrences), frequency,
        lastDate: r.last_date.toISOString().split("T")[0], suggestedDueDate: dates[0]?.getDate() || 1,
        alreadyTracked: false, category: guessCategory(r.name),
      });
    }
    res.json({ detected, count: detected.length });
  } catch (err) {
    console.error("Subscription detect error:", err);
    res.status(500).json({ error: "Failed to detect subscriptions" });
  }
});

module.exports = router;
