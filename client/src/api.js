const API_BASE = process.env.REACT_APP_API_URL || "/api";

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export const api = {
  // Bills
  getBills: () => request("/bills"),
  createBill: (bill) => request("/bills", { method: "POST", body: JSON.stringify(bill) }),
  updateBill: (id, updates) => request(`/bills/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
  deleteBill: (id) => request(`/bills/${id}`, { method: "DELETE" }),
  resetMonth: () => request("/bills/reset-month", { method: "POST" }),

  // History
  getHistory: (month) => request(`/history${month && month !== "all" ? `?month=${encodeURIComponent(month)}` : ""}`),
  recordPayment: (payment) => request("/history", { method: "POST", body: JSON.stringify(payment) }),
  getHistoryMonths: () => request("/history/months"),
  getHistoryStats: () => request("/history/stats"),

  // Health
  health: () => request("/health"),
};
