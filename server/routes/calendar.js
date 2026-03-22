const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

// Helper: format date as iCal YYYYMMDD
function icalDate(year, month, day) {
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

// Helper: generate a UID for an event
function eventUid(prefix, id, year, month) {
  return `${prefix}-${id}-${year}${String(month).padStart(2, "0")}@billbuddy`;
}

// Helper: escape iCal text
function esc(text) {
  return (text || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// ─── Generate / get calendar token (requires auth) ───

router.post("/token", authMiddleware, async (req, res) => {
  try {
    // Check if user already has a token
    const { rows } = await pool.query("SELECT calendar_token FROM users WHERE id=$1", [req.user.id]);
    let token = rows[0]?.calendar_token;

    if (!token) {
      // Generate a new unique token
      token = crypto.randomBytes(32).toString("hex");
      await pool.query("UPDATE users SET calendar_token=$1 WHERE id=$2", [token, req.user.id]);
    }

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const feedUrl = `${baseUrl}/api/calendar/feed/${token}`;

    res.json({ token, feedUrl });
  } catch (err) {
    console.error("Calendar token error:", err);
    res.status(500).json({ error: "Failed to generate calendar token" });
  }
});

// Regenerate token (invalidates old feed URL)
router.post("/token/reset", authMiddleware, async (req, res) => {
  try {
    const token = crypto.randomBytes(32).toString("hex");
    await pool.query("UPDATE users SET calendar_token=$1 WHERE id=$2", [token, req.user.id]);
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    res.json({ token, feedUrl: `${baseUrl}/api/calendar/feed/${token}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset token" });
  }
});

// ─── Public iCal feed (no auth - uses token) ───

router.get("/feed/:token", async (req, res) => {
  try {
    const { token } = req.params;

    // Find user by token
    const { rows: users } = await pool.query("SELECT id, name FROM users WHERE calendar_token=$1", [token]);
    if (!users.length) {
      return res.status(404).send("Calendar feed not found");
    }
    const user = users[0];

    // Get user's bills
    const { rows: bills } = await pool.query(
      "SELECT * FROM bills WHERE user_id=$1 ORDER BY due_date ASC", [user.id]
    );

    // Get user's credit cards
    const { rows: cards } = await pool.query(
      "SELECT * FROM credit_cards WHERE user_id=$1 ORDER BY due_date ASC", [user.id]
    );

    // Build iCal
    const now = new Date();
    const year = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let ical = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//BillBuddy//Bill Tracker//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:BillBuddy - ${esc(user.name)}`,
      "X-WR-TIMEZONE:America/New_York",
      "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
      "X-PUBLISHED-TTL:PT6H",
    ];

    // Generate events for bills (current month + next 2 months)
    for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
      let m = currentMonth + monthOffset;
      let y = year;
      if (m > 12) { m -= 12; y++; }

      const daysInMonth = new Date(y, m, 0).getDate();

      bills.forEach(bill => {
        const dueDay = Math.min(bill.due_date, daysInMonth);
        const dateStr = icalDate(y, m, dueDay);
        const nextDay = dueDay + 1 <= daysInMonth ? icalDate(y, m, dueDay + 1) : icalDate(y, m === 12 ? 1 : m + 1, 1);
        const amount = parseFloat(bill.amount);
        const isPaid = bill.is_paid && monthOffset === 0;
        const status = isPaid ? "✅ PAID" : "💸 DUE";

        const reminderDays = { "1day": 1, "3days": 3, "1week": 7, "sameday": 0 };
        const reminderVal = reminderDays[bill.reminder];

        ical.push("BEGIN:VEVENT");
        ical.push(`UID:${eventUid("bill", bill.id, y, m)}`);
        ical.push(`DTSTART;VALUE=DATE:${dateStr}`);
        ical.push(`DTEND;VALUE=DATE:${nextDay}`);
        ical.push(`SUMMARY:${status} ${esc(bill.name)} - $${amount.toFixed(2)}`);
        ical.push(`DESCRIPTION:${esc(bill.name)}\\nAmount: $${amount.toFixed(2)}\\nCategory: ${esc(bill.category)}\\nDue: ${dueDay}th of every month${isPaid ? "\\n\\nStatus: PAID ✅" : "\\n\\nStatus: UNPAID"}`);
        ical.push(`CATEGORIES:${esc(bill.category)}`);
        if (bill.is_recurring) {
          ical.push(`RRULE:FREQ=MONTHLY;BYMONTHDAY=${bill.due_date}`);
        }
        if (reminderVal !== undefined && !isPaid) {
          ical.push("BEGIN:VALARM");
          ical.push("ACTION:DISPLAY");
          ical.push(`DESCRIPTION:${esc(bill.name)} - $${amount.toFixed(2)} is due${reminderVal > 0 ? ` in ${reminderVal} day${reminderVal > 1 ? "s" : ""}` : " today"}!`);
          ical.push(`TRIGGER:-P${reminderVal}D`);
          ical.push("END:VALARM");
        }
        ical.push("END:VEVENT");
      });

      // Credit card due dates
      cards.forEach(card => {
        const balance = parseFloat(card.balance);
        if (balance <= 0) return;
        const dueDay = Math.min(card.due_date, daysInMonth);
        const dateStr = icalDate(y, m, dueDay);
        const nextDay = dueDay + 1 <= daysInMonth ? icalDate(y, m, dueDay + 1) : icalDate(y, m === 12 ? 1 : m + 1, 1);
        const minPay = parseFloat(card.min_payment);

        ical.push("BEGIN:VEVENT");
        ical.push(`UID:${eventUid("card", card.id, y, m)}`);
        ical.push(`DTSTART;VALUE=DATE:${dateStr}`);
        ical.push(`DTEND;VALUE=DATE:${nextDay}`);
        ical.push(`SUMMARY:💳 ${esc(card.name)} Payment Due - Min $${minPay.toFixed(2)}`);
        ical.push(`DESCRIPTION:${esc(card.name)}\\nBalance: $${balance.toFixed(2)}\\nMinimum Payment: $${minPay.toFixed(2)}\\nAPR: ${parseFloat(card.apr)}%\\nDue: ${dueDay}th`);
        ical.push("CATEGORIES:Credit Card");
        // 1 day reminder for cards
        ical.push("BEGIN:VALARM");
        ical.push("ACTION:DISPLAY");
        ical.push(`DESCRIPTION:💳 ${esc(card.name)} payment of $${minPay.toFixed(2)} is due tomorrow!`);
        ical.push("TRIGGER:-P1D");
        ical.push("END:VALARM");
        ical.push("END:VEVENT");
      });

      // Only generate recurring events for the first month to avoid duplicates with RRULE
      if (monthOffset === 0) break;
    }

    ical.push("END:VCALENDAR");

    const icalString = ical.join("\r\n");

    res.set({
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "attachment; filename=billbuddy.ics",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    });
    res.send(icalString);
  } catch (err) {
    console.error("Calendar feed error:", err);
    res.status(500).send("Failed to generate calendar feed");
  }
});

module.exports = router;
