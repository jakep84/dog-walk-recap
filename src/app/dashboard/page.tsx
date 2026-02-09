// src/app/dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";

type WalkDoc = {
  id: string;
  dogs?: string;
  durationMinutes?: number;
  distanceMiles?: number;
  weatherSummary?: string;
  tempF?: number | null;
  amountDue?: number | null; // IMPORTANT: this must exist in your walk docs to sum earnings
  createdAt?: any; // Firestore Timestamp
  recapImageUrl?: string; // optional if you store it
};

function toDateSafe(ts: any): Date | null {
  try {
    if (!ts) return null;
    if (typeof ts?.toDate === "function") return ts.toDate();
  } catch {}
  return null;
}

// Returns the most recent Friday 00:00 local time
function startOfPayWeek(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);

  // JS: Sunday=0 ... Friday=5
  const day = d.getDay();
  const daysSinceFriday = (day - 5 + 7) % 7;
  d.setDate(d.getDate() - daysSinceFriday);
  return d;
}

function endOfPayWeek(start: Date): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + 7);
  return d;
}

function fmtMoney(n: number) {
  return `$${n.toFixed(2)}`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDateTime(d: Date) {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DashboardPage() {
  const [walks, setWalks] = useState<WalkDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Calendar month selector
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setErr("");

        const qy = query(collection(db, "walks"), orderBy("createdAt", "desc"));
        const snap = await getDocs(qy);

        const out: WalkDoc[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          out.push({
            id: docSnap.id,
            ...data,
          });
        });

        if (!alive) return;
        setWalks(out);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load walks.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const payStart = useMemo(() => startOfPayWeek(new Date()), []);
  const payEnd = useMemo(() => endOfPayWeek(payStart), [payStart]);

  const payWeekWalks = useMemo(() => {
    return walks.filter((w) => {
      const d = toDateSafe(w.createdAt);
      if (!d) return false;
      return d >= payStart && d < payEnd;
    });
  }, [walks, payStart, payEnd]);

  const payTotal = useMemo(() => {
    return payWeekWalks.reduce((sum, w) => sum + (Number(w.amountDue) || 0), 0);
  }, [payWeekWalks]);

  // Calendar computation for selected month
  const calendar = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();

    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);

    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay()); // start Sunday

    const end = new Date(last);
    end.setDate(last.getDate() + (6 - last.getDay())); // end Saturday

    const days: Date[] = [];
    const cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    while (cur <= end) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }

    // Aggregate walks by day
    const dayKey = (d: Date) =>
      `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

    const byDay = new Map<string, { count: number; total: number }>();
    for (const w of walks) {
      const d = toDateSafe(w.createdAt);
      if (!d) continue;
      const k = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      const cur = byDay.get(k) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(w.amountDue) || 0;
      byDay.set(k, cur);
    }

    return { days, byDay, month, year };
  }, [monthCursor, walks]);

  const monthLabel = useMemo(() => {
    return monthCursor.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }, [monthCursor]);

  const recent = useMemo(() => walks.slice(0, 50), [walks]);

  if (loading) {
    return (
      <div style={wrap}>
        <div style={title}>Dashboard</div>
        <div style={{ opacity: 0.7 }}>Loading…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div style={wrap}>
        <div style={title}>Dashboard</div>
        <div style={{ color: "#ffb4b4" }}>Error: {err}</div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={headerRow}>
        <div>
          <div style={title}>SmartWalk Dashboard</div>
          <div style={sub}>
            Pay week: <b>{fmtDate(payStart)}</b> → <b>{fmtDate(payEnd)}</b>
          </div>
        </div>

        <div style={kpiCard}>
          <div style={{ opacity: 0.75, fontWeight: 800, fontSize: 12 }}>
            Earned this pay week
          </div>
          <div style={{ fontSize: 32, fontWeight: 900 }}>
            {fmtMoney(payTotal)}
          </div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            Walks: {payWeekWalks.length}
          </div>
        </div>
      </div>

      <div style={grid}>
        {/* Calendar */}
        <div style={card}>
          <div style={cardHeader}>
            <div style={cardTitle}>Monthly Calendar</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={btn}
                onClick={() => {
                  const d = new Date(monthCursor);
                  d.setMonth(d.getMonth() - 1);
                  setMonthCursor(d);
                }}
              >
                ◀
              </button>
              <div
                style={{
                  fontWeight: 900,
                  opacity: 0.85,
                  minWidth: 180,
                  textAlign: "center",
                }}
              >
                {monthLabel}
              </div>
              <button
                style={btn}
                onClick={() => {
                  const d = new Date(monthCursor);
                  d.setMonth(d.getMonth() + 1);
                  setMonthCursor(d);
                }}
              >
                ▶
              </button>
            </div>
          </div>

          <div style={dowRow}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} style={dow}>
                {d}
              </div>
            ))}
          </div>

          <div style={calGrid}>
            {calendar.days.map((d) => {
              const inMonth = d.getMonth() === calendar.month;
              const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
              const agg = calendar.byDay.get(key);
              return (
                <div
                  key={key}
                  style={{ ...dayCell, opacity: inMonth ? 1 : 0.35 }}
                >
                  <div style={dayNum}>{d.getDate()}</div>
                  {agg ? (
                    <div style={pill}>
                      <div>
                        <b>{agg.count}</b> walk{agg.count === 1 ? "" : "s"}
                      </div>
                      <div style={{ opacity: 0.8 }}>{fmtMoney(agg.total)}</div>
                    </div>
                  ) : (
                    <div style={{ height: 28 }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Walk list */}
        <div style={card}>
          <div style={cardHeader}>
            <div style={cardTitle}>All Walks</div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Showing latest 50</div>
          </div>

          <div style={list}>
            {recent.map((w) => {
              const d = toDateSafe(w.createdAt);
              const when = d ? fmtDateTime(d) : "—";
              const due = Number(w.amountDue) || 0;

              return (
                <div key={w.id} style={row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900 }}>
                      {w.dogs || "Walk"}{" "}
                      <span
                        style={{ opacity: 0.65, fontWeight: 700, fontSize: 12 }}
                      >
                        ({when})
                      </span>
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 13, marginTop: 4 }}>
                      {w.durationMinutes ?? 0} min •{" "}
                      {(w.distanceMiles ?? 0).toFixed(2)} mi
                      {w.weatherSummary ? ` • ${w.weatherSummary}` : ""}
                    </div>
                  </div>

                  {/* Internal-only money display */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900 }}>{fmtMoney(due)}</div>
                    <div style={{ opacity: 0.6, fontSize: 12 }}>earned</div>
                  </div>
                </div>
              );
            })}

            {recent.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No walks yet.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// Styles
const wrap: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0b0b0c",
  color: "white",
  padding: 18,
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "flex-start",
  marginBottom: 16,
};

const title: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 950,
};

const sub: React.CSSProperties = {
  marginTop: 6,
  opacity: 0.75,
  fontSize: 13,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.1fr 0.9fr",
  gap: 14,
};

const card: React.CSSProperties = {
  borderRadius: 18,
  padding: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
  overflow: "hidden",
  minHeight: 200,
};

const cardHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 10,
};

const cardTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
};

const kpiCard: React.CSSProperties = {
  borderRadius: 16,
  padding: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  minWidth: 260,
};

const btn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.05)",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const dowRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 8,
  marginBottom: 8,
};

const dow: React.CSSProperties = {
  opacity: 0.65,
  fontWeight: 800,
  fontSize: 12,
  textAlign: "center",
};

const calGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 8,
};

const dayCell: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(0,0,0,0.15)",
  padding: 10,
  minHeight: 78,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const dayNum: React.CSSProperties = {
  fontWeight: 950,
  fontSize: 14,
  opacity: 0.9,
};

const pill: React.CSSProperties = {
  borderRadius: 10,
  padding: "8px 10px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
  fontSize: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
};

const list: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  maxHeight: "75vh",
  overflow: "auto",
  paddingRight: 6,
};

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(0,0,0,0.18)",
};
