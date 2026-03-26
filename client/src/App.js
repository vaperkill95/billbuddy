import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";

// ─── Constants ───
const CATEGORIES = [
  { name: "Housing", color: "#EF4444", icon: "🏠" },
  { name: "Utilities", color: "#10B981", icon: "💡" },
  { name: "Insurance", color: "#3B82F6", icon: "🛡️" },
  { name: "Subscriptions", color: "#96CEB4", icon: "📺" },
  { name: "Phone/Internet", color: "#FFEAA7", icon: "📱" },
  { name: "Transportation", color: "#DDA0DD", icon: "🚗" },
  { name: "Health", color: "#98D8C8", icon: "🏥" },
  { name: "Other", color: "#F7DC6F", icon: "📋" },
];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const REMINDER_OPTIONS = [
  { value: "none", label: "No reminder" }, { value: "sameday", label: "Day of" },
  { value: "1day", label: "1 day before" }, { value: "3days", label: "3 days before" },
  { value: "1week", label: "1 week before" },
];

const getCatColor = n => CATEGORIES.find(c => c.name === n)?.color || "#ccc";
const getCatIcon = n => CATEGORIES.find(c => c.name === n)?.icon || "📋";
const formatMoney = n => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reminderLabel = v => REMINDER_OPTIONS.find(r => r.value === v)?.label || "No reminder";
const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const getFirstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();

function useTheme(dark) {
  return {
    // Backgrounds
    bg: dark ? "#0D0D12" : "#F7F7FB",
    card: dark ? "#18181F" : "#FFFFFF",
    cardAlt: dark ? "#1E1E28" : "#F2F2F8",
    cs: dark ? "0 1px 3px rgba(0,0,0,0.4)" : "0 1px 4px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.03)",
    // Text
    text: dark ? "#F0F0F5" : "#1A1A2E",
    sub: dark ? "#9090A8" : "#6B6B80",
    muted: dark ? "#5A5A70" : "#ACACBE",
    // Borders & inputs
    border: dark ? "#2A2A38" : "#E8E8F0",
    input: dark ? "#12121A" : "#F7F7FB",
    // Bill rows
    rowBg: dark ? "#18181F" : "#FFFFFF",
    rowPaid: dark ? "#14201A" : "#F4FCF7",
    rowOver: dark ? "#201414" : "#FEF5F5",
    // Tags & pills
    tag: dark ? "#252540" : "#EDECFF",
    pill: dark ? "#1E1E28" : "#F0F0F5",
    prog: dark ? "#1E1E28" : "#F0F0F5",
    // Header
    header: dark ? "#18181F" : "#FFFFFF",
    // Tabs
    tab: dark ? "#18181F" : "#FFFFFF",
    tabS: dark ? "0 1px 3px rgba(0,0,0,0.3)" : "0 1px 4px rgba(0,0,0,0.06)",
    // Modal
    modal: dark ? "#18181F" : "#FFFFFF",
    over: dark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.4)",
    // Calendar
    cell: dark ? "#12121A" : "#F7F7FB",
    today: dark ? "#6C5CE725" : "#6C5CE715",
    bubble: dark ? "rgba(108,92,231,0.08)" : "rgba(108,92,231,0.04)",
    // Priority
    priH: dark ? "#201414" : "#FEF0F0", priM: dark ? "#201E14" : "#FEFAF0", priL: dark ? "#142016" : "#F0FEF0",
    hOk: dark ? "#142016" : "#F0FEF4", hLate: dark ? "#201414" : "#FEF5F5",
    // Accent colors
    accent: "#6C5CE7",
    green: "#10B981",
    red: "#EF4444",
    yellow: "#F59E0B",
    blue: "#3B82F6",
  };
}

// AI insights are now powered by the backend API

// ─── Auth Page ───
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

function AuthPage({ onAuth, t }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [pending2FAUser, setPending2FAUser] = useState(null);
  const [tfaCode, setTfaCode] = useState("");
  const [tfaError, setTfaError] = useState("");
  const [tfaLoading, setTfaLoading] = useState(false);

  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  // Handle auth response - check if 2FA is required
  const processAuthResponse = async (data) => {
    if (data.requires2FA) {
      setNeeds2FA(true);
      setPending2FAUser({ userId: data.userId, userName: data.userName });
      return;
    }
    api.setToken(data.token);
    api.setUser(data.user);
    onAuthRef.current(data.user);
  };

  // 2FA verification
  const handle2FASubmit = async () => {
    if (!tfaCode || tfaCode.length < 6) { setTfaError("Enter 6-digit code"); return; }
    setTfaLoading(true);
    setTfaError("");
    try {
      const valid = await api.validate2FA(pending2FAUser.userId, tfaCode);
      if (valid.valid) {
        const data = await api.complete2FA(pending2FAUser.userId);
        api.setToken(data.token);
        api.setUser(data.user);
        onAuthRef.current(data.user);
      }
    } catch (err) {
      setTfaError(err.message || "Invalid code");
    } finally {
      setTfaLoading(false);
    }
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.google?.accounts?.id?.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            const data = await api.googleLogin(response.credential);
            processAuthResponse(data);
          } catch (err) {
            console.error("Google auth error:", err);
          }
        },
      });
      window.google?.accounts?.id?.renderButton(
        document.getElementById("google-btn"),
        { theme: "outline", size: "large", width: "100%", text: "continue_with", shape: "pill" }
      );
    };
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch(e){} };
  }, []);

  const handleSubmit = async () => {
    setError("");
    if (!email || !password || (mode === "signup" && !name)) { setError("Please fill in all fields"); return; }
    setLoading(true);
    try {
      const data = mode === "signup"
        ? await api.signup({ name, email, password })
        : await api.login({ email, password });
      processAuthResponse(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const is = { width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none", boxSizing: "border-box", background: t.cardAlt || t.bg, color: t.text, transition: "border 0.2s" };

  // 2FA Challenge Screen
  if (needs2FA) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "#6C5CE7", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 12 }}>🔐</div>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, color: t.text, margin: 0 }}>Two-Factor Auth</h1>
            <p style={{ color: t.sub, fontSize: 13, marginTop: 4 }}>Hi {pending2FAUser?.userName || "there"}, enter your code</p>
          </div>
          <div style={{ background: t.card, borderRadius: 16, padding: "28px 24px", boxShadow: t.cs, border: `1px solid ${t.border}` }}>
            {tfaError && <div style={{ background: "#EF444410", color: "#EF4444", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14, textAlign: "center", border: "1px solid #EF444420" }}>{tfaError}</div>}
            <p style={{ color: t.sub, fontSize: 13, textAlign: "center", margin: "0 0 16px" }}>Open your authenticator app and enter the 6-digit code</p>
            <input
              value={tfaCode}
              onChange={e => setTfaCode(e.target.value.replace(/[^0-9A-Za-z]/g, "").substring(0, 8))}
              placeholder="000000"
              maxLength={8}
              style={{ ...is, textAlign: "center", fontSize: 24, fontWeight: 700, letterSpacing: 8, fontFamily: "'Outfit', monospace" }}
              onKeyDown={e => e.key === "Enter" && handle2FASubmit()}
              autoFocus
            />
            <button onClick={handle2FASubmit} disabled={tfaLoading} style={{
              width: "100%", padding: "13px", borderRadius: 10, border: "none",
              background: "#6C5CE7", color: "white", cursor: "pointer",
              fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif",
              marginTop: 16, opacity: tfaLoading ? 0.6 : 1,
            }}>{tfaLoading ? "Verifying..." : "Verify"}</button>
            <p style={{ color: t.sub, fontSize: 11, textAlign: "center", marginTop: 12 }}>You can also use a backup code</p>
            <button onClick={() => { setNeeds2FA(false); setPending2FAUser(null); setTfaCode(""); setTfaError(""); }} style={{
              background: "none", border: "none", color: "#6C5CE7", cursor: "pointer",
              fontSize: 13, fontWeight: 600, width: "100%", marginTop: 8,
            }}>← Back to login</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#6C5CE7", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 12 }}>💸</div>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, color: t.text, margin: 0, letterSpacing: -0.5 }}>BillBuddy</h1>
          <p style={{ color: t.sub, fontSize: 14, marginTop: 4 }}>Smart money management</p>
        </div>
        <div style={{ background: t.card, borderRadius: 16, padding: "28px 24px", boxShadow: t.cs, border: `1px solid ${t.border}` }}>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: "0 0 20px", fontSize: 18, textAlign: "center" }}>
            {mode === "login" ? "Welcome back" : "Create account"}
          </h2>
          {error && <div style={{ background: "#EF444410", color: "#EF4444", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14, textAlign: "center", border: "1px solid #EF444420" }}>{error}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "signup" && (
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={is}
                onFocus={e => e.target.style.borderColor = "#6C5CE7"} onBlur={e => e.target.style.borderColor = t.border} />
            )}
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" type="email" style={is}
              onFocus={e => e.target.style.borderColor = "#6C5CE7"} onBlur={e => e.target.style.borderColor = t.border} />
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" style={is}
              onFocus={e => e.target.style.borderColor = "#6C5CE7"} onBlur={e => e.target.style.borderColor = t.border}
              onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            <button onClick={handleSubmit} disabled={loading} style={{
              width: "100%", padding: "13px", borderRadius: 10, border: "none",
              background: "#6C5CE7", color: "white", cursor: "pointer",
              fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif",
              opacity: loading ? 0.6 : 1,
            }}>{loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: t.border }} />
            <span style={{ color: t.sub, fontSize: 12, fontWeight: 500 }}>OR</span>
            <div style={{ flex: 1, height: 1, background: t.border }} />
          </div>
          <div id="google-btn" style={{ display: "flex", justifyContent: "center" }} />
          <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: t.sub }}>
            {mode === "login" ? "Don't have an account? " : "Already have one? "}
            <span onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
              style={{ color: "#6C5CE7", fontWeight: 600, cursor: "pointer" }}>
              {mode === "login" ? "Sign up" : "Sign in"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
// ─── Dashboard Components ───
function StatCard({ label, value, sub, color, icon, t }) {
  return (
    <div style={{ background: t.card, borderRadius: 12, padding: "14px 16px", boxShadow: t.cs, flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif", letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function BillRow({ bill, onToggle, onDelete, t }) {
  const now = new Date();
  const today = now.getDate();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Calculate days until due, accounting for paid status
  let daysUntilDue;
  let nextDueLabel;

  if (bill.isPaid) {
    // Bill is paid this month — show next month's due date
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const nextDue = new Date(nextYear, nextMonth, bill.dueDate);
    daysUntilDue = Math.ceil((nextDue - now) / (1000 * 60 * 60 * 24));
    nextDueLabel = `Next: ${MONTHS[nextMonth]} ${bill.dueDate}th`;
  } else if (bill.dueDate < today) {
    // Due date has passed this month and NOT paid — this is actually overdue
    daysUntilDue = bill.dueDate - today; // negative = overdue
    nextDueLabel = null;
  } else {
    // Due date is still upcoming this month and not paid
    daysUntilDue = bill.dueDate - today;
    nextDueLabel = null;
  }

  const isOverdue = daysUntilDue < 0 && !bill.isPaid;
  const isDueSoon = !bill.isPaid && daysUntilDue >= 0 && daysUntilDue <= 3;
  const daysAbs = Math.abs(daysUntilDue);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: bill.isPaid ? t.rowPaid : isOverdue ? t.rowOver : t.rowBg, borderRadius: 16, boxShadow: t.cs, borderLeft: `4px solid ${getCatColor(bill.category)}` }}>
      <button onClick={() => onToggle(bill)} style={{ width: 26, height: 26, borderRadius: 8, border: bill.isPaid ? "none" : `2px solid ${t.border}`, background: bill.isPaid ? "#10B981" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{bill.isPaid && "✓"}</button>
      <div style={{ fontSize: 20, flexShrink: 0 }}>{getCatIcon(bill.category)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 14, textDecoration: bill.isPaid ? "line-through" : "none", opacity: bill.isPaid ? 0.5 : 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bill.name}</div>
        <div style={{ fontSize: 11, color: t.sub, marginTop: 2, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          Due: {bill.dueDate}th · {bill.category}
          {bill.isRecurring && <span style={{ background: t.tag, color: "#6C5CE7", padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{bill.frequency === "weekly" ? "WEEKLY" : bill.frequency === "biweekly" ? "BIWEEKLY" : bill.frequency === "daily" ? "DAILY" : "MONTHLY"}</span>}
          {bill.endAmount > 0 && <span style={{ background: "#F59E0B20", color: "#F39C12", padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{formatMoney(bill.totalPaidAmount || 0)}/{formatMoney(bill.endAmount)}</span>}
          {bill.reminder && bill.reminder !== "none" && <span style={{ background: "#FFF8E1", color: "#F39C12", padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>🔔 {reminderLabel(bill.reminder)}</span>}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: bill.isPaid ? "#10B981" : t.text, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(bill.amount)}</div>
        {bill.isPaid ? (
          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: "#6C5CE7" }}>{nextDueLabel}</div>
        ) : (
          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: isOverdue ? "#EF4444" : isDueSoon ? "#F59E0B" : "#10B981" }}>
            {isOverdue ? `OVERDUE ${daysAbs}d` : isDueSoon ? `Due in ${daysUntilDue}d` : daysUntilDue === 0 ? "Due today" : `${daysUntilDue}d left`}
          </div>
        )}
      </div>
      <button onClick={() => onDelete(bill.id)} style={{ width: 26, height: 26, borderRadius: 8, border: "none", background: "#FFF0F0", cursor: "pointer", color: "#EF4444", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>×</button>
    </div>
  );
}

function CalendarView({ bills, cards, t, onMoveBill }) {
  const [cm, setCm] = useState(new Date().getMonth());
  const [cy, setCy] = useState(new Date().getFullYear());
  const [dragBill, setDragBill] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  const [toast, setToast] = useState(null);
  const dim = getDaysInMonth(cy, cm), fd = getFirstDayOfMonth(cy, cm);
  const now = new Date(), isCur = cm === now.getMonth() && cy === now.getFullYear();
  const cells = []; for (let i = 0; i < fd; i++) cells.push(null); for (let d = 1; d <= dim; d++) cells.push(d);

  // Merge bills and credit cards into calendar items
  const getItemsForDay = (day) => {
    const billItems = bills.filter(b => b.dueDate === day).map(b => ({ ...b, type: "bill" }));
    const cardItems = (cards || []).filter(c => c.dueDate === day && c.balance > 0).map(c => ({ id: `card-${c.id}`, name: c.name, amount: c.minPayment, dueDate: c.dueDate, category: "Credit Card", type: "card", balance: c.balance }));
    return [...billItems, ...cardItems];
  };
  const dayTotal = (day) => getItemsForDay(day).reduce((s, item) => s + item.amount, 0);

  const handleDragStart = (e, bill) => {
    setDragBill(bill);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", bill.id);
  };

  const handleDragOver = (e, day) => {
    if (!day || !dragBill) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDay(day);
  };

  const handleDragLeave = () => {
    setDragOverDay(null);
  };

  const handleDrop = async (e, day) => {
    e.preventDefault();
    setDragOverDay(null);
    if (!dragBill || !day || day === dragBill.dueDate) { setDragBill(null); return; }
    const oldDay = dragBill.dueDate;
    onMoveBill(dragBill.id, day);
    setToast(`Moved "${dragBill.name}" from the ${oldDay}th → ${day}th`);
    setTimeout(() => setToast(null), 3000);
    setDragBill(null);
  };

  const handleDragEnd = () => {
    setDragBill(null);
    setDragOverDay(null);
  };

  return (
    <div style={{ background: t.card, borderRadius: 14, padding: 28, boxShadow: t.cs }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <button onClick={() => { if (cm === 0) { setCm(11); setCy(cy - 1); } else setCm(cm - 1); }} style={{ background: t.pill, border: "none", borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 16, fontWeight: 700, color: t.text }}>‹</button>
        <div style={{ fontWeight: 800, fontSize: 18, fontFamily: "'Outfit', sans-serif", color: t.text }}>{MONTHS[cm]} {cy}</div>
        <button onClick={() => { if (cm === 11) { setCm(0); setCy(cy + 1); } else setCm(cm + 1); }} style={{ background: t.pill, border: "none", borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 16, fontWeight: 700, color: t.text }}>›</button>
      </div>
      <div style={{ fontSize: 11, color: t.muted, textAlign: "center", marginBottom: 14 }}>💡 Drag a bill to a different day to change its due date</div>

      {/* Toast notification */}
      {toast && (
        <div style={{
          background: "#10B981", color: "white",
          padding: "10px 18px", borderRadius: 12, fontWeight: 700, fontSize: 13,
          marginBottom: 12, textAlign: "center",
          boxShadow: "0 4px 16px rgba(78,205,196,0.3)",
        }}>✅ {toast}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: t.muted, padding: "4px 0" }}>{d}</div>)}
        {cells.map((day, i) => {
          const db = day ? getItemsForDay(day) : [];
          const isT = isCur && day === now.getDate();
          const total = dayTotal(day);
          const isDropTarget = dragOverDay === day && dragBill && day !== dragBill.dueDate;
          return (
            <div
              key={i}
              onDragOver={e => handleDragOver(e, day)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, day)}
              style={{
                minHeight: 80, borderRadius: 10, padding: "4px 5px",
                background: isDropTarget ? "#6C5CE720" : isT ? t.today : day ? t.cell : "transparent",
                border: isDropTarget ? "2px dashed #6C5CE7" : isT ? "2px solid #6C5CE7" : "2px solid transparent",
                overflow: "hidden",
                transition: "background 0.15s, border 0.15s",
              }}
            >
              {day && <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <div style={{ fontSize: 12, fontWeight: isT ? 800 : 600, color: isT ? "#6C5CE7" : t.sub }}>{day}</div>
                  {total > 0 && <div style={{ fontSize: 9, fontWeight: 700, color: "#6C5CE7", background: "#6C5CE715", padding: "1px 5px", borderRadius: 4 }}>{formatMoney(total)}</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {db.slice(0, 3).map(b => (
                    <div
                      key={b.id}
                      draggable={b.type === "bill"}
                      onDragStart={b.type === "bill" ? (e => handleDragStart(e, b)) : undefined}
                      onDragEnd={b.type === "bill" ? handleDragEnd : undefined}
                      style={{
                        display: "flex", alignItems: "center", gap: 3,
                        padding: "2px 4px", borderRadius: 4,
                        background: b.type === "card" ? "#EF444415" : dragBill?.id === b.id ? "#6C5CE730" : b.isPaid ? "#10B98115" : getCatColor(b.category) + "18",
                        opacity: dragBill?.id === b.id ? 0.4 : b.isPaid ? 0.5 : 1,
                        cursor: b.type === "bill" ? "grab" : "default",
                        transition: "opacity 0.15s",
                      }}
                    >
                      <div style={{ width: 4, height: 4, borderRadius: 2, background: b.type === "card" ? "#EF4444" : b.isPaid ? "#10B981" : getCatColor(b.category), flexShrink: 0 }} />
                      <div style={{ fontSize: 9, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textDecoration: b.isPaid ? "line-through" : "none" }}>
                        {b.type === "card" ? `💳 ${b.name}` : b.name}
                      </div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: b.type === "card" ? "#EF4444" : t.sub, flexShrink: 0 }}>{formatMoney(b.amount)}</div>
                    </div>
                  ))}
                  {db.length > 3 && <div style={{ fontSize: 8, color: t.sub, fontWeight: 700, textAlign: "center" }}>+{db.length - 3} more</div>}
                </div>
              </>}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {CATEGORIES.map(c => bills.some(b => b.category === c.name) ? <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: t.sub }}><div style={{ width: 8, height: 8, borderRadius: 4, background: c.color }} />{c.name}</div> : null)}
        {(cards || []).some(c => c.balance > 0) && <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: t.sub }}><div style={{ width: 8, height: 8, borderRadius: 4, background: "#EF4444" }} />💳 Credit Card</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: t.sub }}><div style={{ width: 8, height: 8, borderRadius: 4, background: "#10B981", opacity: 0.5 }} />Paid</div>
      </div>
    </div>
  );
}

function ActivityView({ t }) {
  const [activity, setActivity] = useState(null);
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const data = await api.getActivity(days, filter); setActivity(data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [days, filter]);

  if (loading && !activity) return <div style={{ textAlign: "center", padding: 60, color: t.sub }}>Loading activity...</div>;
  if (!activity) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 28 }}>📋</div>
        <div>
          <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 18 }}>All Activity</h3>
          <p style={{ margin: 0, fontSize: 12, color: t.sub }}>{activity.summary.transactionCount} transactions</p>
        </div>
      </div>
      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div style={{ background: t.card, borderRadius: 12, padding: "10px 14px", boxShadow: t.cs }}>
          <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Money In</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#10B981", fontFamily: "'Outfit', sans-serif" }}>+{formatMoney(activity.summary.totalIn)}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 12, padding: "10px 14px", boxShadow: t.cs }}>
          <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Money Out</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#EF4444", fontFamily: "'Outfit', sans-serif" }}>-{formatMoney(activity.summary.totalOut)}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 12, padding: "10px 14px", boxShadow: t.cs }}>
          <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Pending</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#F59E0B", fontFamily: "'Outfit', sans-serif" }}>{activity.summary.pendingCount}</div>
        </div>
      </div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[["all", "All"], ["in", "💵 Money In"], ["out", "💸 Money Out"], ["pending", "⏳ Pending"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: filter === k ? "#6C5CE7" : t.pill, color: filter === k ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        {[7, 14, 30, 60, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: days === d ? t.card : "transparent", color: days === d ? t.text : t.muted, cursor: "pointer", fontWeight: 700, fontSize: 10, fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: days === d ? t.cs : "none" }}>{d}d</button>
        ))}
      </div>
      {/* Transaction list grouped by date */}
      {Object.entries(activity.grouped).map(([date, txns]) => (
        <div key={date}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.sub, padding: "6px 4px", position: "sticky", top: 0, background: t.bg, zIndex: 1 }}>{new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
          {txns.map(tx => (
            <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: t.card, borderRadius: 12, boxShadow: t.cs, marginBottom: 4, opacity: tx.pending ? 0.7 : 1 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: tx.isIncome ? "#10B98110" : "#EF444410", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                {tx.pending ? "⏳" : tx.isIncome ? "💵" : "💸"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.name}</div>
                <div style={{ fontSize: 10, color: t.sub }}>{tx.accountName} {tx.mask ? `••••${tx.mask}` : ""}{tx.pending ? " · Pending" : ""}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 13, color: tx.isIncome ? "#10B981" : "#EF4444", fontFamily: "'Outfit', sans-serif", flexShrink: 0 }}>
                {tx.isIncome ? "+" : "-"}{formatMoney(Math.abs(tx.amount))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SubscriptionDetector({ t }) {
  const [subs, setSubs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null);

  useEffect(() => {
    (async () => {
      try { const data = await api.detectSubscriptions(); setSubs(data.detected || []); }
      catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  const addAsBill = async (sub) => {
    setAdding(sub.name);
    try {
      await api.createBill({ name: sub.name, amount: sub.amount, dueDate: sub.suggestedDueDate, category: sub.category, isRecurring: true });
      setSubs(prev => prev.filter(s => s.name !== sub.name));
    } catch (err) { console.error(err); }
    finally { setAdding(null); }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: t.sub }}>Scanning your transactions for recurring charges...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 28 }}>🔍</div>
        <div>
          <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 18 }}>Detected Subscriptions</h3>
          <p style={{ margin: 0, fontSize: 12, color: t.sub }}>Recurring charges found in your bank statements</p>
        </div>
      </div>
      {subs.length === 0 && <div style={{ background: t.card, borderRadius: 14, padding: "24px 18px", boxShadow: t.cs, textAlign: "center" }}><div style={{ fontSize: 28, marginBottom: 8 }}>✅</div><div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>All caught up!</div><div style={{ fontSize: 12, color: t.sub, marginTop: 4 }}>No untracked recurring charges found.</div></div>}
      {subs.map(sub => (
        <div key={sub.name} style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{sub.name}</div>
              <div style={{ fontSize: 11, color: t.sub }}>{sub.category} · {sub.frequency} · {sub.occurrences}x in 90 days</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(sub.amount)}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => addAsBill(sub)} disabled={adding === sub.name} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {adding === sub.name ? "Adding..." : "📋 Add as Bill"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SavingsAdvisor({ t }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalType, setGoalType] = useState("general");

  const load = async () => {
    try { const d = await api.getSavingsAdvice(); setData(d); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const createGoal = async () => {
    try { await api.createSavingsGoal({ name: goalName, targetAmount: parseFloat(goalTarget), accountType: goalType }); setShowGoalForm(false); setGoalName(""); setGoalTarget(""); load(); } catch (err) { console.error(err); }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: t.sub }}>Calculating your savings potential...</div>;
  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 28 }}>🐷</div>
        <div>
          <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 18 }}>Savings Advisor</h3>
          <p style={{ margin: 0, fontSize: 12, color: t.sub }}>How much you can put aside</p>
        </div>
      </div>
      {/* Big savings number */}
      <div style={{ background: "#10B981", borderRadius: 16, padding: "20px 22px", color: "white" }}>
        <div style={{ fontSize: 12, opacity: 0.9 }}>You can save</div>
        <div style={{ display: "flex", gap: 20, alignItems: "baseline", marginTop: 6 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(data.savings.perPaycheck)}</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>{data.savings.paycheckLabel}</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(data.savings.conservative)}</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>per month (comfortable)</div>
          </div>
        </div>
      </div>
      {/* Breakdown */}
      <div style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs }}>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 13, marginBottom: 8 }}>📊 Your Numbers</div>
        {[
          ["Monthly Income", formatMoney(data.income.monthly), "#10B981"],
          ["Fixed Bills", `-${formatMoney(data.expenses.bills)}`, "#EF4444"],
          ["Card Minimums", `-${formatMoney(data.expenses.cardMins)}`, "#EF4444"],
          ["Other Spending", `-${formatMoney(data.expenses.discretionary)}`, "#F59E0B"],
        ].map(([label, val, color]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${t.border}` }}>
            <span style={{ fontSize: 12, color: t.sub }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color }}>{val}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", marginTop: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>💰 Available to Save</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: data.savings.potential >= 0 ? "#10B981" : "#EF4444", fontFamily: "'Outfit', sans-serif" }}>{formatMoney(data.savings.potential)}</span>
        </div>
      </div>
      {/* Savings goals */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>🎯 Savings Goals</div>
        <button onClick={() => setShowGoalForm(true)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>+ New Goal</button>
      </div>
      {showGoalForm && (
        <div style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs }}>
          <input value={goalName} onChange={e => setGoalName(e.target.value)} placeholder="Goal name (e.g. Emergency Fund, Kid's College)" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `2px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", boxSizing: "border-box", marginBottom: 8 }} />
          <input type="number" value={goalTarget} onChange={e => setGoalTarget(e.target.value)} placeholder="Target amount" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `2px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", boxSizing: "border-box", marginBottom: 8 }} />
          <select value={goalType} onChange={e => setGoalType(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `2px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", boxSizing: "border-box", marginBottom: 8 }}>
            <option value="general">General Savings</option>
            <option value="emergency">Emergency Fund</option>
            <option value="kids">Kids Fund</option>
            <option value="vacation">Vacation</option>
            <option value="ezpass">EZ-Pass</option>
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowGoalForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Cancel</button>
            <button onClick={createGoal} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Create Goal</button>
          </div>
        </div>
      )}
      {data.goals.map(g => (
        <div key={g.id} style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{g.accountType === "kids" ? "👶" : g.accountType === "ezpass" ? "🛣️" : g.accountType === "emergency" ? "🆘" : "🎯"} {g.name}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#6C5CE7" }}>{g.progress}%</div>
          </div>
          <div style={{ height: 8, background: t.prog, borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg, #10B981, #6C5CE7)", width: `${Math.min(g.progress, 100)}%`, transition: "width 0.5s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: t.sub }}>
            <span>{formatMoney(g.current)} saved</span>
            <span>{formatMoney(g.target)} goal</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ForecastView({ t }) {
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const data = await api.getForecast(); setForecast(data); }
      catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: t.sub }}>Building your forecast...</div>;
  if (!forecast || !forecast.days.length) return <div style={{ textAlign: "center", padding: 40, color: t.sub }}>Connect your bank to see a spending forecast</div>;

  const maxBal = Math.max(...forecast.days.map(d => d.balance), 0);
  const minBal = Math.min(...forecast.days.map(d => d.balance), 0);
  const range = maxBal - minBal || 1;
  const chartH = 180;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 32 }}>📈</div>
        <div>
          <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 20 }}>30-Day Forecast</h3>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Projected balance based on upcoming bills & income</p>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div style={{ background: t.card, borderRadius: 12, padding: "12px 14px", boxShadow: t.cs }}>
          <div style={{ fontSize: 10, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Today</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#10B981", fontFamily: "'Outfit', sans-serif" }}>{formatMoney(forecast.startBalance)}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 12, padding: "12px 14px", boxShadow: t.cs }}>
          <div style={{ fontSize: 10, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Lowest Point</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: forecast.lowestBalance >= 0 ? "#F59E0B" : "#EF4444", fontFamily: "'Outfit', sans-serif" }}>{formatMoney(forecast.lowestBalance)}</div>
          <div style={{ fontSize: 10, color: t.sub }}>{forecast.lowestDate}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 12, padding: "12px 14px", boxShadow: t.cs }}>
          <div style={{ fontSize: 10, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>In 30 Days</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: forecast.endBalance >= 0 ? "#10B981" : "#EF4444", fontFamily: "'Outfit', sans-serif" }}>{formatMoney(forecast.endBalance)}</div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ background: t.card, borderRadius: 16, padding: "18px 12px 10px", boxShadow: t.cs, overflow: "hidden" }}>
        <svg width="100%" height={chartH + 30} viewBox={`0 0 ${forecast.days.length * 24} ${chartH + 30}`} style={{ display: "block" }}>
          {/* Zero line */}
          {minBal < 0 && <line x1="0" y1={chartH - ((0 - minBal) / range) * chartH} x2={forecast.days.length * 24} y2={chartH - ((0 - minBal) / range) * chartH} stroke="#EF4444" strokeWidth="1" strokeDasharray="4" opacity="0.4" />}
          {/* Area fill */}
          <path d={
            `M 0 ${chartH} ` +
            forecast.days.map((d, i) => `L ${i * 24 + 12} ${chartH - ((d.balance - minBal) / range) * chartH}`).join(" ") +
            ` L ${(forecast.days.length - 1) * 24 + 12} ${chartH} Z`
          } fill="url(#forecastGrad)" opacity="0.15" />
          <defs>
            <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6C5CE7" /><stop offset="100%" stopColor="#6C5CE700" />
            </linearGradient>
          </defs>
          {/* Line */}
          <polyline
            points={forecast.days.map((d, i) => `${i * 24 + 12},${chartH - ((d.balance - minBal) / range) * chartH}`).join(" ")}
            fill="none" stroke="#6C5CE7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          />
          {/* Event dots */}
          {forecast.days.map((d, i) => d.events.length > 0 ? (
            <circle key={i} cx={i * 24 + 12} cy={chartH - ((d.balance - minBal) / range) * chartH} r="4"
              fill={d.events.some(e => e.amount > 0) ? "#10B981" : "#EF4444"} stroke="white" strokeWidth="1.5" />
          ) : null)}
          {/* Day labels (every 5 days) */}
          {forecast.days.map((d, i) => i % 5 === 0 ? (
            <text key={i} x={i * 24 + 12} y={chartH + 20} textAnchor="middle" fontSize="9" fill={t.sub} fontFamily="Plus Jakarta Sans">{d.label}</text>
          ) : null)}
        </svg>
      </div>

      {/* Day by day breakdown */}
      <div style={{ background: t.card, borderRadius: 16, padding: "14px 18px", boxShadow: t.cs }}>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 13, marginBottom: 10 }}>📋 Upcoming Events</div>
        {forecast.days.filter(d => d.events.length > 0).slice(0, 10).map((d, i) => (
          <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 4 }}>{d.label}</div>
            {d.events.map((e, j) => (
              <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "2px 8px", fontSize: 12 }}>
                <span style={{ color: t.sub }}>{e.type === "income" ? "💵" : e.type === "card" ? "💳" : "📋"} {e.name}</span>
                <span style={{ fontWeight: 700, color: e.amount > 0 ? "#10B981" : "#EF4444" }}>{e.amount > 0 ? "+" : ""}{formatMoney(e.amount)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 8px", fontSize: 11, color: t.sub, marginTop: 2 }}>
              <span>Balance after</span>
              <span style={{ fontWeight: 700, color: d.balance >= 0 ? t.text : "#EF4444" }}>{formatMoney(d.balance)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SmartAlertsView({ t }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const data = await api.getAlerts(); setAlerts(data.alerts || []); }
      catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: t.sub }}>Analyzing your spending...</div>;

  const sevColors = { high: "#EF4444", medium: "#F59E0B", low: "#6C5CE7", positive: "#10B981" };
  const sevBg = { high: "#EF444412", medium: "#F59E0B12", low: "#6C5CE712", positive: "#10B98112" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 32 }}>🔔</div>
        <div>
          <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 20 }}>Smart Alerts</h3>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Spending patterns and things to watch</p>
        </div>
      </div>
      {alerts.length === 0 && <div style={{ background: t.card, borderRadius: 16, padding: "30px 20px", boxShadow: t.cs, textAlign: "center" }}><div style={{ fontSize: 32, marginBottom: 8 }}>✅</div><div style={{ fontWeight: 700, color: t.text }}>All good!</div><div style={{ fontSize: 13, color: t.sub, marginTop: 4 }}>No spending anomalies detected. Keep it up!</div></div>}
      {alerts.map((a, i) => (
        <div key={i} style={{ background: sevBg[a.severity] || t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs, borderLeft: `4px solid ${sevColors[a.severity] || t.sub}` }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ fontSize: 22, flexShrink: 0 }}>{a.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 3 }}>{a.title}</div>
              <div style={{ fontSize: 13, color: t.sub, lineHeight: 1.5 }}>{a.desc}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function NegotiateView({ bills, t }) {
  const [opportunities, setOpportunities] = useState(null);
  const [selectedBill, setSelectedBill] = useState(null);
  const [script, setScript] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scriptLoading, setScriptLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try { const data = await api.getNegotiateOpportunities(); setOpportunities(data); }
      catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  const getScript = async (billId) => {
    setSelectedBill(billId);
    setScriptLoading(true);
    setScript(null);
    try { const data = await api.getNegotiationScript(billId); setScript(data); }
    catch (err) { console.error(err); }
    finally { setScriptLoading(false); }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: t.sub }}>Finding negotiation opportunities...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 32 }}>📞</div>
        <div>
          <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 20 }}>Bill Negotiation</h3>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>AI-powered scripts to lower your bills</p>
        </div>
      </div>

      {/* Potential savings */}
      {opportunities && opportunities.totalPotentialMonthlySavings > 0 && (
        <div style={{ background: "#10B981", borderRadius: 16, padding: "18px 22px", color: "white" }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>Estimated potential savings</div>
          <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
            <div><div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(opportunities.totalPotentialMonthlySavings)}</div><div style={{ fontSize: 11, opacity: 0.8 }}>/month</div></div>
            <div><div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(opportunities.totalPotentialYearlySavings)}</div><div style={{ fontSize: 11, opacity: 0.8 }}>/year</div></div>
          </div>
        </div>
      )}

      {/* Opportunities */}
      {opportunities?.opportunities?.map(opp => (
        <div key={opp.id} style={{ background: t.card, borderRadius: 14, padding: "16px 18px", boxShadow: t.cs }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{opp.name}</div>
              <div style={{ fontSize: 12, color: t.sub }}>{opp.category} · {formatMoney(opp.amount)}/mo</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#10B981", fontFamily: "'Outfit', sans-serif" }}>Save ~{formatMoney(opp.potentialSavings)}/mo</div>
              <div style={{ fontSize: 10, color: t.sub }}>Difficulty: {opp.difficulty}</div>
            </div>
          </div>
          <button onClick={() => getScript(opp.id)} disabled={scriptLoading && selectedBill === opp.id} style={{
            width: "100%", padding: "10px", borderRadius: 10, border: "none",
            background: selectedBill === opp.id && script ? t.prog : "#6C5CE7",
            color: selectedBill === opp.id && script ? t.text : "white",
            cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            {scriptLoading && selectedBill === opp.id ? "🧠 Generating script..." : selectedBill === opp.id && script ? "📋 Script ready below ↓" : "📞 Get Negotiation Script"}
          </button>
        </div>
      ))}

      {/* Generated script */}
      {script && (
        <div style={{ background: t.card, borderRadius: 16, padding: "20px 22px", boxShadow: t.cs, borderLeft: "4px solid #6C5CE7" }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 16, marginBottom: 12 }}>📞 Negotiation Guide for {script.billName}</div>

          <div style={{ fontSize: 12, color: t.sub, marginBottom: 12 }}>
            Call: <strong style={{ color: t.text }}>{script.providerPhone}</strong> · Best time: <strong style={{ color: t.text }}>{script.bestTimeToCall}</strong>
          </div>

          {/* Script sections */}
          {[
            ["🗣️ Opening", script.script?.opener],
            ["💰 The Ask", script.script?.mainAsk],
            ["🤝 If They Resist", script.script?.ifTheyResist],
            ["⬆️ Escalation", script.script?.escalation],
            ["✅ Closing", script.script?.closer],
          ].map(([label, text], i) => text ? (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#6C5CE7", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, color: t.text, lineHeight: 1.6, background: t.prog, padding: "10px 14px", borderRadius: 10, fontStyle: "italic" }}>"{text}"</div>
            </div>
          ) : null)}

          {/* Tips */}
          {script.tips?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 6 }}>💡 Tips</div>
              {script.tips.map((tip, i) => (
                <div key={i} style={{ fontSize: 12, color: t.sub, padding: "3px 0", display: "flex", gap: 6 }}>
                  <span>•</span><span>{tip}</span>
                </div>
              ))}
            </div>
          )}

          {/* Alternatives */}
          {script.alternativeProviders?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 6 }}>🔄 Mention These Competitors</div>
              {script.alternativeProviders.map((alt, i) => (
                <div key={i} style={{ fontSize: 12, color: t.sub, padding: "2px 0" }}>• {alt}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {(!opportunities?.opportunities?.length) && (
        <div style={{ background: t.card, borderRadius: 16, padding: "30px 20px", boxShadow: t.cs, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontWeight: 700, color: t.text }}>Add recurring bills first</div>
          <div style={{ fontSize: 13, color: t.sub, marginTop: 4 }}>Add your phone, internet, insurance, and other recurring bills to find negotiation opportunities.</div>
        </div>
      )}
    </div>
  );
}

function SpendingChart({ bills, t }) {
  const ct = CATEGORIES.map(c => ({ ...c, total: bills.filter(b => b.category === c.name).reduce((s, b) => s + b.amount, 0) })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const mx = Math.max(...ct.map(c => c.total), 1), tot = ct.reduce((s, c) => s + c.total, 0);
  let cum = 0;
  const sl = ct.map(c => { const a = (c.total / tot) * 360; const st = cum; cum += a; return { ...c, sa: st, ea: cum }; });
  const p2c = (cx, cy, r, a) => { const rd = ((a - 90) * Math.PI) / 180; return { x: cx + r * Math.cos(rd), y: cy + r * Math.sin(rd) }; };
  const arc = (cx, cy, r, sa, ea) => { const s = p2c(cx, cy, r, ea), e = p2c(cx, cy, r, sa); return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${ea - sa > 180 ? 1 : 0} 0 ${e.x} ${e.y} Z`; };
  return (
    <div style={{ background: t.card, borderRadius: 14, padding: 28, boxShadow: t.cs }}>
      <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: "0 0 20px", fontSize: 18 }}>Spending Breakdown</h3>
      <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
        <svg width="160" height="160" viewBox="0 0 160 160">
          {sl.map((s, i) => <path key={i} d={arc(80, 80, 75, s.sa, s.ea)} fill={s.color} opacity={0.85} />)}
          <circle cx="80" cy="80" r="40" fill={t.card} />
          <text x="80" y="76" textAnchor="middle" fontWeight="800" fontSize="15" fill={t.text} fontFamily="Outfit">{formatMoney(tot)}</text>
          <text x="80" y="92" textAnchor="middle" fontSize="9" fill={t.sub}>/month</text>
        </svg>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 200 }}>
          {ct.map(c => (<div key={c.name}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 13, fontWeight: 600, color: t.sub }}>{c.icon} {c.name}</span><span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{formatMoney(c.total)}</span></div><div style={{ height: 8, background: t.prog, borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${c.color}, ${c.color}CC)`, width: `${(c.total / mx) * 100}%`, transition: "width 0.5s" }} /></div></div>))}
        </div>
      </div>
    </div>
  );
}

function HistoryView({ history, months, filter, setFilter, t }) {
  const f = filter === "all" ? history : history.filter(h => h.month === filter);
  const totP = f.reduce((s, h) => s + h.amount, 0), late = f.filter(h => h.status === "late").length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ fontSize: 32 }}>📜</div><div><h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 20 }}>Payment History</h3><p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Track what you've paid and when</p></div></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setFilter("all")} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: filter === "all" ? "#6C5CE7" : t.pill, color: filter === "all" ? "white" : t.sub, fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>All</button>
        {months.map(m => <button key={m} onClick={() => setFilter(m)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: filter === m ? "#6C5CE7" : t.pill, color: filter === m ? "white" : t.sub, fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{m}</button>)}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {[["Total Paid", formatMoney(totP), "#10B981"], ["Payments", f.length, t.text], ["Late", late, late > 0 ? "#EF4444" : "#10B981"]].map(([l, v, c]) => (
          <div key={l} style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c, fontFamily: "'Outfit', sans-serif", marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {f.map(h => (
          <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: h.status === "on-time" ? t.hOk : t.hLate, borderRadius: 14, boxShadow: t.cs, borderLeft: `4px solid ${h.status === "on-time" ? "#10B981" : "#EF4444"}` }}>
            <div style={{ fontSize: 20 }}>{getCatIcon(h.category)}</div>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{h.billName}</div><div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>Paid {h.paidDate} · {h.category}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontWeight: 800, fontSize: 15, color: t.text, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(h.amount)}</div><div style={{ fontSize: 10, fontWeight: 700, marginTop: 2, padding: "2px 8px", borderRadius: 6, display: "inline-block", background: h.status === "on-time" ? "#10B98120" : "#EF444420", color: h.status === "on-time" ? "#10B981" : "#EF4444" }}>{h.status === "on-time" ? "ON TIME" : "LATE"}</div></div>
          </div>
        ))}
        {!f.length && <div style={{ textAlign: "center", padding: 40, color: t.sub }}>No payment history yet</div>}
      </div>
    </div>
  );
}

function RemindersView({ bills, onUpdate, t }) {
  const [toast, setToast] = useState(null);
  const [feedUrl, setFeedUrl] = useState(null);
  const [webcalUrl, setWebcalUrl] = useState(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handle = (id, v) => { onUpdate(id, v); const b = bills.find(x => x.id === id); if (v !== "none") { setToast(`🔔 Reminder set for ${b?.name}: ${reminderLabel(v)}`); setTimeout(() => setToast(null), 2500); } };

  const generateFeed = async () => {
    setFeedLoading(true);
    try {
      const data = await api.getCalendarToken();
      setFeedUrl(data.feedUrl);
      setWebcalUrl(data.webcalUrl);
    } catch (err) { console.error(err); }
    finally { setFeedLoading(false); }
  };

  const copyUrl = () => {
    if (feedUrl) {
      navigator.clipboard.writeText(feedUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    }
  };

  const resetFeed = async () => {
    setFeedLoading(true);
    try {
      const data = await api.resetCalendarToken();
      setFeedUrl(data.feedUrl);
      setWebcalUrl(data.webcalUrl);
    } catch (err) { console.error(err); }
    finally { setFeedLoading(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ fontSize: 32 }}>🔔</div><div><h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 20 }}>Notification Reminders</h3><p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Never miss a due date</p></div></div>
      {toast && <div style={{ background: "#10B981", color: "white", padding: "12px 20px", borderRadius: 14, fontWeight: 700, fontSize: 14 }}>{toast}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {bills.map(bill => (
          <div key={bill.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: t.card, borderRadius: 16, boxShadow: t.cs, borderLeft: `4px solid ${getCatColor(bill.category)}` }}>
            <div style={{ fontSize: 20 }}>{getCatIcon(bill.category)}</div>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{bill.name}</div><div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>Due {bill.dueDate}th · {formatMoney(bill.amount)}</div></div>
            <select value={bill.reminder || "none"} onChange={e => handle(bill.id, e.target.value)} style={{ padding: "8px 14px", borderRadius: 10, border: `2px solid ${bill.reminder && bill.reminder !== "none" ? "#10B981" : t.border}`, background: bill.reminder && bill.reminder !== "none" ? "#10B98110" : t.input, color: t.text, fontSize: 12, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: "pointer", outline: "none" }}>
              {REMINDER_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Calendar Sync Section */}
      <div style={{ background: t.card, borderRadius: 14, padding: "22px 26px", boxShadow: t.cs, marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 26 }}>📱</div>
          <div>
            <div style={{ fontWeight: 700, color: t.text, fontSize: 16 }}>Sync to Phone Calendar</div>
            <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>All your bill due dates will show up right on your phone's calendar</div>
          </div>
        </div>

        {!feedUrl ? (
          <button onClick={generateFeed} disabled={feedLoading} style={{
            width: "100%", padding: "14px", borderRadius: 14, border: "none",
            background: "#6C5CE7", color: "white",
            cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif",
            opacity: feedLoading ? 0.7 : 1,
          }}>{feedLoading ? "Generating..." : "🔗 Set Up Calendar Sync"}</button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* ONE-TAP SUBSCRIBE BUTTON */}
            <a
              href={webcalUrl}
              onClick={(e) => {
                try { window.location.href = webcalUrl; } catch(err) {}
              }}
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                width: "100%", padding: "16px", borderRadius: 14, border: "none",
                background: "#10B981", color: "white",
                cursor: "pointer", fontWeight: 700, fontSize: 16, fontFamily: "'Plus Jakarta Sans', sans-serif",
                textDecoration: "none", boxShadow: "0 4px 16px rgba(78,205,196,0.3)",
                boxSizing: "border-box",
              }}
            >
              📲 Subscribe to BillBuddy Calendar
            </a>
            <div style={{ fontSize: 11, color: t.sub, textAlign: "center" }}>
              This creates a <strong style={{ color: t.text }}>live subscription</strong> — your phone will automatically pull updates when you add, move, or pay bills. No need to re-sync.
            </div>

            {/* Direct download fallback */}
            <a
              href={feedUrl}
              download="billbuddy.ics"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "12px", borderRadius: 12, border: `2px solid ${t.border}`,
                background: "transparent", color: t.text,
                cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif",
                textDecoration: "none", boxSizing: "border-box",
              }}
            >
              📥 Download .ics Snapshot Instead
            </a>
            <div style={{ fontSize: 11, color: t.muted, textAlign: "center" }}>
              One-time import — won't auto-update. Use the Subscribe button above for live sync.
            </div>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0" }}>
              <div style={{ flex: 1, height: 1, background: t.border }} />
              <span style={{ fontSize: 11, color: t.muted, fontWeight: 600 }}>OR COPY URL MANUALLY</span>
              <div style={{ flex: 1, height: 1, background: t.border }} />
            </div>

            {/* Feed URL with copy */}
            <div style={{ display: "flex", gap: 8 }}>
              <input value={feedUrl} readOnly style={{
                flex: 1, padding: "10px 14px", borderRadius: 10, border: `2px solid ${t.border}`,
                background: t.input, color: t.text, fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif",
                outline: "none",
              }} onClick={e => e.target.select()} />
              <button onClick={copyUrl} style={{
                padding: "10px 18px", borderRadius: 10, border: "none",
                background: copied ? "#10B981" : "#6C5CE7",
                color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12,
                fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: "nowrap",
              }}>{copied ? "✅ Copied!" : "📋 Copy"}</button>
            </div>

            {/* Instructions for manual setup */}
            <details style={{ background: t.prog, borderRadius: 14, padding: "4px 18px" }}>
              <summary style={{ fontWeight: 700, color: t.text, fontSize: 13, cursor: "pointer", padding: "12px 0" }}>Manual setup instructions</summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 14 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 8, background: "#6C5CE7", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>1</div>
                  <div style={{ fontSize: 12, color: t.sub, lineHeight: 1.5 }}><strong style={{ color: t.text }}>iPhone:</strong> Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar → paste the URL above</div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 8, background: "#6C5CE7", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>2</div>
                  <div style={{ fontSize: 12, color: t.sub, lineHeight: 1.5 }}><strong style={{ color: t.text }}>Google Calendar:</strong> Settings → Add calendar → From URL → paste the URL above</div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 8, background: "#6C5CE7", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>3</div>
                  <div style={{ fontSize: 12, color: t.sub, lineHeight: 1.5 }}><strong style={{ color: t.text }}>Outlook:</strong> Add calendar → Subscribe from web → paste the URL above</div>
                </div>
              </div>
            </details>

            {/* What's included */}
            <div style={{ fontSize: 12, color: t.sub, lineHeight: 1.6 }}>
              ✅ Bill due dates with amounts · ✅ Credit card payment dates · ✅ Reminder alerts · ✅ Paid/unpaid status · ✅ Auto-refreshes every 6 hours
            </div>

            {/* Reset button */}
            <button onClick={resetFeed} style={{
              padding: "8px 16px", borderRadius: 10, border: `1px solid ${t.border}`,
              background: "transparent", color: t.sub, cursor: "pointer",
              fontWeight: 600, fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif", alignSelf: "flex-start",
            }}>🔄 Generate New URL (invalidates old one)</button>
          </div>
        )}
      </div>
    </div>
  );
}

function AIInsights({ t }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const data = await api.getInsights();
      setSuggestions(data.suggestions || []);
      setLoaded(true);
    } catch (err) {
      console.error("Insights error:", err);
      setSuggestions([{ icon: "⚠️", title: "Couldn't Load Insights", desc: "Something went wrong fetching your personalized tips. Try again in a moment.", priority: "low" }]);
      setLoaded(true);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (!loaded) fetchInsights(); }, [loaded]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 32 }}>🤖</div>
          <div>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 20 }}>AI Insights</h3>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Personalized tips powered by AI</p>
          </div>
        </div>
        <button onClick={() => { setLoaded(false); }} disabled={loading} style={{
          padding: "8px 18px", borderRadius: 12, border: "none",
          background: loading ? t.pill : "#6C5CE7",
          color: loading ? t.sub : "white", cursor: loading ? "default" : "pointer",
          fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          {loading ? "Analyzing..." : "🔄 Refresh"}
        </button>
      </div>

      {loading && (
        <div style={{ background: t.card, borderRadius: 14, padding: "40px 28px", boxShadow: t.cs, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12, animation: "pulse 1.5s ease-in-out infinite" }}>🧠</div>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 16, fontFamily: "'Outfit', sans-serif", marginBottom: 6 }}>Analyzing your bills...</div>
          <div style={{ fontSize: 13, color: t.sub, lineHeight: 1.6 }}>Our AI is reviewing your spending, due dates, payment history, and categories to find personalized ways to save money and stay on track.</div>
          <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }`}</style>
        </div>
      )}

      {!loading && suggestions.map((s, i) => (
        <div key={i} style={{
          background: t.card, borderRadius: 14, padding: "18px 22px", boxShadow: t.cs,
          borderLeft: `4px solid ${s.priority === "high" ? "#EF4444" : s.priority === "medium" ? "#F59E0B" : "#10B981"}`,
        }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ fontSize: 26, flexShrink: 0 }}>{s.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: 13, color: t.sub, lineHeight: 1.6 }}>{s.desc}</div>
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, flexShrink: 0, textTransform: "uppercase",
              background: s.priority === "high" ? t.priH : s.priority === "medium" ? t.priM : t.priL,
              color: s.priority === "high" ? "#EF4444" : s.priority === "medium" ? "#F39C12" : "#10B981",
            }}>{s.priority}</div>
          </div>
        </div>
      ))}

      {!loading && loaded && (
        <div style={{ textAlign: "center", fontSize: 11, color: t.muted, marginTop: 4 }}>
          Insights generated by AI based on your current bills and payment history
        </div>
      )}
    </div>
  );
}

function BankTransactionsTab({ accounts, transactions, acctFilter, setAcctFilter, txnDays, setTxnDays, setTransactions, t }) {
  const acctTypes = [...new Set(accounts.map(a => a.type))];
  const filteredTxns = acctFilter === "all" ? transactions :
    transactions.filter(tx => {
      const acct = accounts.find(a => a.accountId === tx.accountId);
      return acct && acct.type === acctFilter;
    });
  const pending = filteredTxns.filter(tx => tx.pending);
  const completed = filteredTxns.filter(tx => !tx.pending);
  const pendingTotal = pending.reduce((s, tx) => s + tx.amount, 0);

  const renderTxn = (txn) => {
    const acct = accounts.find(a => a.accountId === txn.accountId);
    const isCredit = acct?.type === "credit";
    return (
      <div key={txn.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: t.card, borderRadius: 10, boxShadow: t.cs }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: txn.pending ? "#F59E0B10" : txn.amount > 0 ? "#EF444410" : "#10B98110", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
          {txn.pending ? "⏳" : txn.amount > 0 ? "💸" : "💵"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: t.text, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{txn.name}</div>
          <div style={{ fontSize: 11, color: t.sub, marginTop: 1, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <span>{txn.date}</span><span>·</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: isCredit ? "#EF4444" : "#10B981", flexShrink: 0 }} />
              {txn.accountName} {txn.mask ? `••${txn.mask}` : ""}
            </span>
            {txn.category && txn.category !== "Other" && <span style={{ background: t.pill, padding: "0px 5px", borderRadius: 3, fontSize: 9, fontWeight: 600 }}>{txn.category}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: txn.amount > 0 ? "#EF4444" : "#10B981", fontFamily: "'Outfit', sans-serif" }}>
            {txn.amount > 0 ? "-" : "+"}{formatMoney(Math.abs(txn.amount))}
          </div>
          {txn.pending && <div style={{ fontSize: 9, fontWeight: 700, color: "#F59E0B", marginTop: 1 }}>PENDING</div>}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 3, background: t.cardAlt || t.pill, borderRadius: 8, padding: 3 }}>
        <button onClick={() => setAcctFilter("all")} style={{ flex: 1, padding: "7px 8px", borderRadius: 6, border: "none", background: acctFilter === "all" ? "#6C5CE7" : "transparent", color: acctFilter === "all" ? "white" : t.sub, cursor: "pointer", fontWeight: 600, fontSize: 11 }}>All</button>
        {acctTypes.includes("depository") && (
          <button onClick={() => setAcctFilter("depository")} style={{ flex: 1, padding: "7px 8px", borderRadius: 6, border: "none", background: acctFilter === "depository" ? "#10B981" : "transparent", color: acctFilter === "depository" ? "white" : t.sub, cursor: "pointer", fontWeight: 600, fontSize: 11 }}>🏦 Bank</button>
        )}
        {acctTypes.includes("credit") && (
          <button onClick={() => setAcctFilter("credit")} style={{ flex: 1, padding: "7px 8px", borderRadius: 6, border: "none", background: acctFilter === "credit" ? "#EF4444" : "transparent", color: acctFilter === "credit" ? "white" : t.sub, cursor: "pointer", fontWeight: 600, fontSize: 11 }}>💳 Credit</button>
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[7, 14, 30, 60].map(d => (
          <button key={d} onClick={() => { setTxnDays(d); api.getBankTransactions(d).then(setTransactions); }} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: txnDays === d ? t.card : "transparent", color: txnDays === d ? t.text : t.muted, cursor: "pointer", fontWeight: 600, fontSize: 10, boxShadow: txnDays === d ? t.cs : "none" }}>{d}d</button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: t.sub, alignSelf: "center" }}>{filteredTxns.length} txns</span>
      </div>
      {pending.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 4px" }}>
            <span style={{ fontWeight: 700, color: "#F59E0B", fontSize: 13 }}>⏳ Pending ({pending.length})</span>
            <span style={{ fontWeight: 700, color: "#F59E0B", fontSize: 12 }}>{formatMoney(Math.abs(pendingTotal))}</span>
          </div>
          {pending.map(renderTxn)}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}>
            <div style={{ flex: 1, height: 1, background: t.border }} />
            <span style={{ fontSize: 10, color: t.muted, fontWeight: 600 }}>COMPLETED</span>
            <div style={{ flex: 1, height: 1, background: t.border }} />
          </div>
        </>
      )}
      {completed.map(renderTxn)}
      {!filteredTxns.length && <div style={{ textAlign: "center", padding: 30, color: t.sub, fontSize: 13 }}>No {acctFilter === "credit" ? "credit card" : acctFilter === "depository" ? "bank" : ""} transactions found.</div>}
    </div>
  );
}

function BankAccountsView({ t }) {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("overview");
  const [txnDays, setTxnDays] = useState(30);
  const [acctFilter, setAcctFilter] = useState("all");

  const loadData = async () => {
    try {
      const [accts, sum, itms] = await Promise.all([
        api.getBankAccounts(), api.getBankSummary(), api.getPlaidItems()
      ]);
      setAccounts(accts); setSummary(sum); setItems(itms);
      if (accts.length > 0) {
        const txns = await api.getBankTransactions(txnDays);
        setTransactions(txns);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const connectBank = async () => {
    try {
      const { linkToken } = await api.createLinkToken();
      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            await api.exchangePlaidToken(publicToken, metadata.institution);
            loadData();
          } catch (err) { console.error("Exchange error:", err); }
        },
        onExit: (err) => { if (err) console.error("Plaid Link exit:", err); },
      });
      handler.open();
    } catch (err) { console.error("Link token error:", err); }
  };

  const [syncResult, setSyncResult] = useState(null);

  const syncAll = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.smartSync();
      setSyncResult(result);
      await loadData();
      setTimeout(() => setSyncResult(null), 5000);
    } catch (err) { console.error(err); }
    finally { setSyncing(false); }
  };

  const disconnectBank = async (itemId) => {
    try { await api.disconnectBank(itemId); loadData(); } catch (err) { console.error(err); }
  };

  const acctIcon = (type) => ({ depository: "🏦", credit: "💳", loan: "📋", investment: "📈" }[type] || "🏦");

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: t.sub }}>Loading bank accounts...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 32 }}>🏦</div>
          <div>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 20 }}>Bank Accounts</h3>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>
              {items.length > 0 ? `${items.length} bank${items.length > 1 ? "s" : ""} connected` : "Connect your bank to see balances & transactions"}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {accounts.length > 0 && (
            <button onClick={syncAll} disabled={syncing} style={{ padding: "8px 16px", borderRadius: 12, border: "none", background: t.pill, color: t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {syncing ? "Syncing..." : "🔄 Sync"}
            </button>
          )}
          <button onClick={connectBank} style={{ padding: "8px 16px", borderRadius: 12, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            + Connect Bank
          </button>
        </div>
      </div>

      {/* Sync result toast */}
      {syncResult && (
        <div style={{ background: "#10B981", color: "white", padding: "12px 20px", borderRadius: 14, fontWeight: 600, fontSize: 13, boxShadow: "0 4px 16px rgba(78,205,196,0.3)" }}>
          ✅ Synced: {syncResult.balancesUpdated} balance{syncResult.balancesUpdated !== 1 ? "s" : ""} updated
          {syncResult.billsMatched > 0 && ` · ${syncResult.billsMatched} bill${syncResult.billsMatched !== 1 ? "s" : ""} auto-matched`}
          {syncResult.incomeDetected > 0 && ` · ${syncResult.incomeDetected} income deposit${syncResult.incomeDetected !== 1 ? "s" : ""} detected`}
          {syncResult.cardsUpdated > 0 && ` · ${syncResult.cardsUpdated} credit card${syncResult.cardsUpdated !== 1 ? "s" : ""} updated`}
        </div>
      )}

      {/* Summary cards */}
      {summary && accounts.length > 0 && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {[
            ["Total Balance", formatMoney(summary.totalBalance), "#10B981"],
            ["Checking", formatMoney(summary.totalChecking), "#6C5CE7"],
            ["Savings", formatMoney(summary.totalSavings), "#3B82F6"],
          ].filter(([, v]) => v !== "$0.00").map(([label, value, color]) => (
            <div key={label} style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "'Outfit', sans-serif", marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 30-day flow */}
      {summary && summary.thirtyDaySpending > 0 && (
        <div style={{ background: t.card, borderRadius: 16, padding: "18px 22px", boxShadow: t.cs }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 10 }}>📊 Last 30 Days</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, color: t.sub }}>Money In</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#10B981", fontFamily: "'Outfit', sans-serif" }}>+{formatMoney(summary.thirtyDayIncome)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: t.sub }}>Money Out</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#EF4444", fontFamily: "'Outfit', sans-serif" }}>-{formatMoney(summary.thirtyDaySpending)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: t.sub }}>Net</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: summary.netFlow >= 0 ? "#10B981" : "#EF4444", fontFamily: "'Outfit', sans-serif" }}>{summary.netFlow >= 0 ? "+" : ""}{formatMoney(summary.netFlow)}</div>
            </div>
          </div>
          {/* Category breakdown */}
          {summary.spendingByCategory?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: t.sub, fontWeight: 600, marginBottom: 8 }}>Top Spending Categories</div>
              {summary.spendingByCategory.slice(0, 5).map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                  <span style={{ fontSize: 13, color: t.text }}>{c.category}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{formatMoney(c.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* View toggle */}
      {accounts.length > 0 && (
        <div style={{ display: "flex", gap: 4, background: t.pill, borderRadius: 12, padding: 4, alignSelf: "flex-start" }}>
          {[["overview", "🏦 Accounts"], ["transactions", "📋 Transactions"], ["banks", "⚙️ Connected Banks"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: view === k ? "#6C5CE7" : "transparent", color: view === k ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{l}</button>
          ))}
        </div>
      )}

      {/* Accounts list */}
      {view === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {accounts.map(a => {
            const acctTxns = transactions.filter(tx => tx.accountId === a.accountId);
            const pendingOut = acctTxns.filter(tx => tx.pending && tx.amount > 0);
            const pendingIn = acctTxns.filter(tx => tx.pending && tx.amount < 0);
            const pendingOutTotal = pendingOut.reduce((s, tx) => s + tx.amount, 0);
            const pendingInTotal = pendingIn.reduce((s, tx) => s + Math.abs(tx.amount), 0);
            // Use balanceAvailable if the bank provides it (already accounts for pending), otherwise use balanceCurrent
            const projectedBalance = a.balanceAvailable > 0 ? a.balanceAvailable : a.balanceCurrent;
            const hasPending = pendingOut.length > 0 || pendingIn.length > 0;

            return (
              <div key={a.id} style={{ background: t.card, borderRadius: 14, boxShadow: t.cs, overflow: "hidden" }}>
                {/* Account header */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px" }}>
                  <div style={{ fontSize: 24 }}>{acctIcon(a.type)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: t.text, fontSize: 15 }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>{a.institution} · {a.subtype} · ••••{a.mask}</div>
                  </div>
                </div>

                {/* Balance breakdown */}
                <div style={{ padding: "0 22px 18px" }}>
                  {/* Current balance - big number */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: t.sub }}>Available Balance</span>
                    <span style={{ fontSize: 26, fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(a.balanceAvailable > 0 ? a.balanceAvailable : a.balanceCurrent)}</span>
                  </div>

                  {hasPending && (
                    <>
                      {/* Divider */}
                      <div style={{ height: 1, background: t.border, margin: "0 0 12px" }} />

                      {/* Pending money out */}
                      {pendingOut.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#EF4444" }}>💸 Money Out (Pending)</span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: "#EF4444", fontFamily: "'Outfit', sans-serif" }}>-{formatMoney(pendingOutTotal)}</span>
                          </div>
                          {pendingOut.map(tx => (
                            <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 12px", marginBottom: 3, background: "#EF444408", borderRadius: 8 }}>
                              <span style={{ fontSize: 12, color: t.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>{tx.name}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#EF4444", flexShrink: 0 }}>-{formatMoney(tx.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Pending money in */}
                      {pendingIn.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#10B981" }}>💵 Money In (Pending)</span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: "#10B981", fontFamily: "'Outfit', sans-serif" }}>+{formatMoney(pendingInTotal)}</span>
                          </div>
                          {pendingIn.map(tx => (
                            <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 12px", marginBottom: 3, background: "#10B98108", borderRadius: 8 }}>
                              <span style={{ fontSize: 12, color: t.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>{tx.name}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#10B981", flexShrink: 0 }}>+{formatMoney(Math.abs(tx.amount))}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Divider */}
                      <div style={{ height: 1, background: t.border, margin: "4px 0 12px" }} />

                      {/* Projected balance */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: projectedBalance >= 0 ? "#10B98110" : "#EF444410", borderRadius: 12 }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Balance After Pending</span>
                          <div style={{ fontSize: 10, color: t.sub, marginTop: 1 }}>When all pending transactions clear</div>
                        </div>
                        <span style={{ fontSize: 22, fontWeight: 800, color: projectedBalance >= 0 ? "#10B981" : "#EF4444", fontFamily: "'Outfit', sans-serif" }}>{formatMoney(projectedBalance)}</span>
                      </div>
                    </>
                  )}

                  {/* Fallback: No individual pending txns but balance differs from available (bank has holds/pending) */}
                  {!hasPending && a.balanceAvailable > 0 && Math.abs(a.balanceCurrent - a.balanceAvailable) > 0.50 && (
                    <>
                      <div style={{ height: 1, background: t.border, margin: "0 0 12px" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#F59E0B" }}>⏳ Pending / Holds</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#F59E0B", fontFamily: "'Outfit', sans-serif" }}>-{formatMoney(a.balanceCurrent - a.balanceAvailable)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: t.sub, marginBottom: 10 }}>Your bank reports holds or pending charges not yet itemized</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: a.balanceAvailable >= 0 ? "#10B98110" : "#EF444410", borderRadius: 12 }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Available Balance</span>
                          <div style={{ fontSize: 10, color: t.sub, marginTop: 1 }}>What you can actually spend right now</div>
                        </div>
                        <span style={{ fontSize: 22, fontWeight: 800, color: a.balanceAvailable >= 0 ? "#10B981" : "#EF4444", fontFamily: "'Outfit', sans-serif" }}>{formatMoney(a.balanceAvailable)}</span>
                      </div>
                    </>
                  )}

                  {!hasPending && (a.balanceAvailable <= 0 || Math.abs(a.balanceCurrent - a.balanceAvailable) <= 0.50) && (
                    <div style={{ fontSize: 11, color: t.muted, marginTop: 6 }}>✅ No pending transactions — balance is current</div>
                  )}
                </div>
              </div>
            );
          })}
          {!accounts.length && (
            <div style={{ background: t.card, borderRadius: 14, padding: "40px 28px", boxShadow: t.cs, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏦</div>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 16, fontFamily: "'Outfit', sans-serif", marginBottom: 6 }}>No Banks Connected</div>
              <div style={{ fontSize: 13, color: t.sub, lineHeight: 1.6, marginBottom: 16 }}>Connect your bank to see balances, track spending, and auto-import transactions.</div>
              <button onClick={connectBank} style={{ padding: "12px 32px", borderRadius: 14, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>🔗 Connect Your Bank</button>
            </div>
          )}
        </div>
      )}

      {/* Transactions */}
      {view === "transactions" && <BankTransactionsTab accounts={accounts} transactions={transactions} acctFilter={acctFilter} setAcctFilter={setAcctFilter} txnDays={txnDays} setTxnDays={setTxnDays} setTransactions={setTransactions} t={t} />}

      {/* Connected banks management */}
      {view === "banks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: t.card, borderRadius: 16, boxShadow: t.cs }}>
              <div style={{ fontSize: 22 }}>🏦</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{item.institutionName}</div>
                <div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>Connected {new Date(item.connectedAt).toLocaleDateString()}</div>
              </div>
              <button onClick={() => disconnectBank(item.id)} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid #EF4444`, background: "transparent", color: "#EF4444", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Disconnect</button>
            </div>
          ))}
          <button onClick={connectBank} style={{ padding: "14px", borderRadius: 14, border: `2px dashed ${t.border}`, background: "transparent", color: t.sub, cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>+ Connect Another Bank</button>
        </div>
      )}
    </div>
  );
}

function AddSourceModal({ t, is, lb, onClose, onAdd }) {
  const [n, setN] = useState(""); const [a, setA] = useState(""); const [f, setF] = useState("biweekly"); const [np, setNp] = useState(""); const [saving, setSaving] = useState(false);
  const go = async () => { if (!n || !a) return; setSaving(true); await onAdd({ name: n, amount: parseFloat(a), frequency: f, nextPayDate: np || null }); setSaving(false); };
  return (
    <div style={{ position: "fixed", inset: 0, background: t.over, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: t.modal, borderRadius: 16, padding: "24px 20px", width: "92%", maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 20px", fontFamily: "'Outfit', sans-serif", color: t.text, fontSize: 18 }}>Add Income Source</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={lb}>Source Name</label><input value={n} onChange={e => setN(e.target.value)} placeholder="e.g. Day Job, Freelance" style={is} /></div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><label style={lb}>Amount ($)</label><input type="number" value={a} onChange={e => setA(e.target.value)} placeholder="2500" style={is} /></div>
            <div style={{ flex: 1 }}><label style={lb}>Frequency</label>
              <select value={f} onChange={e => setF(e.target.value)} style={{ ...is, cursor: "pointer" }}>
                <option value="weekly">Weekly</option><option value="biweekly">Bi-Weekly</option>
                <option value="semimonthly">Semi-Monthly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
              </select>
            </div>
          </div>
          <div><label style={lb}>Next Pay Date (optional)</label><input type="date" value={np} onChange={e => setNp(e.target.value)} style={is} /></div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid ${t.border}`, background: "transparent", cursor: "pointer", fontWeight: 700, fontSize: 13, color: t.sub }}>Cancel</button>
            <button onClick={go} disabled={saving} style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: "#10B981", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 13, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Add Source"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogIncomeModal({ t, is, lb, sources, onClose, onLog }) {
  const [src, setSrc] = useState(sources.length > 0 ? sources[0].name : "");
  const [srcId, setSrcId] = useState(sources.length > 0 ? sources[0].id : null);
  const [a, setA] = useState(sources.length > 0 ? String(sources[0].amount) : "");
  const [dt, setDt] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const pickSource = (s) => { setSrc(s.name); setSrcId(s.id); setA(String(s.amount)); };
  const go = async () => { if (!src || !a) return; setSaving(true); await onLog({ sourceId: srcId, sourceName: src, amount: parseFloat(a), receivedDate: dt }); setSaving(false); };
  return (
    <div style={{ position: "fixed", inset: 0, background: t.over, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: t.modal, borderRadius: 16, padding: "24px 20px", width: "92%", maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 20px", fontFamily: "'Outfit', sans-serif", color: t.text, fontSize: 18 }}>Log Income</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sources.length > 0 && (
            <div><label style={lb}>Quick Select</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {sources.map(s => <button key={s.id} onClick={() => pickSource(s)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid", borderColor: srcId === s.id ? "#10B981" : t.border, background: srcId === s.id ? "#10B98115" : "transparent", cursor: "pointer", fontSize: 11, fontWeight: 700, color: srcId === s.id ? "#10B981" : t.sub }}>{s.name}</button>)}
              </div>
            </div>
          )}
          <div><label style={lb}>Source Name</label><input value={src} onChange={e => { setSrc(e.target.value); setSrcId(null); }} placeholder="e.g. Paycheck" style={is} /></div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><label style={lb}>Amount ($)</label><input type="number" value={a} onChange={e => setA(e.target.value)} placeholder="2500" style={is} /></div>
            <div style={{ flex: 1 }}><label style={lb}>Date</label><input type="date" value={dt} onChange={e => setDt(e.target.value)} style={is} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid ${t.border}`, background: "transparent", cursor: "pointer", fontWeight: 700, fontSize: 13, color: t.sub }}>Cancel</button>
            <button onClick={go} disabled={saving} style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: "#10B981", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 13, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Log Income"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IncomeView({ t }) {
  const [sources, setSources] = useState([]);
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showAddSource, setShowAddSource] = useState(false);
  const [showLogIncome, setShowLogIncome] = useState(false);
  const [entryFilter, setEntryFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("overview"); // overview | sources | history
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState(null);
  const [addingDetected, setAddingDetected] = useState({});

  const loadData = async () => {
    try {
      // Auto-cleanup duplicate income entries first
      await api.cleanupIncomeEntries().catch(() => {});
      const [src, ent, sum] = await Promise.all([
        api.getIncomeSources(), api.getIncomeEntries(), api.getIncomeSummary()
      ]);
      setSources(src); setEntries(ent); setSummary(sum);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const addSource = async (src) => {
    try { const s = await api.createIncomeSource(src); setSources(p => [...p, s]); setShowAddSource(false); loadData(); } catch (err) { console.error(err); }
  };

  const deleteSource = async (id) => {
    setSources(p => p.filter(s => s.id !== id));
    try { await api.deleteIncomeSource(id); loadData(); } catch { loadData(); }
  };

  const logEntry = async (entry) => {
    try { await api.createIncomeEntry(entry); setShowLogIncome(false); loadData(); } catch (err) { console.error(err); }
  };

  const deleteEntry = async (id) => {
    setEntries(p => p.filter(e => e.id !== id));
    try { await api.deleteIncomeEntry(id); loadData(); } catch { loadData(); }
  };

  const detectFromBank = async () => {
    setDetecting(true);
    try {
      const result = await api.detectIncome();
      setDetected(result);
    } catch (err) { console.error(err); }
    finally { setDetecting(false); }
  };

  const addDetectedAsSource = async (item) => {
    setAddingDetected(p => ({ ...p, [item.name]: true }));
    try {
      await api.createIncomeSource({
        name: item.name,
        amount: item.amountVaries ? item.avgAmount : item.lastAmount,
        frequency: item.frequency,
      });
      setDetected(prev => ({
        ...prev,
        detected: prev.detected.map(d => d.name === item.name ? { ...d, alreadyTracked: true } : d)
      }));
      loadData();
    } catch (err) { console.error(err); }
    finally { setAddingDetected(p => ({ ...p, [item.name]: false })); }
  };

  const freqLabel = (f) => ({ weekly: "Weekly", biweekly: "Bi-Weekly", semimonthly: "Semi-Monthly", monthly: "Monthly", yearly: "Yearly" }[f] || f);
  const freqToMonthly = (amt, freq) => {
    switch (freq) {
      case "weekly": return amt * 4.33;
      case "biweekly": return amt * 2.17;
      case "semimonthly": return amt * 2;
      case "yearly": return amt / 12;
      default: return amt;
    }
  };

  const is = { width: "100%", padding: "12px 16px", borderRadius: 12, border: `2px solid ${t.border}`, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none", boxSizing: "border-box", background: t.input, color: t.text };
  const lb = { fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: t.sub }}>Loading income...</div>;

  const filteredEntries = entryFilter === "all" ? entries : entries.filter(e => e.month === entryFilter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 32 }}>💰</div>
          <div>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 20 }}>Income</h3>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Track earnings & see what's left after bills</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={detectFromBank} disabled={detecting} style={{ padding: "8px 16px", borderRadius: 12, border: "none", background: "#3B82F6", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif", opacity: detecting ? 0.6 : 1 }}>{detecting ? "Scanning..." : "🏦 Detect from Bank"}</button>
          <button onClick={() => setShowAddSource(true)} style={{ padding: "8px 16px", borderRadius: 12, border: "none", background: t.pill, color: t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>+ Income Source</button>
          <button onClick={() => setShowLogIncome(true)} style={{ padding: "8px 16px", borderRadius: 12, border: "none", background: "#10B981", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>💵 Log Income</button>
        </div>
      </div>

      {/* Overview cards */}
      {summary && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Est. Monthly Income</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#10B981", fontFamily: "'Outfit', sans-serif", marginTop: 2 }}>{formatMoney(summary.estimatedMonthly)}</div>
          </div>
          <div style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Monthly Expenses</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#EF4444", fontFamily: "'Outfit', sans-serif", marginTop: 2 }}>{formatMoney(summary.totalExpenses)}</div>
          </div>
          <div style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Left After Bills</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: summary.leftover >= 0 ? "#10B981" : "#EF4444", fontFamily: "'Outfit', sans-serif", marginTop: 2 }}>{formatMoney(summary.leftover)}</div>
          </div>
        </div>
      )}

      {/* Income vs Expenses bar */}
      {summary && summary.estimatedMonthly > 0 && (
        <div style={{ background: t.card, borderRadius: 16, padding: "18px 22px", boxShadow: t.cs }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>Income vs Expenses</span>
            <span style={{ fontWeight: 800, color: summary.leftover >= 0 ? "#10B981" : "#EF4444", fontFamily: "'Outfit', sans-serif", fontSize: 14 }}>
              {(summary.totalExpenses / summary.estimatedMonthly * 100).toFixed(0)}% spent
            </span>
          </div>
          <div style={{ height: 14, background: t.prog, borderRadius: 7, overflow: "hidden", position: "relative" }}>
            <div style={{ height: "100%", borderRadius: 7, background: summary.totalExpenses / summary.estimatedMonthly > 0.8 ? "linear-gradient(90deg, #EF4444, #FF8E8E)" : "linear-gradient(90deg, #10B981, #6C5CE7)", width: `${Math.min(summary.totalExpenses / summary.estimatedMonthly * 100, 100)}%`, transition: "width 0.5s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: t.sub }}>
            <span>Bills: {formatMoney(summary.monthlyBills)} + Cards: {formatMoney(summary.monthlyCardMins)}</span>
            <span>{formatMoney(summary.estimatedMonthly)} income</span>
          </div>
        </div>
      )}

      {/* Received this month */}
      {summary && (
        <div style={{ background: t.card, borderRadius: 16, padding: "18px 22px", boxShadow: t.cs }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 6 }}>📅 {summary.thisMonth}</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, color: t.sub }}>Received</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#10B981", fontFamily: "'Outfit', sans-serif" }}>{formatMoney(summary.actualThisMonth)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: t.sub }}>Expected</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(summary.estimatedMonthly)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: t.sub }}>Remaining to receive</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#F59E0B", fontFamily: "'Outfit', sans-serif" }}>{formatMoney(Math.max(0, summary.estimatedMonthly - summary.actualThisMonth))}</div>
            </div>
          </div>
        </div>
      )}

      {/* Detected Income from Bank */}
      {detected && (
        <div style={{ background: t.card, borderRadius: 16, padding: "18px 22px", boxShadow: t.cs, border: "2px solid #3B82F630" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 15 }}>🏦 Detected Income from Bank</div>
              <div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>Found {detected.detected?.length || 0} recurring deposits in your last 90 days</div>
            </div>
            <button onClick={() => setDetected(null)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: t.pill, cursor: "pointer", color: t.sub, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
          {detected.detected?.length === 0 && (
            <div style={{ textAlign: "center", padding: 20, color: t.sub, fontSize: 13 }}>No recurring deposits detected. Try connecting your bank or syncing first.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {detected.detected?.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: item.alreadyTracked ? t.bg : (t.cardAlt || t.bg), borderRadius: 12, border: `1px solid ${item.isLikelyPayroll ? "#10B98130" : t.border}`, opacity: item.alreadyTracked ? 0.6 : 1 }}>
                <div style={{ fontSize: 20, flexShrink: 0 }}>{item.isLikelyPayroll ? "💼" : "💵"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: t.text, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.name}
                    {item.isLikelyPayroll && <span style={{ marginLeft: 8, fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "#10B98120", color: "#10B981", fontWeight: 800, textTransform: "uppercase" }}>Payroll</span>}
                    {item.alreadyTracked && <span style={{ marginLeft: 8, fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "#6C5CE720", color: "#6C5CE7", fontWeight: 800, textTransform: "uppercase" }}>Tracked</span>}
                  </div>
                  <div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>
                    {item.occurrences}x in 90 days · {item.frequency === "weekly" ? "Weekly" : item.frequency === "biweekly" ? "Bi-Weekly" : "Monthly"}
                    {item.amountVaries ? ` · Varies ($${item.avgAmount.toFixed(0)} avg)` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#10B981", fontFamily: "'Outfit', sans-serif" }}>{formatMoney(item.lastAmount)}</div>
                  <div style={{ fontSize: 10, color: t.sub }}>last: {new Date(item.lastDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                </div>
                {!item.alreadyTracked ? (
                  <button onClick={() => addDetectedAsSource(item)} disabled={addingDetected[item.name]} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#10B981", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 11, flexShrink: 0, opacity: addingDetected[item.name] ? 0.6 : 1 }}>
                    {addingDetected[item.name] ? "..." : "+ Add"}
                  </button>
                ) : (
                  <div style={{ fontSize: 16, flexShrink: 0 }}>✅</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View toggle */}
      <div style={{ display: "flex", gap: 4, background: t.pill, borderRadius: 12, padding: 4, alignSelf: "flex-start" }}>
        {[["sources", "💼 Income Sources"], ["history", "📋 Income Log"]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: view === k ? "#6C5CE7" : "transparent", color: view === k ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{l}</button>
        ))}
      </div>

      {/* Sources list */}
      {view === "sources" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sources.map(s => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: t.card, borderRadius: 16, boxShadow: t.cs, borderLeft: `4px solid #10B981` }}>
              <div style={{ fontSize: 20, flexShrink: 0 }}>💼</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>
                  {freqLabel(s.frequency)} · {formatMoney(freqToMonthly(s.amount, s.frequency))}/mo
                  {s.nextPayDate && ` · Next: ${s.nextPayDate}`}
                </div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, color: "#10B981", fontFamily: "'Outfit', sans-serif", flexShrink: 0 }}>{formatMoney(s.amount)}</div>
              <div style={{ fontSize: 10, color: t.sub, fontWeight: 700, background: t.pill, padding: "3px 8px", borderRadius: 6 }}>{freqLabel(s.frequency)}</div>
              <button onClick={() => deleteSource(s.id)} style={{ width: 26, height: 26, borderRadius: 8, border: "none", background: "#FFF0F0", cursor: "pointer", color: "#EF4444", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>×</button>
            </div>
          ))}
          {!sources.length && <div style={{ textAlign: "center", padding: 40, color: t.sub }}>No income sources yet — add your job, freelance work, or any recurring income.</div>}
        </div>
      )}

      {/* Income log */}
      {view === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {summary?.months?.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setEntryFilter("all")} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: entryFilter === "all" ? "#6C5CE7" : t.pill, color: entryFilter === "all" ? "white" : t.sub, fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>All</button>
              {summary.months.map(m => <button key={m} onClick={() => setEntryFilter(m)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: entryFilter === m ? "#6C5CE7" : t.pill, color: entryFilter === m ? "white" : t.sub, fontWeight: 700, fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{m}</button>)}
            </div>
          )}
          {filteredEntries.map(e => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: t.card, borderRadius: 14, boxShadow: t.cs, borderLeft: "4px solid #10B981" }}>
              <div style={{ fontSize: 18 }}>💵</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{e.sourceName}</div>
                <div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>{e.receivedDate}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#10B981", fontFamily: "'Outfit', sans-serif" }}>+{formatMoney(e.amount)}</div>
              <button onClick={() => deleteEntry(e.id)} style={{ width: 24, height: 24, borderRadius: 8, border: "none", background: "#FFF0F0", cursor: "pointer", color: "#EF4444", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>×</button>
            </div>
          ))}
          {!filteredEntries.length && <div style={{ textAlign: "center", padding: 40, color: t.sub }}>No income logged yet. Hit "Log Income" to record a paycheck.</div>}
        </div>
      )}

      {/* Add Source Modal */}
      {showAddSource && <AddSourceModal t={t} is={is} lb={lb} onClose={() => setShowAddSource(false)} onAdd={addSource} />}

      {/* Log Income Modal */}
      {showLogIncome && <LogIncomeModal t={t} is={is} lb={lb} sources={sources} onClose={() => setShowLogIncome(false)} onLog={logEntry} />}
    </div>
  );
}

function CreditCardsView({ t }) {
  const [cards, setCards] = useState([]);
  const [showAddCard, setShowAddCard] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [payoff, setPayoff] = useState(null);
  const [strategy, setStrategy] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("cards"); // cards | strategy
  const [plaidCards, setPlaidCards] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [cardTxns, setCardTxns] = useState([]);
  const [cardTxnsLoading, setCardTxnsLoading] = useState(true);

  const loadCards = async () => {
    try {
      const c = await api.getCards();
      setCards(c);
      if (c.length > 1) { try { const s = await api.getDebtStrategy(); setStrategy(s); } catch {} }
      try {
        const accts = await api.getBankAccounts();
        const creditAccts = accts.filter(a => a.type === "credit");
        const unlinked = creditAccts.filter(pa => !c.some(card =>
          card.name.toLowerCase().includes(pa.name.toLowerCase()) ||
          pa.name.toLowerCase().includes(card.name.toLowerCase()) ||
          (card.mask && pa.mask && card.mask === pa.mask)
        ));
        setPlaidCards(unlinked);
        // Load credit card transactions
        if (creditAccts.length > 0) {
          try {
            const allTxns = await api.getBankTransactions(30);
            const creditAcctIds = creditAccts.map(a => a.accountId);
            setCardTxns(allTxns.filter(tx => creditAcctIds.includes(tx.accountId)));
          } catch {}
        }
        setCardTxnsLoading(false);
      } catch { setCardTxnsLoading(false); }
    } catch (err) { console.error(err); setCardTxnsLoading(false); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadCards(); }, []);

  const syncCards = async () => {
    setSyncing(true);
    try {
      await api.smartSync();
      await loadCards();
      setLastSynced(new Date());
    } catch (err) { console.error(err); }
    finally { setSyncing(false); }
  };

  const connectBank = async () => {
    try {
      const { linkToken } = await api.createLinkToken();
      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            await api.exchangePlaidToken(publicToken, metadata.institution);
            // After connecting, check for new credit accounts
            const accts = await api.getBankAccounts();
            const creditAccts = accts.filter(a => a.type === "credit");
            // Auto-add any new credit cards with real liabilities data
            let liabData = [];
            try {
              const liabResp = await api.getLiabilities();
              liabData = liabResp.accounts || [];
            } catch {}

            for (const ca of creditAccts) {
              const exists = cards.some(card =>
                card.name.toLowerCase().includes(ca.name.toLowerCase()) ||
                (card.mask && ca.mask && card.mask === ca.mask)
              );
              if (!exists) {
                const liab = liabData.find(l => l.accountId === ca.accountId && l.type === "credit_card");
                const purchaseApr = liab?.aprs?.find(a => a.apr_type === "purchase_apr");
                const apr = purchaseApr ? purchaseApr.apr_percentage : (liab?.aprs?.[0]?.apr_percentage || 0);
                try {
                  await api.createCard({
                    name: ca.name,
                    balance: ca.balanceCurrent,
                    creditLimit: ca.balanceAvailable ? ca.balanceCurrent + ca.balanceAvailable : 0,
                    apr: apr,
                    minPayment: liab?.minimumPayment || Math.max(25, Math.round(ca.balanceCurrent * 0.02)),
                    dueDate: liab?.nextPaymentDue ? new Date(liab.nextPaymentDue).getDate() : 1,
                  });
                } catch {}
              }
            }
            loadCards();
          } catch (err) { console.error("Exchange error:", err); }
        },
        onExit: () => {},
      });
      handler.open();
    } catch (err) { console.error("Link token error:", err); }
  };

  const importPlaidCard = async (pa) => {
    try {
      let liab = null;
      try {
        const liabResp = await api.getLiabilities();
        liab = (liabResp.accounts || []).find(l => l.accountId === pa.accountId && l.type === "credit_card");
      } catch {}
      const purchaseApr = liab?.aprs?.find(a => a.apr_type === "purchase_apr");
      const apr = purchaseApr ? purchaseApr.apr_percentage : (liab?.aprs?.[0]?.apr_percentage || 0);
      await api.createCard({
        name: pa.name,
        balance: pa.balanceCurrent,
        creditLimit: pa.balanceAvailable ? pa.balanceCurrent + pa.balanceAvailable : 0,
        apr: apr,
        minPayment: liab?.minimumPayment || Math.max(25, Math.round(pa.balanceCurrent * 0.02)),
        dueDate: liab?.nextPaymentDue ? new Date(liab.nextPaymentDue).getDate() : 1,
      });
      setPlaidCards(p => p.filter(c => c.accountId !== pa.accountId));
      loadCards();
    } catch (err) { console.error(err); }
  };

  const addCard = async (card) => {
    try { const c = await api.createCard(card); setCards(p => [...p, c]); setShowAddCard(false); } catch (err) { console.error(err); }
  };

  const deleteCard = async (id) => {
    setCards(p => p.filter(c => c.id !== id));
    try { await api.deleteCard(id); } catch { loadCards(); }
    if (selectedCard?.id === id) { setSelectedCard(null); setPayoff(null); }
  };

  const toggleHistory = async (id, val) => {
    setCards(p => p.map(c => c.id === id ? { ...c, showInHistory: val } : c));
    try { await api.updateCard(id, { showInHistory: val }); } catch {}
  };

  const makePayment = async (card) => {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) return;
    try {
      const res = await api.makeCardPayment(card.id, { amount: amt });
      setCards(p => p.map(c => c.id === card.id ? { ...c, balance: res.newBalance } : c));
      setPayAmount("");
      if (selectedCard?.id === card.id) loadPayoff(card.id);
    } catch (err) { console.error(err); }
  };

  const loadPayoff = async (id) => {
    try {
      const p = await api.getCardPayoff(id);
      setPayoff(p);
    } catch { setPayoff(null); }
  };

  const selectCard = (card) => {
    setSelectedCard(card);
    loadPayoff(card.id);
  };

  const fmtMo = (m) => m === Infinity ? "Never" : m === 1 ? "1 month" : `${m} months`;
  const fmtYr = (m) => m === Infinity ? "Never" : m < 12 ? fmtMo(m) : `${Math.floor(m / 12)}y ${m % 12}m`;

  const is = { width: "100%", padding: "12px 16px", borderRadius: 12, border: `2px solid ${t.border}`, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none", boxSizing: "border-box", background: t.input, color: t.text };
  const totalDebt = cards.reduce((s, c) => s + c.balance, 0);
  const totalLimit = cards.reduce((s, c) => s + c.creditLimit, 0);
  const totalMin = cards.reduce((s, c) => s + c.minPayment, 0);
  const utilization = totalLimit > 0 ? (totalDebt / totalLimit * 100) : 0;

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: t.sub }}>Loading cards...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 18, fontWeight: 700 }}>Credit Cards</h3>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: t.sub }}>
            {cards.length} card{cards.length !== 1 ? "s" : ""}
            {lastSynced && <span> · Synced {lastSynced.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={syncCards} disabled={syncing} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.sub, cursor: "pointer", fontWeight: 600, fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif", opacity: syncing ? 0.6 : 1 }}>
            {syncing ? "⟳ Syncing..." : "🔄 Sync"}
          </button>
          <button onClick={connectBank} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.sub, cursor: "pointer", fontWeight: 600, fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>🔗 Connect</button>
          <button onClick={() => setShowAddCard(true)} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>+ Add</button>
        </div>
      </div>

      {/* Detected Plaid credit cards not yet tracked */}
      {plaidCards.length > 0 && (
        <div style={{ background: "#6C5CE710", borderRadius: 14, padding: "14px 18px", borderLeft: "4px solid #6C5CE7" }}>
          <div style={{ fontWeight: 700, color: "#6C5CE7", fontSize: 13, marginBottom: 8 }}>🔗 Credit cards found in your bank</div>
          {plaidCards.map(pa => (
            <div key={pa.accountId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${t.border}` }}>
              <div>
                <div style={{ fontWeight: 600, color: t.text, fontSize: 13 }}>{pa.name}</div>
                <div style={{ fontSize: 11, color: t.sub }}>{pa.institution} · ••••{pa.mask} · Balance: {formatMoney(pa.balanceCurrent)}</div>
              </div>
              <button onClick={() => importPlaidCard(pa)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>+ Import</button>
            </div>
          ))}
        </div>
      )}

      {/* Overview card — balance + available + utilization */}
      {cards.length > 0 && (
        <div style={{ background: t.card, borderRadius: 12, padding: "16px 18px", boxShadow: t.cs }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>Total Owed</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif", letterSpacing: -0.5 }}>{formatMoney(totalDebt)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>Available</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#10B981", fontFamily: "'Outfit', sans-serif" }}>{formatMoney(totalLimit - totalDebt)}</div>
            </div>
          </div>
          <div style={{ height: 6, background: t.prog, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ height: "100%", borderRadius: 3, background: utilization > 50 ? "#EF4444" : utilization > 30 ? "#F59E0B" : "#10B981", width: `${Math.min(utilization, 100)}%`, transition: "width 0.5s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
            <span style={{ color: t.sub }}>{utilization.toFixed(0)}% of {formatMoney(totalLimit)} limit</span>
            <span style={{ color: t.sub }}>Min due: {formatMoney(totalMin)}/mo</span>
          </div>
        </div>
      )}

      {/* View toggle — 3 tabs now */}
      {cards.length > 0 && (
        <div style={{ display: "flex", gap: 3, background: t.cardAlt || t.pill, borderRadius: 10, padding: 3 }}>
          {[["cards", "💳 Cards"], ["transactions", "📋 Transactions"], ["strategy", "📊 Payoff"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "none", background: view === k ? "#6C5CE7" : "transparent", color: view === k ? "white" : t.sub, cursor: "pointer", fontWeight: 600, fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{l}</button>
          ))}
        </div>
      )}

      {/* Cards list */}
      {view === "cards" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cards.map(card => {
            const pct = card.creditLimit > 0 ? (card.balance / card.creditLimit * 100) : 0;
            const isSelected = selectedCard?.id === card.id;
            return (
              <div key={card.id}>
                <div onClick={() => selectCard(card)} style={{
                  background: t.card, borderRadius: 14, padding: "20px 24px", boxShadow: t.cs, cursor: "pointer",
                  borderLeft: `4px solid ${pct > 50 ? "#EF4444" : pct > 30 ? "#F59E0B" : "#10B981"}`,
                  border: isSelected ? "2px solid #6C5CE7" : undefined,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: t.text, fontSize: 16 }}>💳 {card.name}</div>
                      <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>
                        APR: {card.apr}% · Due: {card.dueDate}th · Min: {formatMoney(card.minPayment)}
                        {card.apr > 0 && <span style={{ marginLeft: 6, background: "#10B98120", color: "#10B981", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4 }}>PLAID</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: t.sub, cursor: "pointer" }}>
                        <div onClick={e => { e.stopPropagation(); toggleHistory(card.id, !card.showInHistory); }} style={{ width: 18, height: 18, borderRadius: 5, border: card.showInHistory ? "none" : `2px solid ${t.border}`, background: card.showInHistory ? "#10B981" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10, fontWeight: 700 }}>{card.showInHistory && "✓"}</div>
                        History
                      </label>
                      <button onClick={e => { e.stopPropagation(); deleteCard(card.id); }} style={{ width: 24, height: 24, borderRadius: 8, border: "none", background: "#FFF0F0", cursor: "pointer", color: "#EF4444", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    </div>
                  </div>
                  {/* Balance bar */}
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 24, fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(card.balance)}</span>
                    <span style={{ fontSize: 13, color: t.sub, alignSelf: "flex-end" }}>of {formatMoney(card.creditLimit)}</span>
                  </div>
                  <div style={{ height: 10, background: t.prog, borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 5, background: pct > 50 ? "linear-gradient(90deg, #EF4444, #FF8E8E)" : pct > 30 ? "linear-gradient(90deg, #F59E0B, #FDE68A)" : "linear-gradient(90deg, #10B981, #6EE7DE)", width: `${Math.min(pct, 100)}%`, transition: "width 0.5s" }} />
                  </div>
                  <div style={{ fontSize: 11, color: t.sub, marginTop: 4 }}>{pct.toFixed(0)}% utilized{card.goalDate ? ` · Goal: pay off by ${card.goalDate}` : ""}</div>
                </div>

                {/* Expanded: payment + payoff */}
                {isSelected && (
                  <div style={{ background: t.card, borderRadius: "0 0 20px 20px", padding: "16px 24px", boxShadow: t.cs, marginTop: -8, borderTop: `1px solid ${t.border}` }}>
                    {/* Make a payment */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
                      <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Payment amount" style={{ ...is, flex: 1 }} onKeyDown={e => e.key === "Enter" && makePayment(card)} />
                      <button onClick={() => makePayment(card)} style={{ padding: "12px 20px", borderRadius: 12, border: "none", background: "#10B981", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: "nowrap" }}>Pay Now</button>
                    </div>

                    {/* Payoff scenarios */}
                    {payoff && payoff.scenarios && (
                      <div>
                        <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 10 }}>📊 Payoff Scenarios</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {payoff.scenarios.map((s, i) => (
                            <div key={i} style={{ background: t.prog, borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                              <div>
                                <div style={{ fontWeight: 700, color: t.text, fontSize: 13 }}>{s.label}</div>
                                <div style={{ fontSize: 11, color: t.sub }}>{formatMoney(s.monthlyPayment)}/mo · {fmtYr(s.months)}</div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#EF4444" }}>{s.totalInterest === Infinity ? "∞" : formatMoney(s.totalInterest)} interest</div>
                                <div style={{ fontSize: 11, color: t.sub }}>{s.totalPaid === Infinity ? "∞" : formatMoney(s.totalPaid)} total</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!cards.length && <div style={{ textAlign: "center", padding: 40, color: t.sub }}>No credit cards yet — add one to start tracking your debt.</div>}
        </div>
      )}

      {/* Transactions view — credit card transactions from Plaid */}
      {view === "transactions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cardTxnsLoading ? (
            <div style={{ textAlign: "center", padding: 30, color: t.sub, fontSize: 13 }}>Loading transactions...</div>
          ) : cardTxns.length > 0 ? (() => {
            const grouped = {};
            cardTxns.forEach(tx => {
              const key = tx.accountName || "Unknown Card";
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push(tx);
            });
            return Object.entries(grouped).map(([cardName, txns]) => (
              <div key={cardName} style={{ background: t.card, borderRadius: 14, overflow: "hidden", boxShadow: t.cs }}>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>💳 {cardName}</div>
                  <div style={{ fontSize: 12, color: t.sub }}>{txns.length} transaction{txns.length !== 1 ? "s" : ""}</div>
                </div>
                {txns.map(tx => (
                  <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${t.border}` }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: tx.amount > 0 ? "#EF444410" : "#10B98110", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                      {tx.pending ? "⏳" : tx.amount > 0 ? "💸" : "💵"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.name}</div>
                      <div style={{ fontSize: 11, color: t.sub }}>{tx.date}{tx.pending ? " · Pending" : ""}</div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: tx.amount > 0 ? "#EF4444" : "#10B981", fontFamily: "'Outfit', sans-serif", flexShrink: 0 }}>
                      {tx.amount > 0 ? "-" : "+"}{formatMoney(Math.abs(tx.amount))}
                    </div>
                  </div>
                ))}
              </div>
            ));
          })() : (
            <div style={{ textAlign: "center", padding: 30, color: t.sub, fontSize: 13 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
              Connect your credit card issuer through Plaid to see transactions here.
            </div>
          )}
        </div>
      )}

      {/* Strategy view */}
      {view === "strategy" && strategy && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { key: "avalanche", title: "🏔️ Avalanche Method", sub: "Pay highest APR first — saves the most money on interest", data: strategy.avalanche },
            { key: "snowball", title: "⛄ Snowball Method", sub: "Pay lowest balance first — quick wins to build momentum", data: strategy.snowball },
          ].map(method => (
            <div key={method.key} style={{ background: t.card, borderRadius: 14, padding: "20px 24px", boxShadow: t.cs }}>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 16, marginBottom: 2 }}>{method.title}</div>
              <div style={{ fontSize: 12, color: t.sub, marginBottom: 14 }}>{method.sub}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {method.data.map((c, i) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: t.prog, borderRadius: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: i === 0 ? "#6C5CE7" : t.pill, display: "flex", alignItems: "center", justifyContent: "center", color: i === 0 ? "white" : t.sub, fontSize: 12, fontWeight: 800 }}>{c.order}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: t.text, fontSize: 13 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: t.sub }}>{method.key === "avalanche" ? `${c.apr}% APR` : formatMoney(c.balance)} · Min {formatMoney(c.minPayment)}</div>
                    </div>
                    <div style={{ fontWeight: 800, color: t.text, fontSize: 14, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(c.balance)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Card Modal */}
      {showAddCard && <AddCardModal onClose={() => setShowAddCard(false)} onAdd={addCard} t={t} />}
    </div>
  );
}

function AddCardModal({ onClose, onAdd, t }) {
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [apr, setApr] = useState("");
  const [minPayment, setMinPayment] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [saving, setSaving] = useState(false);

  const is = { width: "100%", padding: "12px 16px", borderRadius: 12, border: `2px solid ${t.border}`, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none", boxSizing: "border-box", background: t.input, color: t.text };
  const lb = { fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" };

  const go = async () => {
    if (!name || !balance || !dueDate) return;
    setSaving(true);
    await onAdd({ name, balance: parseFloat(balance), creditLimit: parseFloat(creditLimit) || 0, apr: parseFloat(apr) || 0, minPayment: parseFloat(minPayment) || 0, dueDate: parseInt(dueDate), goalDate: goalDate || null, showInHistory: true });
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: t.over, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: t.modal, borderRadius: 16, padding: "24px 20px", width: "92%", maxWidth: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 24px", fontFamily: "'Outfit', sans-serif", color: t.text, fontSize: 22 }}>💳 Add Credit Card</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={lb}>Card Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chase Sapphire" style={is} /></div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><label style={lb}>Current Balance ($)</label><input type="number" value={balance} onChange={e => setBalance(e.target.value)} placeholder="3500.00" style={is} /></div>
            <div style={{ flex: 1 }}><label style={lb}>Credit Limit ($)</label><input type="number" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} placeholder="10000" style={is} /></div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><label style={lb}>APR (%)</label><input type="number" step="0.1" value={apr} onChange={e => setApr(e.target.value)} placeholder="24.99" style={is} /></div>
            <div style={{ flex: 1 }}><label style={lb}>Min Payment ($)</label><input type="number" value={minPayment} onChange={e => setMinPayment(e.target.value)} placeholder="35.00" style={is} /></div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><label style={lb}>Due Date (Day)</label><input type="number" min="1" max="31" value={dueDate} onChange={e => setDueDate(e.target.value)} placeholder="15" style={is} /></div>
            <div style={{ flex: 1 }}><label style={lb}>Payoff Goal Date</label><input type="date" value={goalDate} onChange={e => setGoalDate(e.target.value)} style={is} /></div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: 14, border: `2px solid ${t.border}`, background: t.card, cursor: "pointer", fontWeight: 700, fontSize: 14, color: t.sub, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Cancel</button>
            <button onClick={go} disabled={saving} style={{ flex: 2, padding: 14, borderRadius: 14, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Add Card"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const COMMON_BILLS = [
  // Housing
  { name: "Rent", category: "Housing" }, { name: "Mortgage", category: "Housing" }, { name: "HOA Fees", category: "Housing" }, { name: "Property Tax", category: "Housing" }, { name: "Renters Insurance", category: "Insurance" },
  // Utilities
  { name: "Electric Bill", category: "Utilities" }, { name: "Gas Bill", category: "Utilities" }, { name: "Water Bill", category: "Utilities" }, { name: "Sewer/Trash", category: "Utilities" }, { name: "ConEd", category: "Utilities" }, { name: "National Grid", category: "Utilities" }, { name: "PSE&G", category: "Utilities" }, { name: "Duke Energy", category: "Utilities" }, { name: "PG&E", category: "Utilities" }, { name: "Florida Power & Light", category: "Utilities" }, { name: "ComEd", category: "Utilities" },
  // Phone / Internet
  { name: "Verizon", category: "Phone/Internet" }, { name: "AT&T", category: "Phone/Internet" }, { name: "T-Mobile", category: "Phone/Internet" }, { name: "Sprint", category: "Phone/Internet" }, { name: "Mint Mobile", category: "Phone/Internet" }, { name: "Cricket Wireless", category: "Phone/Internet" }, { name: "Metro by T-Mobile", category: "Phone/Internet" },
  { name: "Xfinity / Comcast", category: "Phone/Internet" }, { name: "Spectrum", category: "Phone/Internet" }, { name: "Cox Internet", category: "Phone/Internet" }, { name: "Frontier Internet", category: "Phone/Internet" }, { name: "Google Fiber", category: "Phone/Internet" }, { name: "Optimum", category: "Phone/Internet" }, { name: "CenturyLink", category: "Phone/Internet" }, { name: "Starlink", category: "Phone/Internet" },
  // Subscriptions
  { name: "Netflix", category: "Subscriptions" }, { name: "Hulu", category: "Subscriptions" }, { name: "Disney+", category: "Subscriptions" }, { name: "HBO Max", category: "Subscriptions" }, { name: "Apple TV+", category: "Subscriptions" }, { name: "Amazon Prime", category: "Subscriptions" }, { name: "Peacock", category: "Subscriptions" }, { name: "Paramount+", category: "Subscriptions" }, { name: "YouTube Premium", category: "Subscriptions" },
  { name: "Spotify", category: "Subscriptions" }, { name: "Apple Music", category: "Subscriptions" }, { name: "Tidal", category: "Subscriptions" }, { name: "SiriusXM", category: "Subscriptions" }, { name: "Pandora", category: "Subscriptions" }, { name: "Amazon Music", category: "Subscriptions" },
  { name: "iCloud Storage", category: "Subscriptions" }, { name: "Google One", category: "Subscriptions" }, { name: "Dropbox", category: "Subscriptions" }, { name: "Microsoft 365", category: "Subscriptions" }, { name: "Adobe Creative Cloud", category: "Subscriptions" },
  { name: "PlayStation Plus", category: "Subscriptions" }, { name: "Xbox Game Pass", category: "Subscriptions" }, { name: "Nintendo Online", category: "Subscriptions" },
  { name: "ChatGPT Plus", category: "Subscriptions" }, { name: "Claude Pro", category: "Subscriptions" },
  { name: "Walmart+", category: "Subscriptions" }, { name: "Costco Membership", category: "Subscriptions" }, { name: "Sam's Club", category: "Subscriptions" },
  // Insurance
  { name: "Car Insurance", category: "Insurance" }, { name: "Health Insurance", category: "Insurance" }, { name: "Life Insurance", category: "Insurance" }, { name: "Home Insurance", category: "Insurance" },
  { name: "GEICO", category: "Insurance" }, { name: "State Farm", category: "Insurance" }, { name: "Progressive", category: "Insurance" }, { name: "Allstate", category: "Insurance" }, { name: "Liberty Mutual", category: "Insurance" }, { name: "USAA", category: "Insurance" },
  // Transportation
  { name: "Car Payment", category: "Transportation" }, { name: "Car Lease", category: "Transportation" }, { name: "EZ Pass", category: "Transportation" }, { name: "Metro Card", category: "Transportation" }, { name: "Gas / Fuel", category: "Transportation" }, { name: "Uber One", category: "Transportation" }, { name: "Lyft", category: "Transportation" },
  // Health
  { name: "Gym Membership", category: "Health" }, { name: "Planet Fitness", category: "Health" }, { name: "LA Fitness", category: "Health" }, { name: "Equinox", category: "Health" }, { name: "CrossFit", category: "Health" },
  { name: "Dental Insurance", category: "Health" }, { name: "Vision Insurance", category: "Health" }, { name: "Prescription", category: "Health" }, { name: "Therapy", category: "Health" },
  // Other
  { name: "Student Loan", category: "Other" }, { name: "Personal Loan", category: "Other" }, { name: "Child Care", category: "Other" }, { name: "Daycare", category: "Other" }, { name: "Tuition", category: "Other" }, { name: "Alimony", category: "Other" }, { name: "Child Support", category: "Other" }, { name: "Storage Unit", category: "Other" }, { name: "Pet Insurance", category: "Other" },
  { name: "Venmo", category: "Other" }, { name: "Cash App", category: "Other" }, { name: "Zelle", category: "Other" },
];

function AddBillModal({ onClose, onAdd, t }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState("Other");
  const [isRecurring, setIsRecurring] = useState(true);
  const [reminder, setReminder] = useState("1day");
  const [saving, setSaving] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredBills, setFilteredBills] = useState([]);
  const inputRef = useRef(null);

  const [frequency, setFrequency] = useState("monthly");
  const [endAmount, setEndAmount] = useState("");

  const handleNameChange = (val) => {
    setName(val);
    if (val.length >= 1) {
      const lower = val.toLowerCase();
      const matches = COMMON_BILLS.filter(b => b.name.toLowerCase().includes(lower)).slice(0, 8);
      setFilteredBills(matches);
      setShowSuggestions(matches.length > 0);
    } else {
      setShowSuggestions(false);
      setFilteredBills([]);
    }
  };

  const selectSuggestion = (bill) => {
    setName(bill.name);
    setCategory(bill.category);
    setShowSuggestions(false);
  };

  const is = { width: "100%", padding: "12px 16px", borderRadius: 12, border: `2px solid ${t.border}`, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none", boxSizing: "border-box", background: t.input, color: t.text };
  const go = async () => { if (!name || !amount || !dueDate) return; setSaving(true); await onAdd({ name, amount: parseFloat(amount), dueDate: parseInt(dueDate), category, isRecurring, reminder, frequency: isRecurring ? frequency : "once", endAmount: endAmount ? parseFloat(endAmount) : null }); setSaving(false); };

  return (
    <div style={{ position: "fixed", inset: 0, background: t.over, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: t.modal, borderRadius: 16, padding: "24px 20px", width: "92%", maxWidth: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 20px", fontFamily: "'Outfit', sans-serif", color: t.text, fontSize: 18, fontWeight: 700 }}>Add New Bill</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Bill name with autocomplete */}
          <div style={{ position: "relative" }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Bill Name</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, pointerEvents: "none" }}>🔍</span>
              <input
                ref={inputRef}
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                onFocus={() => { if (name.length >= 1 && filteredBills.length > 0) setShowSuggestions(true); }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Search or type a bill name..."
                style={{ ...is, paddingLeft: 40 }}
                autoComplete="off"
              />
            </div>
            {/* Dropdown suggestions */}
            {showSuggestions && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                background: t.modal, borderRadius: 14, marginTop: 4,
                boxShadow: "0 12px 40px rgba(0,0,0,0.2)", border: `1px solid ${t.border}`,
                maxHeight: 240, overflowY: "auto",
              }}>
                {filteredBills.map((bill, i) => (
                  <div
                    key={i}
                    onMouseDown={() => selectSuggestion(bill)}
                    style={{
                      padding: "10px 16px", cursor: "pointer",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      borderBottom: i < filteredBills.length - 1 ? `1px solid ${t.border}` : "none",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = t.prog}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 16 }}>{getCatIcon(bill.category)}</span>
                      <span style={{ fontWeight: 600, color: t.text, fontSize: 14 }}>{bill.name}</span>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: getCatColor(bill.category),
                      background: getCatColor(bill.category) + "15",
                      padding: "2px 8px", borderRadius: 6,
                    }}>{bill.category}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Amount ($)</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={is} /></div>
            <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Due Date</label><input type="number" min="1" max="31" value={dueDate} onChange={e => setDueDate(e.target.value)} placeholder="15" style={is} /></div>
          </div>
          <div><label style={{ fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Category</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{CATEGORIES.map(c => <button key={c.name} onClick={() => setCategory(c.name)} style={{ padding: "8px 12px", borderRadius: 10, border: "2px solid", borderColor: category === c.name ? c.color : t.border, background: category === c.name ? c.color + "15" : "transparent", cursor: "pointer", fontSize: 12, fontWeight: 700, color: category === c.name ? c.color : t.sub }}>{c.icon} {c.name}</button>)}</div>
          </div>
          <div><label style={{ fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Reminder</label><select value={reminder} onChange={e => setReminder(e.target.value)} style={{ ...is, cursor: "pointer" }}>{REMINDER_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <div onClick={() => setIsRecurring(!isRecurring)} style={{ width: 22, height: 22, borderRadius: 6, border: isRecurring ? "none" : `2px solid ${t.border}`, background: isRecurring ? "#6C5CE7" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{isRecurring && "✓"}</div>
            <span style={{ fontSize: 14, fontWeight: 600, color: t.sub }}>Recurring payment</span>
          </label>
          {isRecurring && (
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Frequency</label>
                <select value={frequency} onChange={e => setFrequency(e.target.value)} style={{ ...is, cursor: "pointer" }}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>End After ($)</label>
                <input type="number" value={endAmount} onChange={e => setEndAmount(e.target.value)} placeholder="Optional" style={is} />
                <div style={{ fontSize: 10, color: t.muted, marginTop: 2 }}>Auto-removes when total paid reaches this amount</div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: 14, border: `2px solid ${t.border}`, background: t.card, cursor: "pointer", fontWeight: 700, fontSize: 14, color: t.sub, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Cancel</button>
            <button onClick={go} disabled={saving} style={{ flex: 2, padding: 14, borderRadius: 14, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Add Bill"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Onboarding Wizard ───
function OnboardingWizard({ steps, t, onGoTo }) {
  const done = steps.filter(s => s.done).length;
  const total = steps.length;
  if (done >= total) return null;

  const icons = { bills: "📋", bank: "🏦", income: "💰" };
  const actions = { bills: "dashboard", bank: "money", income: "money" };

  return (
    <div style={{ background: t.card, borderRadius: 16, padding: "18px 20px", boxShadow: t.cs, borderLeft: "4px solid #6C5CE7" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 15 }}>🚀 Get Started</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#6C5CE7" }}>{done}/{total}</div>
      </div>
      <div style={{ height: 6, background: t.prog, borderRadius: 3, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #10B981, #6C5CE7)", width: `${(done / total) * 100}%`, transition: "width 0.5s" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.map(s => (
          <div key={s.key} onClick={() => !s.done && onGoTo(actions[s.key])} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10,
            background: s.done ? "#10B98110" : t.prog, cursor: s.done ? "default" : "pointer",
          }}>
            <div style={{ width: 24, height: 24, borderRadius: 8, background: s.done ? "#10B981" : t.border, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{s.done ? "✓" : icons[s.key]}</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: s.done ? t.sub : t.text, textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Unified Dashboard ───
function UnifiedDashboard({ dash, bills, t, onToggle, onDelete, onGoTo }) {
  if (!dash) return null;
  const getCatIcon2 = n => CATEGORIES.find(c => c.name === n)?.icon || "📄";
  const H = "'Outfit', 'Plus Jakarta Sans', sans-serif";
  const F = "'Plus Jakarta Sans', 'Outfit', sans-serif";
  const paidPct = dash.totalMonthlyBills > 0 ? Math.round((dash.totalPaid / dash.totalMonthlyBills) * 100) : 0;

  const [forecast, setForecast] = useState(null);
  useEffect(() => { api.getPaycheckForecast().then(setForecast).catch(() => {}); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Onboarding */}
      {!dash.onboardingComplete && <OnboardingWizard steps={dash.onboardingSteps} t={t} onGoTo={onGoTo} />}

      {/* Balance hero */}
      {dash.accountCount > 0 ? (
        <div style={{ background: t.card, borderRadius: 18, padding: "22px 22px 18px", boxShadow: t.cs, borderTop: "3px solid #6C5CE7" }}>
          <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Balance</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: "#10B981", fontFamily: H, margin: "2px 0 8px", letterSpacing: -1 }}>{formatMoney(dash.totalAvailable > 0 ? dash.totalAvailable : dash.totalBankBalance)}</div>
          <div style={{ display: "flex", gap: 20, fontSize: 13, color: t.sub }}>
            {dash.totalCardDebt > 0 && <span>💳 <span style={{ color: "#EF4444", fontWeight: 600 }}>{formatMoney(dash.totalCardDebt)}</span> debt</span>}
            <span>💰 {formatMoney(dash.incomeThisMonth)} earned</span>
          </div>
        </div>
      ) : null}

      {/* Paycheck Forecast */}
      {forecast && forecast.hasIncome && forecast.periods?.length > 0 && (
        <div style={{ background: t.card, borderRadius: 16, boxShadow: t.cs, overflow: "hidden", border: `2px solid ${forecast.periods[0].covered ? "#10B98130" : "#EF444430"}` }}>
          <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${t.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 15 }}>💰 Until Next Paycheck</div>
              <div style={{ fontSize: 11, color: t.sub }}>{new Date(forecast.nextPayDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {forecast.periods[0].daysUntilPaycheck}d away</div>
            </div>
            <div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>{forecast.paySource} · {formatMoney(forecast.payAmount)} {forecast.payFrequency}</div>
          </div>
          {forecast.periods.slice(0, 2).map((period, pi) => (
            <div key={pi} style={{ padding: "14px 20px", borderBottom: pi < 1 && forecast.periods.length > 1 ? `1px solid ${t.border}` : "none" }}>
              {pi > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: "#6C5CE7", textTransform: "uppercase", marginBottom: 4, letterSpacing: 0.5 }}>After Paycheck #{pi} → Next</div>}
              {pi > 0 && <div style={{ fontSize: 11, color: t.sub, marginBottom: 8 }}>You'll have {formatMoney(period.balanceBefore)}{dash.accountCount > 0 ? " (balance + paycheck)" : " (paycheck only)"}</div>}
              {period.bills.length > 0 ? (<>
                {period.bills.map((b, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
                    <span style={{ fontSize: 13, color: t.text }}>{getCatIcon2(b.category)} {b.name} <span style={{ color: t.sub, fontSize: 11 }}>· due {b.dueDate}th</span></span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{formatMoney(b.amount)}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: t.border, margin: "8px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Total Due</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#EF4444", fontFamily: H }}>{formatMoney(period.totalDue)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, padding: "10px 14px", borderRadius: 10, background: period.covered ? "#10B98110" : "#EF444410" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: period.covered ? "#10B981" : "#EF4444" }}>{period.covered ? "✅ You're covered" : "⚠️ Short by"}</span>
                  <span style={{ fontSize: 18, fontWeight: 800, fontFamily: H, color: period.covered ? "#10B981" : "#EF4444" }}>{period.covered ? formatMoney(period.balanceAfter) + " left" : formatMoney(period.shortfall)}</span>
                </div>
              </>) : (
                <div style={{ fontSize: 13, color: t.sub, padding: "4px 0" }}>✅ No bills due {pi === 0 ? "before next paycheck" : "in this period"}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stats grid - 2x2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ background: t.card, borderRadius: 14, padding: "16px 18px", boxShadow: t.cs }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "#6C5CE720", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📃</div>
            <span style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Monthly Bills</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#6C5CE7", fontFamily: H }}>{formatMoney(dash.totalMonthlyBills)}</div>
          <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>{dash.totalBills} bills</div>
        </div>
        <div style={{ background: t.card, borderRadius: 14, padding: "16px 18px", boxShadow: t.cs }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: dash.totalUnpaid > 0 ? "#EF444420" : "#10B98120", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{dash.totalUnpaid > 0 ? "⏳" : "✅"}</div>
            <span style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Still Owed</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: dash.totalUnpaid > 0 ? "#EF4444" : "#10B981", fontFamily: H }}>{formatMoney(dash.totalUnpaid)}</div>
          <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>{dash.totalBills - dash.paidCount} unpaid</div>
        </div>
        <div style={{ background: t.card, borderRadius: 14, padding: "16px 18px", boxShadow: t.cs }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "#10B98120", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>💵</div>
            <span style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Left Over</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: (dash.accountCount > 0 ? dash.leftoverFromBank : dash.leftoverEstimated) >= 0 ? "#10B981" : "#EF4444", fontFamily: H }}>{dash.accountCount > 0 ? formatMoney(dash.leftoverFromBank) : formatMoney(dash.leftoverEstimated)}</div>
          <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>{dash.accountCount > 0 ? "after bills" : "estimated · connect bank for accuracy"}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 14, padding: "16px 18px", boxShadow: t.cs }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "#6C5CE720", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📊</div>
            <span style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Progress</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#6C5CE7", fontFamily: H }}>{paidPct}%</div>
          <div style={{ height: 6, background: t.prog, borderRadius: 3, overflow: "hidden", marginTop: 6 }}>
            <div style={{ height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #10B981, #6C5CE7)", width: paidPct + "%", transition: "width 0.5s" }} />
          </div>
        </div>
      </div>

      {/* Overdue alert */}
      {dash.overdue.length > 0 && (
        <div style={{ background: "#EF444410", borderRadius: 14, padding: "16px 18px", borderLeft: "4px solid #EF4444" }}>
          <div style={{ fontWeight: 700, color: "#EF4444", fontSize: 14, marginBottom: 10 }}>⚠️ {dash.overdue.length} Overdue</div>
          {dash.overdue.map(b => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
              <span style={{ color: t.text }}>{getCatIcon2(b.category)} {b.name}</span>
              <span style={{ fontWeight: 700, color: "#EF4444" }}>{formatMoney(b.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming this week */}
      {dash.upcoming.length > 0 && (
        <div style={{ background: t.card, borderRadius: 14, padding: "16px 18px", boxShadow: t.cs }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 10 }}>📅 Due This Week</div>
          {dash.upcoming.map(b => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${t.border}` }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{getCatIcon2(b.category)} {b.name}</span>
                <span style={{ fontSize: 12, color: t.sub, marginLeft: 8 }}>{b.daysUntil === 0 ? "Today" : `in ${b.daysUntil}d`}</span>
              </div>
              <span style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{formatMoney(b.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* All bills */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontFamily: H, color: t.text, margin: 0, fontSize: 17 }}>Bills</h3>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#6C5CE7", background: "#6C5CE715", padding: "3px 10px", borderRadius: 8 }}>{dash.paidCount}/{dash.totalBills} paid</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {bills.sort((a, b) => a.dueDate - b.dueDate).map(b => <BillRow key={b.id} bill={b} onToggle={onToggle} onDelete={onDelete} t={t} />)}
          {!bills.length && (
            <div style={{ textAlign: "center", padding: 40, color: t.sub, fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💸</div>
              No bills yet — tap <span style={{ color: "#6C5CE7", fontWeight: 700 }}>+ Bill</span> to get started
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      {dash.recentActivity.length > 0 && (
        <div style={{ background: t.card, borderRadius: 14, padding: "16px 18px", boxShadow: t.cs }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 10 }}>📋 Recent Payments</div>
          {dash.recentActivity.slice(0, 5).map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 13, borderBottom: `1px solid ${t.border}` }}>
              <span style={{ color: t.sub }}>{"✅"} {a.billName} · {a.paidDate}</span>
              <span style={{ fontWeight: 700, color: t.text }}>{formatMoney(a.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// ─── Money Tab (Bank + Cards + Income combined) ───
function HouseholdView({ t }) {
  const [hh, setHH] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(null); // null, 'household', 'joint'
  const [showJoin, setShowJoin] = useState(false);
  const [hhName, setHHName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [showAddBill, setShowAddBill] = useState(false);
  const [billForm, setBillForm] = useState({ name: "", totalAmount: "", dueDate: "", category: "Utilities" });
  const [jointFilter, setJointFilter] = useState("all"); // all, person1id, person2id
  const [jointView, setJointView] = useState("overview"); // overview, bills, transactions, accounts, cards

  const load = async () => {
    try { const data = await api.getHousehold(); setHH(data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async (mode) => {
    try { await api.createHousehold(hhName || (mode === "joint" ? "Our Finances" : "My Household"), mode); setShowCreate(null); load(); } catch (err) { alert(err.message || "Error"); }
  };
  const join = async () => {
    try { await api.joinHousehold(joinCode); setShowJoin(false); load(); } catch (err) { alert(err.message || "Invalid code"); }
  };
  const addBill = async () => {
    try {
      await api.addHouseholdBill({ name: billForm.name, totalAmount: parseFloat(billForm.totalAmount), dueDate: parseInt(billForm.dueDate), category: billForm.category });
      setShowAddBill(false); setBillForm({ name: "", totalAmount: "", dueDate: "", category: "Utilities" }); load();
    } catch (err) { alert(err.message || "Error"); }
  };
  const paySplit = async (splitId) => { try { await api.payHouseholdSplit(splitId); load(); } catch {} };
  const deleteBill = async (billId) => { try { await api.deleteHouseholdBill(billId); load(); } catch {} };
  const leave = async () => { if (window.confirm(hh?.isOwner ? "Delete this? Everyone will be removed." : "Leave?")) { try { await api.leaveHousehold(); setHH(null); } catch {} } };

  const myId = api.getUser()?.id;
  const is = { width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none", boxSizing: "border-box", background: t.cardAlt || t.bg, color: t.text };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: t.sub }}>Loading...</div>;

  // ─── No household yet — show create/join options ───
  if (!hh) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 18, fontWeight: 700 }}>Shared Finances</h3>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: t.sub }}>Split bills with roommates or manage finances together with a partner</p>
      </div>

      {/* Two options */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div onClick={() => setShowCreate("household")} style={{ background: t.card, borderRadius: 12, padding: "20px 16px", boxShadow: t.cs, cursor: "pointer", textAlign: "center", border: showCreate === "household" ? "2px solid #6C5CE7" : `1px solid ${t.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏠</div>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 4 }}>Household</div>
          <div style={{ fontSize: 11, color: t.sub, lineHeight: 1.5 }}>For roommates. Split shared bills. Everyone keeps their own finances private.</div>
        </div>
        <div onClick={() => setShowCreate("joint")} style={{ background: t.card, borderRadius: 12, padding: "20px 16px", boxShadow: t.cs, cursor: "pointer", textAlign: "center", border: showCreate === "joint" ? "2px solid #6C5CE7" : `1px solid ${t.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>💑</div>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 4 }}>Joint</div>
          <div style={{ fontSize: 11, color: t.sub, lineHeight: 1.5 }}>For partners. See each other's banks, bills, cards, and transactions together.</div>
        </div>
      </div>

      {showCreate && (
        <div style={{ background: t.card, borderRadius: 12, padding: "16px 18px", boxShadow: t.cs }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 10 }}>{showCreate === "joint" ? "💑 Create Joint Account" : "🏠 Create Household"}</div>
          <input value={hhName} onChange={e => setHHName(e.target.value)} placeholder={showCreate === "joint" ? "e.g. John & Jane" : "e.g. Apartment 4B"} style={{ ...is, marginBottom: 10 }} />
          <button onClick={() => create(showCreate)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Create & Get Invite Code</button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 1, background: t.border }} />
        <span style={{ fontSize: 11, color: t.muted }}>or</span>
        <div style={{ flex: 1, height: 1, background: t.border }} />
      </div>

      <button onClick={() => setShowJoin(!showJoin)} style={{ width: "100%", padding: "12px", borderRadius: 10, border: `1px solid ${t.border}`, background: "transparent", color: t.text, cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>🔗 Join with Invite Code</button>

      {showJoin && (
        <div style={{ background: t.card, borderRadius: 12, padding: "16px 18px", boxShadow: t.cs }}>
          <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="Enter code" maxLength={8} style={{ ...is, fontSize: 18, textAlign: "center", letterSpacing: 4, textTransform: "uppercase", marginBottom: 10 }} />
          <button onClick={join} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", background: "#10B981", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Join</button>
        </div>
      )}
    </div>
  );

  // ─── HOUSEHOLD MODE (Roommates) ───
  if (hh.mode === "household" || !hh.mode) {
    const myTotal = hh.bills.reduce((s, b) => { const sp = b.splits.find(sp => sp.userId === myId); return s + (sp && !sp.isPaid ? sp.amount : 0); }, 0);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 18, fontWeight: 700 }}>🏠 {hh.name}</h3>
            <p style={{ margin: 0, fontSize: 12, color: t.sub }}>{hh.members.length} members · Household mode</p>
          </div>
          <button onClick={() => setShowAddBill(true)} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>+ Bill</button>
        </div>

        {/* Invite code */}
        <div style={{ background: t.cardAlt, borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><span style={{ fontSize: 11, color: t.sub }}>Invite: </span><span style={{ fontWeight: 800, color: "#6C5CE7", fontSize: 16, letterSpacing: 2, fontFamily: "'Outfit', sans-serif" }}>{hh.inviteCode}</span></div>
          <button onClick={() => navigator.clipboard?.writeText(hh.inviteCode)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.sub, cursor: "pointer", fontWeight: 600, fontSize: 10 }}>Copy</button>
        </div>

        {/* Your share */}
        <div style={{ background: t.card, borderRadius: 10, padding: "12px 16px", boxShadow: t.cs }}>
          <div style={{ fontSize: 10, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>You Owe</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: myTotal > 0 ? "#EF4444" : "#10B981", fontFamily: "'Outfit', sans-serif" }}>{formatMoney(myTotal)}</div>
        </div>

        {/* Members */}
        <div style={{ display: "flex", gap: 6 }}>
          {hh.members.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: t.card, borderRadius: 8, boxShadow: t.cs }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "#6C5CE7", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10 }}>{m.name?.charAt(0)}</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{m.name?.split(" ")[0]}</span>
            </div>
          ))}
        </div>

        {/* Shared bills */}
        {hh.bills.map(bill => (
          <div key={bill.id} style={{ background: t.card, borderRadius: 10, padding: "12px 16px", boxShadow: t.cs }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div><div style={{ fontWeight: 700, color: t.text, fontSize: 13 }}>{bill.name}</div><div style={{ fontSize: 11, color: t.sub }}>Due: {bill.dueDate}th · {formatMoney(bill.totalAmount)} total</div></div>
              <button onClick={() => deleteBill(bill.id)} style={{ width: 20, height: 20, borderRadius: 4, border: `1px solid ${t.border}`, background: "transparent", cursor: "pointer", color: t.muted, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            {bill.splits.map(sp => (
              <div key={sp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderRadius: 6, background: sp.isPaid ? "#10B98108" : t.cardAlt, marginBottom: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {sp.userId === myId && !sp.isPaid ? (
                    <button onClick={() => paySplit(sp.id)} style={{ width: 18, height: 18, borderRadius: 4, border: `1px solid ${t.border}`, background: "transparent", cursor: "pointer", fontSize: 8 }} />
                  ) : (
                    <div style={{ width: 18, height: 18, borderRadius: 4, background: sp.isPaid ? "#10B981" : t.border, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>{sp.isPaid ? "✓" : ""}</div>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 600, color: sp.isPaid ? t.sub : t.text, textDecoration: sp.isPaid ? "line-through" : "none" }}>{sp.name?.split(" ")[0]}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: sp.isPaid ? "#10B981" : t.text }}>{formatMoney(sp.amount)}</span>
              </div>
            ))}
          </div>
        ))}
        {!hh.bills.length && <div style={{ textAlign: "center", padding: 20, color: t.sub, fontSize: 12 }}>No shared bills yet. Add one to start splitting.</div>}

        {/* Add bill form */}
        {showAddBill && (
          <div style={{ background: t.card, borderRadius: 12, padding: "14px 16px", boxShadow: t.cs }}>
            <input value={billForm.name} onChange={e => setBillForm(p => ({ ...p, name: e.target.value }))} placeholder="Bill name (e.g. Rent)" style={{ ...is, marginBottom: 6 }} />
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input type="number" value={billForm.totalAmount} onChange={e => setBillForm(p => ({ ...p, totalAmount: e.target.value }))} placeholder="Total $" style={{ ...is, flex: 1 }} />
              <input type="number" value={billForm.dueDate} onChange={e => setBillForm(p => ({ ...p, dueDate: e.target.value }))} placeholder="Due day" min="1" max="31" style={{ ...is, flex: 1 }} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setShowAddBill(false)} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.sub, cursor: "pointer", fontWeight: 600, fontSize: 11 }}>Cancel</button>
              <button onClick={addBill} style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>Split Evenly</button>
            </div>
          </div>
        )}

        <button onClick={leave} style={{ padding: "8px", borderRadius: 8, border: `1px solid #EF4444`, background: "transparent", color: "#EF4444", cursor: "pointer", fontWeight: 600, fontSize: 11, marginTop: 8 }}>{hh.isOwner ? "Delete Household" : "Leave"}</button>
      </div>
    );
  }

  // ─── JOINT MODE (Partners) ───
  const md = hh.memberData || {};
  const memberIds = hh.members.map(m => m.id);
  const memberNames = {};
  hh.members.forEach(m => { memberNames[m.id] = m.name?.split(" ")[0] || "Partner"; });

  // Build filtered data based on jointFilter
  const getFilteredData = () => {
    const ids = jointFilter === "all" ? memberIds : [parseInt(jointFilter)];
    const filtered = { bills: [], cards: [], accounts: [], transactions: [] };
    ids.forEach(id => {
      const d = md[id];
      if (!d) return;
      filtered.bills.push(...d.bills.map(b => ({ ...b, owner: memberNames[id], ownerId: id })));
      filtered.cards.push(...d.cards.map(c => ({ ...c, owner: memberNames[id], ownerId: id })));
      filtered.accounts.push(...d.accounts.map(a => ({ ...a, owner: memberNames[id], ownerId: id })));
      filtered.transactions.push(...d.transactions.map(tx => ({ ...tx, owner: memberNames[id], ownerId: id })));
    });
    filtered.transactions.sort((a, b) => b.date.localeCompare(a.date));
    return filtered;
  };
  const fd = getFilteredData();
  const totalBalance = fd.accounts.filter(a => a.type !== "credit").reduce((s, a) => s + (a.balanceAvailable > 0 ? a.balanceAvailable : a.balanceCurrent), 0);
  const totalDebt = fd.cards.reduce((s, c) => s + c.balance, 0);
  const totalBills = fd.bills.reduce((s, b) => s + b.amount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 18, fontWeight: 700 }}>💑 {hh.name}</h3>
          <p style={{ margin: 0, fontSize: 12, color: t.sub }}>Joint finances · {hh.members.length} partners</p>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setShowAddBill(true)} style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 10 }}>+ Shared Bill</button>
        </div>
      </div>

      {/* Invite code */}
      <div style={{ background: t.cardAlt, borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><span style={{ fontSize: 10, color: t.sub }}>Invite: </span><span style={{ fontWeight: 800, color: "#6C5CE7", fontSize: 14, letterSpacing: 2 }}>{hh.inviteCode}</span></div>
        <button onClick={() => navigator.clipboard?.writeText(hh.inviteCode)} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${t.border}`, background: "transparent", color: t.sub, cursor: "pointer", fontWeight: 600, fontSize: 9 }}>Copy</button>
      </div>

      {/* Person filter — the key feature */}
      <div style={{ display: "flex", gap: 3, background: t.cardAlt, borderRadius: 8, padding: 3 }}>
        <button onClick={() => setJointFilter("all")} style={{ flex: 1, padding: "7px 8px", borderRadius: 6, border: "none", background: jointFilter === "all" ? "#6C5CE7" : "transparent", color: jointFilter === "all" ? "white" : t.sub, cursor: "pointer", fontWeight: 600, fontSize: 11 }}>👥 Both</button>
        {hh.members.map(m => (
          <button key={m.id} onClick={() => setJointFilter(String(m.id))} style={{ flex: 1, padding: "7px 8px", borderRadius: 6, border: "none", background: jointFilter === String(m.id) ? "#6C5CE7" : "transparent", color: jointFilter === String(m.id) ? "white" : t.sub, cursor: "pointer", fontWeight: 600, fontSize: 11 }}>{m.id === myId ? "🙋 Me" : `👤 ${m.name?.split(" ")[0]}`}</button>
        ))}
      </div>

      {/* Combined summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
          <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Balance</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#10B981", fontFamily: "'Outfit', sans-serif" }}>{formatMoney(totalBalance)}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
          <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Card Debt</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: totalDebt > 0 ? "#EF4444" : "#10B981", fontFamily: "'Outfit', sans-serif" }}>{formatMoney(totalDebt)}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
          <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Bills/mo</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(totalBills)}</div>
        </div>
      </div>

      {/* View tabs */}
      <div style={{ display: "flex", gap: 3, background: t.cardAlt, borderRadius: 8, padding: 3 }}>
        {[["overview", "Overview"], ["bills", "Bills"], ["transactions", "Transactions"], ["accounts", "Accounts"], ["cards", "Cards"]].map(([k, l]) => (
          <button key={k} onClick={() => setJointView(k)} style={{ flex: 1, padding: "6px 4px", borderRadius: 6, border: "none", background: jointView === k ? t.card : "transparent", color: jointView === k ? t.text : t.muted, cursor: "pointer", fontWeight: 600, fontSize: 10, boxShadow: jointView === k ? t.cs : "none" }}>{l}</button>
        ))}
      </div>

      {/* Overview */}
      {jointView === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Shared bills */}
          {hh.bills.length > 0 && (
            <div style={{ background: t.card, borderRadius: 10, padding: "12px 16px", boxShadow: t.cs }}>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 13, marginBottom: 8 }}>Shared Bills</div>
              {hh.bills.map(b => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${t.border}` }}>
                  <span style={{ fontSize: 12, color: t.text }}>{b.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{formatMoney(b.totalAmount)}</span>
                </div>
              ))}
            </div>
          )}
          {/* Per-person summary */}
          {hh.members.map(m => {
            const d = md[m.id];
            if (!d) return null;
            const bal = d.accounts.filter(a => a.type !== "credit").reduce((s, a) => s + (a.balanceAvailable > 0 ? a.balanceAvailable : a.balanceCurrent), 0);
            const debt = d.cards.reduce((s, c) => s + c.balance, 0);
            const bills = d.bills.reduce((s, b) => s + b.amount, 0);
            return (
              <div key={m.id} style={{ background: t.card, borderRadius: 10, padding: "12px 16px", boxShadow: t.cs }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: "#6C5CE7", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11 }}>{m.name?.charAt(0)}</div>
                  <span style={{ fontWeight: 700, color: t.text, fontSize: 13 }}>{m.name}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  <div><div style={{ fontSize: 9, color: t.sub }}>Bank</div><div style={{ fontSize: 13, fontWeight: 700, color: "#10B981" }}>{formatMoney(bal)}</div></div>
                  <div><div style={{ fontSize: 9, color: t.sub }}>Debt</div><div style={{ fontSize: 13, fontWeight: 700, color: debt > 0 ? "#EF4444" : "#10B981" }}>{formatMoney(debt)}</div></div>
                  <div><div style={{ fontSize: 9, color: t.sub }}>Bills</div><div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{formatMoney(bills)}/mo</div></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bills */}
      {jointView === "bills" && fd.bills.map(b => (
        <div key={`${b.ownerId}-${b.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: t.card, borderRadius: 10, boxShadow: t.cs }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: b.isPaid ? "#10B98115" : "#EF444415", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>{b.isPaid ? "✅" : "📋"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{b.name}</div>
            <div style={{ fontSize: 11, color: t.sub }}>Due: {b.dueDate}th · {b.owner}</div>
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, color: t.text, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(b.amount)}</div>
        </div>
      ))}
      {jointView === "bills" && !fd.bills.length && <div style={{ textAlign: "center", padding: 20, color: t.sub, fontSize: 12 }}>No bills</div>}

      {/* Transactions */}
      {jointView === "transactions" && fd.transactions.map(tx => (
        <div key={`${tx.ownerId}-${tx.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: t.card, borderRadius: 8, boxShadow: t.cs }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: tx.amount > 0 ? "#EF444410" : "#10B98110", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>{tx.amount > 0 ? "💸" : "💵"}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.name}</div>
            <div style={{ fontSize: 10, color: t.sub }}>{tx.date} · {tx.owner} · {tx.accountName || ""}</div>
          </div>
          <div style={{ fontWeight: 700, fontSize: 12, color: tx.amount > 0 ? "#EF4444" : "#10B981", fontFamily: "'Outfit', sans-serif" }}>{tx.amount > 0 ? "-" : "+"}{formatMoney(Math.abs(tx.amount))}</div>
        </div>
      ))}
      {jointView === "transactions" && !fd.transactions.length && <div style={{ textAlign: "center", padding: 20, color: t.sub, fontSize: 12 }}>No transactions</div>}

      {/* Accounts */}
      {jointView === "accounts" && fd.accounts.map(a => (
        <div key={`${a.ownerId}-${a.id}`} style={{ background: t.card, borderRadius: 10, padding: "12px 16px", boxShadow: t.cs }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 600, color: t.text, fontSize: 13 }}>{a.name}</div>
              <div style={{ fontSize: 11, color: t.sub }}>{a.owner} · {a.institution} · ••••{a.mask}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, color: t.text, fontSize: 16, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(a.balanceAvailable > 0 ? a.balanceAvailable : a.balanceCurrent)}</div>
              {a.balanceAvailable > 0 && a.balanceAvailable !== a.balanceCurrent && <div style={{ fontSize: 10, color: t.sub }}>{formatMoney(a.balanceCurrent)} current</div>}
            </div>
          </div>
        </div>
      ))}
      {jointView === "accounts" && !fd.accounts.length && <div style={{ textAlign: "center", padding: 20, color: t.sub, fontSize: 12 }}>No accounts connected</div>}

      {/* Cards */}
      {jointView === "cards" && fd.cards.map(c => {
        const pct = c.creditLimit > 0 ? (c.balance / c.creditLimit * 100) : 0;
        return (
          <div key={`${c.ownerId}-${c.id}`} style={{ background: t.card, borderRadius: 10, padding: "12px 16px", boxShadow: t.cs }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <div><div style={{ fontWeight: 600, color: t.text, fontSize: 13 }}>{c.name}</div><div style={{ fontSize: 11, color: t.sub }}>{c.owner} · {c.apr}% APR</div></div>
              <div style={{ textAlign: "right" }}><div style={{ fontWeight: 800, color: t.text, fontSize: 16, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(c.balance)}</div><div style={{ fontSize: 10, color: "#10B981" }}>{formatMoney(c.creditLimit - c.balance)} avail</div></div>
            </div>
            <div style={{ height: 4, background: t.prog, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 2, background: pct > 50 ? "#EF4444" : pct > 30 ? "#F59E0B" : "#10B981", width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        );
      })}
      {jointView === "cards" && !fd.cards.length && <div style={{ textAlign: "center", padding: 20, color: t.sub, fontSize: 12 }}>No credit cards</div>}

      {/* Add shared bill */}
      {showAddBill && (
        <div style={{ background: t.card, borderRadius: 12, padding: "14px 16px", boxShadow: t.cs }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 13, marginBottom: 8 }}>Add Shared Bill</div>
          <input value={billForm.name} onChange={e => setBillForm(p => ({ ...p, name: e.target.value }))} placeholder="Bill name" style={{ ...is, marginBottom: 6 }} />
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input type="number" value={billForm.totalAmount} onChange={e => setBillForm(p => ({ ...p, totalAmount: e.target.value }))} placeholder="Total $" style={{ ...is, flex: 1 }} />
            <input type="number" value={billForm.dueDate} onChange={e => setBillForm(p => ({ ...p, dueDate: e.target.value }))} placeholder="Day" min="1" max="31" style={{ ...is, flex: 1 }} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setShowAddBill(false)} style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.sub, cursor: "pointer", fontWeight: 600, fontSize: 11 }}>Cancel</button>
            <button onClick={addBill} style={{ flex: 2, padding: "8px", borderRadius: 6, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>Split Evenly</button>
          </div>
        </div>
      )}

      <button onClick={leave} style={{ padding: "8px", borderRadius: 8, border: `1px solid #EF4444`, background: "transparent", color: "#EF4444", cursor: "pointer", fontWeight: 600, fontSize: 11, marginTop: 4 }}>{hh.isOwner ? "Delete Joint Account" : "Leave"}</button>
    </div>
  );
}

function MoneyTab({ t }) {
  const [subTab, setSubTab] = useState("bank");
  const H = "'Outfit', 'Plus Jakarta Sans', sans-serif";
  const F = "'Plus Jakarta Sans', 'Outfit', sans-serif";
  const tabs = [
    { key: "bank", icon: "🏦", label: "Bank" },
    { key: "cards", icon: "💳", label: "Cards" },
    { key: "income", icon: "💰", label: "Income" },
    { key: "household", icon: "🏠", label: "Household" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Segmented control */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 0, background: t.cardAlt, borderRadius: 14, padding: 4 }}>
        {tabs.map(item => (
          <button key={item.key} onClick={() => item.link ? window.open(item.link, "_blank") : setSubTab(item.key)} style={{
            padding: "10px 0", borderRadius: 10, border: "none",
            background: subTab === item.key ? "#6C5CE7" : "transparent",
            color: subTab === item.key ? "white" : t.sub,
            cursor: "pointer", fontWeight: 600, fontSize: 12, fontFamily: F,
            transition: "all 0.2s ease", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 5,
          }}><span style={{ fontSize: 14 }}>{item.icon}</span> {item.label}</button>
        ))}
      </div>
      {subTab === "bank" && <BankAccountsView t={t} />}
      {subTab === "cards" && <CreditCardsView t={t} />}
      {subTab === "income" && <IncomeView t={t} />}
      {subTab === "household" && <HouseholdView t={t} />}
    </div>
  );
}

// ─── Settings Tab (History + Reminders + Charts combined) ───
// Category icons and colors
const SPEND_CATS = {
  "Gas & Fuel": { icon: "⛽", color: "#F59E0B" },
  "Groceries": { icon: "🛒", color: "#10B981" },
  "Eating Out": { icon: "🍔", color: "#EF4444" },
  "Shopping": { icon: "🛍️", color: "#8B5CF6" },
  "Entertainment": { icon: "🎬", color: "#EC4899" },
  "Health & Medical": { icon: "🏥", color: "#06B6D4" },
  "Transportation": { icon: "🚗", color: "#6366F1" },
  "Utilities": { icon: "💡", color: "#F97316" },
  "Home & Living": { icon: "🏠", color: "#14B8A6" },
  "Kids & Family": { icon: "👶", color: "#A855F7" },
  "Personal Care": { icon: "💇", color: "#F472B6" },
  "Subscriptions": { icon: "📺", color: "#3B82F6" },
  "Transfers": { icon: "💸", color: "#6B7280" },
  "Other": { icon: "📋", color: "#9CA3AF" },
};

function SpendingView({ t }) {
  const [data, setData] = useState(null);
  const [weekly, setWeekly] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [view, setView] = useState("overview");
  const [selectedCat, setSelectedCat] = useState(null);
  const [showBudget, setShowBudget] = useState(false);
  const [budgetCat, setBudgetCat] = useState("");
  const [budgetAmt, setBudgetAmt] = useState("");

  const load = async () => {
    try {
      const [s, w] = await Promise.all([api.getSpendingSummary(days), api.getWeeklySpending()]);
      setData(s); setWeekly(w);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [days]);

  const addBudget = async () => {
    if (!budgetCat || !budgetAmt) return;
    try { await api.setBudget(budgetCat, parseFloat(budgetAmt)); setShowBudget(false); setBudgetCat(""); setBudgetAmt(""); load(); } catch {}
  };
  const delBudget = async (id) => { try { await api.deleteBudget(id); load(); } catch {} };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: t.sub }}>Analyzing spending...</div>;
  if (!data || !data.categories.length) return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>💳</div>
      <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 4 }}>No spending data yet</div>
      <div style={{ fontSize: 12, color: t.sub }}>Connect your bank to automatically track spending</div>
    </div>
  );

  const changeColor = data.totalSpent > data.prevTotalSpent ? "#EF4444" : "#10B981";
  const changeAmt = data.totalSpent - data.prevTotalSpent;
  const changePct = data.prevTotalSpent > 0 ? Math.round((changeAmt / data.prevTotalSpent) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ fontFamily: "'Outfit', sans-serif", color: t.text, margin: 0, fontSize: 18, fontWeight: 700 }}>Spending</h3>
          <p style={{ margin: 0, fontSize: 12, color: t.sub }}>Where your money goes</p>
        </div>
        <button onClick={() => setShowBudget(true)} style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 10 }}>+ Budget</button>
      </div>

      {/* Period selector */}
      <div style={{ display: "flex", gap: 3, background: t.cardAlt || t.pill, borderRadius: 8, padding: 3 }}>
        {[7, 14, 30, 60, 90].map(d => (
          <button key={d} onClick={() => { setDays(d); setLoading(true); }} style={{ flex: 1, padding: "6px", borderRadius: 6, border: "none", background: days === d ? "#6C5CE7" : "transparent", color: days === d ? "white" : t.sub, cursor: "pointer", fontWeight: 600, fontSize: 10 }}>{d}d</button>
        ))}
      </div>

      {/* Total spent hero */}
      <div style={{ background: t.card, borderRadius: 12, padding: "16px 18px", boxShadow: t.cs }}>
        <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>Total Spent ({days} days)</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif", letterSpacing: -0.5 }}>{formatMoney(data.totalSpent)}</div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, marginTop: 4 }}>
          <span style={{ color: changeColor, fontWeight: 700 }}>
            {changeAmt >= 0 ? "↑" : "↓"} {formatMoney(Math.abs(changeAmt))} ({changePct >= 0 ? "+" : ""}{changePct}%) vs prev
          </span>
          <span style={{ color: t.sub }}>~{formatMoney(data.dailyAvg)}/day</span>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
          <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>This Week</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif" }}>{weekly ? formatMoney(weekly.total) : "—"}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
          <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Transactions</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif" }}>{data.txnCount}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
          <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Biggest</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#EF4444", fontFamily: "'Outfit', sans-serif" }}>{data.biggest ? formatMoney(data.biggest.amount) : "—"}</div>
          {data.biggest && <div style={{ fontSize: 9, color: t.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.biggest.name}</div>}
        </div>
      </div>

      {/* View tabs */}
      <div style={{ display: "flex", gap: 3, background: t.cardAlt || t.pill, borderRadius: 8, padding: 3 }}>
        {[["overview", "Categories"], ["budgets", "Budgets"], ["weekly", "Weekly"], ["trends", "Trends"]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{ flex: 1, padding: "6px", borderRadius: 6, border: "none", background: view === k ? t.card : "transparent", color: view === k ? t.text : t.muted, cursor: "pointer", fontWeight: 600, fontSize: 10, boxShadow: view === k ? t.cs : "none" }}>{l}</button>
        ))}
      </div>

      {/* Categories view */}
      {view === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {/* Visual bar chart */}
          <div style={{ background: t.card, borderRadius: 10, padding: "14px 16px", boxShadow: t.cs }}>
            {data.categories.slice(0, 8).map(cat => {
              const meta = SPEND_CATS[cat.name] || SPEND_CATS.Other;
              const pct = data.totalSpent > 0 ? (cat.total / data.totalSpent) * 100 : 0;
              return (
                <div key={cat.name} onClick={() => setSelectedCat(selectedCat === cat.name ? null : cat.name)} style={{ cursor: "pointer", marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{meta.icon} {cat.name}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {cat.changePct !== null && <span style={{ fontSize: 9, fontWeight: 700, color: cat.change > 0 ? "#EF4444" : "#10B981" }}>{cat.change > 0 ? "↑" : "↓"}{Math.abs(cat.changePct)}%</span>}
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.text, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(cat.total)}</span>
                    </div>
                  </div>
                  <div style={{ height: 6, background: t.prog, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: meta.color, width: `${pct}%`, transition: "width 0.5s" }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Expanded transactions for selected category */}
          {selectedCat && (() => {
            const cat = data.categories.find(c => c.name === selectedCat);
            if (!cat) return null;
            const meta = SPEND_CATS[cat.name] || SPEND_CATS.Other;
            return (
              <div style={{ background: t.card, borderRadius: 10, padding: "12px 14px", boxShadow: t.cs }}>
                <div style={{ fontWeight: 700, color: t.text, fontSize: 13, marginBottom: 8 }}>{meta.icon} {cat.name} — {cat.count} transactions</div>
                {cat.transactions.slice(0, 10).map(tx => (
                  <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${t.border}` }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{tx.name}</div>
                      <div style={{ fontSize: 10, color: t.sub }}>{tx.date}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{formatMoney(tx.amount)}</span>
                  </div>
                ))}
                {cat.count > 10 && <div style={{ fontSize: 10, color: t.sub, marginTop: 4, textAlign: "center" }}>+ {cat.count - 10} more</div>}
              </div>
            );
          })()}
        </div>
      )}

      {/* Budgets view */}
      {view === "budgets" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.budgets.length > 0 ? data.budgets.map(b => {
            const meta = SPEND_CATS[b.category] || SPEND_CATS.Other;
            const pct = b.limit > 0 ? (b.spent / b.limit) * 100 : 0;
            const over = pct > 100;
            return (
              <div key={b.id} style={{ background: t.card, borderRadius: 10, padding: "12px 16px", boxShadow: t.cs }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{meta.icon} {b.category}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: over ? "#EF4444" : t.text }}>{formatMoney(b.spent)} / {formatMoney(b.limit)}</span>
                    <button onClick={() => delBudget(b.id)} style={{ width: 18, height: 18, borderRadius: 4, border: `1px solid ${t.border}`, background: "transparent", cursor: "pointer", color: t.muted, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                </div>
                <div style={{ height: 8, background: t.prog, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, background: over ? "#EF4444" : pct > 75 ? "#F59E0B" : meta.color, width: `${Math.min(pct, 100)}%`, transition: "width 0.5s" }} />
                </div>
                <div style={{ fontSize: 10, color: over ? "#EF4444" : t.sub, marginTop: 4, fontWeight: over ? 700 : 400 }}>
                  {over ? `Over budget by ${formatMoney(b.spent - b.limit)}!` : `${formatMoney(b.limit - b.spent)} remaining`}
                </div>
              </div>
            );
          }) : (
            <div style={{ textAlign: "center", padding: 20, color: t.sub, fontSize: 12 }}>No budgets set. Tap "+ Budget" to add one.</div>
          )}

          {/* Suggested budgets based on spending */}
          {data.categories.filter(c => !data.budgets.some(b => b.category === c.name) && c.name !== "Transfers" && c.name !== "Other").length > 0 && (
            <div style={{ background: t.cardAlt, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 12, marginBottom: 8 }}>Suggested Budgets</div>
              {data.categories.filter(c => !data.budgets.some(b => b.category === c.name) && c.name !== "Transfers" && c.name !== "Other").slice(0, 5).map(c => {
                const meta = SPEND_CATS[c.name] || SPEND_CATS.Other;
                const suggested = Math.round(c.total * (days / 30) * 0.9 / 10) * 10; // 90% of current, rounded
                return (
                  <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
                    <span style={{ fontSize: 11, color: t.text }}>{meta.icon} {c.name} — spending ~{formatMoney(c.total)}/mo</span>
                    <button onClick={async () => { try { await api.setBudget(c.name, suggested); load(); } catch {} }} style={{ padding: "3px 8px", borderRadius: 4, border: "none", background: "#6C5CE720", color: "#6C5CE7", cursor: "pointer", fontWeight: 700, fontSize: 9 }}>Set {formatMoney(suggested)}</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Weekly breakdown */}
      {view === "weekly" && weekly && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ background: t.card, borderRadius: 10, padding: "14px 16px", boxShadow: t.cs }}>
            <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>This Week's Spending</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif", marginBottom: 10 }}>{formatMoney(weekly.total)}</div>
            {weekly.breakdown.map(c => {
              const meta = SPEND_CATS[c.name] || SPEND_CATS.Other;
              const pct = weekly.total > 0 ? (c.amount / weekly.total) * 100 : 0;
              return (
                <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                  <span style={{ fontSize: 14 }}>{meta.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{c.name}</div>
                    <div style={{ height: 4, background: t.prog, borderRadius: 2, marginTop: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, background: meta.color, width: `${pct}%` }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.text, fontFamily: "'Outfit', sans-serif" }}>{formatMoney(c.amount)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trends — day of week */}
      {view === "trends" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ background: t.card, borderRadius: 10, padding: "14px 16px", boxShadow: t.cs }}>
            <div style={{ fontWeight: 700, color: t.text, fontSize: 13, marginBottom: 10 }}>Spending by Day of Week</div>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 100 }}>
              {data.dayOfWeek.map((d, i) => {
                const max = Math.max(...data.dayOfWeek.map(x => x.total));
                const h = max > 0 ? (d.total / max) * 80 : 4;
                const isWeekend = i === 0 || i === 6;
                return (
                  <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: t.sub }}>{formatMoney(d.total)}</div>
                    <div style={{ width: "100%", height: h, borderRadius: 4, background: isWeekend ? "#EF444480" : "#6C5CE780" }} />
                    <div style={{ fontSize: 9, fontWeight: 600, color: isWeekend ? "#EF4444" : t.sub }}>{d.day}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily spending chart */}
          {data.dailySpending.length > 0 && (
            <div style={{ background: t.card, borderRadius: 10, padding: "14px 16px", boxShadow: t.cs }}>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 13, marginBottom: 10 }}>Daily Spending</div>
              <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 80 }}>
                {data.dailySpending.slice(-30).map(d => {
                  const max = Math.max(...data.dailySpending.map(x => x.total));
                  const h = max > 0 ? (d.total / max) * 70 : 2;
                  return (
                    <div key={d.date} style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ height: h, borderRadius: 2, background: d.total > data.dailyAvg * 1.5 ? "#EF4444" : "#6C5CE7", opacity: 0.7 }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: t.sub, marginTop: 4 }}>
                <span>{data.dailySpending[0]?.date?.slice(5)}</span>
                <span style={{ color: "#EF4444", fontWeight: 600 }}>— avg: {formatMoney(data.dailyAvg)}/day —</span>
                <span>{data.dailySpending[data.dailySpending.length - 1]?.date?.slice(5)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add budget modal */}
      {showBudget && (
        <div style={{ position: "fixed", inset: 0, background: t.over, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }} onClick={() => setShowBudget(false)}>
          <div style={{ background: t.modal, borderRadius: 14, padding: "20px 18px", width: "90%", maxWidth: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: t.text, fontSize: 16, marginBottom: 12, fontFamily: "'Outfit', sans-serif" }}>Set Budget</div>
            <select value={budgetCat} onChange={e => setBudgetCat(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.cardAlt || t.bg, color: t.text, fontSize: 13, marginBottom: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              <option value="">Select category...</option>
              {Object.keys(SPEND_CATS).filter(c => c !== "Other" && c !== "Transfers").map(c => (
                <option key={c} value={c}>{SPEND_CATS[c].icon} {c}</option>
              ))}
            </select>
            <input type="number" value={budgetAmt} onChange={e => setBudgetAmt(e.target.value)} placeholder="Monthly limit $" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.cardAlt || t.bg, color: t.text, fontSize: 13, marginBottom: 10, boxSizing: "border-box", fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowBudget(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.sub, cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Cancel</button>
              <button onClick={addBudget} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Set Budget</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AISpendingInsightsView({ t }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSpendingInsights();
      setData(res);
    } catch (err) {
      console.error("Spending insights error:", err);
      setError("Couldn't load AI spending insights. Try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const F = "'Plus Jakarta Sans', 'Outfit', sans-serif";
  const H = "'Outfit', 'Plus Jakarta Sans', sans-serif";

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <div style={{ fontSize: 40, marginBottom: 12, animation: "pulse 1.5s ease-in-out infinite" }}>🧠</div>
      <div style={{ fontWeight: 700, color: t.text, fontSize: 16, fontFamily: H, marginBottom: 6 }}>Analyzing your spending...</div>
      <div style={{ fontSize: 13, color: t.sub, lineHeight: 1.6 }}>AI is reviewing your transactions, bills, and accounts to find personalized savings tips.</div>
      <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
      <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 8 }}>{error}</div>
      <button onClick={load} style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: F }}>Try Again</button>
    </div>
  );

  if (!data) return null;

  const { insights, summary } = data;
  const totalPotentialSavings = summary?.potentialSavings || insights?.reduce((s, i) => s + (i.savings || 0), 0) || 0;
  const spendChange = (summary?.thisMonthSpend || 0) - (summary?.lastMonthSpend || 0);
  const spendUp = spendChange > 0;

  const typeConfig = {
    warning: { color: "#EF4444", bg: t.priH, icon: "⚠️", label: "Warning" },
    tip: { color: "#6C5CE7", bg: t.tag, icon: "💡", label: "Tip" },
    positive: { color: "#10B981", bg: t.priL, icon: "✅", label: "Great" },
    goal: { color: "#F59E0B", bg: t.priM, icon: "🎯", label: "Goal" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>🧠</div>
          <div>
            <h3 style={{ fontFamily: H, color: t.text, margin: 0, fontSize: 18, fontWeight: 700 }}>AI Spending Tips</h3>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: t.sub }}>Smart analysis of your real spending</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{ padding: "7px 16px", borderRadius: 10, border: "none", background: loading ? t.pill : "#6C5CE7", color: loading ? t.sub : "white", cursor: loading ? "default" : "pointer", fontWeight: 700, fontSize: 11, fontFamily: F }}>{loading ? "Analyzing..." : "🔄 Refresh"}</button>
      </div>
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
            <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>This Month</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: t.text, fontFamily: H }}>{formatMoney(summary.thisMonthSpend || 0)}</div>
            <div style={{ fontSize: 10, color: spendUp ? "#EF4444" : "#10B981", fontWeight: 600 }}>{spendUp ? "▲" : "▼"} {formatMoney(Math.abs(spendChange))} vs last</div>
          </div>
          <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
            <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>CC Debt</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: (summary.debt || 0) > 0 ? "#EF4444" : t.text, fontFamily: H }}>{formatMoney(summary.debt || 0)}</div>
          </div>
          <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
            <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Can Save</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#10B981", fontFamily: H }}>{formatMoney(totalPotentialSavings)}/mo</div>
          </div>
        </div>
      )}
      {insights && insights.map((item, i) => {
        const cfg = typeConfig[item.type] || typeConfig.tip;
        return (
          <div key={i} style={{ background: t.card, borderRadius: 14, padding: "16px 20px", boxShadow: t.cs, borderLeft: `4px solid ${cfg.color}` }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ fontSize: 24, flexShrink: 0 }}>{cfg.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{item.title}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", background: cfg.bg, color: cfg.color }}>{cfg.label}</div>
                </div>
                <div style={{ fontSize: 13, color: t.sub, lineHeight: 1.6 }}>{item.insight}</div>
                {item.savings > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: "#10B981", background: t.priL, display: "inline-block", padding: "3px 10px", borderRadius: 6 }}>💰 Save ~{formatMoney(item.savings)}/month</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ textAlign: "center", fontSize: 11, color: t.muted, marginTop: 4 }}>AI insights based on your real transactions and account data</div>
    </div>
  );
}

function FinancialGoalsView({ t }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [contributeId, setContributeId] = useState(null);
  const [contributeAmt, setContributeAmt] = useState("");
  const [form, setForm] = useState({ name: "", goalType: "savings", icon: "🎯", targetAmount: "", currentAmount: "0", monthlyContribution: "", targetDate: "" });

  const F = "'Plus Jakarta Sans', 'Outfit', sans-serif";
  const H = "'Outfit', 'Plus Jakarta Sans', sans-serif";

  const load = async () => {
    try {
      const data = await api.getGoals();
      setGoals(data);
    } catch (err) {
      console.error("Goals error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name || !form.targetAmount) return;
    try {
      await api.createGoal({
        name: form.name, goalType: form.goalType, icon: form.icon,
        targetAmount: parseFloat(form.targetAmount),
        currentAmount: parseFloat(form.currentAmount) || 0,
        monthlyContribution: parseFloat(form.monthlyContribution) || 0,
        targetDate: form.targetDate || null,
      });
      setShowAdd(false);
      setForm({ name: "", goalType: "savings", icon: "🎯", targetAmount: "", currentAmount: "0", monthlyContribution: "", targetDate: "" });
      load();
    } catch (err) { console.error("Create goal error:", err); }
  };

  const handleContribute = async () => {
    if (!contributeAmt || parseFloat(contributeAmt) <= 0) return;
    try {
      await api.contributeToGoal(contributeId, parseFloat(contributeAmt));
      setContributeId(null); setContributeAmt(""); load();
    } catch (err) { console.error("Contribute error:", err); }
  };

  const handleDelete = async (id) => {
    try { await api.deleteGoal(id); load(); } catch (err) { console.error("Delete goal error:", err); }
  };

  const goalIcons = ["🎯", "🏠", "✈️", "🚗", "💍", "🎓", "💰", "🏖️", "📱", "🛡️", "👶", "💪"];
  const goalTypes = [
    { value: "savings", label: "Savings" }, { value: "emergency", label: "Emergency Fund" },
    { value: "debt", label: "Debt Payoff" }, { value: "purchase", label: "Purchase" },
    { value: "investment", label: "Investment" }, { value: "other", label: "Other" },
  ];

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: t.sub }}>Loading goals...</div>;

  const activeGoals = goals.filter(g => g.status !== "completed");
  const completedGoals = goals.filter(g => g.status === "completed");
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.currentAmount, 0);
  const overallPct = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>🎯</div>
          <div>
            <h3 style={{ fontFamily: H, color: t.text, margin: 0, fontSize: 18, fontWeight: 700 }}>Financial Goals</h3>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: t.sub }}>{goals.length} goal{goals.length !== 1 ? "s" : ""} tracked</p>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: "7px 14px", borderRadius: 10, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: F, display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Goal</button>
      </div>
      {goals.length > 0 && (
        <div style={{ background: t.card, borderRadius: 12, padding: "14px 18px", boxShadow: t.cs }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Total Progress</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: t.text, fontFamily: H }}>{formatMoney(totalSaved)} <span style={{ fontSize: 13, color: t.sub, fontWeight: 500 }}>/ {formatMoney(totalTarget)}</span></div>
            </div>
            <div style={{ width: 48, height: 48, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: `conic-gradient(#6C5CE7 ${overallPct * 3.6}deg, ${t.prog} 0deg)`, fontSize: 12, fontWeight: 800, color: t.text, fontFamily: H }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: t.card, display: "flex", alignItems: "center", justifyContent: "center" }}>{overallPct}%</div>
            </div>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: t.prog, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #6C5CE7, #a78bfa)", width: Math.min(overallPct, 100) + "%", transition: "width 0.5s ease" }} />
          </div>
        </div>
      )}
      {goals.length === 0 && !showAdd && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎯</div>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 4 }}>No goals yet</div>
          <div style={{ fontSize: 12, color: t.sub, marginBottom: 16 }}>Set savings targets and track your progress</div>
          <button onClick={() => setShowAdd(true)} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: F }}>Create Your First Goal</button>
        </div>
      )}
      {showAdd && (
        <div style={{ background: t.card, borderRadius: 14, padding: "18px 20px", boxShadow: t.cs, border: `1px solid ${t.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, color: t.text, fontSize: 14, fontFamily: H }}>New Goal</div>
            <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: t.sub }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
            {goalIcons.map(icon => (
              <button key={icon} onClick={() => setForm(f => ({ ...f, icon }))} style={{ width: 34, height: 34, borderRadius: 8, border: form.icon === icon ? "2px solid #6C5CE7" : `1px solid ${t.border}`, background: form.icon === icon ? t.tag : t.input, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</button>
            ))}
          </div>
          <input placeholder="Goal name (e.g. Emergency Fund)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 13, fontFamily: F, marginBottom: 8, boxSizing: "border-box" }} />
          <select value={form.goalType} onChange={e => setForm(f => ({ ...f, goalType: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 13, fontFamily: F, marginBottom: 8, boxSizing: "border-box" }}>
            {goalTypes.map(gt => <option key={gt.value} value={gt.value}>{gt.label}</option>)}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input type="number" placeholder="Target amount" value={form.targetAmount} onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value }))} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 13, fontFamily: F, boxSizing: "border-box" }} />
            <input type="number" placeholder="Already saved" value={form.currentAmount} onChange={e => setForm(f => ({ ...f, currentAmount: e.target.value }))} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 13, fontFamily: F, boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <input type="number" placeholder="Monthly contribution" value={form.monthlyContribution} onChange={e => setForm(f => ({ ...f, monthlyContribution: e.target.value }))} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 13, fontFamily: F, boxSizing: "border-box" }} />
            <input type="date" placeholder="Target date" value={form.targetDate} onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 13, fontFamily: F, boxSizing: "border-box" }} />
          </div>
          <button onClick={handleCreate} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: F }}>Create Goal</button>
        </div>
      )}
      {activeGoals.map(goal => (
        <div key={goal.id} style={{ background: t.card, borderRadius: 14, padding: "16px 20px", boxShadow: t.cs }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 24 }}>{goal.icon}</div>
              <div>
                <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{goal.name}</div>
                <div style={{ fontSize: 11, color: t.sub }}>{goal.type ? goal.type.charAt(0).toUpperCase() + goal.type.slice(1) : "Savings"}{goal.monthsToGo ? ` · ~${goal.monthsToGo} months left` : ""}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => { setContributeId(contributeId === goal.id ? null : goal.id); setContributeAmt(""); }} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: contributeId === goal.id ? "#6C5CE7" : t.cardAlt, color: contributeId === goal.id ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 10, fontFamily: F }}>+ Add</button>
              <button onClick={() => handleDelete(goal.id)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${t.border}`, background: t.cardAlt, color: "#EF4444", cursor: "pointer", fontSize: 10 }}>✕</button>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.text, fontFamily: H }}>{formatMoney(goal.currentAmount)}</div>
            <div style={{ fontSize: 12, color: t.sub }}>{formatMoney(goal.targetAmount)}</div>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: t.prog, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ height: "100%", borderRadius: 4, transition: "width 0.5s ease", width: Math.min(goal.pct, 100) + "%", background: goal.status === "overdue" ? "linear-gradient(90deg, #EF4444, #f87171)" : "linear-gradient(90deg, #6C5CE7, #a78bfa)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
            <span style={{ color: goal.status === "overdue" ? "#EF4444" : "#10B981", fontWeight: 700 }}>{goal.pct}% complete</span>
            <span style={{ color: t.sub }}>{formatMoney(goal.remaining)} remaining</span>
          </div>
          {contributeId === goal.id && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.border}` }}>
              <input type="number" placeholder="Amount" value={contributeAmt} onChange={e => setContributeAmt(e.target.value)} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 13, fontFamily: F }} />
              <button onClick={handleContribute} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: F }}>Add</button>
            </div>
          )}
          {(goal.targetDate || goal.projectedDate) && (
            <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 10, color: t.sub }}>
              {goal.targetDate && <span>🗓️ Target: {goal.targetDate}</span>}
              {goal.projectedDate && <span>📈 Projected: {goal.projectedDate}</span>}
            </div>
          )}
        </div>
      ))}
      {completedGoals.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.sub, marginTop: 6 }}>🎉 Completed</div>
          {completedGoals.map(goal => (
            <div key={goal.id} style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs, borderLeft: "4px solid #10B981", opacity: 0.8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 20 }}>{goal.icon}</div>
                  <div>
                    <div style={{ fontWeight: 700, color: t.text, fontSize: 13 }}>{goal.name}</div>
                    <div style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>✅ {formatMoney(goal.targetAmount)} achieved!</div>
                  </div>
                </div>
                <button onClick={() => handleDelete(goal.id)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${t.border}`, background: t.cardAlt, color: t.sub, cursor: "pointer", fontSize: 10 }}>✕</button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}


function HelpGuide({ t }) {
  const [open, setOpen] = useState(null);
  const F = "'Plus Jakarta Sans', sans-serif";
  const H = "'Outfit', sans-serif";

  const sections = [
    { title: "Getting Started", icon: "🚀", items: [
      { q: "How do I get started?", a: "1. Add your bills with the '+ Bill' button in the header. 2. Connect your bank in Money → Bank to auto-import transactions. 3. Add your income sources in Money → Income. Once your bank is connected, everything else happens automatically." },
      { q: "Do I need to connect my bank?", a: "No — you can add bills manually and track credit cards without a bank connection. But connecting your bank unlocks automatic spending tracking, bill detection, and transaction categorization." },
      { q: "Is my bank data safe?", a: "Yes. BillBuddy connects through Plaid — the same service used by Venmo, Cash App, and Robinhood. Your bank login credentials are never stored by BillBuddy." },
    ]},
    { title: "Navigation", icon: "🧭", items: [
      { q: "What are the 5 main tabs?", a: "Home (dashboard overview), Money (bank, cards, income, household), Calendar (bill due dates), Insights (AI recommendations), and More (spending tracker, goals, forecasts, and all advanced features)." },
      { q: "How do I switch dark/light mode?", a: "Tap the moon/sun icon in the top header bar. Your preference is saved to your account." },
      { q: "How do I add a bill?", a: "Tap the '+ Bill' button in the header from any screen. Enter the name, amount, due date, category, and frequency." },
    ]},
    { title: "Home Dashboard", icon: "📊", items: [
      { q: "What does 'Still Owed' mean?", a: "The total amount of unpaid bills remaining this month. As you check off bills, this number goes down." },
      { q: "What does 'Left Over' mean?", a: "Your bank balance minus unpaid bills. This is what you have available after paying everything." },
      { q: "Why does my bill show OVERDUE?", a: "The bill's due date has passed and it hasn't been marked as paid. Tap the checkmark to mark it paid. If you already paid it, the status will change to 'Next: [date]'." },
      { q: "Do bills reset every month?", a: "Yes — all recurring bills automatically reset to unpaid at the start of each new month." },
    ]},
    { title: "Money Tab", icon: "🏦", items: [
      { q: "How do I connect my bank?", a: "Go to Money → Bank → tap 'Connect Bank'. This opens Plaid where you log into your bank. Your checking, savings, and credit accounts are imported." },
      { q: "How often does bank data sync?", a: "Automatically on every app load and every 15 minutes. You can also tap 'Sync' to force an immediate refresh." },
      { q: "How do I filter transactions by account?", a: "In the Transactions view, use the filter tabs at the top: All, 🏦 Bank (checking/savings only), or 💳 Credit (credit cards only)." },
      { q: "How do I track credit cards?", a: "Go to Money → Cards. Connect your credit card issuer through Plaid for auto-updates, or tap '+ Add' to enter one manually." },
      { q: "What is Household vs Joint?", a: "Household is for roommates — split shared bills, keep finances private. Joint is for partners — see each other's banks, bills, cards, and transactions together with filter tabs." },
    ]},
    { title: "Calendar", icon: "📅", items: [
      { q: "Can I move a bill's due date?", a: "Yes — drag and drop a bill to a different date on the calendar grid." },
      { q: "How do I sync with my phone calendar?", a: "Go to More → Reminders and tap 'Subscribe to BillBuddy Calendar'. This creates a live calendar subscription in your phone's calendar app." },
    ]},
    { title: "Spending Tracker", icon: "💰", items: [
      { q: "How does auto-categorization work?", a: "BillBuddy recognizes 200+ merchants and automatically sorts transactions: Shell → Gas, Walmart → Groceries, DoorDash → Eating Out, Amazon → Shopping, Netflix → Entertainment, etc." },
      { q: "How do I set a spending budget?", a: "Go to More → Spending → Budgets tab. Tap '+ Budget', pick a category, and set a monthly limit. The progress bar fills up as you spend." },
      { q: "What are the time periods?", a: "Switch between 7, 14, 30, 60, or 90 day views to see spending over different periods." },
      { q: "What does the Trends view show?", a: "Spending by day of week (weekends highlighted in red) and a daily spending chart with your average marked." },
    ]},
    { title: "More Features", icon: "⚙️", items: [
      { q: "What does AI Insights do?", a: "Analyzes your complete financial picture and gives 4-8 personalized recommendations with specific dollar amounts based on your real data." },
      { q: "What is the Forecast?", a: "A 30-day projection of your bank balance showing upcoming bills (red) and income (green). Shows your lowest balance point and date." },
      { q: "How does Bill Negotiation work?", a: "Finds bills you can negotiate (phone, internet, insurance, $100+/mo) and generates word-for-word phone scripts with opener, main ask, resistance handling, and escalation tactics." },
      { q: "What is the Subscription Detector?", a: "Scans bank transactions for recurring charges not in your bills list. One-click 'Add as Bill' to start tracking them." },
      { q: "What are Smart Alerts?", a: "Automatic warnings for: spending increases by category, unusually large transactions, untracked recurring charges, and low balance." },
      { q: "What is the Activity Feed?", a: "Unified view of ALL transactions across all accounts. Filter by type (in/out/pending) and time range (7-90 days)." },
    ]},
    { title: "Account & Settings", icon: "👤", items: [
      { q: "How do I sign out?", a: "Tap the arrow icon (↗) in the top right of the header." },
      { q: "Can I use Google to sign in?", a: "Yes — tap 'Continue with Google' on the login screen." },
      { q: "How do I change my bill reminders?", a: "Go to More → Reminders. Set each bill to: no reminder, day of, 1 day before, 3 days before, or 1 week before." },
    ]},
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <h3 style={{ fontFamily: H, color: t.text, margin: 0, fontSize: 18, fontWeight: 700 }}>Help & FAQ</h3>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: t.sub }}>Everything you need to know about BillBuddy</p>
      </div>

      {sections.map((sec, si) => (
        <div key={si} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
            <span style={{ fontSize: 18 }}>{sec.icon}</span>
            <span style={{ fontWeight: 700, color: t.text, fontSize: 14, fontFamily: H }}>{sec.title}</span>
          </div>
          {sec.items.map((item, qi) => {
            const key = si + "-" + qi;
            const isOpen = open === key;
            return (
              <div key={qi} onClick={() => setOpen(isOpen ? null : key)} style={{ background: t.card, borderRadius: 10, padding: "12px 16px", boxShadow: t.cs, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: t.text, fontSize: 13, flex: 1 }}>{item.q}</span>
                  <span style={{ fontSize: 12, color: t.sub, marginLeft: 8, transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid " + t.border, fontSize: 12, color: t.sub, lineHeight: 1.6 }}>
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div style={{ background: t.cardAlt, borderRadius: 10, padding: "14px 16px", textAlign: "center", marginTop: 8 }}>
        <div style={{ fontSize: 14, marginBottom: 4 }}>💡</div>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 13, marginBottom: 4 }}>Pro Tips</div>
        <div style={{ fontSize: 11, color: t.sub, lineHeight: 1.6 }}>
          Connect your bank first — it unlocks 80% of BillBuddy's features. Check the Spending tab weekly. Use AI Tips monthly for personalized savings advice. Set up calendar sync so you never miss a due date.
        </div>
      </div>
    </div>
  );
}

function CreditScoreView({ t }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const F = "'Plus Jakarta Sans', 'Outfit', sans-serif";
  const H = "'Outfit', 'Plus Jakarta Sans', sans-serif";

  const load = async () => {
    setLoading(true); setError(null);
    try { const res = await api.getCreditHealth(); setData(res); }
    catch (err) { setError("Couldn't load credit score. Try again."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <div style={{ fontSize: 40, marginBottom: 12, animation: "pulse 1.5s ease-in-out infinite" }}>📊</div>
      <div style={{ fontWeight: 700, color: t.text, fontSize: 16, fontFamily: H, marginBottom: 6 }}>Calculating credit health...</div>
      <div style={{ fontSize: 13, color: t.sub }}>Analyzing your accounts, bills, and payment history</div>
      <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }`}</style>
    </div>
  );
  if (error) return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
      <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 8 }}>{error}</div>
      <button onClick={load} style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: F }}>Try Again</button>
    </div>
  );
  if (!data) return null;

  const pct = ((data.score - 300) / 550) * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>📊</div>
          <div>
            <h3 style={{ fontFamily: H, color: t.text, margin: 0, fontSize: 18, fontWeight: 700 }}>Credit Health</h3>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: t.sub }}>Estimated from your financial data</p>
          </div>
        </div>
        <button onClick={load} style={{ padding: "7px 16px", borderRadius: 10, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: F }}>🔄 Refresh</button>
      </div>

      {/* Score gauge */}
      <div style={{ background: t.card, borderRadius: 14, padding: "24px 20px", boxShadow: t.cs, textAlign: "center" }}>
        <div style={{ position: "relative", width: 160, height: 90, margin: "0 auto 12px" }}>
          <svg viewBox="0 0 160 90" style={{ width: "100%", overflow: "visible" }}>
            <path d="M 10 80 A 70 70 0 0 1 150 80" fill="none" stroke={t.border} strokeWidth="12" strokeLinecap="round" />
            <path d="M 10 80 A 70 70 0 0 1 150 80" fill="none" stroke={data.gradeColor} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${pct * 2.2} 220`} />
          </svg>
          <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: t.text, fontFamily: H, lineHeight: 1 }}>{data.score}</div>
            <div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>out of 850</div>
          </div>
        </div>
        <div style={{ display: "inline-block", padding: "4px 16px", borderRadius: 20, background: data.gradeColor + "18", color: data.gradeColor, fontWeight: 700, fontSize: 13 }}>{data.grade}</div>
      </div>

      {/* Factors */}
      {data.factors && data.factors.map((f, i) => (
        <div key={i} style={{ background: t.card, borderRadius: 12, padding: "14px 18px", boxShadow: t.cs, borderLeft: `4px solid ${f.color}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 13 }}>{f.name}</div>
              <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>{f.detail}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: f.color }}>{f.impact}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: f.color + "18", color: f.color }}>{f.rating}</span>
            </div>
          </div>
        </div>
      ))}

      {/* Summary stats */}
      {data.summary && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
            <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Total Debt</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: data.summary.totalDebt > 0 ? "#EF4444" : t.text, fontFamily: H }}>{formatMoney(data.summary.totalDebt)}</div>
          </div>
          <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
            <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Utilization</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: t.text, fontFamily: H }}>{data.utilization}%</div>
          </div>
          <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
            <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Bills Paid</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#10B981", fontFamily: H }}>{data.summary.paidBills}/{data.summary.totalBills}</div>
          </div>
        </div>
      )}

      {/* Score history */}
      {data.scoreHistory && data.scoreHistory.length > 1 && (
        <div style={{ background: t.card, borderRadius: 12, padding: "14px 18px", boxShadow: t.cs }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 8 }}>Score Trend</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 50 }}>
            {data.scoreHistory.map((h, i) => {
              const hPct = ((h.score - 300) / 550) * 100;
              return <div key={i} style={{ flex: 1, background: data.gradeColor + "40", borderRadius: 3, height: hPct + "%", minHeight: 4, transition: "height 0.3s" }} title={h.score + ""} />;
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: t.muted, marginTop: 4 }}>
            <span>Oldest</span><span>Latest</span>
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", fontSize: 11, color: t.muted, marginTop: 4 }}>Estimated credit health based on your BillBuddy data — not an official credit score</div>
    </div>
  );
}

function SmartSavingsView({ t }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRoundUps, setShowRoundUps] = useState(false);
  const F = "'Plus Jakarta Sans', 'Outfit', sans-serif";
  const H = "'Outfit', 'Plus Jakarta Sans', sans-serif";

  const load = async () => {
    setLoading(true); setError(null);
    try { const res = await api.getSmartSavings(); setData(res); }
    catch (err) { setError("Couldn't load savings data."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <div style={{ fontSize: 40, marginBottom: 12, animation: "pulse 1.5s ease-in-out infinite" }}>🤖</div>
      <div style={{ fontWeight: 700, color: t.text, fontSize: 16, fontFamily: H, marginBottom: 6 }}>Crunching your numbers...</div>
      <div style={{ fontSize: 13, color: t.sub }}>Finding smart ways to save from your spending</div>
      <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }`}</style>
    </div>
  );
  if (error) return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
      <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 8 }}>{error}</div>
      <button onClick={load} style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: F }}>Try Again</button>
    </div>
  );
  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>🤖</div>
          <div>
            <h3 style={{ fontFamily: H, color: t.text, margin: 0, fontSize: 18, fontWeight: 700 }}>Smart Savings</h3>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: t.sub }}>Autopilot your savings</p>
          </div>
        </div>
        <button onClick={load} style={{ padding: "7px 16px", borderRadius: 10, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: F }}>🔄 Refresh</button>
      </div>

      {/* Autopilot recommendation */}
      <div style={{ background: "linear-gradient(135deg, #6C5CE7 0%, #a78bfa 100%)", borderRadius: 14, padding: "20px", color: "white" }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", opacity: 0.8, marginBottom: 4 }}>Autopilot Recommendation</div>
        <div style={{ fontSize: 28, fontWeight: 800, fontFamily: H }}>{formatMoney(data.autopilot.monthly)}<span style={{ fontSize: 14, fontWeight: 500, opacity: 0.8 }}>/month</span></div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>Safe to auto-save • {formatMoney(data.autopilot.weekly)}/week • {formatMoney(data.autopilot.daily)}/day</div>
      </div>

      {/* Round-ups */}
      <div style={{ background: t.card, borderRadius: 14, padding: "16px 20px", boxShadow: t.cs }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setShowRoundUps(!showRoundUps)}>
          <div>
            <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>💰 Round-Up Savings</div>
            <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>Round every purchase to the nearest dollar</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#10B981", fontFamily: H }}>{formatMoney(data.roundUps.monthly)}/mo</div>
            <div style={{ fontSize: 11, color: t.sub }}>{formatMoney(data.roundUps.yearly)}/year</div>
          </div>
        </div>
        {showRoundUps && data.roundUps.topRoundUps && data.roundUps.topRoundUps.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: t.sub, marginBottom: 6 }}>Top round-ups from {data.roundUps.txnCount} transactions</div>
            {data.roundUps.topRoundUps.slice(0, 5).map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, color: t.text }}>
                <span style={{ color: t.sub }}>{r.name}</span>
                <span style={{ fontWeight: 700, color: "#10B981" }}>+{formatMoney(r.roundUp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Savings rules */}
      {data.savingsRules && data.savingsRules.map((rule, i) => (
        <div key={i} style={{ background: t.card, borderRadius: 12, padding: "14px 18px", boxShadow: t.cs, borderLeft: `4px solid ${i === 0 ? "#6C5CE7" : i === 1 ? "#10B981" : "#F59E0B"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 13 }}>{rule.name}</div>
              <div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>{rule.description}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: t.text, fontFamily: H }}>{formatMoney(rule.recommended)}</div>
              <div style={{ fontSize: 10, color: t.sub }}>{formatMoney(rule.perPaycheck)}/paycheck</div>
            </div>
          </div>
        </div>
      ))}

      {/* Financial snapshot */}
      {data.snapshot && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
            <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Income</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#10B981", fontFamily: H }}>{formatMoney(data.snapshot.monthlyIncome)}</div>
          </div>
          <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
            <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Bills</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#EF4444", fontFamily: H }}>{formatMoney(data.snapshot.monthlyBills)}</div>
          </div>
          <div style={{ background: t.card, borderRadius: 10, padding: "10px 12px", boxShadow: t.cs }}>
            <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Free Cash</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: t.text, fontFamily: H }}>{formatMoney(data.snapshot.discretionary)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function CancelHelperView({ t }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [emailTemplate, setEmailTemplate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const F = "'Plus Jakarta Sans', 'Outfit', sans-serif";
  const H = "'Outfit', 'Plus Jakarta Sans', sans-serif";

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true); setResult(null); setEmailTemplate(null); setShowEmail(false);
    try {
      const res = await api.getCancelInfo(query.trim());
      setResult(res);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const getEmail = async () => {
    try {
      const res = await api.getCancelEmail(query.trim());
      setEmailTemplate(res);
      setShowEmail(true);
    } catch (err) { console.error(err); }
  };

  const diffColors = { Easy: "#10B981", Medium: "#F59E0B", Hard: "#EF4444", Unknown: "#6B7280" };
  const popularServices = ["Netflix", "Spotify", "Hulu", "Amazon Prime", "Disney+", "Adobe", "Planet Fitness", "SiriusXM", "Audible", "YouTube", "HBO", "DoorDash"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 28 }}>🚫</div>
        <div>
          <h3 style={{ fontFamily: H, color: t.text, margin: 0, fontSize: 18, fontWeight: 700 }}>Cancel Helper</h3>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: t.sub }}>Direct links and steps to cancel any subscription</p>
        </div>
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: 8 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="Search service (Netflix, Spotify, gym...)" style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 14, fontFamily: F, boxSizing: "border-box" }} />
        <button onClick={search} disabled={loading} style={{ padding: "12px 20px", borderRadius: 12, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: F, whiteSpace: "nowrap" }}>{loading ? "..." : "🔍 Search"}</button>
      </div>

      {/* Quick picks */}
      {!result && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {popularServices.map(s => (
            <button key={s} onClick={() => { setQuery(s); setTimeout(() => { }, 0); }} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.cardAlt, color: t.sub, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: F }}
              onClickCapture={() => { setQuery(s); }}>{s}</button>
          ))}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ background: t.card, borderRadius: 14, padding: "20px", boxShadow: t.cs }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 16, textTransform: "capitalize" }}>{result.service}</div>
              <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>Method: {result.method}</div>
            </div>
            <div style={{ padding: "4px 12px", borderRadius: 8, fontWeight: 700, fontSize: 11, background: (diffColors[result.difficulty] || "#6B7280") + "18", color: diffColors[result.difficulty] || "#6B7280" }}>{result.difficulty}</div>
          </div>

          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {result.steps && result.steps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#6C5CE7", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ fontSize: 13, color: t.text, lineHeight: 1.5, paddingTop: 2 }}>{step}</div>
              </div>
            ))}
          </div>

          {result.note && (
            <div style={{ background: t.cardAlt, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: t.sub, marginBottom: 14 }}>📝 {result.note}</div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {result.url && (
              <a href={result.url} target="_blank" rel="noopener noreferrer" style={{ padding: "10px 18px", borderRadius: 10, background: "#6C5CE7", color: "white", fontWeight: 700, fontSize: 12, fontFamily: F, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>🔗 Open Cancel Page</a>
            )}
            <button onClick={getEmail} style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.cardAlt, color: t.text, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: F }}>✉️ Email Template</button>
            <button onClick={() => { setResult(null); setQuery(""); setShowEmail(false); }} style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.cardAlt, color: t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: F }}>New Search</button>
          </div>
        </div>
      )}

      {/* Email template */}
      {showEmail && emailTemplate && (
        <div style={{ background: t.card, borderRadius: 14, padding: "18px 20px", boxShadow: t.cs }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 13, marginBottom: 8 }}>Cancellation Email Template</div>
          <div style={{ background: t.input, borderRadius: 10, padding: "14px", fontSize: 12, color: t.sub, marginBottom: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: t.text }}>Subject: {emailTemplate.subject}</div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{emailTemplate.body}</div>
          </div>
          <button onClick={() => { navigator.clipboard.writeText("Subject: " + emailTemplate.subject + "\n\n" + emailTemplate.body); }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#6C5CE7", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: F }}>📋 Copy to Clipboard</button>
        </div>
      )}
    </div>
  );
}

function FloatingCalculator({ t }) {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState(null);
  const [op, setOp] = useState(null);
  const [fresh, setFresh] = useState(true);
  const H = "'Outfit', 'Plus Jakarta Sans', sans-serif";

  const handleNum = (n) => {
    if (fresh) { setDisplay(n === "." ? "0." : n); setFresh(false); }
    else { setDisplay(display === "0" && n !== "." ? n : display + n); }
  };

  const handleOp = (nextOp) => {
    const current = parseFloat(display);
    if (prev !== null && op && !fresh) {
      let result;
      switch (op) {
        case "+": result = prev + current; break;
        case "-": result = prev - current; break;
        case "×": result = prev * current; break;
        case "÷": result = current !== 0 ? prev / current : 0; break;
        default: result = current;
      }
      setPrev(result);
      setDisplay(String(parseFloat(result.toFixed(10))));
    } else {
      setPrev(current);
    }
    setOp(nextOp);
    setFresh(true);
  };

  const handleEquals = () => {
    if (prev === null || !op) return;
    const current = parseFloat(display);
    let result;
    switch (op) {
      case "+": result = prev + current; break;
      case "-": result = prev - current; break;
      case "×": result = prev * current; break;
      case "÷": result = current !== 0 ? prev / current : 0; break;
      default: result = current;
    }
    setDisplay(String(parseFloat(result.toFixed(10))));
    setPrev(null);
    setOp(null);
    setFresh(true);
  };

  const handleClear = () => { setDisplay("0"); setPrev(null); setOp(null); setFresh(true); };
  const handlePercent = () => { setDisplay(String(parseFloat(display) / 100)); setFresh(true); };
  const handlePlusMinus = () => { setDisplay(String(parseFloat(display) * -1)); };

  const btnStyle = (bg, color) => ({
    width: 56, height: 48, borderRadius: 12, border: "none", cursor: "pointer",
    fontSize: 18, fontWeight: 700, fontFamily: H, background: bg, color: color,
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "opacity 0.15s",
  });

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} style={{
          position: "fixed", bottom: 155, right: 20, width: 48, height: 48,
          borderRadius: "50%", background: "linear-gradient(135deg, #F59E0B, #F97316)",
          border: "none", cursor: "pointer", zIndex: 999,
          boxShadow: "0 4px 16px rgba(245,158,11,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "transform 0.2s",
        }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
        >
          <span style={{ fontSize: 22, lineHeight: 1 }}>🧮</span>
        </button>
      )}

      {open && (
        <div style={{
          position: "fixed", bottom: 90, right: 20,
          width: 280, background: t.card, borderRadius: 20, zIndex: 1000,
          boxShadow: "0 8px 40px rgba(0,0,0,0.3)", overflow: "hidden",
          border: `1px solid ${t.border}`,
        }}>
          <div style={{
            background: "linear-gradient(135deg, #F59E0B, #F97316)",
            padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ color: "white", fontWeight: 700, fontSize: 14, fontFamily: H }}>🧮 Calculator</span>
            <button onClick={() => setOpen(false)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 16, fontWeight: 700 }}>✕</button>
          </div>
          <div style={{ padding: "16px 16px 8px" }}>
            {prev !== null && op && <div style={{ fontSize: 11, color: t.sub, textAlign: "right", marginBottom: 2 }}>{prev} {op}</div>}
            <div style={{ fontSize: 28, fontWeight: 800, color: t.text, textAlign: "right", fontFamily: H, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{display}</div>
          </div>
          <div style={{ padding: "8px 12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              [{ l: "C", fn: handleClear, bg: t.cardAlt || "#333", c: t.text }, { l: "±", fn: handlePlusMinus, bg: t.cardAlt || "#333", c: t.text }, { l: "%", fn: handlePercent, bg: t.cardAlt || "#333", c: t.text }, { l: "÷", fn: () => handleOp("÷"), bg: "#F59E0B", c: "white" }],
              [{ l: "7", fn: () => handleNum("7") }, { l: "8", fn: () => handleNum("8") }, { l: "9", fn: () => handleNum("9") }, { l: "×", fn: () => handleOp("×"), bg: "#F59E0B", c: "white" }],
              [{ l: "4", fn: () => handleNum("4") }, { l: "5", fn: () => handleNum("5") }, { l: "6", fn: () => handleNum("6") }, { l: "-", fn: () => handleOp("-"), bg: "#F59E0B", c: "white" }],
              [{ l: "1", fn: () => handleNum("1") }, { l: "2", fn: () => handleNum("2") }, { l: "3", fn: () => handleNum("3") }, { l: "+", fn: () => handleOp("+"), bg: "#F59E0B", c: "white" }],
              [{ l: "0", fn: () => handleNum("0"), wide: true }, { l: ".", fn: () => handleNum(".") }, { l: "=", fn: handleEquals, bg: "#10B981", c: "white" }],
            ].map((row, ri) => (
              <div key={ri} style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                {row.map((btn, bi) => (
                  <button key={bi} onClick={btn.fn} style={{
                    ...btnStyle(btn.bg || (t.prog || "#2a2a3e"), btn.c || t.text),
                    ...(btn.wide ? { width: 118 } : {}),
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                  >{btn.l}</button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function AdvisorChat({ t, user }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const F = "'Plus Jakarta Sans', 'Outfit', sans-serif";
  const H = "'Outfit', 'Plus Jakarta Sans', sans-serif";

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(() => { scrollToBottom(); }, [messages]);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await api.askAdvisor(userMsg, history);
      setMessages(prev => [...prev, { role: "assistant", content: res.reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't process that. Please try again." }]);
    } finally { setLoading(false); }
  };

  const suggestions = [
    "Can I afford a $1,500 TV paying $250/mo?",
    "When is the safest day to make a big purchase?",
    "How much can I spend this week?",
    "What should I prioritize paying off first?",
  ];

  return (
    <>
      {/* Floating button - always visible */}
      {!open && (
        <button onClick={() => setOpen(true)} style={{
          position: "fixed", bottom: 90, right: 20, width: 56, height: 56,
          borderRadius: "50%", background: "linear-gradient(135deg, #6C5CE7, #a78bfa)",
          border: "none", cursor: "pointer", zIndex: 999,
          boxShadow: "0 4px 20px rgba(108,92,231,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={e => { e.target.style.transform = "scale(1.1)"; e.target.style.boxShadow = "0 6px 28px rgba(108,92,231,0.6)"; }}
        onMouseLeave={e => { e.target.style.transform = "scale(1)"; e.target.style.boxShadow = "0 4px 20px rgba(108,92,231,0.5)"; }}
        >
          <span style={{ fontSize: 26, lineHeight: 1 }}>💬</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 20, right: 20,
          width: 380, maxWidth: "calc(100vw - 40px)", height: 520, maxHeight: "calc(100vh - 100px)",
          background: t.card, borderRadius: 20, zIndex: 1000,
          boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          border: `1px solid ${t.border}`,
        }}>
          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg, #6C5CE7, #a78bfa)",
            padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💸</div>
              <div>
                <div style={{ color: "white", fontWeight: 700, fontSize: 14, fontFamily: H }}>BillBuddy Advisor</div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>AI-powered financial advice</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "white", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>

          {/* Messages area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>👋</div>
                <div style={{ fontWeight: 700, color: t.text, fontSize: 14, fontFamily: H, marginBottom: 4 }}>Hey{user?.name ? ", " + user.name.split(" ")[0] : ""}!</div>
                <div style={{ fontSize: 12, color: t.sub, lineHeight: 1.6, marginBottom: 16 }}>Ask me anything about your finances. I know your balance, bills, income, and spending.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => { setInput(s); }} style={{
                      padding: "10px 14px", borderRadius: 10, border: `1px solid ${t.border}`,
                      background: t.cardAlt, color: t.text, cursor: "pointer",
                      fontSize: 12, fontFamily: F, textAlign: "left", fontWeight: 500,
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={e => e.target.style.background = t.pill}
                    onMouseLeave={e => e.target.style.background = t.cardAlt}
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "85%", padding: "10px 14px", borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: msg.role === "user" ? "#6C5CE7" : t.cardAlt,
                  color: msg.role === "user" ? "white" : t.text,
                  fontSize: 13, lineHeight: 1.6, fontFamily: F, whiteSpace: "pre-wrap",
                }}>{msg.content}</div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "12px 18px", borderRadius: "14px 14px 14px 4px", background: t.cardAlt }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.sub, animation: "dotPulse 1.2s ease-in-out 0s infinite" }} />
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.sub, animation: "dotPulse 1.2s ease-in-out 0.2s infinite" }} />
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.sub, animation: "dotPulse 1.2s ease-in-out 0.4s infinite" }} />
                  </div>
                  <style>{`@keyframes dotPulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }`}</style>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${t.border}`, display: "flex", gap: 8, alignItems: "center" }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Ask about your finances..."
              style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: `1px solid ${t.border}`, background: t.input, color: t.text, fontSize: 13, fontFamily: F, outline: "none", boxSizing: "border-box" }} />
            <button onClick={send} disabled={loading || !input.trim()} style={{
              width: 40, height: 40, borderRadius: 12, border: "none",
              background: input.trim() ? "#6C5CE7" : t.cardAlt,
              color: input.trim() ? "white" : t.sub,
              cursor: input.trim() ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0,
            }}>↑</button>
          </div>
        </div>
      )}
    </>
  );
}


// ─── Security View (2FA Setup) ───
function SecurityView({ t }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupData, setSetupData] = useState(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [backupCodes, setBackupCodes] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const F = "'Plus Jakarta Sans', 'Outfit', sans-serif";
  const H = "'Outfit', 'Plus Jakarta Sans', sans-serif";

  useEffect(() => {
    api.get2FAStatus().then(s => { setStatus(s.enabled); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const startSetup = async () => {
    setError("");
    try {
      const data = await api.setup2FA();
      setSetupData(data);
    } catch (err) { setError(err.message); }
  };

  const verifySetup = async () => {
    if (!verifyCode || verifyCode.length < 6) { setError("Enter the 6-digit code"); return; }
    setError("");
    try {
      const result = await api.verify2FA(verifyCode);
      setBackupCodes(result.backupCodes);
      setStatus(true);
      setSetupData(null);
      setVerifyCode("");
    } catch (err) { setError(err.message || "Invalid code"); }
  };

  const handleDisable = async () => {
    if (!disableCode || disableCode.length < 6) { setError("Enter your current 2FA code"); return; }
    setError("");
    try {
      await api.disable2FA(disableCode);
      setStatus(false);
      setDisableCode("");
      setMsg("2FA has been disabled");
      setTimeout(() => setMsg(""), 3000);
    } catch (err) { setError(err.message || "Invalid code"); }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: t.sub }}>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ fontFamily: H, color: t.text, margin: 0, fontSize: 20, fontWeight: 700 }}>🔐 Security</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: t.sub }}>Protect your account</p>
      </div>

      {error && <div style={{ background: "#EF444410", color: "#EF4444", padding: "12px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600, border: "1px solid #EF444420" }}>{error}</div>}
      {msg && <div style={{ background: "#10B98110", color: "#10B981", padding: "12px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600, border: "1px solid #10B98120" }}>{msg}</div>}

      {/* Status card */}
      <div style={{ background: t.card, borderRadius: 16, padding: "18px 20px", boxShadow: t.cs }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, color: t.text, fontSize: 15 }}>Two-Factor Authentication</div>
            <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>
              {status ? "Your account is protected with 2FA" : "Add an extra layer of security"}
            </div>
          </div>
          <div style={{
            padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
            background: status ? "#10B98120" : "#EF444420",
            color: status ? "#10B981" : "#EF4444",
          }}>{status ? "ENABLED" : "OFF"}</div>
        </div>
      </div>

      {/* Setup flow */}
      {!status && !setupData && (
        <button onClick={startSetup} style={{
          width: "100%", padding: "14px", borderRadius: 12, border: "none",
          background: "#6C5CE7", color: "white", cursor: "pointer",
          fontWeight: 700, fontSize: 14, fontFamily: F,
        }}>Enable Two-Factor Authentication</button>
      )}

      {/* QR Code setup */}
      {setupData && (
        <div style={{ background: t.card, borderRadius: 16, padding: "20px", boxShadow: t.cs }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 12 }}>Step 1: Scan QR Code</div>
          <p style={{ fontSize: 12, color: t.sub, marginBottom: 12 }}>
            Open Google Authenticator (or any TOTP app) and scan this QR code
          </p>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <img src={setupData.qrCode} alt="2FA QR Code" style={{ width: 200, height: 200, borderRadius: 12 }} />
          </div>
          <div style={{ background: t.cardAlt, borderRadius: 10, padding: "10px 14px", marginBottom: 16, wordBreak: "break-all" }}>
            <div style={{ fontSize: 10, color: t.sub, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Manual Key</div>
            <div style={{ fontSize: 12, color: t.text, fontFamily: "monospace", fontWeight: 600 }}>{setupData.secret}</div>
          </div>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 8 }}>Step 2: Enter Code</div>
          <input
            value={verifyCode}
            onChange={e => setVerifyCode(e.target.value.replace(/\D/g, "").substring(0, 6))}
            placeholder="000000"
            maxLength={6}
            style={{
              width: "100%", padding: "12px", borderRadius: 10, border: `1px solid ${t.border}`,
              fontSize: 20, fontWeight: 700, textAlign: "center", letterSpacing: 6,
              fontFamily: "'Outfit', monospace", background: t.cardAlt || t.bg, color: t.text,
              outline: "none", boxSizing: "border-box",
            }}
            onKeyDown={e => e.key === "Enter" && verifySetup()}
          />
          <button onClick={verifySetup} style={{
            width: "100%", padding: "13px", borderRadius: 10, border: "none",
            background: "#10B981", color: "white", cursor: "pointer",
            fontWeight: 700, fontSize: 14, fontFamily: F, marginTop: 12,
          }}>Verify & Enable</button>
        </div>
      )}

      {/* Backup codes */}
      {backupCodes && (
        <div style={{ background: "#F59E0B10", borderRadius: 16, padding: "18px 20px", border: "1px solid #F59E0B30" }}>
          <div style={{ fontWeight: 700, color: "#F59E0B", fontSize: 14, marginBottom: 8 }}>⚠️ Save Your Backup Codes</div>
          <p style={{ fontSize: 12, color: t.sub, marginBottom: 12 }}>Store these codes safely. Each can be used once if you lose access to your authenticator.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {backupCodes.map((code, i) => (
              <div key={i} style={{ background: t.card, padding: "8px 12px", borderRadius: 8, fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: t.text, textAlign: "center" }}>{code}</div>
            ))}
          </div>
          <button onClick={() => setBackupCodes(null)} style={{
            width: "100%", padding: "10px", borderRadius: 10, border: `1px solid ${t.border}`,
            background: "transparent", color: t.text, cursor: "pointer",
            fontWeight: 600, fontSize: 13, fontFamily: F, marginTop: 12,
          }}>I've saved my codes</button>
        </div>
      )}

      {/* Disable 2FA */}
      {status && !setupData && (
        <div style={{ background: t.card, borderRadius: 16, padding: "18px 20px", boxShadow: t.cs }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 8 }}>Disable 2FA</div>
          <p style={{ fontSize: 12, color: t.sub, marginBottom: 12 }}>Enter your current 2FA code to disable</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={disableCode}
              onChange={e => setDisableCode(e.target.value.replace(/\D/g, "").substring(0, 6))}
              placeholder="000000"
              maxLength={6}
              style={{
                flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${t.border}`,
                fontSize: 16, fontWeight: 700, textAlign: "center", letterSpacing: 4,
                fontFamily: "monospace", background: t.cardAlt || t.bg, color: t.text,
                outline: "none", boxSizing: "border-box",
              }}
            />
            <button onClick={handleDisable} style={{
              padding: "10px 20px", borderRadius: 10, border: "none",
              background: "#EF4444", color: "white", cursor: "pointer",
              fontWeight: 700, fontSize: 13, fontFamily: F,
            }}>Disable</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsTab({ bills, history, hMonths, hFilter, setHFilter, onUpdateReminder, t }) {
  const [subTab, setSubTab] = useState(null);
  const F = "'Plus Jakarta Sans', 'Outfit', sans-serif";
  const H = "'Outfit', 'Plus Jakarta Sans', sans-serif";

  const groups = [
    {
      title: "Money Tools",
      items: [
        { key: "spending", icon: "💰", label: "Spending", desc: "Where your money goes" },
        { key: "forecast", icon: "📈", label: "Forecast", desc: "Predict future expenses" },
        { key: "charts", icon: "📊", label: "Charts", desc: "Visual breakdowns" },
        { key: "history", icon: "📜", label: "History", desc: "Payment records" },
      ]
    },
    {
      title: "Save & Grow",
      items: [
        { key: "savings", icon: "🐷", label: "Savings", desc: "Savings advisor" },
        { key: "goals", icon: "🎯", label: "Goals", desc: "Track financial goals" },
        { key: "smartsave", icon: "🤖", label: "AutoSave", desc: "Smart savings autopilot" },
        { key: "credit", icon: "📊", label: "Credit Score", desc: "Credit health report" },
      ]
    },
    {
      title: "Smart Tools",
      items: [
        { key: "aitips", icon: "🧠", label: "AI Tips", desc: "AI spending insights" },
        { key: "negotiate", icon: "🤝", label: "Negotiate", desc: "Bill negotiation scripts" },
        { key: "cancel", icon: "🚫", label: "Cancel Helper", desc: "Cancel subscriptions easily" },
        { key: "subs", icon: "📺", label: "Subscriptions", desc: "Detect recurring charges" },
      ]
    },
    {
      title: "Manage",
      items: [
        { key: "activity", icon: "📋", label: "Activity", desc: "Recent activity feed" },
        { key: "alerts", icon: "🔔", label: "Alerts", desc: "Smart notifications" },
        { key: "reminders", icon: "⏰", label: "Reminders", desc: "Bill due date reminders" },
      ]
    },
    {
      title: "Security",
      items: [
        { key: "security", icon: "🔐", label: "Security", desc: "2FA and account protection" },
      ]
    },
    {
      title: "Legal & Support",
      items: [
        { key: "link_support", icon: "💬", label: "Support & Help", desc: "FAQ, contact us, get help", link: "/support.html" },
        { key: "link_privacy", icon: "📄", label: "Privacy Policy", desc: "How we handle your data", link: "/privacy.html" },
      ]
    },
  ];

  // If a sub-tab is selected, show that view with a back button
  if (subTab) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button onClick={() => setSubTab(null)} style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
          color: "#6C5CE7", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: F,
          padding: "4px 0", alignSelf: "flex-start",
        }}>← More</button>
        {subTab === "spending" && <SpendingView t={t} />}
        {subTab === "forecast" && <ForecastView t={t} />}
        {subTab === "savings" && <SavingsAdvisor t={t} />}
        {subTab === "negotiate" && <NegotiateView bills={bills} t={t} />}
        {subTab === "subs" && <SubscriptionDetector t={t} />}
        {subTab === "activity" && <ActivityView t={t} />}
        {subTab === "alerts" && <SmartAlertsView t={t} />}
        {subTab === "reminders" && <RemindersView bills={bills} onUpdate={onUpdateReminder} t={t} />}
        {subTab === "history" && <HistoryView history={history} months={hMonths} filter={hFilter} setFilter={setHFilter} t={t} />}
        {subTab === "charts" && <SpendingChart bills={bills} t={t} />}
        {subTab === "aitips" && <AISpendingInsightsView t={t} />}
        {subTab === "goals" && <FinancialGoalsView t={t} />}
        {subTab === "credit" && <CreditScoreView t={t} />}
        {subTab === "smartsave" && <SmartSavingsView t={t} />}
        {subTab === "cancel" && <CancelHelperView t={t} />}
        {subTab === "security" && <SecurityView t={t} />}
      </div>
    );
  }

  // Menu view - grouped cards
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontFamily: H, color: t.text, margin: 0, fontSize: 22, fontWeight: 700 }}>More</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: t.sub }}>All your financial tools in one place</p>
      </div>
      {groups.map((group, gi) => (
        <div key={gi}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, paddingLeft: 2 }}>{group.title}</div>
          <div style={{ background: t.card, borderRadius: 16, overflow: "hidden", boxShadow: t.cs }}>
            {group.items.map((item, ii) => (
              <button key={item.key} onClick={() => item.link ? window.open(item.link, "_blank") : setSubTab(item.key)} style={{
                display: "flex", alignItems: "center", gap: 14, width: "100%",
                padding: "14px 16px", background: "none", border: "none", cursor: "pointer",
                borderTop: ii > 0 ? `1px solid ${t.border}` : "none",
                textAlign: "left", transition: "background 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = t.cardAlt}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: t.cardAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{item.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: t.text, fontSize: 14, fontFamily: F }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: t.sub, marginTop: 1 }}>{item.desc}</div>
                </div>
                <div style={{ color: t.muted, fontSize: 18, flexShrink: 0 }}>›</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
// ─── Main App ───
export default function App() {
  const [user, setUser] = useState(api.getUser());
  const [bills, setBills] = useState([]);
  const [calCards, setCalCards] = useState([]);
  const [history, setHistory] = useState([]);
  const [hMonths, setHMonths] = useState([]);
  const [dash, setDash] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [showAdd, setShowAdd] = useState(false);
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("bb_dark") === "true"; } catch { return false; }
  });
  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    try { localStorage.setItem("bb_dark", String(next)); } catch {}
    api.updatePreferences({ darkMode: next }).catch(() => {});
  };
  const [hFilter, setHFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const getDismissedNotifs = () => {
    try {
      const stored = JSON.parse(localStorage.getItem("bb_dismissed_notifs") || "{}");
      const today = new Date().toISOString().split("T")[0];
      if (stored.date !== today) { localStorage.setItem("bb_dismissed_notifs", JSON.stringify({ date: today, items: [] })); return []; }
      return stored.items || [];
    } catch { return []; }
  };
  const saveDismissed = (items) => {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem("bb_dismissed_notifs", JSON.stringify({ date: today, items }));
  };
  const dismissNotif = (title) => {
    const dismissed = getDismissedNotifs();
    if (!dismissed.includes(title)) { dismissed.push(title); saveDismissed(dismissed); }
    setNotifs(prev => prev.filter(n => n.title !== title));
  };
  const markAllRead = () => {
    const dismissed = getDismissedNotifs();
    notifs.forEach(n => { if (!dismissed.includes(n.title)) dismissed.push(n.title); });
    saveDismissed(dismissed);
    setNotifs([]);
    setShowNotifs(false);
  };

  // PWA Install prompt
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); setShowInstallBanner(true); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setShowInstallBanner(false);
    setInstallPrompt(null);
  };

  const t = useTheme(dark);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [b, h, m, d] = await Promise.all([
        api.getBills(), api.getHistory(), api.getHistoryMonths(), api.getDashboard()
      ]);
      setBills(b); setHistory(h); setHMonths(m); setDash(d);
      try { const c = await api.getCards(); setCalCards(c); } catch(e) {}
      try { const n = await api.getAlerts(); const dismissed = getDismissedNotifs(); setNotifs((n.alerts || []).filter(a => !dismissed.includes(a.title))); } catch(e) {}

      // Auto-cleanup stale bank data if no accounts connected but income still showing
      if (d.accountCount === 0 && d.incomeThisMonth > 0) {
        try { await api.cleanupBankData(); const d2 = await api.getDashboard(); setDash(d2); } catch {}
      }
    } catch (err) { console.error("Load error:", err); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto smart sync
  const [lastSync, setLastSync] = useState(null);
  useEffect(() => {
    if (!user) return;
    const runSync = async () => {
      try {
        const result = await api.smartSync();
        setLastSync(new Date());
        // Always refresh dashboard after sync for real-time accuracy
        const [b, h, m, d] = await Promise.all([api.getBills(), api.getHistory(), api.getHistoryMonths(), api.getDashboard()]);
        setBills(b); setHistory(h); setHMonths(m); setDash(d);
      } catch (err) { /* silently fail */ }
    };
    runSync();
    const interval = setInterval(runSync, 10 * 60 * 1000);

    // Sync when user returns to the app (tab focus)
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && lastSync) {
        const minsSinceLast = (Date.now() - lastSync.getTime()) / 60000;
        if (minsSinceLast >= 2) runSync();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", handleVisibility); };
  }, [user]);

  // Request browser notification permission
  useEffect(() => {
    if (user && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    // Browser notification for urgent alerts
    if (notifs.filter(n => n.severity === "high").length > 0 && "Notification" in window && Notification.permission === "granted") {
      const urgent = notifs.filter(n => n.severity === "high");
      new Notification("BillBuddy Alert", { body: urgent[0].title, icon: "/favicon.ico" });
    }
  }, [notifs]);

  const handleAuth = (u) => {
    setUser(u);
    setTab("dashboard");
    setLoading(true);
  };

  const handleLogout = () => {
    api.clearToken();
    api.setUser(null);
    setUser(null);
    setBills([]);
    setHistory([]);
    setHMonths([]);
    setDash(null);
    setCalCards([]);
    setTab("dashboard");
  };

  const togglePaid = async (bill) => {
    const np = !bill.isPaid;
    const newTotalPaid = (bill.totalPaidAmount || 0) + (np ? bill.amount : 0);
    setBills(p => p.map(b => b.id === bill.id ? { ...b, isPaid: np, totalPaidAmount: np ? newTotalPaid : b.totalPaidAmount } : b));
    try {
      await api.updateBill(bill.id, { isPaid: np });
      if (np) {
        await api.recordPayment({ billName: bill.name, amount: bill.amount, category: bill.category, dueDate: bill.dueDate });
        // Track total paid and auto-delete if end amount reached
        if (bill.endAmount && newTotalPaid >= bill.endAmount) {
          await api.deleteBill(bill.id);
          setBills(p => p.filter(b => b.id !== bill.id));
        }
      }
      const [h, m, d] = await Promise.all([api.getHistory(), api.getHistoryMonths(), api.getDashboard()]);
      setHistory(h); setHMonths(m); setDash(d);
    } catch (err) { setBills(p => p.map(b => b.id === bill.id ? { ...b, isPaid: !np } : b)); }
  };

  const deleteBill = async (id) => {
    const prev = bills;
    setBills(p => p.filter(b => b.id !== id));
    try { await api.deleteBill(id); const d = await api.getDashboard(); setDash(d); } catch { setBills(prev); }
  };

  const addBill = async (bill) => {
    try { const c = await api.createBill(bill); setBills(p => [...p, c]); setShowAdd(false); const d = await api.getDashboard(); setDash(d); } catch (err) { console.error(err); }
  };

  const updateReminder = async (id, val) => {
    setBills(p => p.map(b => b.id === id ? { ...b, reminder: val } : b));
    try { await api.updateBill(id, { reminder: val }); } catch {}
  };

  const moveBillDate = async (id, newDay) => {
    setBills(p => p.map(b => b.id === id ? { ...b, dueDate: newDay } : b));
    try { await api.updateBill(id, { dueDate: newDay }); } catch {}
  };

  const [showMore, setShowMore] = useState(false);

  if (!user) return <AuthPage key="auth" onAuth={handleAuth} t={t} />;

  const totalMonthly = bills.reduce((s, b) => s + b.amount, 0);
  const totalPaid = bills.filter(b => b.isPaid).reduce((s, b) => s + b.amount, 0);
  const totalUnpaid = totalMonthly - totalPaid;
  const paidCount = bills.filter(b => b.isPaid).length;

  // Tab navigation
  const navItems = [
    { key: "dashboard", label: "Home", icon: "🏠" },
    { key: "money", label: "Money", icon: "💳" },
    { key: "calendar", label: "Calendar", icon: "📅" },
    { key: "insights", label: "Insights", icon: "✨" },
    { key: "more", label: "More", icon: "⚙️" },
  ];
  const F = "'Plus Jakarta Sans', 'Outfit', sans-serif";
  const H = "'Outfit', 'Plus Jakarta Sans', sans-serif";

  return (
    <div style={{ fontFamily: F, minHeight: "100vh", background: t.bg, transition: "background 0.3s ease" }}>
      <style>{`
        select option { background: ${t.card}; color: ${t.text}; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        @media (min-width: 768px) {
          .bb-bottom-nav { display: none !important; }
          .bb-desktop-nav { display: flex !important; }
        }
        @media (max-width: 767px) {
          .bb-bottom-nav { display: flex !important; }
          .bb-desktop-nav { display: none !important; }
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .bb-animate { animation: fadeIn 0.25s ease-out; }
        .bb-content { max-width: 600px; margin: 0 auto; padding: 0 16px; }
        @media (min-width: 768px) { .bb-content { max-width: 720px; } }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: t.card, borderBottom: `1px solid ${t.border}`, padding: "10px 16px", position: "sticky", top: 0, zIndex: 50 }}>
        <div className="bb-content" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 720, margin: "0 auto", padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "#6C5CE7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💸</div>
            <div>
              <div style={{ fontFamily: H, fontWeight: 800, fontSize: 17, color: t.text, letterSpacing: -0.5 }}>BillBuddy</div>
              <div style={{ fontSize: 11, color: t.sub, fontWeight: 500 }}>Hey, {user.name?.split(" ")[0]}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={toggleDark} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${t.border}`, cursor: "pointer", background: t.cardAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
              {dark ? "🌙" : "☀️"}
            </button>
            <div style={{ position: "relative", overflow: "visible" }}>
              <button onClick={() => setShowNotifs(!showNotifs)} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${t.border}`, cursor: "pointer", background: showNotifs ? "#6C5CE7" : t.cardAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "relative", zIndex: 101 }}>
                🔔
              </button>
              {notifs.length > 0 && !showNotifs && (
                <div style={{ position: "absolute", top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, background: "#EF4444", color: "white", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", pointerEvents: "none", zIndex: 102, border: "2px solid " + t.card }}>{notifs.length}</div>
              )}
              {showNotifs && (
                <>
                  <div onClick={() => setShowNotifs(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
                  <div style={{ position: "absolute", top: 42, right: 0, width: 340, maxWidth: "calc(100vw - 32px)", maxHeight: 440, overflowY: "auto", background: t.card, borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,0.3)", border: `1px solid ${t.border}`, zIndex: 100 }}>
                    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>🔔 Notifications {notifs.length > 0 && <span style={{ fontSize: 11, color: t.sub, fontWeight: 500 }}>({notifs.length})</span>}</span>
                      {notifs.length > 0 && <button onClick={() => markAllRead()} style={{ background: "none", border: "none", color: "#6C5CE7", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "4px 8px" }}>Mark all read</button>}
                    </div>
                    {notifs.length === 0 ? (
                      <div style={{ padding: "30px 16px", textAlign: "center", color: t.sub, fontSize: 13 }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
                        All clear — no alerts right now
                      </div>
                    ) : notifs.map((n, i) => (
                      <div key={i} style={{ padding: "12px 16px", borderBottom: i < notifs.length - 1 ? `1px solid ${t.border}` : "none", display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>{n.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: n.severity === "high" ? "#EF4444" : n.severity === "positive" ? "#10B981" : t.text, fontSize: 13 }}>{n.title}</div>
                          <div style={{ fontSize: 11, color: t.sub, marginTop: 2, lineHeight: 1.4 }}>{n.desc}</div>
                        </div>
                        <button onClick={() => dismissNotif(n.title)} style={{ background: "none", border: "none", color: t.sub, fontSize: 14, cursor: "pointer", padding: "2px 4px", flexShrink: 0, opacity: 0.6 }}>✕</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setShowAdd(true)} style={{
              height: 36, padding: "0 16px", borderRadius: 10, border: "none",
              background: "#6C5CE7", color: "white", cursor: "pointer",
              fontWeight: 700, fontSize: 13, fontFamily: F,
              display: "flex", alignItems: "center", gap: 5,
              boxShadow: "0 2px 8px rgba(108,92,231,0.3)",
            }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Bill
            </button>
            <button onClick={handleLogout} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${t.border}`, background: t.cardAlt, cursor: "pointer", fontSize: 14, color: t.sub, display: "flex", alignItems: "center", justifyContent: "center" }}>→</button>
          </div>
        </div>
      </div>
      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div style={{ background: "linear-gradient(135deg, #6C5CE7, #a78bfa)", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <span style={{ color: "white", fontSize: 13, fontWeight: 600 }}>📱 Install BillBuddy for a better experience</span>
          <button onClick={handleInstall} style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: "white", color: "#6C5CE7", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Install</button>
          <button onClick={() => setShowInstallBanner(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>✕</button>
        </div>
      )}
      {/* ── Desktop Nav ── */}
      <div className="bb-desktop-nav" style={{ display: "none", maxWidth: 720, margin: "12px auto 0", padding: "0 16px", justifyContent: "center" }}>
        <div style={{ display: "inline-flex", gap: 2, background: t.cardAlt, borderRadius: 12, padding: 3 }}>
          {navItems.map(item => (
            <button key={item.key} onClick={() => setTab(item.key)} style={{
              padding: "9px 22px", borderRadius: 10, border: "none",
              background: tab === item.key ? "#6C5CE7" : "transparent",
              color: tab === item.key ? "white" : t.sub,
              cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: F,
              transition: "all 0.2s ease",
            }}>{item.icon} {item.label}</button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="bb-content" style={{ paddingTop: 16, paddingBottom: 100 }}>
        {loading && !bills.length ? (
          <div style={{ textAlign: "center", padding: 80 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "#6C5CE7", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>💸</div>
            <div style={{ marginTop: 16, fontWeight: 700, color: t.text, fontFamily: H, fontSize: 17 }}>Loading your finances...</div>
            <div style={{ marginTop: 6, color: t.sub, fontSize: 13 }}>Syncing with your accounts</div>
          </div>
        ) : (<>
          {tab === "dashboard" && <UnifiedDashboard dash={dash} bills={bills} t={t} onToggle={togglePaid} onDelete={deleteBill} onGoTo={setTab} />}
          {tab === "money" && <MoneyTab t={t} />}
          {tab === "calendar" && <CalendarView bills={bills} cards={calCards} t={t} onMoveBill={moveBillDate} />}
          {tab === "insights" && <AIInsights t={t} />}
          {tab === "more" && <SettingsTab bills={bills} history={history} hMonths={hMonths} hFilter={hFilter} setHFilter={setHFilter} onUpdateReminder={updateReminder} t={t} />}
        </>)}
      </div>

      {/* ── Bottom Nav ── */}
      <div className="bb-bottom-nav" style={{
        display: "none", position: "fixed", bottom: 0, left: 0, right: 0,
        background: dark ? "rgba(13,13,18,0.95)" : "rgba(255,255,255,0.95)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderTop: `1px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
        padding: "8px 0", paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        justifyContent: "space-around", alignItems: "center", zIndex: 100,
      }}>
        {navItems.map(item => {
          const active = tab === item.key;
          return (
            <button key={item.key} onClick={() => setTab(item.key)} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              background: "none", border: "none", cursor: "pointer",
              padding: "4px 0", minWidth: 56, position: "relative",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                background: active ? "#6C5CE720" : "transparent",
                transition: "all 0.2s",
              }}>
                <span style={{
                  fontSize: 18, lineHeight: 1,
                  filter: active ? "none" : "grayscale(0.6)",
                  opacity: active ? 1 : 0.5,
                  transition: "all 0.2s",
                }}>{item.icon}</span>
              </div>
              <span style={{
                fontSize: 10, fontWeight: active ? 700 : 500, fontFamily: F,
                color: active ? "#6C5CE7" : t.sub, transition: "color 0.2s",
                letterSpacing: 0.1,
              }}>{item.label}</span>
              {active && <div style={{ position: "absolute", top: -4, width: 24, height: 2.5, borderRadius: 2, background: "#6C5CE7" }} />}
            </button>
          );
        })}
      </div>

      {user && <FloatingCalculator t={t} />}
      {user && <AdvisorChat t={t} user={user} />}
      {showAdd && <AddBillModal onClose={() => setShowAdd(false)} onAdd={addBill} t={t} />}
    </div>
  );
}
