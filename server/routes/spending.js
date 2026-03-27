const express = require("express");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

const CATEGORY_MAP = {
  "Gas & Fuel": ["shell", "exxon", "mobil", "chevron", "bp ", "sunoco", "wawa gas", "speedway", "citgo", "marathon", "valero", "phillips 66", "racetrac", "quiktrip", "sheetz", "gas station", "fuel", "petrol"],
  "Groceries": ["walmart", "target", "shoprite", "stop & shop", "kroger", "publix", "aldi", "lidl", "trader joe", "whole foods", "costco", "sam's club", "bj's", "food lion", "wegmans", "safeway", "albertsons", "heb", "meijer", "giant", "market basket", "piggly", "grocery", "supermarket", "fresh market"],
  "Eating Out": ["mcdonald", "burger king", "wendy", "chick-fil-a", "taco bell", "chipotle", "subway", "starbucks", "dunkin", "domino", "pizza hut", "papa john", "olive garden", "applebee", "chili's", "denny", "ihop", "waffle house", "panera", "five guys", "popeye", "kfc", "sonic", "arby", "jack in the box", "doordash", "ubereats", "uber eat", "grubhub", "postmates", "seamless", "instacart", "restaurant", "cafe", "diner", "grill", "kitchen", "bistro", "sushi", "thai", "chinese", "mexican", "italian"],
  "Shopping": ["amazon", "ebay", "etsy", "best buy", "home depot", "lowe's", "ikea", "wayfair", "marshalls", "tj maxx", "ross", "nordstrom", "macy", "kohls", "old navy", "gap ", "h&m", "zara", "nike", "adidas", "foot locker", "bath & body", "ulta", "sephora", "dollar tree", "dollar general", "five below", "big lots", "burlington"],
  "Entertainment": ["netflix", "hulu", "disney+", "disney plus", "hbo", "spotify", "apple music", "youtube", "paramount", "peacock", "amc", "regal", "cinema", "movie", "playstation", "xbox", "nintendo", "steam", "twitch", "ticketmaster", "stubhub", "live nation", "concert", "theater"],
  "Health & Medical": ["cvs", "walgreens", "rite aid", "pharmacy", "doctor", "hospital", "medical", "dental", "dentist", "optometrist", "urgent care", "labcorp", "quest diagnostics", "health", "clinic", "copay"],
  "Transportation": ["uber", "lyft", "taxi", "toll", "ez-pass", "ezpass", "e-zpass", "parking", "garage", "metro", "transit", "subway", "bus pass", "nj transit", "mta", "lirr", "amtrak", "greyhound", "jiffy lube", "autozone", "o'reilly", "advance auto", "car wash", "tire"],
  "Utilities": ["electric", "gas bill", "water bill", "sewer", "trash", "cable", "internet", "comcast", "xfinity", "verizon", "at&t", "t-mobile", "sprint", "spectrum", "optimum", "con edison", "coned", "pseg"],
  "Home & Living": ["rent", "mortgage", "insurance", "state farm", "geico", "allstate", "progressive", "liberty mutual", "cleaning", "maid", "lawn", "pest control"],
  "Kids & Family": ["daycare", "childcare", "school", "tuition", "baby", "toys r us", "children's place", "carter's", "buy buy baby", "tutoring"],
  "Personal Care": ["barber", "salon", "haircut", "spa", "nail", "gym", "planet fitness", "equinox", "la fitness", "orangetheory", "peloton", "yoga"],
  "Subscriptions": ["apple.com/bill", "google storage", "icloud", "dropbox", "microsoft", "adobe", "audible", "kindle", "patreon", "onlyfans"],
  "Transfers": ["venmo", "zelle", "paypal", "cash app", "transfer", "payment to", "payment from"],
};

function categorizeTransaction(name, plaidCategory) {
  const lower = (name || "").toLowerCase();
  for (const [cat, patterns] of Object.entries(CATEGORY_MAP)) {
    if (patterns.some(p => lower.includes(p))) return cat;
  }
  if (plaidCategory) {
    const pc = plaidCategory.toLowerCase();
    if (pc.includes("food") && pc.includes("groceries")) return "Groceries";
    if (pc.includes("food") || pc.includes("restaurant")) return "Eating Out";
    if (pc.includes("gas") || pc.includes("fuel")) return "Gas & Fuel";
    if (pc.includes("shops") || pc.includes("merchandise")) return "Shopping";
    if (pc.includes("entertainment") || pc.includes("recreation")) return "Entertainment";
    if (pc.includes("health") || pc.includes("medical") || pc.includes("pharmacy")) return "Health & Medical";
    if (pc.includes("travel") || pc.includes("transportation")) return "Transportation";
    if (pc.includes("utilities") || pc.includes("telecom")) return "Utilities";
    if (pc.includes("payment") || pc.includes("transfer")) return "Transfers";
    if (pc.includes("service") || pc.includes("subscription")) return "Subscriptions";
  }
  return "Other";
}

router.get("/summary", async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const { rows: txns } = await pool.query(
      `SELECT bt.*, ba.name as account_name, ba.account_type
       FROM bank_transactions bt
       LEFT JOIN bank_accounts ba ON bt.account_id = ba.account_id AND ba.user_id = bt.user_id
       WHERE bt.user_id = $1 AND bt.date >= CURRENT_DATE - $2::integer AND bt.amount > 0 AND bt.pending = false
       ORDER BY bt.date DESC`,
      [req.user.id, days]
    );

    const categorized = txns.map(tx => ({
      id: tx.id, name: tx.name, amount: parseFloat(tx.amount),
      date: tx.date ? (typeof tx.date === "string" ? tx.date.split("T")[0] : tx.date.toISOString().split("T")[0]) : "",
      accountName: tx.account_name || "", accountType: tx.account_type || "",
      category: categorizeTransaction(tx.name, tx.category),
      plaidCategory: tx.category,
    }));

    const categoryTotals = {};
    categorized.forEach(tx => {
      if (!categoryTotals[tx.category]) categoryTotals[tx.category] = { total: 0, count: 0, transactions: [] };
      categoryTotals[tx.category].total += tx.amount;
      categoryTotals[tx.category].count++;
      categoryTotals[tx.category].transactions.push(tx);
    });

    const categories = Object.entries(categoryTotals)
      .map(([name, data]) => ({ name, total: Math.round(data.total * 100) / 100, count: data.count, transactions: data.transactions }))
      .sort((a, b) => b.total - a.total);

    const totalSpent = categories.reduce((s, c) => s + c.total, 0);
    const dailyAvg = days > 0 ? totalSpent / days : 0;
    const biggest = categorized.length > 0 ? categorized.reduce((max, tx) => tx.amount > max.amount ? tx : max, categorized[0]) : null;

    const dayOfWeek = [0, 0, 0, 0, 0, 0, 0];
    categorized.forEach(tx => { const d = new Date(tx.date + "T12:00:00"); dayOfWeek[d.getDay()] += tx.amount; });

    const dailySpending = {};
    categorized.forEach(tx => { if (!dailySpending[tx.date]) dailySpending[tx.date] = 0; dailySpending[tx.date] += tx.amount; });

    const { rows: prevTxns } = await pool.query(
      `SELECT bt.name, bt.amount, bt.category FROM bank_transactions bt
       WHERE bt.user_id = $1 AND bt.date >= CURRENT_DATE - $2::integer AND bt.date < CURRENT_DATE - $3::integer AND bt.amount > 0 AND bt.pending = false`,
      [req.user.id, days * 2, days]
    );
    const prevCategoryTotals = {};
    prevTxns.forEach(tx => { const cat = categorizeTransaction(tx.name, tx.category); if (!prevCategoryTotals[cat]) prevCategoryTotals[cat] = 0; prevCategoryTotals[cat] += parseFloat(tx.amount); });
    const prevTotal = Object.values(prevCategoryTotals).reduce((s, v) => s + v, 0);

    categories.forEach(c => {
      c.prevTotal = Math.round((prevCategoryTotals[c.name] || 0) * 100) / 100;
      c.change = c.total - c.prevTotal;
      c.changePct = c.prevTotal > 0 ? Math.round(((c.total - c.prevTotal) / c.prevTotal) * 100) : null;
    });

    let budgets = [];
    try { const r = await pool.query("SELECT * FROM spending_budgets WHERE user_id = $1", [req.user.id]); budgets = r.rows; } catch (e) {}

    res.json({
      totalSpent: Math.round(totalSpent * 100) / 100, prevTotalSpent: Math.round(prevTotal * 100) / 100,
      dailyAvg: Math.round(dailyAvg * 100) / 100, txnCount: categorized.length, biggest, categories,
      dayOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => ({ day: d, total: Math.round(dayOfWeek[i] * 100) / 100 })),
      dailySpending: Object.entries(dailySpending).map(([date, total]) => ({ date, total: Math.round(total * 100) / 100 })).sort((a, b) => a.date.localeCompare(b.date)),
      budgets: budgets.map(b => ({ id: b.id, category: b.category, limit: parseFloat(b.monthly_limit), spent: (categories.find(c => c.name === b.category) || {}).total || 0 })),
      days,
    });
  } catch (err) {
    console.error("Spending summary error:", err.message);
    res.status(500).json({ error: "Failed to get spending summary", detail: err.message });
  }
});

router.get("/weekly", async (req, res) => {
  try {
    const { rows: txns } = await pool.query(
      `SELECT bt.name, bt.amount, bt.category, bt.date FROM bank_transactions bt
       WHERE bt.user_id = $1 AND bt.date >= CURRENT_DATE - 7 AND bt.amount > 0 AND bt.pending = false
       ORDER BY bt.date DESC`, [req.user.id]
    );
    const categorized = {}; let total = 0;
    txns.forEach(tx => { const cat = categorizeTransaction(tx.name, tx.category); if (!categorized[cat]) categorized[cat] = 0; categorized[cat] += parseFloat(tx.amount); total += parseFloat(tx.amount); });
    const breakdown = Object.entries(categorized).map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount);
    res.json({ total: Math.round(total * 100) / 100, breakdown, txnCount: txns.length });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.post("/budgets", async (req, res) => {
  try {
    const { category, monthlyLimit } = req.body;
    if (!category || !monthlyLimit) return res.status(400).json({ error: "Category and limit required" });
    const { rows } = await pool.query(`INSERT INTO spending_budgets (user_id, category, monthly_limit) VALUES ($1, $2, $3) ON CONFLICT (user_id, category) DO UPDATE SET monthly_limit = $3 RETURNING *`, [req.user.id, category, monthlyLimit]);
    res.json({ id: rows[0].id, category: rows[0].category, limit: parseFloat(rows[0].monthly_limit) });
  } catch (err) { res.status(500).json({ error: "Failed to save budget" }); }
});

router.delete("/budgets/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM spending_budgets WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// PATCH /api/spending/transactions/:id - Recategorize a transaction
router.patch("/transactions/:id", async (req, res) => {
  try {
    const { category } = req.body;
    if (!category) return res.status(400).json({ error: "Category required" });
    await pool.query(
      "UPDATE bank_transactions SET category = $1 WHERE id = $2 AND user_id = $3",
      [category, req.params.id, req.user.id]
    );
    res.json({ success: true, category });
  } catch (err) {
    console.error("Recategorize error:", err);
    res.status(500).json({ error: "Failed to update category" });
  }
});

module.exports = router;
