const API_BASE = process.env.REACT_APP_API_URL || "/api";

function getToken() {
  return localStorage.getItem("billbuddy_token");
}

function setToken(token) {
  localStorage.setItem("billbuddy_token", token);
}

function clearToken() {
  localStorage.removeItem("billbuddy_token");
  localStorage.removeItem("billbuddy_user");
}

function getUser() {
  const u = localStorage.getItem("billbuddy_user");
  return u ? JSON.parse(u) : null;
}

function setUser(user) {
  localStorage.setItem("billbuddy_user", JSON.stringify(user));
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export const api = {
  // Auth
  signup: (data) => request("/auth/signup", { method: "POST", body: JSON.stringify(data) }),
  login: (data) => request("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  googleLogin: (credential) => request("/auth/google", { method: "POST", body: JSON.stringify({ credential }) }),
  getMe: () => request("/auth/me"),

  // Bills
  getBills: () => request("/bills"),
  createBill: (bill) => request("/bills", { method: "POST", body: JSON.stringify(bill) }),
  updateBill: (id, updates) => request(`/bills/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
  deleteBill: (id) => request(`/bills/${id}`, { method: "DELETE" }),
  resetMonth: () => request("/bills/reset-month", { method: "POST" }),

  // History
  getHistory: (month) => request(`/history${month && month !== "all" ? `?month=${encodeURIComponent(month)}` : ""}`),
  recordPayment: (p) => request("/history", { method: "POST", body: JSON.stringify(p) }),
  getHistoryMonths: () => request("/history/months"),

  // AI Insights
  getInsights: () => request("/insights", { method: "POST" }),

  // Dashboard
  getDashboard: () => request("/dashboard"),

  // Forecast
  getForecast: () => request("/forecast"),

  // Smart Alerts
  getAlerts: () => request("/alerts"),

  // Bill Negotiation
  getNegotiateOpportunities: () => request("/negotiate/opportunities"),
  getNegotiationScript: (billId) => request(`/negotiate/${billId}`, { method: "POST" }),

  // Household
  getHousehold: () => request("/household"),
  createHousehold: (name, mode) => request("/household/create", { method: "POST", body: JSON.stringify({ name, mode: mode || "household" }) }),
  joinHousehold: (inviteCode) => request("/household/join", { method: "POST", body: JSON.stringify({ inviteCode }) }),
  addHouseholdBill: (bill) => request("/household/bills", { method: "POST", body: JSON.stringify(bill) }),
  payHouseholdSplit: (splitId) => request(`/household/splits/${splitId}/pay`, { method: "PATCH" }),
  leaveHousehold: () => request("/household/leave", { method: "DELETE" }),
  deleteHouseholdBill: (billId) => request(`/household/bills/${billId}`, { method: "DELETE" }),

  // Subscriptions
  detectSubscriptions: () => request("/subscriptions/detect"),

  // Activity Feed
  getActivity: (days, type) => request(`/activity?days=${days || 30}&type=${type || "all"}`),

  // Savings
  getSavingsAdvice: () => request("/savings/advisor"),
  createSavingsGoal: (goal) => request("/savings/goals", { method: "POST", body: JSON.stringify(goal) }),
  updateSavingsGoal: (id, addAmount) => request(`/savings/goals/${id}`, { method: "PATCH", body: JSON.stringify({ addAmount }) }),
  deleteSavingsGoal: (id) => request(`/savings/goals/${id}`, { method: "DELETE" }),

  // User Preferences
  updatePreferences: (prefs) => request("/auth/preferences", { method: "PATCH", body: JSON.stringify(prefs) }),

  // Credit Cards
  getCards: () => request("/cards"),
  createCard: (card) => request("/cards", { method: "POST", body: JSON.stringify(card) }),
  updateCard: (id, updates) => request(`/cards/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
  deleteCard: (id) => request(`/cards/${id}`, { method: "DELETE" }),
  makeCardPayment: (id, payment) => request(`/cards/${id}/pay`, { method: "POST", body: JSON.stringify(payment) }),
  getCardPayments: (id) => request(`/cards/${id}/payments`),
  getCardPayoff: (id) => request(`/cards/${id}/payoff`),
  getDebtStrategy: () => request("/cards/strategy"),

  // Income
  getIncomeSources: () => request("/income/sources"),
  createIncomeSource: (s) => request("/income/sources", { method: "POST", body: JSON.stringify(s) }),
  updateIncomeSource: (id, u) => request(`/income/sources/${id}`, { method: "PATCH", body: JSON.stringify(u) }),
  deleteIncomeSource: (id) => request(`/income/sources/${id}`, { method: "DELETE" }),
  getIncomeEntries: (month) => request(`/income/entries${month && month !== "all" ? `?month=${encodeURIComponent(month)}` : ""}`),
  createIncomeEntry: (e) => request("/income/entries", { method: "POST", body: JSON.stringify(e) }),
  deleteIncomeEntry: (id) => request(`/income/entries/${id}`, { method: "DELETE" }),
  getIncomeSummary: () => request("/income/summary"),
  detectIncome: () => request("/income/detect"),
  cleanupIncomeEntries: () => request("/income/cleanup-duplicates", { method: "POST" }),
  getPaycheckForecast: () => request("/dashboard/paycheck-forecast"),

  // Calendar Feed
  getCalendarToken: () => request("/calendar/token", { method: "POST" }),
  resetCalendarToken: () => request("/calendar/token/reset", { method: "POST" }),

  // Plaid / Bank Accounts
  createLinkToken: () => request("/plaid/create-link-token", { method: "POST" }),
  exchangePlaidToken: (publicToken, institution) => request("/plaid/exchange-token", { method: "POST", body: JSON.stringify({ publicToken, institution }) }),
  getBankAccounts: () => request("/plaid/accounts"),
  syncBalances: () => request("/plaid/sync-balances", { method: "POST" }),
  syncTransactions: () => request("/plaid/sync-transactions", { method: "POST" }),
  getBankTransactions: (days) => request(`/plaid/transactions?days=${days || 30}`),
  getBankSummary: () => request("/plaid/summary"),
  getPlaidItems: () => request("/plaid/items"),
  disconnectBank: (itemId) => request(`/plaid/disconnect/${itemId}`, { method: "DELETE" }),
  getLiabilities: () => request("/plaid/liabilities"),
  smartSync: () => request("/plaid/smart-sync", { method: "POST" }),

  // Spending
  getSpendingSummary: (days) => request(`/spending/summary?days=${days || 30}`),
  getWeeklySpending: () => request("/spending/weekly"),
  setBudget: (category, monthlyLimit) => request("/spending/budgets", { method: "POST", body: JSON.stringify({ category, monthlyLimit }) }),
  deleteBudget: (id) => request(`/spending/budgets/${id}`, { method: "DELETE" }),

  // Spending Insights (AI)
  getSpendingInsights: () => request("/spending-insights"),

  // Financial Goals
  getGoals: () => request("/goals"),
  createGoal: (goal) => request("/goals", { method: "POST", body: JSON.stringify(goal) }),
  updateGoal: (id, data) => request("/goals/" + id, { method: "PATCH", body: JSON.stringify(data) }),
  contributeToGoal: (id, amount) => request("/goals/" + id + "/contribute", { method: "POST", body: JSON.stringify({ amount }) }),
  deleteGoal: (id) => request("/goals/" + id, { method: "DELETE" }),

  // Credit Health
  getCreditHealth: () => request("/credit"),

  // Smart Savings
  getSmartSavings: () => request("/smart-savings"),

  // Subscription Cancel Helper
  getCancelInfo: (name) => request("/cancel-helper/lookup?name=" + encodeURIComponent(name)),
  getCancelEmail: (name) => request("/cancel-helper/email-template?name=" + encodeURIComponent(name)),

  // AI Advisor
  askAdvisor: (message, history) => request("/advisor", { method: "POST", body: JSON.stringify({ message, history }) }),

  // Two-Factor Authentication
  get2FAStatus: () => request("/2fa/status"),
  setup2FA: () => request("/2fa/setup", { method: "POST" }),
  verify2FA: (code) => request("/2fa/verify", { method: "POST", body: JSON.stringify({ code }) }),
  validate2FA: (userId, code) => request("/2fa/validate", { method: "POST", body: JSON.stringify({ userId, code }) }),
  disable2FA: (code) => request("/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }),
  complete2FA: (userId) => request("/auth/2fa-complete", { method: "POST", body: JSON.stringify({ userId }) }),


  // Helpers
  getToken, setToken, clearToken, getUser, setUser,
};



