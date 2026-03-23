const express = require("express");
const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require("plaid");
const router = express.Router();
const pool = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");

router.use(authMiddleware);

// Initialize Plaid client
const plaidEnv = process.env.PLAID_ENV || "sandbox";
const configuration = new Configuration({
  basePath: PlaidEnvironments[plaidEnv],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});
const plaidClient = new PlaidApi(configuration);

// POST /api/plaid/create-link-token - Generate link token for Plaid Link
router.post("/create-link-token", async (req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: String(req.user.id) },
      client_name: "BillBuddy",
      products: [Products.Transactions, Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    res.json({ linkToken: response.data.link_token });
  } catch (err) {
    console.error("Plaid link token error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to create link token" });
  }
});

// POST /api/plaid/exchange-token - Exchange public token for access token
router.post("/exchange-token", async (req, res) => {
  try {
    const { publicToken, institution } = req.body;
    if (!publicToken) return res.status(400).json({ error: "publicToken is required" });

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Save the item
    const { rows } = await pool.query(
      `INSERT INTO plaid_items (user_id, access_token, item_id, institution_name, institution_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.id, accessToken, itemId, institution?.name || "Bank", institution?.institution_id || null]
    );
    const plaidItemId = rows[0].id;

    // Fetch accounts
    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
    const accounts = accountsResponse.data.accounts;

    for (const acct of accounts) {
      await pool.query(
        `INSERT INTO bank_accounts (user_id, plaid_item_id, account_id, name, official_name, account_type, account_subtype, balance_current, balance_available, mask)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (account_id) DO UPDATE SET balance_current=$8, balance_available=$9, last_synced=NOW()`,
        [req.user.id, plaidItemId, acct.account_id, acct.name, acct.official_name,
         acct.type, acct.subtype, acct.balances.current || 0, acct.balances.available || 0, acct.mask]
      );
    }

    res.json({
      success: true,
      institutionName: institution?.name || "Bank",
      accountCount: accounts.length,
    });
  } catch (err) {
    console.error("Plaid exchange error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to connect bank account" });
  }
});

// GET /api/plaid/accounts - Get all connected bank accounts
router.get("/accounts", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ba.*, pi.institution_name FROM bank_accounts ba
       JOIN plaid_items pi ON ba.plaid_item_id = pi.id
       WHERE ba.user_id = $1
       ORDER BY pi.institution_name, ba.name`,
      [req.user.id]
    );
    res.json(rows.map(r => ({
      id: r.id, accountId: r.account_id, name: r.name, officialName: r.official_name,
      type: r.account_type, subtype: r.account_subtype,
      balanceCurrent: parseFloat(r.balance_current), balanceAvailable: parseFloat(r.balance_available),
      mask: r.mask, institution: r.institution_name, lastSynced: r.last_synced,
    })));
  } catch (err) { res.status(500).json({ error: "Failed to fetch accounts" }); }
});

// POST /api/plaid/sync-balances - Refresh balances for all connected accounts
router.post("/sync-balances", async (req, res) => {
  try {
    const { rows: items } = await pool.query(
      "SELECT * FROM plaid_items WHERE user_id = $1", [req.user.id]
    );

    let totalUpdated = 0;
    for (const item of items) {
      try {
        const response = await plaidClient.accountsGet({ access_token: item.access_token });
        for (const acct of response.data.accounts) {
          await pool.query(
            `UPDATE bank_accounts SET balance_current=$1, balance_available=$2, last_synced=NOW()
             WHERE account_id=$3 AND user_id=$4`,
            [acct.balances.current || 0, acct.balances.available || 0, acct.account_id, req.user.id]
          );
          totalUpdated++;
        }
      } catch (itemErr) {
        console.error(`Failed to sync item ${item.id}:`, itemErr.message);
      }
    }

    res.json({ success: true, accountsUpdated: totalUpdated });
  } catch (err) { res.status(500).json({ error: "Failed to sync balances" }); }
});

// POST /api/plaid/sync-transactions - Fetch recent transactions
router.post("/sync-transactions", async (req, res) => {
  try {
    const { rows: items } = await pool.query(
      "SELECT * FROM plaid_items WHERE user_id = $1", [req.user.id]
    );

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = thirtyDaysAgo.toISOString().split("T")[0];
    const endDate = now.toISOString().split("T")[0];

    let totalNew = 0;
    for (const item of items) {
      try {
        const response = await plaidClient.transactionsGet({
          access_token: item.access_token,
          start_date: startDate,
          end_date: endDate,
          options: { count: 100 },
        });

        for (const txn of response.data.transactions) {
          try {
            await pool.query(
              `INSERT INTO bank_transactions (user_id, account_id, transaction_id, name, amount, date, category, pending)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (transaction_id) DO UPDATE SET amount=$5, pending=$8, name=$4`,
              [req.user.id, txn.account_id, txn.transaction_id, txn.name,
               txn.amount, txn.date, txn.category?.[0] || "Other", txn.pending]
            );
            totalNew++;
          } catch (txnErr) { /* duplicate, skip */ }
        }
      } catch (itemErr) {
        console.error(`Failed to sync transactions for item ${item.id}:`, itemErr.message);
      }
    }

    res.json({ success: true, transactionsProcessed: totalNew });
  } catch (err) { res.status(500).json({ error: "Failed to sync transactions" }); }
});

// GET /api/plaid/transactions - Get stored transactions
router.get("/transactions", async (req, res) => {
  try {
    const { days } = req.query;
    const d = parseInt(days) || 30;
    const { rows } = await pool.query(
      `SELECT bt.*, ba.name as account_name, ba.mask, pi.institution_name
       FROM bank_transactions bt
       JOIN bank_accounts ba ON bt.account_id = ba.account_id AND ba.user_id = bt.user_id
       JOIN plaid_items pi ON ba.plaid_item_id = pi.id
       WHERE bt.user_id = $1 AND bt.date >= CURRENT_DATE - $2::integer
       ORDER BY bt.date DESC, bt.id DESC
       LIMIT 200`,
      [req.user.id, d]
    );
    res.json(rows.map(r => ({
      id: r.id, transactionId: r.transaction_id, name: r.name,
      amount: parseFloat(r.amount), date: r.date.toISOString().split("T")[0],
      category: r.category, pending: r.pending,
      accountId: r.account_id, accountName: r.account_name, mask: r.mask, institution: r.institution_name,
    })));
  } catch (err) { res.status(500).json({ error: "Failed to fetch transactions" }); }
});

// GET /api/plaid/summary - Dashboard summary of all bank data
router.get("/summary", async (req, res) => {
  try {
    // Total balances by type
    const { rows: accounts } = await pool.query(
      `SELECT ba.*, pi.institution_name FROM bank_accounts ba
       JOIN plaid_items pi ON ba.plaid_item_id = pi.id
       WHERE ba.user_id = $1`,
      [req.user.id]
    );

    let totalChecking = 0, totalSavings = 0, totalOther = 0;
    accounts.forEach(a => {
      const bal = parseFloat(a.balance_current) || 0;
      if (a.account_subtype === "checking") totalChecking += bal;
      else if (a.account_subtype === "savings" || a.account_subtype === "cd" || a.account_subtype === "money market") totalSavings += bal;
      else totalOther += bal;
    });

    // Recent spending (last 30 days, positive amounts = money out in Plaid)
    const { rows: spendingRows } = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM bank_transactions
       WHERE user_id = $1 AND amount > 0 AND date >= CURRENT_DATE - 30 AND pending = false`,
      [req.user.id]
    );
    const thirtyDaySpending = parseFloat(spendingRows[0].total);

    // Recent income (negative amounts = money in, in Plaid)
    const { rows: incomeRows } = await pool.query(
      `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM bank_transactions
       WHERE user_id = $1 AND amount < 0 AND date >= CURRENT_DATE - 30 AND pending = false`,
      [req.user.id]
    );
    const thirtyDayIncome = parseFloat(incomeRows[0].total);

    // Spending by category
    const { rows: catRows } = await pool.query(
      `SELECT category, SUM(amount) as total FROM bank_transactions
       WHERE user_id = $1 AND amount > 0 AND date >= CURRENT_DATE - 30 AND pending = false
       GROUP BY category ORDER BY total DESC LIMIT 10`,
      [req.user.id]
    );

    const connectedBanks = [...new Set(accounts.map(a => a.institution_name))];

    res.json({
      totalChecking, totalSavings, totalOther,
      totalBalance: totalChecking + totalSavings + totalOther,
      thirtyDaySpending, thirtyDayIncome,
      netFlow: thirtyDayIncome - thirtyDaySpending,
      spendingByCategory: catRows.map(r => ({ category: r.category, total: parseFloat(r.total) })),
      accountCount: accounts.length,
      connectedBanks,
    });
  } catch (err) { res.status(500).json({ error: "Failed to get summary" }); }
});

// DELETE /api/plaid/disconnect/:itemId - Remove a connected bank
router.delete("/disconnect/:itemId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM plaid_items WHERE id = $1 AND user_id = $2", [req.params.itemId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });

    // Remove from Plaid
    try {
      await plaidClient.itemRemove({ access_token: rows[0].access_token });
    } catch (e) { /* may already be removed */ }

    // Remove from DB (cascades to accounts)
    await pool.query("DELETE FROM plaid_items WHERE id = $1", [req.params.itemId]);

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to disconnect" }); }
});

// GET /api/plaid/items - Get connected banks
router.get("/items", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, institution_name, institution_id, created_at FROM plaid_items WHERE user_id = $1",
      [req.user.id]
    );
    res.json(rows.map(r => ({
      id: r.id, institutionName: r.institution_name,
      institutionId: r.institution_id, connectedAt: r.created_at,
    })));
  } catch (err) { res.status(500).json({ error: "Failed to fetch items" }); }
});

// POST /api/plaid/smart-sync - Run full smart sync (auto-match bills, detect income, update cards)
router.post("/smart-sync", async (req, res) => {
  try {
    const { syncUserData } = require("../services/smartSync");
    const results = await syncUserData(req.user.id);
    res.json({ success: true, ...results });
  } catch (err) {
    console.error("Smart sync error:", err);
    res.status(500).json({ error: "Failed to sync" });
  }
});

// GET /api/plaid/liabilities - Get credit card, loan, and mortgage details
router.get("/liabilities", async (req, res) => {
  try {
    const { rows: items } = await pool.query("SELECT * FROM plaid_items WHERE user_id = $1", [req.user.id]);
    if (!items.length) return res.json({ accounts: [] });
    
    const allLiabilities = [];
    for (const item of items) {
      try {
        const response = await plaidClient.liabilitiesGet({ access_token: item.access_token });
        const liabs = response.data.liabilities || {};
        
        // Credit cards
        if (liabs.credit) {
          liabs.credit.forEach(cc => {
            allLiabilities.push({
              type: "credit_card",
              accountId: cc.account_id,
              lastPaymentAmount: cc.last_payment_amount,
              lastPaymentDate: cc.last_payment_date,
              lastStatementBalance: cc.last_statement_balance,
              lastStatementDate: cc.last_statement_issue_date,
              minimumPayment: cc.minimum_payment_amount,
              nextPaymentDue: cc.next_payment_due_date,
              aprs: cc.aprs || [],
              isOverdue: cc.is_overdue,
            });
          });
        }
        
        // Student loans
        if (liabs.student) {
          liabs.student.forEach(sl => {
            allLiabilities.push({
              type: "student_loan",
              accountId: sl.account_id,
              name: sl.loan_name,
              interestRate: sl.interest_rate_percentage,
              lastPaymentAmount: sl.last_payment_amount,
              lastPaymentDate: sl.last_payment_date,
              minimumPayment: sl.minimum_payment_amount,
              nextPaymentDue: sl.next_payment_due_date,
              originationDate: sl.origination_date,
              outstandingBalance: sl.outstanding_interest_amount,
              repaymentPlan: sl.repayment_plan && sl.repayment_plan.type,
              loanStatus: sl.loan_status && sl.loan_status.type,
            });
          });
        }
        
        // Mortgages
        if (liabs.mortgage) {
          liabs.mortgage.forEach(m => {
            allLiabilities.push({
              type: "mortgage",
              accountId: m.account_id,
              interestRate: m.interest_rate && m.interest_rate.percentage,
              lastPaymentAmount: m.last_payment_amount,
              lastPaymentDate: m.last_payment_date,
              nextPaymentDue: m.next_payment_due_date,
              maturityDate: m.maturity_date,
              originationDate: m.origination_date,
              propertyAddress: m.property_address,
              loanType: m.loan_type_description,
            });
          });
        }
      } catch (err) {
        console.error("Liabilities error for item:", item.id, err.message);
      }
    }
    
    res.json({ accounts: allLiabilities });
  } catch (err) {
    console.error("Liabilities fetch error:", err.message);
    res.status(500).json({ error: "Failed to get liabilities" });
  }
});

module.exports = router;

