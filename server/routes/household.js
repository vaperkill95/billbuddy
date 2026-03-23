const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

// GET /api/household - Get user's household
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

    // Get splits for each bill
    for (const bill of bills) {
      const { rows: splits } = await pool.query(
        `SELECT hs.*, u.name FROM household_splits hs
         JOIN users u ON hs.user_id = u.id
         WHERE hs.household_bill_id = $1`, [bill.id]
      );
      bill.splits = splits.map(s => ({
        id: s.id, userId: s.user_id, name: s.name,
        amount: parseFloat(s.split_amount), isPaid: s.is_paid, paidAt: s.paid_at,
      }));
    }

    res.json({
      id: hh.id, name: hh.name, inviteCode: hh.invite_code, role: hh.role,
      isOwner: hh.owner_id === req.user.id,
      members: members.map(m => ({ id: m.user_id, name: m.name, email: m.email, role: m.role, joinedAt: m.joined_at })),
      bills: bills.map(b => ({
        id: b.id, name: b.bill_name, totalAmount: parseFloat(b.total_amount),
        dueDate: b.due_date, category: b.category, isRecurring: b.is_recurring,
        splits: b.splits,
      })),
    });
  } catch (err) {
    console.error("Household get error:", err);
    res.status(500).json({ error: "Failed to fetch household" });
  }
});

// POST /api/household/create - Create a new household
router.post("/create", async (req, res) => {
  try {
    const { name } = req.body;
    // Check if user already in a household
    const { rows: existing } = await pool.query(
      "SELECT id FROM household_members WHERE user_id = $1", [req.user.id]
    );
    if (existing.length) return res.status(400).json({ error: "You're already in a household. Leave first to create a new one." });

    const inviteCode = crypto.randomBytes(4).toString("hex").toUpperCase();
    const { rows } = await pool.query(
      "INSERT INTO households (name, owner_id, invite_code) VALUES ($1, $2, $3) RETURNING *",
      [name || "My Household", req.user.id, inviteCode]
    );
    await pool.query(
      "INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner')",
      [rows[0].id, req.user.id]
    );
    res.json({ id: rows[0].id, name: rows[0].name, inviteCode });
  } catch (err) {
    console.error("Household create error:", err);
    res.status(500).json({ error: "Failed to create household" });
  }
});

// POST /api/household/join - Join with invite code
router.post("/join", async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ error: "Invite code required" });

    const { rows: existing } = await pool.query(
      "SELECT id FROM household_members WHERE user_id = $1", [req.user.id]
    );
    if (existing.length) return res.status(400).json({ error: "You're already in a household" });

    const { rows: hh } = await pool.query(
      "SELECT * FROM households WHERE invite_code = $1", [inviteCode.toUpperCase()]
    );
    if (!hh.length) return res.status(404).json({ error: "Invalid invite code" });

    await pool.query(
      "INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'member')",
      [hh[0].id, req.user.id]
    );
    res.json({ success: true, householdName: hh[0].name });
  } catch (err) {
    console.error("Household join error:", err);
    res.status(500).json({ error: "Failed to join household" });
  }
});

// POST /api/household/bills - Add a shared bill
router.post("/bills", async (req, res) => {
  try {
    const { name, totalAmount, dueDate, category, splitType } = req.body;
    // Get user's household
    const { rows: hm } = await pool.query(
      "SELECT household_id FROM household_members WHERE user_id = $1", [req.user.id]
    );
    if (!hm.length) return res.status(400).json({ error: "Not in a household" });
    const hhId = hm[0].household_id;

    const { rows } = await pool.query(
      `INSERT INTO household_bills (household_id, bill_name, total_amount, due_date, category, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [hhId, name, totalAmount, dueDate, category || "Other", req.user.id]
    );
    const billId = rows[0].id;

    // Get all members and create even splits by default
    const { rows: members } = await pool.query(
      "SELECT user_id FROM household_members WHERE household_id = $1", [hhId]
    );
    const splitAmount = Math.round((totalAmount / members.length) * 100) / 100;

    for (const m of members) {
      await pool.query(
        "INSERT INTO household_splits (household_bill_id, user_id, split_amount) VALUES ($1, $2, $3)",
        [billId, m.user_id, splitAmount]
      );
    }

    res.json({ id: billId, name, totalAmount, splitPerPerson: splitAmount, memberCount: members.length });
  } catch (err) {
    console.error("Household bill error:", err);
    res.status(500).json({ error: "Failed to add bill" });
  }
});

// PATCH /api/household/splits/:splitId/pay - Mark your split as paid
router.patch("/splits/:splitId/pay", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE household_splits SET is_paid = true, paid_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *",
      [req.params.splitId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Split not found" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to update" }); }
});

// DELETE /api/household/leave - Leave household
router.delete("/leave", async (req, res) => {
  try {
    const { rows: hm } = await pool.query(
      "SELECT hm.*, h.owner_id FROM household_members hm JOIN households h ON hm.household_id = h.id WHERE hm.user_id = $1",
      [req.user.id]
    );
    if (!hm.length) return res.status(400).json({ error: "Not in a household" });

    if (hm[0].owner_id === req.user.id) {
      // Owner leaving = delete household
      await pool.query("DELETE FROM households WHERE id = $1", [hm[0].household_id]);
    } else {
      await pool.query("DELETE FROM household_members WHERE user_id = $1", [req.user.id]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to leave" }); }
});

module.exports = router;
