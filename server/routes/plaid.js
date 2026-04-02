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
    const userAgent = req.headers["user-agent"] || "";
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
    const config = {
      user: { client_user_id: String(req.user.id) },
      client_name: "BillBuddy",
      products: [Products.Transactions],
      optional_products: [Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: "en",
    };
    // Always include redirect_uri - needed for OAuth banks (Chase, etc.)
    // iOS native app uses Universal Links to handle the redirect back to app
    config.redirect_uri = "https://billbuddy.us/plaid-oauth";
    const response = await plaidClient.linkTokenCreate(config);
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
            // Use personal_finance_category (more accurate) or fall back to legacy category
            const pfc = txn.personal_finance_category?.primary || "";
            const legacyCat = txn.category?.[0] || "";
            const catStr = pfc || legacyCat || "Other";
            await pool.query(
              `INSERT INTO bank_transactions (user_id, account_id, transaction_id, name, amount, date, category, pending)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (transaction_id) DO UPDATE SET amount=$5, pending=$8, name=$4, category=CASE WHEN bank_transactions.category = 'Other' THEN $7 ELSE bank_transactions.category END`,
              [req.user.id, txn.account_id, txn.transaction_id, txn.name,
               txn.amount, txn.date, catStr, txn.pending]
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

// GET /api/plaid/summary - Dashboard summary of all bank data (excludes credit cards)
router.get("/summary", async (req, res) => {
  try {
    // Total balances by type
    const { rows: accounts } = await pool.query(
      `SELECT ba.*, pi.institution_name FROM bank_accounts ba
       JOIN plaid_items pi ON ba.plaid_item_id = pi.id
       WHERE ba.user_id = $1`,
      [req.user.id]
    );

    // Only count depository accounts (checking, savings, etc.) — exclude credit cards
    let totalChecking = 0, totalSavings = 0, totalOther = 0;
    accounts.forEach(a => {
      if (a.account_type === "credit") return; // Skip credit card accounts
      const bal = parseFloat(a.balance_available) > 0 ? parseFloat(a.balance_available) : (parseFloat(a.balance_current) || 0);
      if (a.account_subtype === "checking") totalChecking += bal;
      else if (a.account_subtype === "savings" || a.account_subtype === "cd" || a.account_subtype === "money market") totalSavings += bal;
      else totalOther += bal;
    });

    // Get account IDs for non-credit accounts only (for transaction filtering)
    const bankAccountIds = accounts
      .filter(a => a.account_type !== "credit")
      .map(a => a.account_id);

    // Recent spending (last 30 days, positive amounts = money out in Plaid) — bank accounts only
    const { rows: spendingRows } = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM bank_transactions
       WHERE user_id = $1 AND amount > 0 AND date >= CURRENT_DATE - 30 AND pending = false
       AND account_id = ANY($2)`,
      [req.user.id, bankAccountIds.length > 0 ? bankAccountIds : ['']]
    );
    const thirtyDaySpending = parseFloat(spendingRows[0].total);

    // Recent income (negative amounts = money in, in Plaid) — bank accounts only
    const { rows: incomeRows } = await pool.query(
      `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM bank_transactions
       WHERE user_id = $1 AND amount < 0 AND date >= CURRENT_DATE - 30 AND pending = false
       AND account_id = ANY($2)`,
      [req.user.id, bankAccountIds.length > 0 ? bankAccountIds : ['']]
    );
    const thirtyDayIncome = parseFloat(incomeRows[0].total);

    // Spending by category — bank accounts only
    const { rows: catRows } = await pool.query(
      `SELECT category, SUM(amount) as total FROM bank_transactions
       WHERE user_id = $1 AND amount > 0 AND date >= CURRENT_DATE - 30 AND pending = false
       AND account_id = ANY($2)
       GROUP BY category ORDER BY total DESC LIMIT 10`,
      [req.user.id, bankAccountIds.length > 0 ? bankAccountIds : ['']]
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
    const { rows: accts } = await pool.query("SELECT account_id FROM bank_accounts WHERE plaid_item_id = $1", [req.params.itemId]);
    const acctIds = accts.map(a => a.account_id);
    if (acctIds.length > 0) { await pool.query("DELETE FROM bank_transactions WHERE user_id = $1 AND account_id = ANY($2)", [req.user.id, acctIds]); }
    await pool.query("DELETE FROM bank_accounts WHERE plaid_item_id = $1", [req.params.itemId]);
    await pool.query("DELETE FROM plaid_items WHERE id = $1", [req.params.itemId]);

    // Check if user has ANY remaining bank connections
    const { rows: remaining } = await pool.query("SELECT id FROM plaid_items WHERE user_id = $1", [req.user.id]);
    if (remaining.length === 0) {
      // No banks left — clean up bank-derived data
      await pool.query("DELETE FROM income_entries WHERE user_id = $1", [req.user.id]);
      await pool.query("DELETE FROM bank_transactions WHERE user_id = $1", [req.user.id]);
      await pool.query("DELETE FROM bank_accounts WHERE user_id = $1", [req.user.id]);
    }

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
    const { invalidateCache } = require("../middleware/cache");
    const results = await syncUserData(req.user.id);
    invalidateCache(`user:${req.user.id}`);
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

// POST /api/plaid/cleanup - Remove orphaned bank data when no plaid items exist
router.post("/cleanup", async (req, res) => {
  try {
    const { rows: items } = await pool.query("SELECT id FROM plaid_items WHERE user_id = $1", [req.user.id]);
    if (items.length === 0) {
      await pool.query("DELETE FROM bank_transactions WHERE user_id = $1", [req.user.id]);
      await pool.query("DELETE FROM bank_accounts WHERE user_id = $1", [req.user.id]);
      await pool.query("DELETE FROM income_entries WHERE user_id = $1", [req.user.id]);
      res.json({ success: true, message: "Cleaned up orphaned bank data" });
    } else {
      res.json({ success: true, message: "Active connections exist, no cleanup needed" });
    }
  } catch (err) { res.status(500).json({ error: "Cleanup failed" }); }
});

// POST /api/plaid/refresh - Force refresh transactions for fresher data
router.post("/refresh", async (req, res) => {
  try {
    const { rows: items } = await pool.query("SELECT * FROM plaid_items WHERE user_id = $1", [req.user.id]);
    let refreshed = 0;
    for (const item of items) {
      try {
        await plaidClient.transactionsRefresh({ access_token: item.access_token });
        refreshed++;
      } catch (err) {
        // transactions/refresh may not be available for all items
        console.error("Refresh error for item:", item.id, err.response?.data?.error_code || err.message);
      }
    }
    res.json({ refreshed, total: items.length });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Failed to refresh transactions" });
  }
});

// GET /api/plaid/recurring - Get Plaid-detected recurring transactions
router.get("/recurring", async (req, res) => {
  try {
    const { rows: items } = await pool.query("SELECT * FROM plaid_items WHERE user_id = $1", [req.user.id]);
    const allInflows = [];
    const allOutflows = [];

    for (const item of items) {
      try {
        const { rows: accounts } = await pool.query(
          "SELECT account_id FROM bank_accounts WHERE plaid_item_id = $1", [item.id]
        );
        const accountIds = accounts.map(a => a.account_id);
        if (accountIds.length === 0) continue;

        const response = await plaidClient.transactionsRecurringGet({
          access_token: item.access_token,
          account_ids: accountIds,
        });

        if (response.data.inflow_streams) {
          allInflows.push(...response.data.inflow_streams.map(s => ({
            ...s, institution: item.institution_name || "Unknown",
          })));
        }
        if (response.data.outflow_streams) {
          allOutflows.push(...response.data.outflow_streams.map(s => ({
            ...s, institution: item.institution_name || "Unknown",
          })));
        }
      } catch (err) {
        const code = err.response?.data?.error_code;
        if (code !== "PRODUCTS_NOT_SUPPORTED" && code !== "PRODUCT_NOT_READY") {
          console.error("Recurring get error:", code || err.message);
        }
      }
    }

    // Format for frontend
    const formatStream = (s, type) => ({
      id: s.stream_id || s.transaction_ids?.[0] || Math.random().toString(36),
      name: s.merchant_name || s.description || "Unknown",
      amount: Math.abs(s.last_amount?.amount || s.average_amount?.amount || 0),
      frequency: s.frequency || "unknown",
      category: s.personal_finance_category?.primary || s.category?.[0] || "Other",
      lastDate: s.last_date || null,
      nextDate: s.predicted_next_date || null,
      status: s.status || "mature",
      isActive: s.is_active !== false,
      type,
      transactionCount: s.transaction_ids?.length || 0,
      institution: s.institution || "",
    });

    res.json({
      inflows: allInflows.map(s => formatStream(s, "inflow")),
      outflows: allOutflows.map(s => formatStream(s, "outflow")),
      totalMonthlyInflow: allInflows.reduce((s, i) => s + Math.abs(i.last_amount?.amount || i.average_amount?.amount || 0), 0),
      totalMonthlyOutflow: allOutflows.reduce((s, o) => s + Math.abs(o.last_amount?.amount || o.average_amount?.amount || 0), 0),
    });
  } catch (err) {
    console.error("Plaid recurring error:", err);
    res.status(500).json({ error: "Failed to get recurring transactions" });
  }
});

// GET /api/plaid/investments - Get investment holdings
router.get("/investments", async (req, res) => {
  try {
    const { rows: items } = await pool.query("SELECT * FROM plaid_items WHERE user_id = $1", [req.user.id]);
    const allHoldings = [];
    const allAccounts = [];
    let totalValue = 0;

    for (const item of items) {
      try {
        const response = await plaidClient.investmentsHoldingsGet({
          access_token: item.access_token,
        });

        const accounts = response.data.accounts || [];
        const holdings = response.data.holdings || [];
        const securities = response.data.securities || [];

        const secMap = {};
        for (const sec of securities) {
          secMap[sec.security_id] = sec;
        }

        for (const acct of accounts) {
          if (acct.type === "investment") {
            allAccounts.push({
              id: acct.account_id,
              name: acct.name,
              balance: acct.balances?.current || 0,
              institution: item.institution_name || "Unknown",
              subtype: acct.subtype || "investment",
              mask: acct.mask || "",
            });
            totalValue += acct.balances?.current || 0;
          }
        }

        for (const h of holdings) {
          const sec = secMap[h.security_id] || {};
          allHoldings.push({
            name: sec.name || "Unknown",
            ticker: sec.ticker_symbol || "",
            type: sec.type || "other",
            quantity: h.quantity || 0,
            price: h.institution_price || sec.close_price || 0,
            value: h.institution_value || (h.quantity * (h.institution_price || sec.close_price || 0)),
            costBasis: h.cost_basis || null,
            accountName: accounts.find(a => a.account_id === h.account_id)?.name || "",
          });
        }
      } catch (err) {
        const code = err.response?.data?.error_code;
        if (code !== "PRODUCTS_NOT_SUPPORTED" && code !== "PRODUCT_NOT_READY" && code !== "NO_INVESTMENT_ACCOUNTS") {
          console.error("Investments error:", code || err.message);
        }
      }
    }

    res.json({
      accounts: allAccounts,
      holdings: allHoldings.sort((a, b) => b.value - a.value),
      totalValue: Math.round(totalValue * 100) / 100,
    });
  } catch (err) {
    console.error("Investments error:", err);
    res.status(500).json({ error: "Failed to get investments" });
  }
});

module.exports = router;


