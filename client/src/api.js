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
  createHousehold: (name) => request("/household/create", { method: "POST", body: JSON.stringify({ name }) }),
  joinHousehold: (inviteCode) => request("/household/join", { method: "POST", body: JSON.stringify({ inviteCode }) }),
  addHouseholdBill: (bill) => request("/household/bills", { method: "POST", body: JSON.stringify(bill) }),
  payHouseholdSplit: (splitId) => request(`/household/splits/${splitId}/pay`, { method: "PATCH" }),
  leaveHousehold: () => request("/household/leave", { method: "DELETE" }),

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
  smartSync: () => request("/plaid/smart-sync", { method: "POST" }),

  // Helpers
  getToken, setToken, clearToken, getUser, setUser,
};
