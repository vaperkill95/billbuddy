import React, { useState, useEffect, useCallback } from "react";
import { api } from "./api";

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
  { value: "none", label: "No reminder" },
  { value: "sameday", label: "Day of" },
  { value: "1day", label: "1 day before" },
  { value: "3days", label: "3 days before" },
  { value: "1week", label: "1 week before" },
];

function getCatColor(n) { return CATEGORIES.find(c => c.name === n)?.color || "#ccc"; }
function getCatIcon(n) { return CATEGORIES.find(c => c.name === n)?.icon || "📋"; }
function formatMoney(n) { return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function reminderLabel(v) { return REMINDER_OPTIONS.find(r => r.value === v)?.label || "No reminder"; }
function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfMonth(y, m) { return new Date(y, m, 1).getDay(); }

function useTheme(dark) {
  return {
    bg: dark ? "linear-gradient(180deg, #1A1A2E 0%, #16213E 40%, #0F3460 100%)" : "linear-gradient(180deg, #F5F3FF 0%, #FFF5F5 40%, #F0FFFE 100%)",
    card: dark ? "#1E2A45" : "white",
    cs: dark ? "0 4px 24px rgba(0,0,0,0.3)" : "0 4px 24px rgba(0,0,0,0.06)",
    text: dark ? "#E8E8F0" : "#2D3436",
    sub: dark ? "#8A8AA0" : "#888",
    muted: dark ? "#6A6A80" : "#aaa",
    border: dark ? "#2A3A5C" : "#eee",
    input: dark ? "#162036" : "white",
    rowBg: dark ? "#1E2A45" : "white",
    rowPaid: dark ? "#1A2E2A" : "#F8FFF8",
    rowOver: dark ? "#2E1A1A" : "#FFF5F5",
    tag: dark ? "#2A2A50" : "#EEF2FF",
    prog: dark ? "#2A3A5C" : "#F0F0F5",
    header: dark ? "linear-gradient(135deg, #3D2E7C, #5A4BAF, #2E5E9E)" : "linear-gradient(135deg, #6C5CE7, #A29BFE, #74B9FF)",
    tab: dark ? "#162036" : "white",
    tabS: dark ? "0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.08)",
    modal: dark ? "#1A2540" : "white",
    bubble: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
    cell: dark ? "#162036" : "#FAFAFA",
    today: dark ? "#6C5CE730" : "#6C5CE720",
    pill: dark ? "#2A2A50" : "#F0F0F5",
    priH: dark ? "#3D1A1A" : "#FFF0F0",
    priM: dark ? "#3D3A1A" : "#FFFDF0",
    priL: dark ? "#1A3D2A" : "#F0FFF0",
    hOk: dark ? "#1A2E2A" : "#F0FFF4",
    hLate: dark ? "#2E1A1A" : "#FFF5F5",
    over: dark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.4)",
  };
}

function getSmartSuggestions(bills) {
  const s = [];
  const tot = bills.reduce((a, b) => a + b.amount, 0);
  const subs = bills.filter(b => b.category === "Subscriptions");
  const subT = subs.reduce((a, b) => a + b.amount, 0);
  const unpaid = bills.filter(b => !b.isPaid);
  const day = new Date().getDate();
  const soon = unpaid.filter(b => b.dueDate - day <= 5 && b.dueDate - day > 0);
  const noRem = bills.filter(b => !b.reminder || b.reminder === "none");

  if (subT > 50) s.push({ icon: "💰", title: "Subscription Audit", desc: `You're spending ${formatMoney(subT)}/mo on ${subs.length} subscriptions. Canceling one could save ~${formatMoney(subT / subs.length)}/mo.`, priority: "high" });
  if (soon.length > 0) s.push({ icon: "⚡", title: "Bills Due Soon", desc: `${soon.length} bill${soon.length > 1 ? "s" : ""} due in 5 days totaling ${formatMoney(soon.reduce((a, b) => a + b.amount, 0))}. Make sure funds are ready!`, priority: "high" });
  if (noRem.length > 0) s.push({ icon: "🔔", title: "Set Up Reminders", desc: `${noRem.length} bill${noRem.length > 1 ? "s have" : " has"} no reminders. Head to Reminders to stay on track.`, priority: "high" });
  if (tot > 2000) s.push({ icon: "📊", title: "Budget Check", desc: `Monthly bills total ${formatMoney(tot)}. The 50/30/20 rule suggests keeping fixed costs under 50% of income.`, priority: "medium" });
  s.push({ icon: "🔄", title: "Autopay Savings", desc: "Set up autopay for recurring bills to avoid late fees. Many providers offer a discount for autopay.", priority: "low" });
  s.push({ icon: "📞", title: "Negotiate Bills", desc: "Call your providers once a year to negotiate rates. Mentioning competitors can save 10-20%.", priority: "medium" });
  if (bills.filter(b => b.category === "Insurance").length > 1) s.push({ icon: "🛡️", title: "Bundle Insurance", desc: "Multiple insurance bills? Bundling could save 15-25% on premiums.", priority: "medium" });
  return s;
}

// ─── Sub-components ───

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
  const day = new Date().getDate();
  const d = bill.dueDate - day;
  const over = d < 0 && !bill.isPaid;
  const soon = d >= 0 && d <= 3 && !bill.isPaid;

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
  const dim = getDaysInMonth(cy, cm);
  const fd = getFirstDayOfMonth(cy, cm);
  const now = new Date();
  const isCur = cm === now.getMonth() && cy === now.getFullYear();
  const cells = [];
  for (let i = 0; i < fd; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);

  return (
    <div style={{ background: t.card, borderRadius: 20, padding: 28, boxShadow: t.cs }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button onClick={() => { if (cm === 0) { setCm(11); setCy(cy - 1); } else setCm(cm - 1); }} style={{ background: t.pill, border: "none", borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 16, fontWeight: 700, color: t.text }}>‹</button>
        <div style={{ fontWeight: 800, fontSize: 18, fontFamily: "'Fredoka', sans-serif", color: t.text }}>{MONTHS[cm]} {cy}</div>
        <button onClick={() => { if (cm === 11) { setCm(0); setCy(cy + 1); } else setCm(cm + 1); }} style={{ background: t.pill, border: "none", borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 16, fontWeight: 700, color: t.text }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: t.muted, padding: "4px 0", textTransform: "uppercase" }}>{d}</div>)}
        {cells.map((day, i) => {
          const db = day ? bills.filter(b => b.dueDate === day) : [];
          const isT = isCur && day === now.getDate();
          return (
            <div key={i} style={{ minHeight: 52, borderRadius: 10, padding: 4, background: isT ? t.today : day ? t.cell : "transparent", border: isT ? "2px solid #6C5CE7" : "2px solid transparent" }}>
              {day && <>
                <div style={{ fontSize: 12, fontWeight: isT ? 800 : 500, color: isT ? "#6C5CE7" : t.sub, textAlign: "right", padding: "0 2px" }}>{day}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                  {db.map(b => <div key={b.id} title={`${b.name} - ${formatMoney(b.amount)}`} style={{ width: "100%", height: 6, borderRadius: 3, background: b.isPaid ? "#4ECDC4" : getCatColor(b.category), opacity: b.isPaid ? 0.4 : 1 }} />)}
                </div>
              </>}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {CATEGORIES.map(c => bills.some(b => b.category === c.name) ? <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: t.sub }}><div style={{ width: 8, height: 8, borderRadius: 4, background: c.color }} />{c.name}</div> : null)}
      </div>
    </div>
  );
}

function SpendingChart({ bills, t }) {
  const ct = CATEGORIES.map(c => ({ ...c, total: bills.filter(b => b.category === c.name).reduce((s, b) => s + b.amount, 0) })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const mx = Math.max(...ct.map(c => c.total), 1);
  const tot = ct.reduce((s, c) => s + c.total, 0);
  let cum = 0;
  const sl = ct.map(c => { const a = (c.total / tot) * 360; const st = cum; cum += a; return { ...c, sa: st, ea: cum }; });
  const p2c = (cx, cy, r, a) => { const rd = ((a - 90) * Math.PI) / 180; return { x: cx + r * Math.cos(rd), y: cy + r * Math.sin(rd) }; };
  const arc = (cx, cy, r, sa, ea) => { const s = p2c(cx, cy, r, ea); const e = p2c(cx, cy, r, sa); return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${ea - sa > 180 ? 1 : 0} 0 ${e.x} ${e.y} Z`; };

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
          {ct.map(c => (
            <div key={c.name}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.sub }}>{c.icon} {c.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{formatMoney(c.total)}</span>
              </div>
              <div style={{ height: 8, background: t.prog, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${c.color}, ${c.color}CC)`, width: `${(c.total / mx) * 100}%`, transition: "width 0.5s" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HistoryView({ history, historyMonths, filter, setFilter, t }) {
  const filtered = filter === "all" ? history : history.filter(h => h.month === filter);
  const totP = filtered.reduce((s, h) => s + h.amount, 0);
  const late = filtered.filter(h => h.status === "late").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <div style={{ fontSize: 32 }}>📜</div>
        <div>
          <h3 style={{ fontFamily: "'Fredoka', sans-serif", color: t.text, margin: 0, fontSize: 20 }}>Payment History</h3>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Track what you've paid and when</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setFilter("all")} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: filter === "all" ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : t.pill, color: filter === "all" ? "white" : t.sub, fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>All</button>
        {historyMonths.map(m => <button key={m} onClick={() => setFilter(m)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: filter === m ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : t.pill, color: filter === m ? "white" : t.sub, fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{m}</button>)}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 150 }}>
          <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Total Paid</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#4ECDC4", fontFamily: "'Fredoka', sans-serif", marginTop: 2 }}>{formatMoney(totP)}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 150 }}>
          <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Payments</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.text, fontFamily: "'Fredoka', sans-serif", marginTop: 2 }}>{filtered.length}</div>
        </div>
        <div style={{ background: t.card, borderRadius: 16, padding: "16px 22px", boxShadow: t.cs, flex: 1, minWidth: 150 }}>
          <div style={{ fontSize: 11, color: t.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Late</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: late > 0 ? "#FF6B6B" : "#4ECDC4", fontFamily: "'Fredoka', sans-serif", marginTop: 2 }}>{late}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(h => (
          <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: h.status === "on-time" ? t.hOk : t.hLate, borderRadius: 14, boxShadow: t.cs, borderLeft: `4px solid ${h.status === "on-time" ? "#4ECDC4" : "#FF6B6B"}` }}>
            <div style={{ fontSize: 20, flexShrink: 0 }}>{getCatIcon(h.category)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{h.billName}</div>
              <div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>Paid {h.paidDate} · {h.category}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: t.text, fontFamily: "'Fredoka', sans-serif" }}>{formatMoney(h.amount)}</div>
              <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2, padding: "2px 8px", borderRadius: 6, display: "inline-block", background: h.status === "on-time" ? "#4ECDC420" : "#FF6B6B20", color: h.status === "on-time" ? "#4ECDC4" : "#FF6B6B" }}>{h.status === "on-time" ? "ON TIME" : "LATE"}</div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: t.sub, fontSize: 14 }}>No payment history yet</div>}
      </div>
    </div>
  );
}

function RemindersView({ bills, onUpdate, t }) {
  const [toast, setToast] = useState(null);
  const handle = (id, val) => {
    onUpdate(id, val);
    const b = bills.find(x => x.id === id);
    if (val !== "none") { setToast(`🔔 Reminder set for ${b?.name}: ${reminderLabel(val)}`); setTimeout(() => setToast(null), 2500); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <div style={{ fontSize: 32 }}>🔔</div>
        <div>
          <h3 style={{ fontFamily: "'Fredoka', sans-serif", color: t.text, margin: 0, fontSize: 20 }}>Notification Reminders</h3>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Set reminders so you never miss a due date</p>
        </div>
      </div>
      {toast && <div style={{ background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", color: "white", padding: "12px 20px", borderRadius: 14, fontWeight: 700, fontSize: 14, boxShadow: "0 6px 20px rgba(78,205,196,0.3)" }}>{toast}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {bills.map(bill => (
          <div key={bill.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: t.card, borderRadius: 16, boxShadow: t.cs, borderLeft: `4px solid ${getCatColor(bill.category)}` }}>
            <div style={{ fontSize: 20, flexShrink: 0 }}>{getCatIcon(bill.category)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: t.text, fontSize: 14 }}>{bill.name}</div>
              <div style={{ fontSize: 11, color: t.sub, marginTop: 2 }}>Due on the {bill.dueDate}th · {formatMoney(bill.amount)}</div>
            </div>
            <select value={bill.reminder || "none"} onChange={e => handle(bill.id, e.target.value)} style={{ padding: "8px 14px", borderRadius: 10, border: `2px solid ${bill.reminder && bill.reminder !== "none" ? "#4ECDC4" : t.border}`, background: bill.reminder && bill.reminder !== "none" ? "#4ECDC410" : t.input, color: t.text, fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", outline: "none" }}>
              {REMINDER_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div style={{ background: t.card, borderRadius: 16, padding: "18px 22px", boxShadow: t.cs, marginTop: 4 }}>
        <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 10 }}>Reminder Overview</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {REMINDER_OPTIONS.map(r => {
            const c = bills.filter(b => (b.reminder || "none") === r.value).length;
            return <div key={r.value} style={{ padding: "8px 16px", borderRadius: 10, background: r.value === "none" ? t.pill : "#4ECDC415", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 800, color: r.value === "none" ? t.sub : "#4ECDC4", fontSize: 16, fontFamily: "'Fredoka', sans-serif" }}>{c}</span>
              <span style={{ fontSize: 12, color: t.sub, fontWeight: 600 }}>{r.label}</span>
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}

function AddBillModal({ onClose, onAdd, t }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState("Other");
  const [isRecurring, setIsRecurring] = useState(true);
  const [reminder, setReminder] = useState("1day");
  const [saving, setSaving] = useState(false);

  const is = { width: "100%", padding: "12px 16px", borderRadius: 12, border: `2px solid ${t.border}`, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", background: t.input, color: t.text };

  const handleAdd = async () => {
    if (!name || !amount || !dueDate) return;
    setSaving(true);
    await onAdd({ name, amount: parseFloat(amount), dueDate: parseInt(dueDate), category, isRecurring, reminder });
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: t.over, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: t.modal, borderRadius: 24, padding: 32, width: "90%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 24px", fontFamily: "'Fredoka', sans-serif", color: t.text, fontSize: 22 }}>➕ Add New Bill</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Bill Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Electric Bill" style={is} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Amount ($)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={is} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Due Date (Day)</label>
              <input type="number" min="1" max="31" value={dueDate} onChange={e => setDueDate(e.target.value)} placeholder="15" style={is} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Category</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {CATEGORIES.map(c => <button key={c.name} onClick={() => setCategory(c.name)} style={{ padding: "8px 12px", borderRadius: 10, border: "2px solid", borderColor: category === c.name ? c.color : t.border, background: category === c.name ? c.color + "15" : "transparent", cursor: "pointer", fontSize: 12, fontWeight: 700, color: category === c.name ? c.color : t.sub }}>{c.icon} {c.name}</button>)}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: t.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Reminder</label>
            <select value={reminder} onChange={e => setReminder(e.target.value)} style={{ ...is, cursor: "pointer" }}>
              {REMINDER_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <div onClick={() => setIsRecurring(!isRecurring)} style={{ width: 22, height: 22, borderRadius: 6, border: isRecurring ? "none" : `2px solid ${t.border}`, background: isRecurring ? "#6C5CE7" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{isRecurring && "✓"}</div>
            <span style={{ fontSize: 14, fontWeight: 600, color: t.sub }}>Recurring monthly bill</span>
          </label>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "14px", borderRadius: 14, border: `2px solid ${t.border}`, background: t.card, cursor: "pointer", fontWeight: 700, fontSize: 14, color: t.sub, fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
            <button onClick={handleAdd} disabled={saving} style={{ flex: 2, padding: "14px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14, boxShadow: "0 4px 16px #6C5CE740", fontFamily: "'DM Sans', sans-serif", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Add Bill"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ───

export default function App() {
  const [bills, setBills] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyMonths, setHistoryMonths] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [showAdd, setShowAdd] = useState(false);
  const [dark, setDark] = useState(false);
  const [hFilter, setHFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const t = useTheme(dark);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [b, h, m] = await Promise.all([
        api.getBills(),
        api.getHistory(),
        api.getHistoryMonths(),
      ]);
      setBills(b);
      setHistory(h);
      setHistoryMonths(m);
      setError(null);
    } catch (err) {
      console.error("Load error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const togglePaid = async (bill) => {
    try {
      const newPaid = !bill.isPaid;
      await api.updateBill(bill.id, { isPaid: newPaid });
      if (newPaid) {
        await api.recordPayment({ billName: bill.name, amount: bill.amount, category: bill.category, dueDate: bill.dueDate });
        const [h, m] = await Promise.all([api.getHistory(), api.getHistoryMonths()]);
        setHistory(h);
        setHistoryMonths(m);
      }
      setBills(prev => prev.map(b => b.id === bill.id ? { ...b, isPaid: newPaid } : b));
    } catch (err) { console.error("Toggle error:", err); }
  };

  const deleteBill = async (id) => {
    try {
      await api.deleteBill(id);
      setBills(prev => prev.filter(b => b.id !== id));
    } catch (err) { console.error("Delete error:", err); }
  };

  const addBill = async (bill) => {
    try {
      const created = await api.createBill(bill);
      setBills(prev => [...prev, created]);
      setShowAdd(false);
    } catch (err) { console.error("Add error:", err); }
  };

  const updateReminder = async (id, val) => {
    try {
      await api.updateBill(id, { reminder: val });
      setBills(prev => prev.map(b => b.id === id ? { ...b, reminder: val } : b));
    } catch (err) { console.error("Reminder error:", err); }
  };

  const totalMonthly = bills.reduce((s, b) => s + b.amount, 0);
  const totalPaid = bills.filter(b => b.isPaid).reduce((s, b) => s + b.amount, 0);
  const totalUnpaid = bills.filter(b => !b.isPaid).reduce((s, b) => s + b.amount, 0);
  const paidCount = bills.filter(b => b.isPaid).length;
  const suggestions = getSmartSuggestions(bills);

  const tabs = [
    { key: "dashboard", label: "Dashboard", icon: "📊" },
    { key: "calendar", label: "Calendar", icon: "📅" },
    { key: "insights", label: "AI Insights", icon: "🤖" },
    { key: "charts", label: "Charts", icon: "📈" },
    { key: "history", label: "History", icon: "📜" },
    { key: "reminders", label: "Reminders", icon: "🔔" },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💸</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.text, fontFamily: "'Fredoka', sans-serif" }}>Loading BillBuddy...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", padding: 20 }}>
        <div style={{ textAlign: "center", background: t.card, borderRadius: 24, padding: 40, boxShadow: t.cs, maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: t.text, fontFamily: "'Fredoka', sans-serif", marginBottom: 8 }}>Connection Error</div>
          <div style={{ fontSize: 14, color: t.sub, marginBottom: 20, lineHeight: 1.6 }}>Couldn't connect to the server. Make sure your backend is running.</div>
          <div style={{ fontSize: 12, color: "#FF6B6B", background: t.pill, padding: "8px 16px", borderRadius: 10, marginBottom: 20 }}>{error}</div>
          <button onClick={loadData} style={{ padding: "12px 32px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #6C5CE7, #A29BFE)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", background: t.bg, transition: "background 0.4s ease" }}>
      <style>{`select option { background: ${t.card}; color: ${t.text}; }`}</style>

      {/* Header */}
      <div style={{ background: t.header, padding: "28px 28px 56px", borderRadius: "0 0 36px 36px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 150, height: 150, borderRadius: "50%", background: t.bubble }} />
        <div style={{ position: "absolute", bottom: -20, left: 30, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
        <div style={{ position: "relative", maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontFamily: "'Fredoka', sans-serif", fontSize: 30, color: "white", fontWeight: 700 }}>💸 BillBuddy</h1>
              <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 4 }}>Your friendly bill manager</div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={() => setDark(!dark)} style={{ width: 48, height: 28, borderRadius: 14, border: "none", cursor: "pointer", background: dark ? "#4ECDC4" : "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", padding: "0 3px", transition: "background 0.3s" }}>
                <div style={{ width: 22, height: 22, borderRadius: 11, background: "white", boxShadow: "0 2px 6px rgba(0,0,0,0.2)", transform: dark ? "translateX(20px)" : "translateX(0)", transition: "transform 0.3s ease", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>{dark ? "🌙" : "☀️"}</div>
              </button>
              <button onClick={() => setShowAdd(true)} style={{ padding: "10px 20px", borderRadius: 14, border: "none", background: "rgba(255,255,255,0.2)", backdropFilter: "blur(10px)", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif" }}>
                <span style={{ fontSize: 16 }}>+</span> Add Bill
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ maxWidth: 960, margin: "-28px auto 0", padding: "0 12px", display: "flex", justifyContent: "center", position: "relative", zIndex: 10 }}>
        <div style={{ display: "inline-flex", gap: 3, background: t.tab, borderRadius: 16, padding: 5, boxShadow: t.tabS, flexWrap: "wrap", justifyContent: "center" }}>
          {tabs.map(tb => <button key={tb.key} onClick={() => setTab(tb.key)} style={{ padding: "9px 14px", borderRadius: 12, border: "none", background: tab === tb.key ? "linear-gradient(135deg, #6C5CE7, #A29BFE)" : "transparent", color: tab === tb.key ? "white" : t.sub, cursor: "pointer", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" }}>{tb.icon} {tb.label}</button>)}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 960, margin: "20px auto", padding: "0 16px 40px" }}>
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
                <span style={{ fontWeight: 800, color: "#6C5CE7", fontFamily: "'Fredoka', sans-serif" }}>{totalMonthly > 0 ? Math.round((totalPaid / totalMonthly) * 100) : 0}%</span>
              </div>
              <div style={{ height: 12, background: t.prog, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 6, background: "linear-gradient(90deg, #4ECDC4, #6C5CE7)", width: `${totalMonthly > 0 ? (totalPaid / totalMonthly) * 100 : 0}%`, transition: "width 0.5s" }} />
              </div>
            </div>
            <div>
              <h3 style={{ fontFamily: "'Fredoka', sans-serif", color: t.text, margin: "0 0 12px", fontSize: 18 }}>Your Bills</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {bills.sort((a, b) => a.dueDate - b.dueDate).map(bill => <BillRow key={bill.id} bill={bill} onToggle={togglePaid} onDelete={deleteBill} t={t} />)}
                {bills.length === 0 && <div style={{ textAlign: "center", padding: 40, color: t.sub }}>No bills yet — add one to get started!</div>}
              </div>
            </div>
          </div>
        )}
        {tab === "calendar" && <CalendarView bills={bills} t={t} />}
        {tab === "insights" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <div style={{ fontSize: 32 }}>🤖</div>
              <div>
                <h3 style={{ fontFamily: "'Fredoka', sans-serif", color: t.text, margin: 0, fontSize: 20 }}>Smart Suggestions</h3>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: t.sub }}>Personalized tips based on your bills</p>
              </div>
            </div>
            {suggestions.map((s, i) => (
              <div key={i} style={{ background: t.card, borderRadius: 20, padding: "18px 22px", boxShadow: t.cs, borderLeft: `4px solid ${s.priority === "high" ? "#FF6B6B" : s.priority === "medium" ? "#FDCB6E" : "#4ECDC4"}` }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 26, flexShrink: 0 }}>{s.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: t.text, fontSize: 14, marginBottom: 4 }}>{s.title}</div>
                    <div style={{ fontSize: 13, color: t.sub, lineHeight: 1.6 }}>{s.desc}</div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: s.priority === "high" ? t.priH : s.priority === "medium" ? t.priM : t.priL, color: s.priority === "high" ? "#FF6B6B" : s.priority === "medium" ? "#F39C12" : "#4ECDC4", flexShrink: 0, textTransform: "uppercase" }}>{s.priority}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "charts" && <SpendingChart bills={bills} t={t} />}
        {tab === "history" && <HistoryView history={history} historyMonths={historyMonths} filter={hFilter} setFilter={setHFilter} t={t} />}
        {tab === "reminders" && <RemindersView bills={bills} onUpdate={updateReminder} t={t} />}
      </div>

      {showAdd && <AddBillModal onClose={() => setShowAdd(false)} onAdd={addBill} t={t} />}
    </div>
  );
}
