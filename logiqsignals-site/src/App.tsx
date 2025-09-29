import React, { useEffect, useMemo, useState } from "react";

/** Interactive + Safe:
 *  - Tabs (Intraday / Swing / Crypto)
 *  - Search
 *  - Manual Refresh
 *  - Auto-Refresh (toggle)
 *  - Watchlist (★) saved to localStorage + “Watch Only” filter
 *  - Pagination (12/page)
 *  - Card click → Detail Drawer with quick links (TradingView / Yahoo / CMC)
 *  - Auto-demo when feeds are empty so UI never looks dead
 */

type Row = { symbol: string; note?: string; score?: number; raw?: any };

// ---------- helpers ----------
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
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.records)
    ? raw.records
    : Array.isArray(raw?.data)
    ? raw.data
    : Array.isArray(raw?.values)
    ? raw.values
    : [];
  return arr.map(toRow);
}

function toRow(r: any): Row {
  const symbol = String(r.ticker ?? r.symbol ?? r.SYMBOL ?? "");
  const note =
    (r.note ?? r.strategy ?? r.action ?? r.timeframe ?? "") || undefined;
  let score: number | undefined = undefined;
  if (typeof r.prob === "number") score = r.prob <= 1 ? r.prob * 100 : r.prob;
  if (typeof r.score === "number") score = r.score;
  if (typeof r.weekly_change === "number") score = r.weekly_change * 100; // crypto movers
  return { symbol, note, score, raw: r };
}

function pct(n?: number) {
  return n == null ? "" : `${n.toFixed(1)}%`;
}

const tvLink = (sym: string) =>
  sym.includes("-USD")
    ? `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym)}`
    : `https://www.tradingview.com/symbols/${encodeURIComponent(sym)}`;
const cmcLink = (sym: string) =>
  `https://coinmarketcap.com/currencies/${sym.replace("-USD", "")}/`;
const yfLink = (sym: string) =>
  `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}`;

// watchlist storage
const LSKEY = "logiq_watchlist";
const loadWatch = () => {
  try {
    return JSON.parse(localStorage.getItem(LSKEY) || "[]") as string[];
  } catch {
    return [];
  }
};
const saveWatch = (arr: string[]) =>
  localStorage.setItem(LSKEY, JSON.stringify(arr));

// CSV export
function toCSV(rows: Row[]): string {
  const header = ["symbol", "note", "score"].join(",");
  const body = rows
    .map((r) => [r.symbol, JSON.stringify(r.note ?? ""), r.score ?? ""].join(","))
    .join("\n"); // <- keep on one line to avoid string errors
  return header + "\n" + body;
}

// demo fallback (so UI never looks empty)
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

// ---------- Drawer ----------
function Drawer({
  row,
  onClose,
}: {
  row: Row | null;
  onClose: () => void;
}) {
  if (!row) return null;
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: "min(520px,92vw)",
          height: "100%",
          background: "#0b0b0c",
          borderLeft: "1px solid #27272a",
          padding: 18,
          color: "#fff",
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>{row.symbol}</h3>
          <button
            onClick={onClose}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #3f3f46",
              background: "rgba(24,24,27,.7)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "120px 1fr",
            rowGap: 8,
            columnGap: 10,
            marginBottom: 12,
          }}
        >
          <div style={{ color: "#a1a1aa" }}>Confidence</div>
          <div style={{ fontWeight: 700 }}>{pct(row.score)}</div>
          <div style={{ color: "#a1a1aa" }}>Note</div>
          <div>{row.note || "—"}</div>
        </div>

        <div style={{ marginBottom: 10, color: "#a1a1aa" }}>Quick Links</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <a
            href={tvLink(row.symbol)}
            target="_blank"
            rel="noreferrer"
            style={btn()}
          >
            TradingView
          </a>
          <a href={yfLink(row.symbol)} target="_blank" rel="noreferrer" style={btn()}>
            Yahoo Finance
          </a>
          {row.symbol.includes("-USD") && (
            <a
              href={cmcLink(row.symbol)}
              target="_blank"
              rel="noreferrer"
              style={btn()}
            >
              CoinMarketCap
            </a>
          )}
          <button
            style={btn()}
            onClick={() => navigator.clipboard.writeText(row.symbol)}
          >
            Copy Symbol
          </button>
        </div>

        <div style={{ marginBottom: 6, color: "#a1a1aa" }}>Raw</div>
        <pre
          style={{
            background: "#0f0f12",
            border: "1px solid #27272a",
            borderRadius: 12,
            padding: 12,
            maxHeight: 300,
            overflow: "auto",
          }}
        >
{JSON.stringify(row.raw ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}

const btn = () => ({
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #3f3f46",
  background: "rgba(24,24,27,.7)",
  color: "#fff",
  cursor: "pointer",
});

// ---------- Main ----------
export default function App() {
  const [tab, setTab] = useState<"intraday" | "swing" | "crypto">("intraday");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const [auto, setAuto] = useState(true);
  const [watch, setWatch] = useState<string[]>(loadWatch());
  const [onlyWatch, setOnlyWatch] = useState(false);

  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [open, setOpen] = useState<Row | null>(null);

  const load = async () => {
    setLoading(true);
    let url = "/signals.json";
    if (tab === "swing") url = "/signals_swing.json";
    if (tab === "crypto") url = "/crypto_movers.json";
    const raw = await fetchJSON(url);
    const data = normalize(raw);
    setRows(data.length ? data : DEMO[tab]); // auto-demo if empty
    setLoading(false);
    setPage(1);
  };

  // initial + on tab change
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // auto-refresh
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, tab]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = rows.filter(
      (r) => !term || r.symbol.toLowerCase().includes(term)
    );
    if (onlyWatch) list = list.filter((r) => watch.includes(r.symbol));
    // sort by score desc (fallback to -inf when missing)
    list = list.sort((a, b) => (b.score ?? -1e9) - (a.score ?? -1e9));
    return list;
  }, [rows, q, onlyWatch, watch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleWatch = (sym: string) => {
    setWatch((prev) => {
      const next = prev.includes(sym)
        ? prev.filter((s) => s !== sym)
        : [...prev, sym];
      saveWatch(next);
      return next;
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 800px at 20% -10%, rgba(255,215,0,.10), transparent)," +
          "radial-gradient(1200px 800px at 80% 110%, rgba(147,51,234,.10), transparent), #000",
        color: "#fff",
        padding: 24,
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img
          src="/logo.png"
          alt="Logo"
          style={{
            width: 96,
            height: 96,
            animation: "pulse 2s infinite",
            filter:
              "brightness(1.2) drop-shadow(0 0 12px rgba(255,215,0,0.28))",
            borderRadius: 12,
            objectFit: "contain",
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
              background:
                tab === t ? "linear-gradient(90deg,#ffd700,#f79d00)" : "rgba(24,24,27,.7)",
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
        <button onClick={load} style={btn()}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button onClick={() => setAuto((v) => !v)} style={btn()}>
          Auto: {auto ? "On" : "Off"}
        </button>
        <button onClick={() => setOnlyWatch((v) => !v)} style={btn()}>
          {onlyWatch ? "Watch: Only" : "Watch: All"}
        </button>
        <button
          onClick={() => {
            const csv = toCSV(filtered);
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${tab}.csv`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 500);
          }}
          style={btn()}
        >
          Export CSV
        </button>
      </nav>

      {/* Cards */}
      <main
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        {pageRows.map((r) => (
          <div
            key={r.symbol}
            onClick={() => setOpen(r)}
            style={{
              border: "1px solid rgba(63,63,70,.8)",
              background: "rgba(24,24,27,.7)",
              padding: 16,
              borderRadius: 14,
              cursor: "pointer",
            }}
            title="Open details"
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
                gap: 8,
              }}
            >
              <strong>{r.symbol}</strong>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: (r.score ?? 0) >= 60 ? "#34d399" : "#f87171",
                }}
              >
                {pct(r.score)}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 10 }}>
              {r.note || "—"}
            </div>
            {/* watch star */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ color: "#a1a1aa", fontSize: 12 }}>
                Click for details
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  toggleWatch(r.symbol);
                }}
                style={{ fontSize: 16, userSelect: "none", cursor: "pointer" }}
              >
                {watch.includes(r.symbol) ? "★" : "☆"}
              </span>
            </div>
          </div>
        ))}
        {pageRows.length === 0 && (
          <div
            style={{
              border: "1px solid rgba(63,63,70,.8)",
              background: "rgba(24,24,27,.7)",
              padding: 20,
              borderRadius: 14,
              textAlign: "center",
              gridColumn: "1/-1",
            }}
          >
            No results. Clear search or refresh.
          </div>
        )}
      </main>

      {/* Pager */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginTop: 14,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          style={btn()}
          disabled={page <= 1}
        >
          Prev
        </button>
        <span style={{ color: "#a1a1aa", fontSize: 12 }}>
          Page {page} / {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          style={btn()}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>

      {/* Drawer */}
      <Drawer row={open} onClose={() => setOpen(null)} />

      {/* pulse keyframes */}
      <style>
        {`@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.9}}`}
      </style>
    </div>
  );
}
