const pool = require("../db/pool");

const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Generate weekly summary data for a user
async function getWeeklySummary(userId) {
  try {
    // Bills due in next 7 days
    const today = new Date();
    const dayOfMonth = today.getDate();
    const { rows: bills } = await pool.query(
      "SELECT * FROM bills WHERE user_id = $1 AND is_paid = false ORDER BY due_date ASC", [userId]
    );
    const upcomingBills = bills.filter(b => {
      const daysUntil = b.due_date - dayOfMonth;
      return daysUntil >= 0 && daysUntil <= 7;
    });
    const overdueBills = bills.filter(b => b.due_date < dayOfMonth);
    const totalUpcoming = upcomingBills.reduce((s, b) => s + parseFloat(b.amount), 0);

    // Bank balance
    const { rows: accounts } = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN balance_available > 0 THEN balance_available ELSE balance_current END), 0) as total FROM bank_accounts WHERE user_id = $1 AND account_type != 'credit'", [userId]
    );
    const bankBalance = parseFloat(accounts[0].total);

    // Credit card debt
    const { rows: cards } = await pool.query(
      "SELECT COALESCE(SUM(balance), 0) as total FROM credit_cards WHERE user_id = $1", [userId]
    );
    const cardDebt = parseFloat(cards[0].total);

    // Income this month
    const thisMonth = `${FULL_MONTHS[today.getMonth()]} ${today.getFullYear()}`;
    const { rows: income } = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) as total FROM income_entries WHERE user_id = $1 AND month_label = $2", [userId, thisMonth]
    );
    const monthlyIncome = parseFloat(income[0].total);

    // Total monthly bills
    const totalMonthlyBills = bills.reduce((s, b) => s + parseFloat(b.amount), 0) +
      upcomingBills.reduce((s, b) => s + parseFloat(b.amount), 0);

    return {
      upcomingBills: upcomingBills.map(b => ({ name: b.name, amount: parseFloat(b.amount), dueDate: b.due_date })),
      overdueBills: overdueBills.map(b => ({ name: b.name, amount: parseFloat(b.amount), dueDate: b.due_date })),
      totalUpcoming,
      bankBalance,
      cardDebt,
      monthlyIncome,
      remainingAfterBills: bankBalance - totalUpcoming,
    };
  } catch (err) {
    console.error("Weekly summary error:", err);
    return null;
  }
}

// Generate the email HTML for weekly summary
function generateSummaryEmail(userName, summary) {
  const formatMoney = (n) => "$" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F3FF;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:500px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#6C5CE7,#A29BFE);border-radius:20px;padding:30px;text-align:center;color:white;">
    <div style="font-size:36px;margin-bottom:8px;">💸</div>
    <h1 style="margin:0;font-size:24px;">BillBuddy Weekly Summary</h1>
    <p style="margin:4px 0 0;opacity:0.8;font-size:14px;">Hey ${userName}! Here's your financial snapshot.</p>
  </div>

  <div style="background:white;border-radius:16px;padding:24px;margin-top:16px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <h2 style="margin:0 0 16px;font-size:16px;color:#2D3436;">💰 Account Overview</h2>
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;">
      <span style="color:#888;">Bank Balance</span>
      <strong style="color:#4ECDC4;">${formatMoney(summary.bankBalance)}</strong>
    </div>
    ${summary.cardDebt > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;">
      <span style="color:#888;">Credit Card Debt</span>
      <strong style="color:#FF6B6B;">${formatMoney(summary.cardDebt)}</strong>
    </div>` : ""}
    <div style="display:flex;justify-content:space-between;padding:8px 0;">
      <span style="color:#888;">Income This Month</span>
      <strong style="color:#4ECDC4;">${formatMoney(summary.monthlyIncome)}</strong>
    </div>
  </div>

  ${summary.overdueBills.length > 0 ? `
  <div style="background:#FFF5F5;border-radius:16px;padding:24px;margin-top:16px;border-left:4px solid #FF6B6B;">
    <h2 style="margin:0 0 12px;font-size:16px;color:#FF6B6B;">⚠️ Overdue Bills</h2>
    ${summary.overdueBills.map(b => `<div style="display:flex;justify-content:space-between;padding:6px 0;"><span>${b.name}</span><strong style="color:#FF6B6B;">${formatMoney(b.amount)}</strong></div>`).join("")}
  </div>` : ""}

  ${summary.upcomingBills.length > 0 ? `
  <div style="background:white;border-radius:16px;padding:24px;margin-top:16px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <h2 style="margin:0 0 12px;font-size:16px;color:#2D3436;">📅 Due This Week</h2>
    ${summary.upcomingBills.map(b => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f5f5f5;"><span>${b.name} <small style="color:#888;">(${b.dueDate}th)</small></span><strong>${formatMoney(b.amount)}</strong></div>`).join("")}
    <div style="display:flex;justify-content:space-between;padding:12px 0 0;margin-top:8px;border-top:2px solid #eee;">
      <strong>Total Due</strong>
      <strong style="color:#6C5CE7;">${formatMoney(summary.totalUpcoming)}</strong>
    </div>
  </div>` : `
  <div style="background:#F0FFF4;border-radius:16px;padding:24px;margin-top:16px;text-align:center;">
    <div style="font-size:28px;margin-bottom:8px;">✅</div>
    <p style="margin:0;color:#4ECDC4;font-weight:700;">No bills due this week!</p>
  </div>`}

  <div style="background:${summary.remainingAfterBills >= 0 ? '#F0FFF4' : '#FFF5F5'};border-radius:16px;padding:24px;margin-top:16px;text-align:center;">
    <p style="margin:0 0 4px;color:#888;font-size:13px;">After upcoming bills, you'll have</p>
    <p style="margin:0;font-size:28px;font-weight:800;color:${summary.remainingAfterBills >= 0 ? '#4ECDC4' : '#FF6B6B'};">${formatMoney(summary.remainingAfterBills)}</p>
  </div>

  <div style="text-align:center;margin-top:24px;">
    <a href="https://billbuddy-production-2e6b.up.railway.app" style="display:inline-block;background:linear-gradient(135deg,#6C5CE7,#A29BFE);color:white;text-decoration:none;padding:14px 32px;border-radius:14px;font-weight:700;font-size:14px;">Open BillBuddy</a>
  </div>

  <p style="text-align:center;color:#aaa;font-size:11px;margin-top:20px;">You're receiving this because you have email notifications enabled in BillBuddy.</p>
</div>
</body>
</html>`;
}

module.exports = { getWeeklySummary, generateSummaryEmail };
