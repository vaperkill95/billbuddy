const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

// GET /api/household - Get user's household/joint setup
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT h.*, hm.role FROM households h
       JOIN household_members hm ON h.id = hm.household_id
       WHERE hm.user_id = $1 LIMIT 1`, [req.user.id]
    );
    if (!rows.length) return res.json(null);

    const hh = rows[0];
    const { rows: members } = await pool.query(
      `SELECT hm.*, u.name, u.email FROM household_members hm
       JOIN users u ON hm.user_id = u.id
       WHERE hm.household_id = $1 ORDER BY hm.joined_at`, [hh.id]
    );

    const { rows: bills } = await pool.query(
      "SELECT * FROM household_bills WHERE household_id = $1 ORDER BY due_date", [hh.id]
    );
    for (const bill of bills) {
      const { rows: splits } = await pool.query(
        `SELECT hs.*, u.name FROM household_splits hs
         JOIN users u ON hs.user_id = u.id WHERE hs.household_bill_id = $1`, [bill.id]
      );
      bill.splits = splits.map(s => ({
        id: s.id, userId: s.user_id, name: s.name,
        amount: parseFloat(s.split_amount), isPaid: s.is_paid, paidAt: s.paid_at,
      }));
    }

    const result = {
      id: hh.id, name: hh.name, mode: hh.mode || "household",
      inviteCode: hh.invite_code, role: hh.role,
      isOwner: hh.owner_id === req.user.id,
      members: members.map(m => ({ id: m.user_id, name: m.name, email: m.email, role: m.role, joinedAt: m.joined_at })),
      bills: bills.map(b => ({
        id: b.id, name: b.bill_name, totalAmount: parseFloat(b.total_amount),
        dueDate: b.due_date, category: b.category, isRecurring: b.is_recurring, splits: b.splits,
      })),
    };

    // For JOINT mode, pull each member's full financial data
    if ((hh.mode || "household") === "joint") {
      const memberData = {};
      for (const m of members) {
        const uid = m.user_id;
        const [billsRes, cardsRes, accountsRes, txnsRes, incomeRes] = await Promise.all([
          pool.query("SELECT * FROM bills WHERE user_id = $1 ORDER BY due_date", [uid]),
          pool.query("SELECT * FROM credit_cards WHERE user_id = $1", [uid]),
          pool.query(`SELECT ba.*, pi.institution_name FROM bank_accounts ba LEFT JOIN plaid_items pi ON ba.plaid_item_id = pi.id WHERE ba.user_id = $1`, [uid]),
          pool.query(`SELECT bt.*, ba.name as account_name, ba.mask FROM bank_transactions bt LEFT JOIN bank_accounts ba ON bt.account_id = ba.account_id AND ba.user_id = bt.user_id WHERE bt.user_id = $1 AND bt.date >= CURRENT_DATE - 30 ORDER BY bt.date DESC LIMIT 100`, [uid]),
          pool.query("SELECT * FROM income_sources WHERE user_id = $1 AND is_active = true", [uid]),
        ]);

        memberData[uid] = {
          name: m.name,
          bills: billsRes.rows.map(r => ({ id: r.id, name: r.name, amount: parseFloat(r.amount), dueDate: r.due_date, category: r.category, isPaid: r.is_paid, isRecurring: r.is_recurring })),
          cards: cardsRes.rows.map(r => ({ id: r.id, name: r.name, balance: parseFloat(r.balance), creditLimit: parseFloat(r.credit_limit), apr: parseFloat(r.apr), minPayment: parseFloat(r.min_payment), dueDate: r.due_date })),
          accounts: accountsRes.rows.map(r => ({ id: r.id, name: r.name, type: r.account_type, subtype: r.account_subtype, balanceCurrent: parseFloat(r.balance_current || 0), balanceAvailable: parseFloat(r.balance_available || 0), mask: r.mask, institution: r.institution_name })),
          transactions: txnsRes.rows.map(r => ({ id: r.id, name: r.name, amount: parseFloat(r.amount), date: r.date.toISOString().split("T")[0], pending: r.pending, accountName: r.account_name, mask: r.mask })),
          income: incomeRes.rows.map(r => ({ id: r.id, name: r.name, amount: parseFloat(r.amount), frequency: r.frequency })),
        };
      }
      result.memberData = memberData;

      const allMembers = Object.values(memberData);
      result.combined = {
        totalBankBalance: allMembers.reduce((s, m) => s + m.accounts.reduce((a, acc) => a + acc.balanceCurrent, 0), 0),
        totalCardDebt: allMembers.reduce((s, m) => s + m.cards.reduce((a, c) => a + c.balance, 0), 0),
        totalMonthlyBills: allMembers.reduce((s, m) => s + m.bills.reduce((a, b) => a + b.amount, 0), 0),
        totalMonthlyIncome: allMembers.reduce((s, m) => {
          return s + m.income.reduce((a, src) => {
            const amt = src.amount;
            switch (src.frequency) { case "weekly": return a + amt * 4.33; case "biweekly": return a + amt * 2.17; case "semimonthly": return a + amt * 2; case "yearly": return a + amt / 12; default: return a + amt; }
          }, 0);
        }, 0),
      };
    }

    res.json(result);
  } catch (err) {
    console.error("Household get error:", err);
    res.status(500).json({ error: "Failed to fetch household" });
  }
});

// POST /api/household/create
router.post("/create", async (req, res) => {
  try {
    const { name, mode } = req.body;
    const { rows: existing } = await pool.query("SELECT id FROM household_members WHERE user_id = $1", [req.user.id]);
    if (existing.length) return res.status(400).json({ error: "You're already in a household or joint. Leave first." });
    const inviteCode = crypto.randomBytes(4).toString("hex").toUpperCase();
    const { rows } = await pool.query(
      "INSERT INTO households (name, owner_id, invite_code, mode) VALUES ($1, $2, $3, $4) RETURNING *",
      [name || (mode === "joint" ? "Our Finances" : "My Household"), req.user.id, inviteCode, mode || "household"]
    );
    await pool.query("INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner')", [rows[0].id, req.user.id]);
    res.json({ id: rows[0].id, name: rows[0].name, inviteCode, mode: rows[0].mode });
  } catch (err) { res.status(500).json({ error: "Failed to create" }); }
});

// POST /api/household/join
router.post("/join", async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ error: "Invite code required" });
    const { rows: existing } = await pool.query("SELECT id FROM household_members WHERE user_id = $1", [req.user.id]);
    if (existing.length) return res.status(400).json({ error: "You're already in a household" });
    const { rows: hh } = await pool.query("SELECT * FROM households WHERE invite_code = $1", [inviteCode.toUpperCase()]);
    if (!hh.length) return res.status(404).json({ error: "Invalid invite code" });
    await pool.query("INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'member')", [hh[0].id, req.user.id]);
    res.json({ success: true, householdName: hh[0].name, mode: hh[0].mode });
  } catch (err) { res.status(500).json({ error: "Failed to join" }); }
});

// POST /api/household/bills
router.post("/bills", async (req, res) => {
  try {
    const { name, totalAmount, dueDate, category, splits: customSplits, assignTo } = req.body;
    const { rows: hm } = await pool.query("SELECT household_id FROM household_members WHERE user_id = $1", [req.user.id]);
    if (!hm.length) return res.status(400).json({ error: "Not in a household" });
    const hhId = hm[0].household_id;
    const { rows } = await pool.query(
      `INSERT INTO household_bills (household_id, bill_name, total_amount, due_date, category, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [hhId, name, totalAmount, dueDate, category || "Other", req.user.id]
    );
    const billId = rows[0].id;
    const { rows: members } = await pool.query("SELECT user_id FROM household_members WHERE household_id = $1", [hhId]);

    if (assignTo) {
      // Assign entire bill to one person
      await pool.query("INSERT INTO household_splits (household_bill_id, user_id, split_amount) VALUES ($1, $2, $3)", [billId, assignTo, totalAmount]);
    } else if (customSplits && customSplits.length) {
      for (const sp of customSplits) {
        await pool.query("INSERT INTO household_splits (household_bill_id, user_id, split_amount) VALUES ($1, $2, $3)", [billId, sp.userId, sp.amount]);
      }
    } else {
      const splitAmount = Math.round((totalAmount / members.length) * 100) / 100;
      for (const m of members) {
        await pool.query("INSERT INTO household_splits (household_bill_id, user_id, split_amount) VALUES ($1, $2, $3)", [billId, m.user_id, splitAmount]);
      }
    }
    res.json({ id: billId, name, totalAmount });
  } catch (err) { res.status(500).json({ error: "Failed to add bill" }); }
});

// PATCH /api/household/splits/:splitId/pay
router.patch("/splits/:splitId/pay", async (req, res) => {
  try {
    await pool.query("UPDATE household_splits SET is_paid = NOT is_paid, paid_at = CASE WHEN is_paid THEN NULL ELSE NOW() END WHERE id = $1 AND user_id = $2", [req.params.splitId, req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to update" }); }
});

// DELETE /api/household/bills/:billId
router.delete("/bills/:billId", async (req, res) => {
  try {
    await pool.query("DELETE FROM household_bills WHERE id = $1", [req.params.billId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to delete" }); }
});

// DELETE /api/household/leave
router.delete("/leave", async (req, res) => {
  try {
    const { rows: hm } = await pool.query(
      "SELECT hm.*, h.owner_id FROM household_members hm JOIN households h ON hm.household_id = h.id WHERE hm.user_id = $1", [req.user.id]
    );
    if (!hm.length) return res.status(400).json({ error: "Not in a household" });
    if (hm[0].owner_id === req.user.id) {
      await pool.query("DELETE FROM households WHERE id = $1", [hm[0].household_id]);
    } else {
      await pool.query("DELETE FROM household_members WHERE user_id = $1 AND household_id = $2", [req.user.id, hm[0].household_id]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to leave" }); }
});

module.exports = router;
