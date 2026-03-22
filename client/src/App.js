import React, { useState, useEffect, useCallback } from "react";
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

function getSmartSuggestions(bills) {
  const s = [];
  const tot = bills.reduce((a, b) => a + b.amount, 0);
  const subs = bills.filter(b => b.category === "Subscriptions");
  const subT = subs.reduce((a, b) => a + b.amount, 0);
  const day = new Date().getDate();
  const soon = bills.filter(b => !b.isPaid && b.dueDate - day <= 5 && b.dueDate - day > 0);
  const noRem = bills.filter(b => !b.reminder || b.reminder === "none");
  if (subT > 50) s.push({ icon: "💰", title: "Subscription Audit", desc: `Spending ${formatMoney(subT)}/mo on ${subs.length} subscriptions. Canceling one saves ~${formatMoney(subT / subs.length)}/mo.`, priority: "high" });
  if (soon.length > 0) s.push({ icon: "⚡", title: "Bills Due Soon", desc: `${soon.length} bill${soon.length > 1 ? "s" : ""} due in 5 days totaling ${formatMoney(soon.reduce((a, b) => a + b.amount, 0))}.`, priority: "high" });
  if (noRem.length > 0) s.push({ icon: "🔔", title: "Set Up Reminders", desc: `${noRem.length} bill${noRem.length > 1 ? "s" : ""} without reminders. Head to Reminders tab.`, priority: "high" });
  if (tot > 2000) s.push({ icon: "📊", title: "Budget Check", desc: `Monthly total ${formatMoney(tot)}. Try the 50/30/20 rule.`, priority: "medium" });
  s.push({ icon: "🔄", title: "Autopay", desc: "Set up autopay to avoid late fees and get discounts.", priority: "low" });
  s.push({ icon: "📞", title: "Negotiate", desc: "Call providers yearly to negotiate rates. Save 10-20%.", priority: "medium" });
  return s;
}

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
    <div style={{ background: t.card, borderRadius: 20, padding: "22px 26px", boxShadow: t.cs, flex: 1, minWidth: 170, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: color + "20" }} />
      <div style={{ fontSize: 26, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: t.text, fontFamily: "'Fredoka', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function BillRow({ bill, onToggle, onDelete, t }) {
  const d = bill.dueDate - new Date().getDate();
  const over = d < 0 && !bill.isPaid, soon = d >= 0 && d <= 3 && !bill.isPaid;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: bill.isPaid ? t.rowPaid : over ? t.rowOver : t.rowBg, borderRadius: 16, boxShadow: t.cs, borderLeft: `4px solid ${getCatColor(bill.category)}` }}>
      <button onClick={() => onToggle(bill)} style={{ width: 26, height: 26, borderRadius: 8, border: bill.isPaid ? "none" : `2px solid ${t.border}`, background: bill.isPaid ? "#4ECDC4" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{bill.isPaid && "✓"}</button>
      <div style={{ fontSize: 20, flexShrink: 0 }}>{getCatIcon(bill.category)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 14, textDecoration: bill.isPaid ? "line-through" : "none", opacity: bill.isPaid ? 0.5 : 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bill.name}</div>
        <div style={{ fontSize: 11, color: t.sub, marginTop: 2, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          Due: {bill.dueDate}th · {bill.category}
          {bill.isRecurring && <span style={{ background: t.tag, color: "#6C5CE7", padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>RECURRING</span>}
          {bill.reminder && bill.reminder !== "none" && <span style={{ background: "#FFF8E1", color: "#F39C12", padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>🔔 {reminderLabel(bill.reminder)}</span>}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: bill.isPaid ? "#4ECDC4" : t.text, fontFamily: "'Fredoka', sans-serif" }}>{formatMoney(bill.amount)}</div>
        {!bill.isPaid && <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: over ? "#FF6B6B" : soon ? "#FDCB6E" : "#4ECDC4" }}>{over ? "OVERDUE" : soon ? `Due in ${d}d` : `${d}d left`}</div>}
      </div>
      <button onClick={() => onDelete(bill.id)} style={{ width: 26, height: 26, borderRadius: 8, border: "none", background: "#FFF0F0", cursor: "pointer", color: "#FF6B6B", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>×</button>
    </div>
  );
}

function CalendarView({ bills, t }) {
  const [cm, setCm] = useState(new Date().getMonth());
  const [cy, setCy] = useState(new Date().getFullYear());
  const dim = getDaysInMonth(cy, cm), fd = getFirstDayOfMonth(cy, cm);
  const now = new Date(), isCur = cm === now.getMonth() && cy === now.getFullYear();
  const cells = []; for (let i = 0; i < fd; i++) cells.push(null); for (let d = 1; d <= dim; d++) cells.push(d);
  return (
    <div style={{ background: t.card, borderRadius: 20, padding: 28, boxShadow: t.cs }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button onClick={() => { if (cm === 0) { setCm(11); setCy(cy - 1); } else setCm(cm - 1); }} style={{ background: t.pill, border: "none", borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 16, fontWeight: 700, color: t.text }}>‹</button>
        <div style={{ fontWeight: 800, fontSize: 18, fontFamily: "'Fredoka', sans-serif", color: t.text }}>{MONTHS[cm]} {cy}</div>
        <button onClick={() => { if (cm === 11) { setCm(0); setCy(cy + 1); } else setCm(cm + 1); }} style={{ background: t.pill, border: "none", borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 16, fontWeight: 700, color: t.text }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: t.muted, padding: "4px 0" }}>{d}</div>)}
        {cells.map((day, i) => {
          const db = day ? bills.filter(b => b.dueDate === day) : [];
          const isT = isCur && day === now.getDate();
          return (<div key={i} style={{ minHeight: 52, borderRadius: 10, padding: 4, background: isT ? t.today : day ? t.cell : "transparent", border: isT ? "2px solid #6C5CE7" : "2px solid transparent" }}>{day && <><div style={{ fontSize: 12, fontWeight: isT ? 800 : 500, color: isT ? "#6C5CE7" : t.sub, textAlign: "right", padding: "0 2px" }}>{day}</div><div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>{db.map(b => <div key={b.id} title={`${b.name} - ${formatMoney(b.amount)}`} style={{ width: "100%", height: 6, borderRadius: 3, background: b.isPaid ? "#4ECDC4" : getCatColor(b.category), opacity: b.isPaid ? 0.4 : 1 }} />)}</div></>}</div>);
        })}
      </div>
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
  const handle = (id, v) => { onUpdate(id, v); const b = bills.find(x => x.id === id); if (v !== "none") { setToast(`🔔 Reminder set for ${b?.name}: ${reminderLabel(v)}`); setTimeout(() => setToast(null), 2500); } };
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
    </div>
  );
}

function AddBillModal({ onClose, onAdd, t }) {
  const [name, setName] = useState(""); const [amount, setAmount] = useState(""); const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState("Other"); const [isRecurring, setIsRecurring] = useState(true);
  const [reminder, setReminder] = useState("1day"); const [saving, setSaving] = useState(false);
  const is = { width: "100%", padding: "12px 16px", borderRadius: 12, border: `2px solid ${t.border}`, fontSize: 14, fontFamily: "'DM Sans'", outline: "none", boxSizing: "border-box", background: t.input, color: t.text };
  const go = async () => { if (!name || !amount || !dueDate) return; setSaving(true); await onAdd({ name, amount: parseFloat(amount), dueDate: parseInt(dueDate), category, isRecurring, reminder }); setSaving(false); };
  return (
    <div style={{ position: "fixed", inset: 0, background: t.over, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: t.modal, borderRadius: 24, padding: 32, width: "90%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 24px", fontFamily: "'Fredoka'", color: t.text, fontSize: 22 }}>➕ Add New Bill</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div><label style={{ fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Bill Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Electric Bill" style={is} /></div>
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
            <span style={{ fontSize: 14, fontWeight: 600, color: t.sub }}>Recurring monthly</span>
          </label>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: 14, border: `2px solid ${t.border}`, background: t.card, cursor: "pointer", fontWeight: 700, fontSize: 14, color: t.sub, fontFamily: "'DM Sans'" }}>Cancel</button>
            <button onClick={go} disabled={saving} style={{ flex: 2, padding: 14, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans'", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Add Bill"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ───
export default function App() {
  const [user, setUser] = useState(api.getUser());
  const [bills, setBills] = useState([]);
  const [history, setHistory] = useState([]);
  const [hMonths, setHMonths] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [showAdd, setShowAdd] = useState(false);
  const [dark, setDark] = useState(false);
  const [hFilter, setHFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  const t = useTheme(dark);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [b, h, m] = await Promise.all([api.getBills(), api.getHistory(), api.getHistoryMonths()]);
      setBills(b); setHistory(h); setHMonths(m);
    } catch (err) { console.error("Load error:", err); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAuth = (u) => { setUser(u); };
  const handleLogout = () => { api.clearToken(); setUser(null); setBills([]); setHistory([]); };

  const togglePaid = async (bill) => {
    const np = !bill.isPaid;
    setBills(p => p.map(b => b.id === bill.id ? { ...b, isPaid: np } : b));
    try {
      await api.updateBill(bill.id, { isPaid: np });
      if (np) {
        await api.recordPayment({ billName: bill.name, amount: bill.amount, category: bill.category, dueDate: bill.dueDate });
        const [h, m] = await Promise.all([api.getHistory(), api.getHistoryMonths()]);
        setHistory(h); setHMonths(m);
      }
    } catch (err) { setBills(p => p.map(b => b.id === bill.id ? { ...b, isPaid: !np } : b)); }
  };

  const deleteBill = async (id) => {
    const prev = bills;
    setBills(p => p.filter(b => b.id !== id));
    try { await api.deleteBill(id); } catch { setBills(prev); }
  };

  const addBill = async (bill) => {
    try { const c = await api.createBill(bill); setBills(p => [...p, c]); setShowAdd(false); } catch (err) { console.error(err); }
  };

  const updateReminder = async (id, val) => {
    setBills(p => p.map(b => b.id === id ? { ...b, reminder: val } : b));
    try { await api.updateBill(id, { reminder: val }); } catch {}
  };

  // Not logged in → show auth
  if (!user) return <AuthPage onAuth={handleAuth} t={t} />;

  const totalMonthly = bills.reduce((s, b) => s + b.amount, 0);
  const totalPaid = bills.filter(b => b.isPaid).reduce((s, b) => s + b.amount, 0);
  const totalUnpaid = totalMonthly - totalPaid;
  const paidCount = bills.filter(b => b.isPaid).length;
  const suggestions = getSmartSuggestions(bills);

  const tabs = [
    { key: "dashboard", label: "Dashboard", icon: "📊" }, { key: "calendar", label: "Calendar", icon: "📅" },
    { key: "insights", label: "AI Insights", icon: "🤖" }, { key: "charts", label: "Charts", icon: "📈" },
    { key: "history", label: "History", icon: "📜" }, { key: "reminders", label: "Reminders", icon: "🔔" },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", background: t.bg, transition: "background 0.4s" }}>
      <style>{`select option { background: ${t.card}; color: ${t.text}; }`}</style>
      {/* Header */}
      <div style={{ background: t.header, padding: "28px 28px 56px", borderRadius: "0 0 36px 36px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 150, height: 150, borderRadius: "50%", background: t.bubble }} />
        <div style={{ position: "relative", maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontFamily: "'Fredoka'", fontSize: 30, color: "white", fontWeight: 700 }}>💸 BillBuddy</h1>
              <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 4 }}>Hey, {user.name}!</div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={() => setDark(!dark)} style={{ width: 48, height: 28, borderRadius: 14, border: "none", cursor: "pointer", background: dark ? "#4ECDC4" : "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", padding: "0 3px" }}>
                <div style={{ width: 22, height: 22, borderRadius: 11, background: "white", boxShadow: "0 2px 6px rgba(0,0,0,0.2)", transform: dark ? "translateX(20px)" : "translateX(0)", transition: "transform 0.3s", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>{dark ? "🌙" : "☀️"}</div>
              </button>
              <button onClick={() => setShowAdd(true)} style={{ padding: "10px 20px", borderRadius: 14, border: "none", background: "rgba(255,255,255,0.2)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans'" }}><span style={{ fontSize: 16 }}>+</span> Add Bill</button>
              <button onClick={handleLogout} style={{ padding: "10px 16px", borderRadius: 14, border: "none", background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans'" }}>Sign Out</button>
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ maxWidth: 960, margin: "-28px auto 0", padding: "0 12px", display: "flex", justifyContent: "center", position: "relative", zIndex: 10 }}>
        <div style={{ display: "inline-flex", gap: 3, background: t.tab, borderRadius: 16, padding: 5, boxShadow: t.tabS, flexWrap: "wrap", justifyContent: "center" }}>
          {tabs.map(tb => <button key={tb.key} onClick={() => setTab(tb.key)} style={{ padding: "9px 14px", borderRadius: 12, border: "none", background: tab === tb.key ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : "transparent", color: tab === tb.key ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans'", whiteSpace: "nowrap" }}>{tb.icon} {tb.label}</button>)}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 960, margin: "20px auto", padding: "0 16px 40px" }}>
        {loading && !bills.length ? (
          <div style={{ textAlign: "center", padding: 60 }}><div style={{ fontSize: 48 }}>💸</div><div style={{ marginTop: 12, fontWeight: 700, color: t.text, fontFamily: "'Fredoka'" }}>Loading your bills...</div></div>
        ) : (<>
          {tab === "dashboard" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <StatCard label="Total Monthly" value={formatMoney(totalMonthly)} icon="📋" color="#6C5CE7" t={t} />
                <StatCard label="Paid" value={formatMoney(totalPaid)} sub={`${paidCount} of ${bills.length} bills`} icon="✅" color="#4ECDC4" t={t} />
                <StatCard label="Remaining" value={formatMoney(totalUnpaid)} sub={`${bills.length - paidCount} bills left`} icon="⏳" color="#FF6B6B" t={t} />
              </div>
              <div style={{ background: t.card, borderRadius: 20, padding: "18px 24px", boxShadow: t.cs }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>Monthly Progress</span>
                  <span style={{ fontWeight: 800, color: "#6C5CE7", fontFamily: "'Fredoka'" }}>{totalMonthly > 0 ? Math.round((totalPaid / totalMonthly) * 100) : 0}%</span>
                </div>
                <div style={{ height: 12, background: t.prog, borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 6, background: "linear-gradient(90deg, #4ECDC4, #6C5CE7)", width: `${totalMonthly > 0 ? (totalPaid / totalMonthly) * 100 : 0}%`, transition: "width 0.5s" }} />
                </div>
              </div>
              <div>
                <h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: "0 0 12px", fontSize: 18 }}>Your Bills</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {bills.sort((a, b) => a.dueDate - b.dueDate).map(b => <BillRow key={b.id} bill={b} onToggle={togglePaid} onDelete={deleteBill} t={t} />)}
                  {!bills.length && <div style={{ textAlign: "center", padding: 40, color: t.sub }}>No bills yet — add one to get started!</div>}
                </div>
              </div>
            </div>
          )}
          {tab === "calendar" && <CalendarView bills={bills} t={t} />}
          {tab === "insights" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ fontSize: 32 }}>🤖</div><div><h3 style={{ fontFamily: "'Fredoka'", color: t.text, margin: 0, fontSize: 20 }}>Smart Suggestions</h3><p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Tips based on your bills</p></div></div>
              {suggestions.map((s, i) => (
                <div key={i} style={{ background: t.card, borderRadius: 20, padding: "18px 22px", boxShadow: t.cs, borderLeft: `4px solid ${s.priority === "high" ? "#FF6B6B" : s.priority === "medium" ? "#FDCB6E" : "#4ECDC4"}` }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ fontSize: 26 }}>{s.icon}</div>
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 4 }}>{s.title}</div><div style={{ fontSize: 13, color: t.sub, lineHeight: 1.6 }}>{s.desc}</div></div>
                    <div style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: s.priority === "high" ? t.priH : s.priority === "medium" ? t.priM : t.priL, color: s.priority === "high" ? "#FF6B6B" : s.priority === "medium" ? "#F39C12" : "#4ECDC4", textTransform: "uppercase" }}>{s.priority}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === "charts" && <SpendingChart bills={bills} t={t} />}
          {tab === "history" && <HistoryView history={history} months={hMonths} filter={hFilter} setFilter={setHFilter} t={t} />}
          {tab === "reminders" && <RemindersView bills={bills} onUpdate={updateReminder} t={t} />}
        </>)}
      </div>
      {showAdd && <AddBillModal onClose={() => setShowAdd(false)} onAdd={addBill} t={t} />}
    </div>
  );
}
