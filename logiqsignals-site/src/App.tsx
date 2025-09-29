import React, { useEffect, useMemo, useState } from "react";

type Row = { symbol: string; note?: string; score?: number };

async function fetchJSON(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function normalize(raw: any): Row[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(toRow);
  if (Array.isArray(raw?.records)) return raw.records.map(toRow);
  if (Array.isArray(raw?.data)) return raw.data.map(toRow);
  if (Array.isArray(raw?.values)) return raw.values.map(toRow);
  return [];
}

function toRow(r: any): Row {
  const symbol = String(r.ticker ?? r.symbol ?? r.SYMBOL ?? "");
  const note = String(r.note ?? r.strategy ?? r.action ?? r.timeframe ?? "") || undefined;
  let score: number | undefined = undefined;
  if (typeof r.prob === "number") score = r.prob <= 1 ? r.prob * 100 : r.prob;
  if (typeof r.score === "number") score = r.score;
  if (typeof r.weekly_change === "number") score = r.weekly_change * 100; // crypto movers
  return { symbol, note, score };
}

function toCSV(rows: Row[]): string {
  const header = ["symbol", "note", "score"].join(",");
  const body = rows
    .map((r) => [r.symbol, JSON.stringify(r.note ?? ""), r.score ?? ""].join(","))
    .join("\n");
  return header + "\n" + body;
}

// demo fallback so page never looks blank
const DEMO = {
  intraday: [
    { symbol: "BTC-USD", note: "ORB + EMA20", score: 72 },
    { symbol: "ETH-USD", note: "EMA10/20 cross", score: 66 },
  ],
  swing: [{ symbol: "LINK-USD", note: "EMA20 retest", score: 68 }],
  crypto: [
    { symbol: "ARB-USD", note: "+7d", score: 22 },
    { symbol: "ADA-USD", note: "-7d", score: -4 },
  ],
};

export default function App() {
  const [tab, setTab] = useState<"intraday" | "swing" | "crypto">("intraday");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    let url = "/signals.json";
    if (tab === "swing") url = "/signals_swing.json";
    if (tab === "crypto") url = "/crypto_movers.json";
    const raw = await fetchJSON(url);
    const data = normalize(raw);
    setRows(data.length ? data : DEMO[tab]); // auto-demo if empty
    setLoading(false);
  };

  useEffect(() => { load(); }, [tab]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows || []).filter((r) => !term || r.symbol.toLowerCase().includes(term));
  }, [rows, q]);

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: 24, fontFamily: "system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif" }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img
          src="/logo.png"
          alt="Logo"
          style={{
            width: 96,
            height: 96,
            animation: "pulse 2s infinite",
            filter: "brightness(1.2) drop-shadow(0 0 12px rgba(255,215,0,0.28))",
            borderRadius: 12
          }}
        />
        <h1
          style={{
            fontSize: 36,
            fontWeight: 800,
            background: "linear-gradient(90deg,#ffd700,#f79d00,#d977ff)",
            WebkitBackgroundClip: "text",
            color: "transparent",
            margin: 0,
          }}
        >
          Logiq Signals
        </h1>
      </header>

      {/* Tabs + Controls */}
      <nav style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {["intraday", "swing", "crypto"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as any)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #3f3f46",
              background: tab === t ? "linear-gradient(90deg,#ffd700,#f79d00)" : "rgba(24,24,27,.7)",
              color: tab === t ? "#000" : "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {t.toUpperCase()}
          </button>
        ))}

        <input
          placeholder="Search symbol…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            marginLeft: "auto",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #3f3f46",
            background: "rgba(9,9,11,.6)",
            color: "#fff",
            outline: "none",
            minWidth: 180,
          }}
        />
        <button
          onClick={load}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #3f3f46", background: "rgba(24,24,27,.7)", color: "#fff", cursor: "pointer" }}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button
          onClick={() => {
            const blob = new Blob([toCSV(filtered)], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${tab}.csv`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 500);
          }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #3f3f46", background: "rgba(24,24,27,.7)", color: "#fff", cursor: "pointer" }}
        >
          Export CSV
        </button>
      </nav>

      {/* Cards */}
      <main style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
        {filtered.map((r) => (
          <div key={r.symbol} style={{ border: "1px solid rgba(63,63,70,.8)", background: "rgba(24,24,27,.7)", padding: 16, borderRadius: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <strong>{r.symbol}</strong>
              <span style={{ fontSize: 12, fontWeight: 700, color: (r.score ?? 0) >= 60 ? "#34d399" : "#f87171" }}>
                {r.score != null ? `${r.score.toFixed(1)}%` : ""}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#a1a1aa" }}>{r.note || "—"}</div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ border: "1px solid rgba(63,63,70,.8)", background: "rgba(24,24,27,.7)", padding: 20, borderRadius: 14, textAlign: "center", gridColumn: "1/-1" }}>
            No results. Clear search or refresh.
          </div>
        )}
      </main>

      {/* pulse keyframes */}
      <style>
        {`@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.9}}`}
      </style>
    </div>
  );
}
