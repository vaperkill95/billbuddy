import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";

// ─── Constants ───
const CATEGORIES = [
  { name: "Housing", color: "#FF6B6B", icon: "🏠" },
  { name: "Utilities", color: "#4ECDC4", icon: "💡" },
  { name: "Insurance", color: "#45B7D1", icon: "🛡️" },
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
    bg: dark ? "linear-gradient(180deg, #1A1A2E 0%, #16213E 40%, #0F3460 100%)" : "linear-gradient(180deg, #F5F3FF 0%, #FFF5F5 40%, #F0FFFE 100%)",
    card: dark ? "#1E2A45" : "white", cs: dark ? "0 4px 24px rgba(0,0,0,0.3)" : "0 4px 24px rgba(0,0,0,0.06)",
    text: dark ? "#E8E8F0" : "#2D3436", sub: dark ? "#8A8AA0" : "#888", muted: dark ? "#6A6A80" : "#aaa",
    border: dark ? "#2A3A5C" : "#eee", input: dark ? "#162036" : "white",
    rowBg: dark ? "#1E2A45" : "white", rowPaid: dark ? "#1A2E2A" : "#F8FFF8", rowOver: dark ? "#2E1A1A" : "#FFF5F5",
    tag: dark ? "#2A2A50" : "#EEF2FF", prog: dark ? "#2A3A5C" : "#F0F0F5",
    header: dark ? "linear-gradient(135deg, #3D2E7C, #5A4BAF, #2E5E9E)" : "linear-gradient(135deg, #6C5CE7, #A29BFE, #74B9FF)",
    tab: dark ? "#162036" : "white", tabS: dark ? "0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.08)",
    modal: dark ? "#1A2540" : "white", bubble: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
    cell: dark ? "#162036" : "#FAFAFA", today: dark ? "#6C5CE730" : "#6C5CE720",
    pill: dark ? "#2A2A50" : "#F0F0F5",
    priH: dark ? "#3D1A1A" : "#FFF0F0", priM: dark ? "#3D3A1A" : "#FFFDF0", priL: dark ? "#1A3D2A" : "#F0FFF0",
    hOk: dark ? "#1A2E2A" : "#F0FFF4", hLate: dark ? "#2E1A1A" : "#FFF5F5",
    over: dark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.4)",
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

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.google?.accounts?.id?.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
      });
      window.google?.accounts?.id?.renderButton(
        document.getElementById("google-btn"),
        { theme: "outline", size: "large", width: "100%", text: "continue_with", shape: "pill" }
      );
    };
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch(e){} };
  }, []);

  const handleGoogleResponse = async (response) => {
    try {
      setLoading(true);
      setError("");
      const data = await api.googleLogin(response.credential);
      api.setToken(data.token);
      api.setUser(data.user);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    setError("");
    if (!email || !password || (mode === "signup" && !name)) {
      setError("Please fill in all fields"); return;
    }
    setLoading(true);
    try {
      const data = mode === "signup"
        ? await api.signup({ name, email, password })
        : await api.login({ email, password });
      api.setToken(data.token);
      api.setUser(data.user);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const is = { width: "100%", padding: "14px 18px", borderRadius: 14, border: `2px solid ${t.border}`, fontSize: 15, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", background: t.input, color: t.text, transition: "border 0.2s" };

  return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>💸</div>
          <h1 style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 36, color: t.text, margin: 0 }}>BillBuddy</h1>
          <p style={{ color: t.sub, fontSize: 15, marginTop: 4 }}>Your friendly bill manager</p>
        </div>

        {/* Card */}
        <div style={{ background: t.card, borderRadius: 24, padding: "36px 32px", boxShadow: t.cs }}>
          <h2 style={{ fontFamily: "'Fredoka', sans-serif", color: t.text, margin: "0 0 24px", fontSize: 22, textAlign: "center" }}>
            {mode === "login" ? "Welcome back!" : "Create your account"}
          </h2>

          {error && <div style={{ background: "#FFF0F0", color: "#FF6B6B", padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600, marginBottom: 16, textAlign: "center" }}>{error}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "signup" && (
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={is} onFocus={e => e.target.style.borderColor = "#6C5CE7"} onBlur={e => e.target.style.borderColor = t.border} />
            )}
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" type="email" style={is} onFocus={e => e.target.style.borderColor = "#6C5CE7"} onBlur={e => e.target.style.borderColor = t.border} />
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" style={is} onKeyDown={e => e.key === "Enter" && handleSubmit()} onFocus={e => e.target.style.borderColor = "#6C5CE7"} onBlur={e => e.target.style.borderColor = t.border} />
            <button onClick={handleSubmit} disabled={loading} style={{
              width: "100%", padding: "14px", borderRadius: 14, border: "none",
              background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white",
              cursor: "pointer", fontWeight: 700, fontSize: 15, fontFamily: "'DM Sans', sans-serif",
              boxShadow: "0 4px 16px #6C5CE740", opacity: loading ? 0.7 : 1,
            }}>{loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}</button>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: t.border }} />
            <span style={{ fontSize: 12, color: t.muted, fontWeight: 600 }}>OR</span>
            <div style={{ flex: 1, height: 1, background: t.border }} />
          </div>

          {/* Google sign-in */}
          {GOOGLE_CLIENT_ID ? (
            <div id="google-btn" style={{ display: "flex", justifyContent: "center" }} />
          ) : (
            <div style={{ textAlign: "center", fontSize: 12, color: t.muted, padding: "8px 0" }}>
              Google sign-in available when configured
            </div>
          )}

          {/* Toggle mode */}
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <span style={{ fontSize: 14, color: t.sub }}>
              {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }} style={{
              background: "none", border: "none", color: "#6C5CE7", fontWeight: 700,
              fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}>{mode === "login" ? "Sign up" : "Sign in"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Components ───
function StatCard({ label, value, sub, color, icon, t }) {
  return (
    <div style={{ background: t.card, borderRadius: 16, padding: "16px 18px", boxShadow: t.cs, flex: 1, minWidth: 0, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -15, right: -15, width: 60, height: 60, borderRadius: "50%", background: color + "15" }} />
      <div style={{ fontSize: 20, marginBottom: 3 }}>{icon}</div>
      <div style={{ fontSize: 10, color: t.sub, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: t.text, fontFamily: "'Fredoka', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 1 }}>{sub}</div>}
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
      <button onClick={() => onToggle(bill)} style={{ width: 26, height: 26, borderRadius: 8, border: bill.isPaid ? "none" : `2px solid ${t.border}`, background: bill.isPaid ? "#4ECDC4" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{bill.isPaid && "✓"}</button>
      <div style={{ fontSize: 20, flexShrink: 0 }}>{getCatIcon(bill.category)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 14, textDecoration: bill.isPaid ? "line-through" : "none", opacity: bill.isPaid ? 0.5 : 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bill.name}</div>
        <div style={{ fontSize: 11, color: t.sub, marginTop: 2, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          Due: {bill.dueDate}th · {bill.category}
          {bill.isRecurring && <span style={{ background: t.tag, color: "#6C5CE7", padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{bill.frequency === "weekly" ? "WEEKLY" : bill.frequency === "biweekly" ? "BIWEEKLY" : bill.frequency === "daily" ? "DAILY" : "MONTHLY"}</span>}
          {bill.endAmount > 0 && <span style={{ background: "#FDCB6E20", color: "#F39C12", padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{formatMoney(bill.totalPaidAmount || 0)}/{formatMoney(bill.endAmount)}</span>}
          {bill.reminder && bill.reminder !== "none" && <span style={{ background: "#FFF8E1", color: "#F39C12", padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>🔔 {reminderLabel(bill.reminder)}</span>}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: bill.isPaid ? "#4ECDC4" : t.text, fontFamily: "'Fredoka', sans-serif" }}>{formatMoney(bill.amount)}</div>
        {bill.isPaid ? (
          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: "#6C5CE7" }}>{nextDueLabel}</div>
        ) : (
          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: isOverdue ? "#FF6B6B" : isDueSoon ? "#FDCB6E" : "#4ECDC4" }}>
            {isOverdue ? `OVERDUE ${daysAbs}d` : isDueSoon ? `Due in ${daysUntilDue}d` : daysUntilDue === 0 ? "Due today" : `${daysUntilDue}d left`}
          </div>
        )}
      </div>
      <button onClick={() => onDelete(bill.id)} style={{ width: 26, height: 26, borderRadius: 8, border: "none", background: "#FFF0F0", cursor: "pointer", color: "#FF6B6B", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>×</button>
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
    <div style={{ background: t.card, borderRadius: 20, padding: 28, boxShadow: t.cs }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <button onClick={() => { if (cm === 0) { setCm(11); setCy(cy - 1); } else setCm(cm - 1); }} style={{ background: t.pill, border: "none", borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 16, fontWeight: 700, color: t.text }}>‹</button>
        <div style={{ fontWeight: 800, fontSize: 18, fontFamily: "'Fredoka', sans-serif", color: t.text }}>{MONTHS[cm]} {cy}</div>
        <button onClick={() => { if (cm === 11) { setCm(0); setCy(cy + 1); } else setCm(cm + 1); }} style={{ background: t.pill, border: "none", borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 16, fontWeight: 700, color: t.text }}>›</button>
      </div>
      <div style={{ fontSize: 11, color: t.muted, textAlign: "center", marginBottom: 14 }}>💡 Drag a bill to a different day to change its due date</div>

      {/* Toast notification */}
      {toast && (
        <div style={{
          background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", color: "white",
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
                        background: b.type === "card" ? "#FF6B6B15" : dragBill?.id === b.id ? "#6C5CE730" : b.isPaid ? "#4ECDC415" : getCatColor(b.category) + "18",
                        opacity: dragBill?.id === b.id ? 0.4 : b.isPaid ? 0.5 : 1,
                        cursor: b.type === "bill" ? "grab" : "default",
                        transition: "opacity 0.15s",
                      }}
                    >
                      <div style={{ width: 4, height: 4, borderRadius: 2, background: b.type === "card" ? "#FF6B6B" : b.isPaid ? "#4ECDC4" : getCatColor(b.category), flexShrink: 0 }} />
                      <div style={{ fontSize: 9, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textDecoration: b.isPaid ? "line-through" : "none" }}>
                        {b.type === "card" ? `💳 ${b.name}` : b.name}
                      </div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: b.type === "card" ? "#FF6B6B" : t.sub, flexShrink: 0 }}>{formatMoney(b.amount)}</div>
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
        {(cards || []).some(c => c.balance > 0) && <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: t.sub }}><div style={{ width: 8, height: 8, borderRadius: 4, background: "#FF6B6B" }} />💳 Credit Card</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: t.sub }}><div style={{ width: 8, height: 8, borderRadius: 4, background: "#4ECDC4", opacity: 0.5 }} />Paid</div>
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
          <h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: 0, fontSize: 18 }}>All Activity</h3>
          <p style={{ margin: 0, fontSize: 12, color: t.sub }}>{activity.summary.transactionCount} transactions</p>
        </div>
      </div>
      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div style={{ background: t.card, borderRadius: 12, padding: "10px 14px", boxShadow: t.cs }}>
          <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Money In</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#4ECDC4", fontFamily: "'Fredoka'" }}>+{formatMoney(activity.summary.totalIn)}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 12, padding: "10px 14px", boxShadow: t.cs }}>
          <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Money Out</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#FF6B6B", fontFamily: "'Fredoka'" }}>-{formatMoney(activity.summary.totalOut)}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 12, padding: "10px 14px", boxShadow: t.cs }}>
          <div style={{ fontSize: 9, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Pending</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#FDCB6E", fontFamily: "'Fredoka'" }}>{activity.summary.pendingCount}</div>
        </div>
      </div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[["all", "All"], ["in", "💵 Money In"], ["out", "💸 Money Out"], ["pending", "⏳ Pending"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: filter === k ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : t.pill, color: filter === k ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'DM Sans'" }}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        {[7, 14, 30, 60, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: days === d ? t.card : "transparent", color: days === d ? t.text : t.muted, cursor: "pointer", fontWeight: 700, fontSize: 10, fontFamily: "'DM Sans'", boxShadow: days === d ? t.cs : "none" }}>{d}d</button>
        ))}
      </div>
      {/* Transaction list grouped by date */}
      {Object.entries(activity.grouped).map(([date, txns]) => (
        <div key={date}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.sub, padding: "6px 4px", position: "sticky", top: 0, background: t.bg, zIndex: 1 }}>{new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
          {txns.map(tx => (
            <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: t.card, borderRadius: 12, boxShadow: t.cs, marginBottom: 4, opacity: tx.pending ? 0.7 : 1 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: tx.isIncome ? "#4ECDC410" : "#FF6B6B10", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                {tx.pending ? "⏳" : tx.isIncome ? "💵" : "💸"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.name}</div>
                <div style={{ fontSize: 10, color: t.sub }}>{tx.accountName} {tx.mask ? `••••${tx.mask}` : ""}{tx.pending ? " · Pending" : ""}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 13, color: tx.isIncome ? "#4ECDC4" : "#FF6B6B", fontFamily: "'Fredoka'", flexShrink: 0 }}>
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
          <h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: 0, fontSize: 18 }}>Detected Subscriptions</h3>
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
            <div style={{ fontSize: 16, fontWeight: 800, color: t.text, fontFamily: "'Fredoka'" }}>{formatMoney(sub.amount)}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => addAsBill(sub)} disabled={adding === sub.name} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'DM Sans'" }}>
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
          <h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: 0, fontSize: 18 }}>Savings Advisor</h3>
          <p style={{ margin: 0, fontSize: 12, color: t.sub }}>How much you can put aside</p>
        </div>
      </div>
      {/* Big savings number */}
      <div style={{ background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", borderRadius: 16, padding: "20px 22px", color: "white" }}>
        <div style={{ fontSize: 12, opacity: 0.9 }}>You can save</div>
        <div style={{ display: "flex", gap: 20, alignItems: "baseline", marginTop: 6 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Fredoka'" }}>{formatMoney(data.savings.perPaycheck)}</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>{data.savings.paycheckLabel}</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Fredoka'" }}>{formatMoney(data.savings.conservative)}</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>per month (comfortable)</div>
          </div>
        </div>
      </div>
      {/* Breakdown */}
      <div style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs }}>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 13, marginBottom: 8 }}>📊 Your Numbers</div>
        {[
          ["Monthly Income", formatMoney(data.income.monthly), "#4ECDC4"],
          ["Fixed Bills", `-${formatMoney(data.expenses.bills)}`, "#FF6B6B"],
          ["Card Minimums", `-${formatMoney(data.expenses.cardMins)}`, "#FF6B6B"],
          ["Other Spending", `-${formatMoney(data.expenses.discretionary)}`, "#FDCB6E"],
        ].map(([label, val, color]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${t.border}` }}>
            <span style={{ fontSize: 12, color: t.sub }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color }}>{val}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", marginTop: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>💰 Available to Save</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: data.savings.potential >= 0 ? "#4ECDC4" : "#FF6B6B", fontFamily: "'Fredoka'" }}>{formatMoney(data.savings.potential)}</span>
        </div>
      </div>
      {/* Savings goals */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>🎯 Savings Goals</div>
        <button onClick={() => setShowGoalForm(true)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'DM Sans'" }}>+ New Goal</button>
      </div>
      {showGoalForm && (
        <div style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs }}>
          <input value={goalName} onChange={e => setGoalName(e.target.value)} placeholder="Goal name (e.g. Emergency Fund, Kid's College)" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `2px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, fontFamily: "'DM Sans'", boxSizing: "border-box", marginBottom: 8 }} />
          <input type="number" value={goalTarget} onChange={e => setGoalTarget(e.target.value)} placeholder="Target amount" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `2px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, fontFamily: "'DM Sans'", boxSizing: "border-box", marginBottom: 8 }} />
          <select value={goalType} onChange={e => setGoalType(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `2px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, fontFamily: "'DM Sans'", boxSizing: "border-box", marginBottom: 8 }}>
            <option value="general">General Savings</option>
            <option value="emergency">Emergency Fund</option>
            <option value="kids">Kids Fund</option>
            <option value="vacation">Vacation</option>
            <option value="ezpass">EZ-Pass</option>
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowGoalForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>Cancel</button>
            <button onClick={createGoal} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>Create Goal</button>
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
            <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg, #4ECDC4, #6C5CE7)", width: `${Math.min(g.progress, 100)}%`, transition: "width 0.5s" }} />
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
          <h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: 0, fontSize: 20 }}>30-Day Forecast</h3>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Projected balance based on upcoming bills & income</p>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div style={{ background: t.card, borderRadius: 12, padding: "12px 14px", boxShadow: t.cs }}>
          <div style={{ fontSize: 10, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Today</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#4ECDC4", fontFamily: "'Fredoka'" }}>{formatMoney(forecast.startBalance)}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 12, padding: "12px 14px", boxShadow: t.cs }}>
          <div style={{ fontSize: 10, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Lowest Point</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: forecast.lowestBalance >= 0 ? "#FDCB6E" : "#FF6B6B", fontFamily: "'Fredoka'" }}>{formatMoney(forecast.lowestBalance)}</div>
          <div style={{ fontSize: 10, color: t.sub }}>{forecast.lowestDate}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 12, padding: "12px 14px", boxShadow: t.cs }}>
          <div style={{ fontSize: 10, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>In 30 Days</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: forecast.endBalance >= 0 ? "#4ECDC4" : "#FF6B6B", fontFamily: "'Fredoka'" }}>{formatMoney(forecast.endBalance)}</div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ background: t.card, borderRadius: 16, padding: "18px 12px 10px", boxShadow: t.cs, overflow: "hidden" }}>
        <svg width="100%" height={chartH + 30} viewBox={`0 0 ${forecast.days.length * 24} ${chartH + 30}`} style={{ display: "block" }}>
          {/* Zero line */}
          {minBal < 0 && <line x1="0" y1={chartH - ((0 - minBal) / range) * chartH} x2={forecast.days.length * 24} y2={chartH - ((0 - minBal) / range) * chartH} stroke="#FF6B6B" strokeWidth="1" strokeDasharray="4" opacity="0.4" />}
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
              fill={d.events.some(e => e.amount > 0) ? "#4ECDC4" : "#FF6B6B"} stroke="white" strokeWidth="1.5" />
          ) : null)}
          {/* Day labels (every 5 days) */}
          {forecast.days.map((d, i) => i % 5 === 0 ? (
            <text key={i} x={i * 24 + 12} y={chartH + 20} textAnchor="middle" fontSize="9" fill={t.sub} fontFamily="DM Sans">{d.label}</text>
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
                <span style={{ fontWeight: 700, color: e.amount > 0 ? "#4ECDC4" : "#FF6B6B" }}>{e.amount > 0 ? "+" : ""}{formatMoney(e.amount)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 8px", fontSize: 11, color: t.sub, marginTop: 2 }}>
              <span>Balance after</span>
              <span style={{ fontWeight: 700, color: d.balance >= 0 ? t.text : "#FF6B6B" }}>{formatMoney(d.balance)}</span>
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

  const sevColors = { high: "#FF6B6B", medium: "#FDCB6E", low: "#6C5CE7", positive: "#4ECDC4" };
  const sevBg = { high: "#FF6B6B12", medium: "#FDCB6E12", low: "#6C5CE712", positive: "#4ECDC412" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 32 }}>🔔</div>
        <div>
          <h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: 0, fontSize: 20 }}>Smart Alerts</h3>
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
          <h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: 0, fontSize: 20 }}>Bill Negotiation</h3>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>AI-powered scripts to lower your bills</p>
        </div>
      </div>

      {/* Potential savings */}
      {opportunities && opportunities.totalPotentialMonthlySavings > 0 && (
        <div style={{ background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", borderRadius: 16, padding: "18px 22px", color: "white" }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>Estimated potential savings</div>
          <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
            <div><div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Fredoka'" }}>{formatMoney(opportunities.totalPotentialMonthlySavings)}</div><div style={{ fontSize: 11, opacity: 0.8 }}>/month</div></div>
            <div><div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Fredoka'" }}>{formatMoney(opportunities.totalPotentialYearlySavings)}</div><div style={{ fontSize: 11, opacity: 0.8 }}>/year</div></div>
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
              <div style={{ fontSize: 14, fontWeight: 800, color: "#4ECDC4", fontFamily: "'Fredoka'" }}>Save ~{formatMoney(opp.potentialSavings)}/mo</div>
              <div style={{ fontSize: 10, color: t.sub }}>Difficulty: {opp.difficulty}</div>
            </div>
          </div>
          <button onClick={() => getScript(opp.id)} disabled={scriptLoading && selectedBill === opp.id} style={{
            width: "100%", padding: "10px", borderRadius: 10, border: "none",
            background: selectedBill === opp.id && script ? t.prog : "linear-gradient(135deg, #6C5CE7, #A29BFE)",
            color: selectedBill === opp.id && script ? t.text : "white",
            cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'",
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
    <div style={{ background: t.card, borderRadius: 20, padding: 28, boxShadow: t.cs }}>
      <h3 style={{ fontFamily: "'Fredoka', sans-serif", color: t.text, margin: "0 0 20px", fontSize: 18 }}>Spending Breakdown</h3>
      <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
        <svg width="160" height="160" viewBox="0 0 160 160">
          {sl.map((s, i) => <path key={i} d={arc(80, 80, 75, s.sa, s.ea)} fill={s.color} opacity={0.85} />)}
          <circle cx="80" cy="80" r="40" fill={t.card} />
          <text x="80" y="76" textAnchor="middle" fontWeight="800" fontSize="15" fill={t.text} fontFamily="Fredoka">{formatMoney(tot)}</text>
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
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ fontSize: 32 }}>📜</div><div><h3 style={{ fontFamily: "'Fredoka', sans-serif", color: t.text, margin: 0, fontSize: 20 }}>Payment History</h3><p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Track what you've paid and when</p></div></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setFilter("all")} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: filter === "all" ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : t.pill, color: filter === "all" ? "white" : t.sub, fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>All</button>
        {months.map(m => <button key={m} onClick={() => setFilter(m)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: filter === m ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : t.pill, color: filter === m ? "white" : t.sub, fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>{m}</button>)}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {[["Total Paid", formatMoney(totP), "#4ECDC4"], ["Payments", f.length, t.text], ["Late", late, late > 0 ? "#FF6B6B" : "#4ECDC4"]].map(([l, v, c]) => (
          <div key={l} style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c, fontFamily: "'Fredoka', sans-serif", marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {f.map(h => (
          <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: h.status === "on-time" ? t.hOk : t.hLate, borderRadius: 14, boxShadow: t.cs, borderLeft: `4px solid ${h.status === "on-time" ? "#4ECDC4" : "#FF6B6B"}` }}>
            <div style={{ fontSize: 20 }}>{getCatIcon(h.category)}</div>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{h.billName}</div><div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>Paid {h.paidDate} · {h.category}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontWeight: 800, fontSize: 15, color: t.text, fontFamily: "'Fredoka'" }}>{formatMoney(h.amount)}</div><div style={{ fontSize: 10, fontWeight: 700, marginTop: 2, padding: "2px 8px", borderRadius: 6, display: "inline-block", background: h.status === "on-time" ? "#4ECDC420" : "#FF6B6B20", color: h.status === "on-time" ? "#4ECDC4" : "#FF6B6B" }}>{h.status === "on-time" ? "ON TIME" : "LATE"}</div></div>
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
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ fontSize: 32 }}>🔔</div><div><h3 style={{ fontFamily: "'Fredoka', sans-serif", color: t.text, margin: 0, fontSize: 20 }}>Notification Reminders</h3><p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Never miss a due date</p></div></div>
      {toast && <div style={{ background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", color: "white", padding: "12px 20px", borderRadius: 14, fontWeight: 700, fontSize: 14 }}>{toast}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {bills.map(bill => (
          <div key={bill.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: t.card, borderRadius: 16, boxShadow: t.cs, borderLeft: `4px solid ${getCatColor(bill.category)}` }}>
            <div style={{ fontSize: 20 }}>{getCatIcon(bill.category)}</div>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{bill.name}</div><div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>Due {bill.dueDate}th · {formatMoney(bill.amount)}</div></div>
            <select value={bill.reminder || "none"} onChange={e => handle(bill.id, e.target.value)} style={{ padding: "8px 14px", borderRadius: 10, border: `2px solid ${bill.reminder && bill.reminder !== "none" ? "#4ECDC4" : t.border}`, background: bill.reminder && bill.reminder !== "none" ? "#4ECDC410" : t.input, color: t.text, fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans'", cursor: "pointer", outline: "none" }}>
              {REMINDER_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Calendar Sync Section */}
      <div style={{ background: t.card, borderRadius: 20, padding: "22px 26px", boxShadow: t.cs, marginTop: 8 }}>
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
            background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white",
            cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans'",
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
                background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", color: "white",
                cursor: "pointer", fontWeight: 700, fontSize: 16, fontFamily: "'DM Sans'",
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
                cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans'",
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
                background: t.input, color: t.text, fontSize: 11, fontFamily: "'DM Sans'",
                outline: "none",
              }} onClick={e => e.target.select()} />
              <button onClick={copyUrl} style={{
                padding: "10px 18px", borderRadius: 10, border: "none",
                background: copied ? "#4ECDC4" : "linear-gradient(135deg, #6C5CE7, #A29BFE)",
                color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12,
                fontFamily: "'DM Sans'", whiteSpace: "nowrap",
              }}>{copied ? "✅ Copied!" : "📋 Copy"}</button>
            </div>

            {/* Instructions for manual setup */}
            <details style={{ background: t.prog, borderRadius: 14, padding: "4px 18px" }}>
              <summary style={{ fontWeight: 700, color: t.text, fontSize: 13, cursor: "pointer", padding: "12px 0" }}>Manual setup instructions</summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 14 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 8, background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>1</div>
                  <div style={{ fontSize: 12, color: t.sub, lineHeight: 1.5 }}><strong style={{ color: t.text }}>iPhone:</strong> Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar → paste the URL above</div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 8, background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>2</div>
                  <div style={{ fontSize: 12, color: t.sub, lineHeight: 1.5 }}><strong style={{ color: t.text }}>Google Calendar:</strong> Settings → Add calendar → From URL → paste the URL above</div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 8, background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>3</div>
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
              fontWeight: 600, fontSize: 11, fontFamily: "'DM Sans'", alignSelf: "flex-start",
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
            <h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: 0, fontSize: 20 }}>AI Insights</h3>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Personalized tips powered by AI</p>
          </div>
        </div>
        <button onClick={() => { setLoaded(false); }} disabled={loading} style={{
          padding: "8px 18px", borderRadius: 12, border: "none",
          background: loading ? t.pill : "linear-gradient(135deg, #6C5CE7, #A29BFE)",
          color: loading ? t.sub : "white", cursor: loading ? "default" : "pointer",
          fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          {loading ? "Analyzing..." : "🔄 Refresh"}
        </button>
      </div>

      {loading && (
        <div style={{ background: t.card, borderRadius: 20, padding: "40px 28px", boxShadow: t.cs, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12, animation: "pulse 1.5s ease-in-out infinite" }}>🧠</div>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 16, fontFamily: "'Fredoka'", marginBottom: 6 }}>Analyzing your bills...</div>
          <div style={{ fontSize: 13, color: t.sub, lineHeight: 1.6 }}>Our AI is reviewing your spending, due dates, payment history, and categories to find personalized ways to save money and stay on track.</div>
          <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }`}</style>
        </div>
      )}

      {!loading && suggestions.map((s, i) => (
        <div key={i} style={{
          background: t.card, borderRadius: 20, padding: "18px 22px", boxShadow: t.cs,
          borderLeft: `4px solid ${s.priority === "high" ? "#FF6B6B" : s.priority === "medium" ? "#FDCB6E" : "#4ECDC4"}`,
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
              color: s.priority === "high" ? "#FF6B6B" : s.priority === "medium" ? "#F39C12" : "#4ECDC4",
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

function BankAccountsView({ t }) {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("overview");
  const [txnDays, setTxnDays] = useState(30);

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
            <h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: 0, fontSize: 20 }}>Bank Accounts</h3>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>
              {items.length > 0 ? `${items.length} bank${items.length > 1 ? "s" : ""} connected` : "Connect your bank to see balances & transactions"}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {accounts.length > 0 && (
            <button onClick={syncAll} disabled={syncing} style={{ padding: "8px 16px", borderRadius: 12, border: "none", background: t.pill, color: t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>
              {syncing ? "Syncing..." : "🔄 Sync"}
            </button>
          )}
          <button onClick={connectBank} style={{ padding: "8px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>
            + Connect Bank
          </button>
        </div>
      </div>

      {/* Sync result toast */}
      {syncResult && (
        <div style={{ background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", color: "white", padding: "12px 20px", borderRadius: 14, fontWeight: 600, fontSize: 13, boxShadow: "0 4px 16px rgba(78,205,196,0.3)" }}>
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
            ["Total Balance", formatMoney(summary.totalBalance), "#4ECDC4"],
            ["Checking", formatMoney(summary.totalChecking), "#6C5CE7"],
            ["Savings", formatMoney(summary.totalSavings), "#45B7D1"],
          ].filter(([, v]) => v !== "$0.00").map(([label, value, color]) => (
            <div key={label} style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "'Fredoka'", marginTop: 2 }}>{value}</div>
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
              <div style={{ fontSize: 20, fontWeight: 800, color: "#4ECDC4", fontFamily: "'Fredoka'" }}>+{formatMoney(summary.thirtyDayIncome)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: t.sub }}>Money Out</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#FF6B6B", fontFamily: "'Fredoka'" }}>-{formatMoney(summary.thirtyDaySpending)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: t.sub }}>Net</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: summary.netFlow >= 0 ? "#4ECDC4" : "#FF6B6B", fontFamily: "'Fredoka'" }}>{summary.netFlow >= 0 ? "+" : ""}{formatMoney(summary.netFlow)}</div>
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
            <button key={k} onClick={() => setView(k)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: view === k ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : "transparent", color: view === k ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>{l}</button>
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
            const projectedBalance = a.balanceCurrent - pendingOutTotal + pendingInTotal;
            const hasPending = pendingOut.length > 0 || pendingIn.length > 0;

            return (
              <div key={a.id} style={{ background: t.card, borderRadius: 20, boxShadow: t.cs, overflow: "hidden" }}>
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
                    <span style={{ fontSize: 13, fontWeight: 600, color: t.sub }}>Current Balance</span>
                    <span style={{ fontSize: 26, fontWeight: 800, color: t.text, fontFamily: "'Fredoka'" }}>{formatMoney(a.balanceCurrent)}</span>
                  </div>

                  {hasPending && (
                    <>
                      {/* Divider */}
                      <div style={{ height: 1, background: t.border, margin: "0 0 12px" }} />

                      {/* Pending money out */}
                      {pendingOut.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#FF6B6B" }}>💸 Money Out (Pending)</span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: "#FF6B6B", fontFamily: "'Fredoka'" }}>-{formatMoney(pendingOutTotal)}</span>
                          </div>
                          {pendingOut.map(tx => (
                            <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 12px", marginBottom: 3, background: "#FF6B6B08", borderRadius: 8 }}>
                              <span style={{ fontSize: 12, color: t.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>{tx.name}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#FF6B6B", flexShrink: 0 }}>-{formatMoney(tx.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Pending money in */}
                      {pendingIn.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#4ECDC4" }}>💵 Money In (Pending)</span>
                            <span style={{ fontSize: 14, fontWeight: 800, color: "#4ECDC4", fontFamily: "'Fredoka'" }}>+{formatMoney(pendingInTotal)}</span>
                          </div>
                          {pendingIn.map(tx => (
                            <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 12px", marginBottom: 3, background: "#4ECDC408", borderRadius: 8 }}>
                              <span style={{ fontSize: 12, color: t.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>{tx.name}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#4ECDC4", flexShrink: 0 }}>+{formatMoney(Math.abs(tx.amount))}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Divider */}
                      <div style={{ height: 1, background: t.border, margin: "4px 0 12px" }} />

                      {/* Projected balance */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: projectedBalance >= 0 ? "#4ECDC410" : "#FF6B6B10", borderRadius: 12 }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Balance After Pending</span>
                          <div style={{ fontSize: 10, color: t.sub, marginTop: 1 }}>When all pending transactions clear</div>
                        </div>
                        <span style={{ fontSize: 22, fontWeight: 800, color: projectedBalance >= 0 ? "#4ECDC4" : "#FF6B6B", fontFamily: "'Fredoka'" }}>{formatMoney(projectedBalance)}</span>
                      </div>
                    </>
                  )}

                  {/* Fallback: No individual pending txns but balance differs from available (bank has holds/pending) */}
                  {!hasPending && a.balanceAvailable > 0 && Math.abs(a.balanceCurrent - a.balanceAvailable) > 0.50 && (
                    <>
                      <div style={{ height: 1, background: t.border, margin: "0 0 12px" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#FDCB6E" }}>⏳ Pending / Holds</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#FDCB6E", fontFamily: "'Fredoka'" }}>-{formatMoney(a.balanceCurrent - a.balanceAvailable)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: t.sub, marginBottom: 10 }}>Your bank reports holds or pending charges not yet itemized</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: a.balanceAvailable >= 0 ? "#4ECDC410" : "#FF6B6B10", borderRadius: 12 }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Available Balance</span>
                          <div style={{ fontSize: 10, color: t.sub, marginTop: 1 }}>What you can actually spend right now</div>
                        </div>
                        <span style={{ fontSize: 22, fontWeight: 800, color: a.balanceAvailable >= 0 ? "#4ECDC4" : "#FF6B6B", fontFamily: "'Fredoka'" }}>{formatMoney(a.balanceAvailable)}</span>
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
            <div style={{ background: t.card, borderRadius: 20, padding: "40px 28px", boxShadow: t.cs, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏦</div>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 16, fontFamily: "'Fredoka'", marginBottom: 6 }}>No Banks Connected</div>
              <div style={{ fontSize: 13, color: t.sub, lineHeight: 1.6, marginBottom: 16 }}>Connect your bank to see balances, track spending, and auto-import transactions.</div>
              <button onClick={connectBank} style={{ padding: "12px 32px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans'" }}>🔗 Connect Your Bank</button>
            </div>
          )}
        </div>
      )}

      {/* Transactions */}
      {view === "transactions" && (() => {
        const pending = transactions.filter(tx => tx.pending);
        const completed = transactions.filter(tx => !tx.pending);
        const pendingTotal = pending.reduce((s, tx) => s + tx.amount, 0);

        const TxnRow = ({ txn }) => (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: t.card, borderRadius: 14, boxShadow: t.cs, opacity: txn.pending ? 0.75 : 1 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: txn.amount > 0 ? "#FF6B6B15" : "#4ECDC415", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
              {txn.pending ? "⏳" : txn.amount > 0 ? "💸" : "💵"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: t.text, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{txn.name}</div>
              <div style={{ fontSize: 11, color: t.sub, marginTop: 1 }}>
                {txn.date} · {txn.accountName} ••••{txn.mask}
                {txn.category && txn.category !== "Other" && <span style={{ marginLeft: 6, background: t.pill, padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{txn.category}</span>}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: txn.amount > 0 ? "#FF6B6B" : "#4ECDC4", fontFamily: "'Fredoka'" }}>
                {txn.amount > 0 ? "-" : "+"}{formatMoney(Math.abs(txn.amount))}
              </div>
              {txn.pending && <div style={{ fontSize: 9, fontWeight: 700, color: "#FDCB6E", marginTop: 1 }}>PENDING</div>}
            </div>
          </div>
        );

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Time filter */}
            <div style={{ display: "flex", gap: 8 }}>
              {[7, 14, 30, 60].map(d => (
                <button key={d} onClick={() => { setTxnDays(d); api.getBankTransactions(d).then(setTransactions); }} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: txnDays === d ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : t.pill, color: txnDays === d ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'DM Sans'" }}>{d}d</button>
              ))}
            </div>

            {/* Pending section */}
            {pending.length > 0 && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>⏳</span>
                    <span style={{ fontWeight: 700, color: "#FDCB6E", fontSize: 14 }}>Pending ({pending.length})</span>
                  </div>
                  <span style={{ fontWeight: 700, color: "#FDCB6E", fontSize: 13 }}>{formatMoney(Math.abs(pendingTotal))}</span>
                </div>
                {pending.map(txn => <TxnRow key={txn.id} txn={txn} />)}

                {/* Divider */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0" }}>
                  <div style={{ flex: 1, height: 1, background: t.border }} />
                  <span style={{ fontSize: 11, color: t.muted, fontWeight: 600 }}>COMPLETED</span>
                  <div style={{ flex: 1, height: 1, background: t.border }} />
                </div>
              </>
            )}

            {/* Completed section */}
            {completed.length > 0 && (
              <>
                {!pending.length && (
                  <div style={{ padding: "4px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>✅</span>
                    <span style={{ fontWeight: 700, color: "#4ECDC4", fontSize: 14 }}>Completed ({completed.length})</span>
                  </div>
                )}
                {completed.map(txn => <TxnRow key={txn.id} txn={txn} />)}
              </>
            )}

            {!transactions.length && <div style={{ textAlign: "center", padding: 40, color: t.sub }}>No transactions yet. Hit "Sync" to import from your bank.</div>}
          </div>
        );
      })()}

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
              <button onClick={() => disconnectBank(item.id)} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid #FF6B6B`, background: "transparent", color: "#FF6B6B", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>Disconnect</button>
            </div>
          ))}
          <button onClick={connectBank} style={{ padding: "14px", borderRadius: 14, border: `2px dashed ${t.border}`, background: "transparent", color: t.sub, cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans'" }}>+ Connect Another Bank</button>
        </div>
      )}
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

  const loadData = async () => {
    try {
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

  const is = { width: "100%", padding: "12px 16px", borderRadius: 12, border: `2px solid ${t.border}`, fontSize: 14, fontFamily: "'DM Sans'", outline: "none", boxSizing: "border-box", background: t.input, color: t.text };
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
            <h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: 0, fontSize: 20 }}>Income</h3>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Track earnings & see what's left after bills</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowAddSource(true)} style={{ padding: "8px 16px", borderRadius: 12, border: "none", background: t.pill, color: t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>+ Income Source</button>
          <button onClick={() => setShowLogIncome(true)} style={{ padding: "8px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>💵 Log Income</button>
        </div>
      </div>

      {/* Overview cards */}
      {summary && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Est. Monthly Income</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#4ECDC4", fontFamily: "'Fredoka'", marginTop: 2 }}>{formatMoney(summary.estimatedMonthly)}</div>
          </div>
          <div style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Monthly Expenses</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#FF6B6B", fontFamily: "'Fredoka'", marginTop: 2 }}>{formatMoney(summary.totalExpenses)}</div>
          </div>
          <div style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Left After Bills</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: summary.leftover >= 0 ? "#4ECDC4" : "#FF6B6B", fontFamily: "'Fredoka'", marginTop: 2 }}>{formatMoney(summary.leftover)}</div>
          </div>
        </div>
      )}

      {/* Income vs Expenses bar */}
      {summary && summary.estimatedMonthly > 0 && (
        <div style={{ background: t.card, borderRadius: 16, padding: "18px 22px", boxShadow: t.cs }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>Income vs Expenses</span>
            <span style={{ fontWeight: 800, color: summary.leftover >= 0 ? "#4ECDC4" : "#FF6B6B", fontFamily: "'Fredoka'", fontSize: 14 }}>
              {(summary.totalExpenses / summary.estimatedMonthly * 100).toFixed(0)}% spent
            </span>
          </div>
          <div style={{ height: 14, background: t.prog, borderRadius: 7, overflow: "hidden", position: "relative" }}>
            <div style={{ height: "100%", borderRadius: 7, background: summary.totalExpenses / summary.estimatedMonthly > 0.8 ? "linear-gradient(90deg, #FF6B6B, #FF8E8E)" : "linear-gradient(90deg, #4ECDC4, #6C5CE7)", width: `${Math.min(summary.totalExpenses / summary.estimatedMonthly * 100, 100)}%`, transition: "width 0.5s" }} />
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
              <div style={{ fontSize: 20, fontWeight: 800, color: "#4ECDC4", fontFamily: "'Fredoka'" }}>{formatMoney(summary.actualThisMonth)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: t.sub }}>Expected</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: t.text, fontFamily: "'Fredoka'" }}>{formatMoney(summary.estimatedMonthly)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: t.sub }}>Remaining to receive</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#FDCB6E", fontFamily: "'Fredoka'" }}>{formatMoney(Math.max(0, summary.estimatedMonthly - summary.actualThisMonth))}</div>
            </div>
          </div>
        </div>
      )}

      {/* View toggle */}
      <div style={{ display: "flex", gap: 4, background: t.pill, borderRadius: 12, padding: 4, alignSelf: "flex-start" }}>
        {[["sources", "💼 Income Sources"], ["history", "📋 Income Log"]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: view === k ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : "transparent", color: view === k ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>{l}</button>
        ))}
      </div>

      {/* Sources list */}
      {view === "sources" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sources.map(s => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: t.card, borderRadius: 16, boxShadow: t.cs, borderLeft: `4px solid #4ECDC4` }}>
              <div style={{ fontSize: 20, flexShrink: 0 }}>💼</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>
                  {freqLabel(s.frequency)} · {formatMoney(freqToMonthly(s.amount, s.frequency))}/mo
                  {s.nextPayDate && ` · Next: ${s.nextPayDate}`}
                </div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, color: "#4ECDC4", fontFamily: "'Fredoka'", flexShrink: 0 }}>{formatMoney(s.amount)}</div>
              <div style={{ fontSize: 10, color: t.sub, fontWeight: 700, background: t.pill, padding: "3px 8px", borderRadius: 6 }}>{freqLabel(s.frequency)}</div>
              <button onClick={() => deleteSource(s.id)} style={{ width: 26, height: 26, borderRadius: 8, border: "none", background: "#FFF0F0", cursor: "pointer", color: "#FF6B6B", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>×</button>
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
              <button onClick={() => setEntryFilter("all")} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: entryFilter === "all" ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : t.pill, color: entryFilter === "all" ? "white" : t.sub, fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>All</button>
              {summary.months.map(m => <button key={m} onClick={() => setEntryFilter(m)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: entryFilter === m ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : t.pill, color: entryFilter === m ? "white" : t.sub, fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>{m}</button>)}
            </div>
          )}
          {filteredEntries.map(e => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: t.card, borderRadius: 14, boxShadow: t.cs, borderLeft: "4px solid #4ECDC4" }}>
              <div style={{ fontSize: 18 }}>💵</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{e.sourceName}</div>
                <div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>{e.receivedDate}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#4ECDC4", fontFamily: "'Fredoka'" }}>+{formatMoney(e.amount)}</div>
              <button onClick={() => deleteEntry(e.id)} style={{ width: 24, height: 24, borderRadius: 8, border: "none", background: "#FFF0F0", cursor: "pointer", color: "#FF6B6B", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>×</button>
            </div>
          ))}
          {!filteredEntries.length && <div style={{ textAlign: "center", padding: 40, color: t.sub }}>No income logged yet. Hit "Log Income" to record a paycheck.</div>}
        </div>
      )}

      {/* Add Source Modal */}
      {showAddSource && (() => {
        const Comp = () => {
          const [n, setN] = useState(""); const [a, setA] = useState(""); const [f, setF] = useState("biweekly"); const [np, setNp] = useState(""); const [saving, setSaving] = useState(false);
          const go = async () => { if (!n || !a) return; setSaving(true); await addSource({ name: n, amount: parseFloat(a), frequency: f, nextPayDate: np || null }); setSaving(false); };
          return (
            <div style={{ position: "fixed", inset: 0, background: t.over, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }} onClick={() => setShowAddSource(false)}>
              <div style={{ background: t.modal, borderRadius: 24, padding: 32, width: "90%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }} onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: "0 0 24px", fontFamily: "'Fredoka'", color: t.text, fontSize: 22 }}>💼 Add Income Source</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div><label style={lb}>Source Name</label><input value={n} onChange={e => setN(e.target.value)} placeholder="e.g. Day Job, Freelance, Side Hustle" style={is} /></div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ flex: 1 }}><label style={lb}>Amount ($)</label><input type="number" value={a} onChange={e => setA(e.target.value)} placeholder="2500.00" style={is} /></div>
                    <div style={{ flex: 1 }}><label style={lb}>Frequency</label>
                      <select value={f} onChange={e => setF(e.target.value)} style={{ ...is, cursor: "pointer" }}>
                        <option value="weekly">Weekly</option><option value="biweekly">Bi-Weekly</option>
                        <option value="semimonthly">Semi-Monthly</option><option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                  </div>
                  <div><label style={lb}>Next Pay Date (optional)</label><input type="date" value={np} onChange={e => setNp(e.target.value)} style={is} /></div>
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <button onClick={() => setShowAddSource(false)} style={{ flex: 1, padding: 14, borderRadius: 14, border: `2px solid ${t.border}`, background: t.card, cursor: "pointer", fontWeight: 700, fontSize: 14, color: t.sub, fontFamily: "'DM Sans'" }}>Cancel</button>
                    <button onClick={go} disabled={saving} style={{ flex: 2, padding: 14, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans'", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Add Source"}</button>
                  </div>
                </div>
              </div>
            </div>
          );
        };
        return <Comp />;
      })()}

      {/* Log Income Modal */}
      {showLogIncome && (() => {
        const Comp = () => {
          const [src, setSrc] = useState(sources.length > 0 ? sources[0].name : ""); const [srcId, setSrcId] = useState(sources.length > 0 ? sources[0].id : null);
          const [a, setA] = useState(sources.length > 0 ? String(sources[0].amount) : ""); const [dt, setDt] = useState(new Date().toISOString().split("T")[0]); const [saving, setSaving] = useState(false);
          const pickSource = (s) => { setSrc(s.name); setSrcId(s.id); setA(String(s.amount)); };
          const go = async () => { if (!src || !a) return; setSaving(true); await logEntry({ sourceId: srcId, sourceName: src, amount: parseFloat(a), receivedDate: dt }); setSaving(false); };
          return (
            <div style={{ position: "fixed", inset: 0, background: t.over, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }} onClick={() => setShowLogIncome(false)}>
              <div style={{ background: t.modal, borderRadius: 24, padding: 32, width: "90%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }} onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: "0 0 24px", fontFamily: "'Fredoka'", color: t.text, fontSize: 22 }}>💵 Log Income</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {sources.length > 0 && (
                    <div><label style={lb}>Quick Select</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {sources.map(s => <button key={s.id} onClick={() => pickSource(s)} style={{ padding: "8px 14px", borderRadius: 10, border: "2px solid", borderColor: srcId === s.id ? "#4ECDC4" : t.border, background: srcId === s.id ? "#4ECDC415" : "transparent", cursor: "pointer", fontSize: 12, fontWeight: 700, color: srcId === s.id ? "#4ECDC4" : t.sub }}>{s.name}</button>)}
                      </div>
                    </div>
                  )}
                  <div><label style={lb}>Source Name</label><input value={src} onChange={e => { setSrc(e.target.value); setSrcId(null); }} placeholder="e.g. Paycheck" style={is} /></div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ flex: 1 }}><label style={lb}>Amount ($)</label><input type="number" value={a} onChange={e => setA(e.target.value)} placeholder="2500.00" style={is} /></div>
                    <div style={{ flex: 1 }}><label style={lb}>Date Received</label><input type="date" value={dt} onChange={e => setDt(e.target.value)} style={is} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <button onClick={() => setShowLogIncome(false)} style={{ flex: 1, padding: 14, borderRadius: 14, border: `2px solid ${t.border}`, background: t.card, cursor: "pointer", fontWeight: 700, fontSize: 14, color: t.sub, fontFamily: "'DM Sans'" }}>Cancel</button>
                    <button onClick={go} disabled={saving} style={{ flex: 2, padding: 14, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans'", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Log Income"}</button>
                  </div>
                </div>
              </div>
            </div>
          );
        };
        return <Comp />;
      })()}
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

  const loadCards = async () => {
    try {
      const c = await api.getCards();
      setCards(c);
      if (c.length > 1) {
        const s = await api.getDebtStrategy();
        setStrategy(s);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadCards(); }, []);

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

  const is = { width: "100%", padding: "12px 16px", borderRadius: 12, border: `2px solid ${t.border}`, fontSize: 14, fontFamily: "'DM Sans'", outline: "none", boxSizing: "border-box", background: t.input, color: t.text };
  const totalDebt = cards.reduce((s, c) => s + c.balance, 0);
  const totalLimit = cards.reduce((s, c) => s + c.creditLimit, 0);
  const totalMin = cards.reduce((s, c) => s + c.minPayment, 0);
  const utilization = totalLimit > 0 ? (totalDebt / totalLimit * 100) : 0;

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: t.sub }}>Loading cards...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 32 }}>💳</div>
          <div>
            <h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: 0, fontSize: 20 }}>Credit Cards</h3>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Track balances, payments & payoff goals</p>
          </div>
        </div>
        <button onClick={() => setShowAddCard(true)} style={{ padding: "8px 18px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>+ Add Card</button>
      </div>

      {/* Summary stats */}
      {cards.length > 0 && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Total Debt</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#FF6B6B", fontFamily: "'Fredoka'", marginTop: 2 }}>{formatMoney(totalDebt)}</div>
          </div>
          <div style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Min Payments</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: t.text, fontFamily: "'Fredoka'", marginTop: 2 }}>{formatMoney(totalMin)}/mo</div>
          </div>
          <div style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Utilization</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: utilization > 30 ? "#FF6B6B" : "#4ECDC4", fontFamily: "'Fredoka'", marginTop: 2 }}>{utilization.toFixed(0)}%</div>
          </div>
        </div>
      )}

      {/* View toggle */}
      {cards.length > 1 && (
        <div style={{ display: "flex", gap: 4, background: t.pill, borderRadius: 12, padding: 4, alignSelf: "flex-start" }}>
          {[["cards", "💳 Cards"], ["strategy", "🎯 Payoff Strategy"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: view === k ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : "transparent", color: view === k ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>{l}</button>
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
                  background: t.card, borderRadius: 20, padding: "20px 24px", boxShadow: t.cs, cursor: "pointer",
                  borderLeft: `4px solid ${pct > 50 ? "#FF6B6B" : pct > 30 ? "#FDCB6E" : "#4ECDC4"}`,
                  border: isSelected ? "2px solid #6C5CE7" : undefined,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: t.text, fontSize: 16 }}>💳 {card.name}</div>
                      <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>APR: {card.apr}% · Due: {card.dueDate}th · Min: {formatMoney(card.minPayment)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: t.sub, cursor: "pointer" }}>
                        <div onClick={e => { e.stopPropagation(); toggleHistory(card.id, !card.showInHistory); }} style={{ width: 18, height: 18, borderRadius: 5, border: card.showInHistory ? "none" : `2px solid ${t.border}`, background: card.showInHistory ? "#4ECDC4" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10, fontWeight: 700 }}>{card.showInHistory && "✓"}</div>
                        History
                      </label>
                      <button onClick={e => { e.stopPropagation(); deleteCard(card.id); }} style={{ width: 24, height: 24, borderRadius: 8, border: "none", background: "#FFF0F0", cursor: "pointer", color: "#FF6B6B", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    </div>
                  </div>
                  {/* Balance bar */}
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 24, fontWeight: 800, color: t.text, fontFamily: "'Fredoka'" }}>{formatMoney(card.balance)}</span>
                    <span style={{ fontSize: 13, color: t.sub, alignSelf: "flex-end" }}>of {formatMoney(card.creditLimit)}</span>
                  </div>
                  <div style={{ height: 10, background: t.prog, borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 5, background: pct > 50 ? "linear-gradient(90deg, #FF6B6B, #FF8E8E)" : pct > 30 ? "linear-gradient(90deg, #FDCB6E, #FDE68A)" : "linear-gradient(90deg, #4ECDC4, #6EE7DE)", width: `${Math.min(pct, 100)}%`, transition: "width 0.5s" }} />
                  </div>
                  <div style={{ fontSize: 11, color: t.sub, marginTop: 4 }}>{pct.toFixed(0)}% utilized{card.goalDate ? ` · Goal: pay off by ${card.goalDate}` : ""}</div>
                </div>

                {/* Expanded: payment + payoff */}
                {isSelected && (
                  <div style={{ background: t.card, borderRadius: "0 0 20px 20px", padding: "16px 24px", boxShadow: t.cs, marginTop: -8, borderTop: `1px solid ${t.border}` }}>
                    {/* Make a payment */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
                      <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Payment amount" style={{ ...is, flex: 1 }} onKeyDown={e => e.key === "Enter" && makePayment(card)} />
                      <button onClick={() => makePayment(card)} style={{ padding: "12px 20px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "'DM Sans'", whiteSpace: "nowrap" }}>Pay Now</button>
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
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#FF6B6B" }}>{s.totalInterest === Infinity ? "∞" : formatMoney(s.totalInterest)} interest</div>
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

      {/* Strategy view */}
      {view === "strategy" && strategy && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { key: "avalanche", title: "🏔️ Avalanche Method", sub: "Pay highest APR first — saves the most money on interest", data: strategy.avalanche },
            { key: "snowball", title: "⛄ Snowball Method", sub: "Pay lowest balance first — quick wins to build momentum", data: strategy.snowball },
          ].map(method => (
            <div key={method.key} style={{ background: t.card, borderRadius: 20, padding: "20px 24px", boxShadow: t.cs }}>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 16, marginBottom: 2 }}>{method.title}</div>
              <div style={{ fontSize: 12, color: t.sub, marginBottom: 14 }}>{method.sub}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {method.data.map((c, i) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: t.prog, borderRadius: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: i === 0 ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : t.pill, display: "flex", alignItems: "center", justifyContent: "center", color: i === 0 ? "white" : t.sub, fontSize: 12, fontWeight: 800 }}>{c.order}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: t.text, fontSize: 13 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: t.sub }}>{method.key === "avalanche" ? `${c.apr}% APR` : formatMoney(c.balance)} · Min {formatMoney(c.minPayment)}</div>
                    </div>
                    <div style={{ fontWeight: 800, color: t.text, fontSize: 14, fontFamily: "'Fredoka'" }}>{formatMoney(c.balance)}</div>
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

  const is = { width: "100%", padding: "12px 16px", borderRadius: 12, border: `2px solid ${t.border}`, fontSize: 14, fontFamily: "'DM Sans'", outline: "none", boxSizing: "border-box", background: t.input, color: t.text };
  const lb = { fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" };

  const go = async () => {
    if (!name || !balance || !dueDate) return;
    setSaving(true);
    await onAdd({ name, balance: parseFloat(balance), creditLimit: parseFloat(creditLimit) || 0, apr: parseFloat(apr) || 0, minPayment: parseFloat(minPayment) || 0, dueDate: parseInt(dueDate), goalDate: goalDate || null, showInHistory: true });
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: t.over, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: t.modal, borderRadius: 24, padding: 32, width: "90%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 24px", fontFamily: "'Fredoka'", color: t.text, fontSize: 22 }}>💳 Add Credit Card</h3>
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
            <button onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: 14, border: `2px solid ${t.border}`, background: t.card, cursor: "pointer", fontWeight: 700, fontSize: 14, color: t.sub, fontFamily: "'DM Sans'" }}>Cancel</button>
            <button onClick={go} disabled={saving} style={{ flex: 2, padding: 14, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans'", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Add Card"}</button>
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

  const is = { width: "100%", padding: "12px 16px", borderRadius: 12, border: `2px solid ${t.border}`, fontSize: 14, fontFamily: "'DM Sans'", outline: "none", boxSizing: "border-box", background: t.input, color: t.text };
  const go = async () => { if (!name || !amount || !dueDate) return; setSaving(true); await onAdd({ name, amount: parseFloat(amount), dueDate: parseInt(dueDate), category, isRecurring, reminder, frequency: isRecurring ? frequency : "once", endAmount: endAmount ? parseFloat(endAmount) : null }); setSaving(false); };

  return (
    <div style={{ position: "fixed", inset: 0, background: t.over, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: t.modal, borderRadius: 24, padding: 32, width: "90%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 24px", fontFamily: "'Fredoka'", color: t.text, fontSize: 22 }}>➕ Add New Bill</h3>
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
            <button onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: 14, border: `2px solid ${t.border}`, background: t.card, cursor: "pointer", fontWeight: 700, fontSize: 14, color: t.sub, fontFamily: "'DM Sans'" }}>Cancel</button>
            <button onClick={go} disabled={saving} style={{ flex: 2, padding: 14, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans'", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Add Bill"}</button>
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
        <div style={{ height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #4ECDC4, #6C5CE7)", width: `${(done / total) * 100}%`, transition: "width 0.5s" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.map(s => (
          <div key={s.key} onClick={() => !s.done && onGoTo(actions[s.key])} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10,
            background: s.done ? "#4ECDC410" : t.prog, cursor: s.done ? "default" : "pointer",
          }}>
            <div style={{ width: 24, height: 24, borderRadius: 8, background: s.done ? "#4ECDC4" : t.border, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{s.done ? "✓" : icons[s.key]}</div>
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
  const getCatIcon2 = n => CATEGORIES.find(c => c.name === n)?.icon || "📋";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Onboarding */}
      {!dash.onboardingComplete && <OnboardingWizard steps={dash.onboardingSteps} t={t} onGoTo={onGoTo} />}

      {/* Bank balance hero */}
      {dash.accountCount > 0 && (
        <div style={{ background: t.card, borderRadius: 16, padding: "18px 20px", boxShadow: t.cs }}>
          <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Bank Balance</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#4ECDC4", fontFamily: "'Fredoka'", margin: "4px 0" }}>{formatMoney(dash.totalBankBalance)}</div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: t.sub }}>
            {dash.totalCardDebt > 0 && <span>💳 {formatMoney(dash.totalCardDebt)} debt</span>}
            <span>💰 {formatMoney(dash.incomeThisMonth)} earned this month</span>
          </div>
        </div>
      )}

      {/* Quick stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div style={{ background: t.card, borderRadius: 14, padding: "14px 16px", boxShadow: t.cs }}>
          <div style={{ fontSize: 10, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Monthly Bills</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#6C5CE7", fontFamily: "'Fredoka'" }}>{formatMoney(dash.totalMonthlyBills)}</div>
          <div style={{ fontSize: 11, color: t.sub, fontWeight: 600 }}>{dash.totalBills} total</div>
        </div>
        <div style={{ background: t.card, borderRadius: 14, padding: "14px 16px", boxShadow: t.cs }}>
          <div style={{ fontSize: 10, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Still Owed</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: dash.totalUnpaid > 0 ? "#FF6B6B" : "#4ECDC4", fontFamily: "'Fredoka'" }}>{formatMoney(dash.totalUnpaid)}</div>
          <div style={{ fontSize: 11, color: t.sub, fontWeight: 600 }}>{dash.totalBills - dash.paidCount} unpaid</div>
        </div>
        <div style={{ background: t.card, borderRadius: 14, padding: "14px 16px", boxShadow: t.cs }}>
          <div style={{ fontSize: 10, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Left Over</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: dash.leftoverFromBank >= 0 ? "#4ECDC4" : "#FF6B6B", fontFamily: "'Fredoka'" }}>{dash.accountCount > 0 ? formatMoney(dash.leftoverFromBank) : formatMoney(dash.leftoverEstimated)}</div>
          <div style={{ fontSize: 11, color: t.sub, fontWeight: 600 }}>after bills</div>
        </div>
      </div>

      {/* Progress */}
      <div style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontWeight: 700, color: t.text, fontSize: 13 }}>Monthly Progress</span>
          <span style={{ fontWeight: 800, color: "#6C5CE7", fontFamily: "'Fredoka'", fontSize: 13 }}>{dash.totalMonthlyBills > 0 ? Math.round((dash.totalPaid / dash.totalMonthlyBills) * 100) : 0}%</span>
        </div>
        <div style={{ height: 8, background: t.prog, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg, #4ECDC4, #6C5CE7)", width: `${dash.totalMonthlyBills > 0 ? (dash.totalPaid / dash.totalMonthlyBills) * 100 : 0}%`, transition: "width 0.5s" }} />
        </div>
      </div>

      {/* Overdue alert */}
      {dash.overdue.length > 0 && (
        <div style={{ background: "#FF6B6B15", borderRadius: 14, padding: "14px 18px", borderLeft: "4px solid #FF6B6B" }}>
          <div style={{ fontWeight: 700, color: "#FF6B6B", fontSize: 13, marginBottom: 8 }}>⚠️ {dash.overdue.length} Overdue</div>
          {dash.overdue.map(b => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
              <span style={{ color: t.text }}>{getCatIcon2(b.category)} {b.name}</span>
              <span style={{ fontWeight: 700, color: "#FF6B6B" }}>{formatMoney(b.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming this week */}
      {dash.upcoming.length > 0 && (
        <div style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 13, marginBottom: 10 }}>📅 Due This Week</div>
          {dash.upcoming.map(b => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${t.border}` }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{getCatIcon2(b.category)} {b.name}</span>
                <span style={{ fontSize: 11, color: t.sub, marginLeft: 8 }}>{b.daysUntil === 0 ? "Today" : `in ${b.daysUntil}d`}</span>
              </div>
              <span style={{ fontWeight: 700, color: t.text, fontSize: 13 }}>{formatMoney(b.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* All bills */}
      <div>
        <h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: "4px 0 10px", fontSize: 16 }}>All Bills</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {bills.sort((a, b) => a.dueDate - b.dueDate).map(b => <BillRow key={b.id} bill={b} onToggle={onToggle} onDelete={onDelete} t={t} />)}
          {!bills.length && <div style={{ textAlign: "center", padding: 30, color: t.sub, fontSize: 13 }}>No bills yet — tap "+ Add" to get started</div>}
        </div>
      </div>

      {/* Recent activity */}
      {dash.recentActivity.length > 0 && (
        <div style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 13, marginBottom: 10 }}>🕐 Recent Activity</div>
          {dash.recentActivity.map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, borderBottom: `1px solid ${t.border}` }}>
              <span style={{ color: t.sub }}>{a.status === "on-time" ? "✅" : "⚠️"} {a.billName} · {a.paidDate}</span>
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
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [hhName, setHHName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [showAddBill, setShowAddBill] = useState(false);
  const [billForm, setBillForm] = useState({ name: "", totalAmount: "", dueDate: "", category: "Utilities" });

  const load = async () => {
    try { const data = await api.getHousehold(); setHH(data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try { await api.createHousehold(hhName || "My Household"); setShowCreate(false); load(); } catch (err) { alert(err.message || "Error"); }
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
  const paySplit = async (splitId) => { try { await api.payHouseholdSplit(splitId); load(); } catch (err) { console.error(err); } };
  const leave = async () => { if (window.confirm("Leave this household?")) { try { await api.leaveHousehold(); setHH(null); } catch (err) { console.error(err); } } };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: t.sub }}>Loading household...</div>;

  // No household - show create/join
  if (!hh) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 32 }}>🏠</div>
        <div>
          <h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: 0, fontSize: 20 }}>Shared Household</h3>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Split bills with a partner or roommates</p>
        </div>
      </div>
      <div style={{ background: t.card, borderRadius: 16, padding: "24px 20px", boxShadow: t.cs, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🏠</div>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 16, marginBottom: 4 }}>No household yet</div>
        <div style={{ fontSize: 13, color: t.sub, marginBottom: 16, lineHeight: 1.5 }}>Create a household and invite your partner or roommates to split and track bills together.</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => setShowCreate(true)} style={{ padding: "12px 24px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans'" }}>🏠 Create Household</button>
          <button onClick={() => setShowJoin(true)} style={{ padding: "12px 24px", borderRadius: 12, border: `2px solid ${t.border}`, background: "transparent", color: t.text, cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans'" }}>🔗 Join with Code</button>
        </div>
      </div>
      {showCreate && (
        <div style={{ background: t.card, borderRadius: 16, padding: "18px 20px", boxShadow: t.cs }}>
          <div style={{ fontWeight: 700, color: t.text, marginBottom: 10 }}>Name your household</div>
          <input value={hhName} onChange={e => setHHName(e.target.value)} placeholder="e.g. Our Apartment" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `2px solid ${t.border}`, background: t.inputBg || t.bg, color: t.text, fontSize: 14, fontFamily: "'DM Sans'", boxSizing: "border-box", marginBottom: 10 }} />
          <button onClick={create} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans'" }}>Create</button>
        </div>
      )}
      {showJoin && (
        <div style={{ background: t.card, borderRadius: 16, padding: "18px 20px", boxShadow: t.cs }}>
          <div style={{ fontWeight: 700, color: t.text, marginBottom: 10 }}>Enter invite code</div>
          <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. A1B2C3D4" maxLength={8} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `2px solid ${t.border}`, background: t.inputBg || t.bg, color: t.text, fontSize: 18, fontFamily: "'DM Sans'", boxSizing: "border-box", marginBottom: 10, textAlign: "center", letterSpacing: 4, textTransform: "uppercase" }} />
          <button onClick={join} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans'" }}>Join Household</button>
        </div>
      )}
    </div>
  );

  // Has household
  const myId = api.getUser()?.id;
  const myTotal = hh.bills.reduce((s, b) => {
    const mySplit = b.splits.find(sp => sp.userId === myId);
    return s + (mySplit && !mySplit.isPaid ? mySplit.amount : 0);
  }, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>🏠</div>
          <div>
            <h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: 0, fontSize: 18 }}>{hh.name}</h3>
            <p style={{ margin: 0, fontSize: 12, color: t.sub }}>{hh.members.length} member{hh.members.length > 1 ? "s" : ""}</p>
          </div>
        </div>
        <button onClick={() => setShowAddBill(true)} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>+ Add Bill</button>
      </div>

      {/* Invite code */}
      <div style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div style={{ fontSize: 11, color: t.sub, fontWeight: 600 }}>Invite Code</div><div style={{ fontSize: 18, fontWeight: 800, color: "#6C5CE7", fontFamily: "'Fredoka'", letterSpacing: 2 }}>{hh.inviteCode}</div></div>
        <button onClick={() => { navigator.clipboard?.writeText(hh.inviteCode); }} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.sub, cursor: "pointer", fontWeight: 600, fontSize: 11, fontFamily: "'DM Sans'" }}>📋 Copy</button>
      </div>

      {/* Your share */}
      <div style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs }}>
        <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase" }}>Your Share This Month</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: myTotal > 0 ? "#FF6B6B" : "#4ECDC4", fontFamily: "'Fredoka'" }}>{formatMoney(myTotal)}</div>
      </div>

      {/* Members */}
      <div style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs }}>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 13, marginBottom: 8 }}>👥 Members</div>
        {hh.members.map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>{m.name?.charAt(0)?.toUpperCase()}</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: t.text, flex: 1 }}>{m.name}</span>
            <span style={{ fontSize: 11, color: t.sub }}>{m.role === "owner" ? "👑 Owner" : "Member"}</span>
          </div>
        ))}
      </div>

      {/* Shared bills */}
      <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginTop: 4 }}>📋 Shared Bills</div>
      {hh.bills.map(bill => (
        <div key={bill.id} style={{ background: t.card, borderRadius: 14, padding: "14px 18px", boxShadow: t.cs }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div><div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{bill.name}</div><div style={{ fontSize: 11, color: t.sub }}>Due: {bill.dueDate}th · {bill.category}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontWeight: 800, color: t.text, fontFamily: "'Fredoka'" }}>{formatMoney(bill.totalAmount)}</div><div style={{ fontSize: 10, color: t.sub }}>total</div></div>
          </div>
          {bill.splits.map(sp => (
            <div key={sp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 8, background: sp.isPaid ? "#4ECDC408" : t.prog, marginBottom: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 18, height: 18, borderRadius: 6, background: sp.isPaid ? "#4ECDC4" : t.border, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>{sp.isPaid ? "✓" : ""}</div>
                <span style={{ fontSize: 12, fontWeight: 600, color: sp.isPaid ? t.sub : t.text, textDecoration: sp.isPaid ? "line-through" : "none" }}>{sp.name}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: sp.isPaid ? "#4ECDC4" : t.text }}>{formatMoney(sp.amount)}</span>
                {!sp.isPaid && sp.userId === myId && <button onClick={() => paySplit(sp.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#4ECDC4", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 10, fontFamily: "'DM Sans'" }}>Pay</button>}
              </div>
            </div>
          ))}
        </div>
      ))}
      {!hh.bills.length && <div style={{ textAlign: "center", padding: 20, color: t.sub, fontSize: 13 }}>No shared bills yet</div>}

      {/* Add bill form */}
      {showAddBill && (
        <div style={{ background: t.card, borderRadius: 16, padding: "18px 20px", boxShadow: t.cs }}>
          <div style={{ fontWeight: 700, color: t.text, marginBottom: 10 }}>Add Shared Bill</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={billForm.name} onChange={e => setBillForm(p => ({ ...p, name: e.target.value }))} placeholder="Bill name" style={{ padding: "10px 12px", borderRadius: 8, border: `2px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, fontFamily: "'DM Sans'" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" value={billForm.totalAmount} onChange={e => setBillForm(p => ({ ...p, totalAmount: e.target.value }))} placeholder="Total $" style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: `2px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, fontFamily: "'DM Sans'" }} />
              <input type="number" value={billForm.dueDate} onChange={e => setBillForm(p => ({ ...p, dueDate: e.target.value }))} placeholder="Due day" min="1" max="31" style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: `2px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, fontFamily: "'DM Sans'" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowAddBill(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `2px solid ${t.border}`, background: "transparent", color: t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>Cancel</button>
              <button onClick={addBill} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>Add & Split Evenly</button>
            </div>
          </div>
        </div>
      )}

      <button onClick={leave} style={{ padding: "10px", borderRadius: 10, border: `1px solid #FF6B6B`, background: "transparent", color: "#FF6B6B", cursor: "pointer", fontWeight: 600, fontSize: 12, fontFamily: "'DM Sans'", marginTop: 8 }}>{hh.isOwner ? "🗑️ Delete Household" : "Leave Household"}</button>
    </div>
  );
}

function MoneyTab({ t }) {
  const [subTab, setSubTab] = useState("bank");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 4, background: t.pill, borderRadius: 12, padding: 4, alignSelf: "flex-start", flexWrap: "wrap" }}>
        {[["bank", "🏦 Bank"], ["cards", "💳 Cards"], ["income", "💰 Income"], ["household", "🏠 Household"]].map(([k, l]) => (
          <button key={k} onClick={() => setSubTab(k)} style={{ padding: "7px 12px", borderRadius: 10, border: "none", background: subTab === k ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : "transparent", color: subTab === k ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'DM Sans'" }}>{l}</button>
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
function SettingsTab({ bills, history, hMonths, hFilter, setHFilter, onUpdateReminder, t }) {
  const [subTab, setSubTab] = useState("forecast");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 3, background: t.pill, borderRadius: 12, padding: 3, alignSelf: "stretch", flexWrap: "wrap" }}>
        {[["forecast", "📈 Forecast"], ["savings", "🐷 Savings"], ["negotiate", "📞 Negotiate"], ["subs", "🔍 Subscriptions"], ["activity", "📋 Activity"], ["alerts", "🔔 Alerts"], ["reminders", "⏰ Reminders"], ["history", "📜 History"], ["charts", "📊 Charts"]].map(([k, l]) => (
          <button key={k} onClick={() => setSubTab(k)} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: subTab === k ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : "transparent", color: subTab === k ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 10, fontFamily: "'DM Sans'" }}>{l}</button>
        ))}
      </div>
      {subTab === "forecast" && <ForecastView t={t} />}
      {subTab === "savings" && <SavingsAdvisor t={t} />}
      {subTab === "negotiate" && <NegotiateView bills={bills} t={t} />}
      {subTab === "subs" && <SubscriptionDetector t={t} />}
      {subTab === "activity" && <ActivityView t={t} />}
      {subTab === "alerts" && <SmartAlertsView t={t} />}
      {subTab === "reminders" && <RemindersView bills={bills} onUpdate={onUpdateReminder} t={t} />}
      {subTab === "history" && <HistoryView history={history} months={hMonths} filter={hFilter} setFilter={setHFilter} t={t} />}
      {subTab === "charts" && <SpendingChart bills={bills} t={t} />}
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
        if (result.billsMatched > 0 || result.incomeDetected > 0 || result.cardsUpdated > 0) {
          const [b, h, m, d] = await Promise.all([api.getBills(), api.getHistory(), api.getHistoryMonths(), api.getDashboard()]);
          setBills(b); setHistory(h); setHMonths(m); setDash(d);
        }
      } catch (err) { /* silently fail */ }
    };
    runSync();
    const interval = setInterval(runSync, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const handleAuth = (u) => { setUser(u); };
  const handleLogout = () => { api.clearToken(); setUser(null); setBills([]); setHistory([]); setDash(null); };

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

  if (!user) return <AuthPage onAuth={handleAuth} t={t} />;

  const totalMonthly = bills.reduce((s, b) => s + b.amount, 0);
  const totalPaid = bills.filter(b => b.isPaid).reduce((s, b) => s + b.amount, 0);
  const totalUnpaid = totalMonthly - totalPaid;
  const paidCount = bills.filter(b => b.isPaid).length;

  // 5-tab navigation
  const mainTabs = [
    { key: "dashboard", label: "Home", icon: "📊" },
    { key: "money", label: "Money", icon: "🏦" },
    { key: "calendar", label: "Calendar", icon: "📅" },
    { key: "insights", label: "Insights", icon: "🤖" },
    { key: "more", label: "More", icon: "⚙️" },
  ];

  const [showMore, setShowMore] = useState(false);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", background: t.bg, transition: "background 0.4s", paddingBottom: 80 }}>
      <style>{`
        select option { background: ${t.card}; color: ${t.text}; }
        @media (min-width: 768px) {
          .bb-bottom-nav { display: none !important; }
          .bb-desktop-nav { display: flex !important; }
        }
        @media (max-width: 767px) {
          .bb-bottom-nav { display: flex !important; }
          .bb-desktop-nav { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ background: t.header, padding: "18px 16px 44px", borderRadius: "0 0 24px 24px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: "50%", background: t.bubble }} />
        <div style={{ position: "relative", maxWidth: 960, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Fredoka'", fontSize: 22, color: "white", fontWeight: 700 }}>💸 BillBuddy</h1>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 2 }}>Hey, {user.name}!</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={toggleDark} style={{ width: 36, height: 22, borderRadius: 11, border: "none", cursor: "pointer", background: dark ? "#4ECDC4" : "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", padding: "0 2px" }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transform: dark ? "translateX(14px)" : "translateX(0)", transition: "transform 0.3s", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>{dark ? "🌙" : "☀️"}</div>
            </button>
            <button onClick={() => setShowAdd(true)} style={{ padding: "7px 14px", borderRadius: 10, border: "none", background: "rgba(255,255,255,0.2)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>+ Add</button>
            <button onClick={handleLogout} style={{ padding: "7px 10px", borderRadius: 10, border: "none", background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontWeight: 600, fontSize: 10, fontFamily: "'DM Sans'" }}>Sign Out</button>
          </div>
        </div>
      </div>

      {/* Desktop Nav */}
      <div className="bb-desktop-nav" style={{ display: "none", maxWidth: 960, margin: "-20px auto 0", padding: "0 12px", justifyContent: "center", position: "relative", zIndex: 10 }}>
        <div style={{ display: "inline-flex", gap: 3, background: t.tab, borderRadius: 14, padding: 4, boxShadow: t.tabS }}>
          {mainTabs.filter(tb => tb.key !== "more").map(tb => (
            <button key={tb.key} onClick={() => setTab(tb.key)} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: tab === tb.key ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : "transparent", color: tab === tb.key ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>{tb.icon} {tb.label}</button>
          ))}
          <button onClick={() => setTab("more")} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: tab === "more" ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : "transparent", color: tab === "more" ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>⚙️ More</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 960, margin: "12px auto", padding: "0 12px", paddingBottom: 90 }}>
        {loading && !bills.length ? (
          <div style={{ textAlign: "center", padding: 60 }}><div style={{ fontSize: 48 }}>💸</div><div style={{ marginTop: 12, fontWeight: 700, color: t.text, fontFamily: "'Fredoka'" }}>Loading...</div></div>
        ) : (<>
          {tab === "dashboard" && <UnifiedDashboard dash={dash} bills={bills} t={t} onToggle={togglePaid} onDelete={deleteBill} onGoTo={setTab} />}
          {tab === "money" && <MoneyTab t={t} />}
          {tab === "calendar" && <CalendarView bills={bills} cards={calCards} t={t} onMoveBill={moveBillDate} />}
          {tab === "insights" && <AIInsights t={t} />}
          {tab === "more" && <SettingsTab bills={bills} history={history} hMonths={hMonths} hFilter={hFilter} setHFilter={setHFilter} onUpdateReminder={updateReminder} t={t} />}
        </>)}
      </div>

      {/* Bottom Navigation (mobile) */}
      <div className="bb-bottom-nav" style={{
        display: "none", position: "fixed", bottom: 0, left: 0, right: 0,
        background: t.card, borderTop: `1px solid ${t.border}`,
        padding: "6px 4px 8px", paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        justifyContent: "space-around", alignItems: "center", zIndex: 100,
        boxShadow: "0 -4px 20px rgba(0,0,0,0.08)",
      }}>
        {mainTabs.map(tb => (
          <button key={tb.key} onClick={() => { setTab(tb.key); setShowMore(false); }} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
            background: "none", border: "none", cursor: "pointer", padding: "4px 8px",
            color: tab === tb.key ? "#6C5CE7" : t.sub, minWidth: 48,
          }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>{tb.icon}</span>
            <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "'DM Sans'" }}>{tb.label}</span>
            {tab === tb.key && <div style={{ width: 16, height: 3, borderRadius: 2, background: "#6C5CE7" }} />}
          </button>
        ))}
      </div>

      {showAdd && <AddBillModal onClose={() => setShowAdd(false)} onAdd={addBill} t={t} />}
    </div>
  );
}
