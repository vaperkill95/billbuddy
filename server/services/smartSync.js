const { Configuration, PlaidApi, PlaidEnvironments } = require("plaid");
const pool = require("../db/pool");

const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

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

// ─── Main sync function - call this per user ───
async function syncUserData(userId) {
  const results = { balancesUpdated: 0, transactionsProcessed: 0, billsMatched: 0, incomeDetected: 0, cardsUpdated: 0 };

  try {
    const { rows: items } = await pool.query("SELECT * FROM plaid_items WHERE user_id = $1", [userId]);
    if (!items.length) return results;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = thirtyDaysAgo.toISOString().split("T")[0];
    const endDate = now.toISOString().split("T")[0];

    for (const item of items) {
      try {
        // 1. Sync balances
        const acctResp = await plaidClient.accountsGet({ access_token: item.access_token });
        for (const acct of acctResp.data.accounts) {
          await pool.query(
            `UPDATE bank_accounts SET balance_current=$1, balance_available=$2, last_synced=NOW()
             WHERE account_id=$3 AND user_id=$4`,
            [acct.balances.current || 0, acct.balances.available || 0, acct.account_id, userId]
          );
          results.balancesUpdated++;
        }

        // 2. Sync transactions
        const txnResp = await plaidClient.transactionsGet({
          access_token: item.access_token,
          start_date: startDate,
          end_date: endDate,
          options: { count: 250 },
        });

        for (const txn of txnResp.data.transactions) {
          try {
            await pool.query(
              `INSERT INTO bank_transactions (user_id, account_id, transaction_id, name, amount, date, category, pending)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (transaction_id) DO UPDATE SET amount=$5, pending=$8, name=$4`,
              [userId, txn.account_id, txn.transaction_id, txn.name, txn.amount, txn.date, txn.category?.[0] || "Other", txn.pending]
            );
            results.transactionsProcessed++;
          } catch (e) { /* skip duplicates */ }
        }

        // 3. Auto-match transactions to bills
        results.billsMatched += await matchBillPayments(userId, txnResp.data.transactions);

        // 4. Auto-detect income deposits
        results.incomeDetected += await detectIncomeDeposits(userId, txnResp.data.transactions);

        // 5. Update credit card balances from Plaid
        results.cardsUpdated += await syncCreditCardBalances(userId, acctResp.data.accounts);

        // 6. Sync liabilities data (APR, min payment, etc.)
        try {
          const liabResp = await plaidClient.liabilitiesGet({ access_token: item.access_token });
          const liabs = liabResp.data.liabilities || {};
          if (liabs.credit) {
            results.cardsUpdated += await syncLiabilitiesData(userId, liabs.credit, acctResp.data.accounts);
          }
        } catch (liabErr) {
          if (!liabErr.message?.includes("PRODUCTS_NOT_SUPPORTED")) {
            console.error("Liabilities sync error:", liabErr.message);
          }
        }

      } catch (itemErr) {
        console.error(`Sync failed for item ${item.id}:`, itemErr.message);
      }
    }
  } catch (err) {
    console.error(`syncUserData error for user ${userId}:`, err.message);
  }

  return results;
}

// ─── Match bank transactions to bills and auto-check them ───
async function matchBillPayments(userId, transactions) {
  let matched = 0;

  // Get user's unpaid bills
  const { rows: bills } = await pool.query(
    "SELECT * FROM bills WHERE user_id = $1 AND is_paid = false", [userId]
  );
  if (!bills.length) return 0;

  // Get recent non-pending transactions (money going out = positive in Plaid)
  const recentPayments = transactions.filter(t => !t.pending && t.amount > 0);

  // Common name mappings for fuzzy matching
  const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const bill of bills) {
    const billName = normalize(bill.name);
    const billAmount = parseFloat(bill.amount);

    for (const txn of recentPayments) {
      const txnName = normalize(txn.name);
      const txnAmount = txn.amount;

      // Match by name similarity AND amount (within 20% tolerance for variable bills)
      const nameMatch = txnName.includes(billName) || billName.includes(txnName) ||
        // Common variations
        (billName.includes("netflix") && txnName.includes("netflix")) ||
        (billName.includes("spotify") && txnName.includes("spotify")) ||
        (billName.includes("hulu") && txnName.includes("hulu")) ||
        (billName.includes("electric") && (txnName.includes("electric") || txnName.includes("power") || txnName.includes("energy"))) ||
        (billName.includes("internet") && (txnName.includes("internet") || txnName.includes("comcast") || txnName.includes("spectrum") || txnName.includes("xfinity"))) ||
        (billName.includes("phone") && (txnName.includes("tmobile") || txnName.includes("verizon") || txnName.includes("att"))) ||
        (billName.includes("rent") && (txnName.includes("rent") || txnName.includes("landlord") || txnName.includes("property"))) ||
        (billName.includes("gym") && (txnName.includes("gym") || txnName.includes("fitness") || txnName.includes("planet")));

      const amountClose = Math.abs(txnAmount - billAmount) / billAmount < 0.2;

      if (nameMatch && amountClose) {
        // Auto-mark as paid
        await pool.query("UPDATE bills SET is_paid = true, updated_at = NOW() WHERE id = $1", [bill.id]);

        // Log to payment history
        const today = new Date();
        const monthLabel = `${FULL_MONTHS[today.getMonth()]} ${today.getFullYear()}`;
        const isLate = today.getDate() > bill.due_date;

        try {
          await pool.query(
            `INSERT INTO payment_history (user_id, bill_name, amount, category, paid_date, month_label, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, bill.name, txnAmount, bill.category, txn.date, monthLabel, isLate ? "late" : "on-time"]
          );
        } catch (e) { /* might already exist */ }

        matched++;
        break; // Move to next bill
      }
    }
  }

  return matched;
}

// ─── Detect income deposits and auto-log them ───
async function detectIncomeDeposits(userId, transactions) {
  let detected = 0;

  // Get user's income sources
  const { rows: sources } = await pool.query(
    "SELECT * FROM income_sources WHERE user_id = $1 AND is_active = true", [userId]
  );

  // Money coming in = negative amounts in Plaid
  const deposits = transactions.filter(t => !t.pending && t.amount < 0 && Math.abs(t.amount) > 50);

  const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Common payroll keywords
  const payrollKeywords = ["payroll", "direct dep", "paycheck", "salary", "wages", "paychex", "adp", "gusto", "quickbooks payroll", "workday", "ceridian"];

  for (const dep of deposits) {
    const depName = normalize(dep.name);
    const depAmount = Math.abs(dep.amount);
    const isPayroll = payrollKeywords.some(kw => depName.includes(normalize(kw)));

    // Check if we already logged this deposit (by amount + date — don't rely on name match since source name may differ from transaction name)
    const { rows: existing } = await pool.query(
      `SELECT id FROM income_entries WHERE user_id = $1 AND amount = $2 AND received_date = $3`,
      [userId, depAmount, dep.date]
    );
    if (existing.length > 0) continue;

    // Try to match to an income source
    let matchedSource = null;
    for (const src of sources) {
      const srcName = normalize(src.name);
      const srcAmount = parseFloat(src.amount);
      const amountClose = Math.abs(depAmount - srcAmount) / srcAmount < 0.15;

      if ((depName.includes(srcName) || srcName.includes(depName) || (isPayroll && amountClose))) {
        matchedSource = src;
        break;
      }
    }

    // If it's a payroll deposit or matches a source, log it
    if (matchedSource || isPayroll) {
      const today = new Date(dep.date);
      const monthLabel = `${FULL_MONTHS[today.getMonth()]} ${today.getFullYear()}`;

      try {
        await pool.query(
          `INSERT INTO income_entries (user_id, source_id, source_name, amount, received_date, month_label)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, matchedSource?.id || null, matchedSource?.name || dep.name, depAmount, dep.date, monthLabel]
        );
        detected++;
      } catch (e) { /* skip if already exists */ }
    }
  }

  return detected;
}

// ─── Sync credit card balances from Plaid accounts ───
async function syncCreditCardBalances(userId, plaidAccounts) {
  let updated = 0;

  // Get user's credit cards
  const { rows: cards } = await pool.query(
    "SELECT * FROM credit_cards WHERE user_id = $1", [userId]
  );
  if (!cards.length) return 0;

  const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Find credit-type Plaid accounts
  const creditAccounts = plaidAccounts.filter(a => a.type === "credit");

  for (const card of cards) {
    const cardName = normalize(card.name);

    for (const plaidAcct of creditAccounts) {
      const plaidName = normalize(plaidAcct.name);

      // Match by name or last 4 digits
      if (plaidName.includes(cardName) || cardName.includes(plaidName) ||
          (card.mask && plaidAcct.mask && card.mask === plaidAcct.mask)) {
        const newBalance = plaidAcct.balances.current || 0;
        await pool.query(
          "UPDATE credit_cards SET balance = $1, updated_at = NOW() WHERE id = $2",
          [newBalance, card.id]
        );
        updated++;
        break;
      }
    }
  }

  return updated;
}

// ─── Sync liabilities data (APR, min payment) from Plaid to credit cards ───
async function syncLiabilitiesData(userId, creditLiabilities, plaidAccounts) {
  let updated = 0;
  const { rows: cards } = await pool.query("SELECT * FROM credit_cards WHERE user_id = $1", [userId]);
  if (!cards.length || !creditLiabilities.length) return 0;

  const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const liab of creditLiabilities) {
    const plaidAcct = plaidAccounts.find(a => a.account_id === liab.account_id);
    if (!plaidAcct) continue;

    for (const card of cards) {
      const cardName = normalize(card.name);
      const plaidName = normalize(plaidAcct.name);

      if (plaidName.includes(cardName) || cardName.includes(plaidName) ||
          (card.mask && plaidAcct.mask && card.mask === plaidAcct.mask)) {
        let apr = card.apr;
        if (liab.aprs && liab.aprs.length > 0) {
          const purchaseApr = liab.aprs.find(a => a.apr_type === "purchase_apr");
          apr = purchaseApr ? purchaseApr.apr_percentage : liab.aprs[0].apr_percentage;
        }
        const minPayment = liab.minimum_payment_amount || card.min_payment;
        const creditLimit = plaidAcct.balances.limit || card.credit_limit;
        const balance = plaidAcct.balances.current || card.balance;

        await pool.query(
          `UPDATE credit_cards SET balance = $1, apr = COALESCE($2, apr), min_payment = COALESCE($3, min_payment), credit_limit = COALESCE($4, credit_limit), updated_at = NOW() WHERE id = $5`,
          [balance, apr, minPayment, creditLimit, card.id]
        );
        updated++;
        break;
      }
    }
  }
  return updated;
}

module.exports = { syncUserData, matchBillPayments, detectIncomeDeposits, syncCreditCardBalances, syncLiabilitiesData };
