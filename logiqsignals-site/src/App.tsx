import React, { useEffect, useMemo, useRef, useState } from "react";

/** ---------- Types (loose to avoid TS build drama) ---------- */
type AnyRow = Record<string, any>;
type Feed<T = AnyRow> = { data: T[]; asof?: string };

/** ---------- Small utils ---------- */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (n?: number | string, p = 2) =>
  n === undefined || n === null || n === "" ? "—" : Number(n).toFixed(p);
const pct = (n?: number) =>
  n === undefined || n === null ? "—" : `${(n * 100).toFixed(1)}%`;
const kmb = (n?: number) => {
  if (typeof n !== "number" || isNaN(n)) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
};

async function fetchJSON<T = any>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** ---------- Confetti (tiny, dependency-free) ---------- */
function fireConfetti(container: HTMLElement) {
  const c = document.createElement("canvas");
  c.width = container.clientWidth;
  c.height = 180;
  c.style.position = "absolute";
  c.style.left = "0";
  c.style.right = "0";
  c.style.top = "0";
  c.style.pointerEvents = "none";
  container.appendChild(c);
  const ctx = c.getContext("2d")!;
  const pieces = Array.from({ length: 80 }, () => ({
    x: Math.random() * c.width,
    y: Math.random() * -40,
    r: 2 + Math.random() * 4,
    vx: -1 + Math.random() * 2,
    vy: 1 + Math.random() * 2,
    col: `hsl(${Math.floor(Math.random() * 360)}, 80%, 60%)`,
  }));
  let t = 0;
  const tick = () => {
    t++;
    ctx.clearRect(0, 0, c.width, c.height);
    pieces.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.03; // gravity
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.col;
      ctx.fill();
    });
    if (t < 220) requestAnimationFrame(tick);
    else container.removeChild(c);
  };
  tick();
}

/** ---------- Tabs ---------- */
type TabKey = "intraday" | "swing" | "crypto" | "options";
const TABS: { key: TabKey; label: string }[] = [
  { key: "intraday", label: "Intraday" },
  { key: "swing", label: "Swing" },
  { key: "crypto", label: "Crypto" },
  { key: "options", label: "Options" },
];

/** ---------- App ---------- */
export default function App() {
  const [tab, setTab] = useState<TabKey>("intraday");

  const [intraday, setIntraday] = useState<Feed>({ data: [] });
  const [swing, setSwing] = useState<Feed>({ data: [] });
  const [crypto, setCrypto] = useState<Feed>({ data: [] });
  const [options, setOptions] = useState<Feed>({ data: [] });

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadFeeds() {
    setLoading(true);
    setErr(null);
    try {
      const [a, b, c, d] = await Promise.all([
        fetchJSON("/signals.json").catch(() => ({ data: [] })),
        fetchJSON("/signals_swing.json").catch(() => ({ data: [] })),
        fetchJSON("/crypto_movers.json").catch(() => ({ data: [] })),
        fetchJSON("/options.json").catch(() => ({ data: [] })),
      ]);

      // normalize: if plain array, wrap as {data: [...]}
      setIntraday(Array.isArray(a) ? { data: a } : a);
      setSwing(Array.isArray(b) ? { data: b } : b);
      setCrypto(Array.isArray(c) ? { data: c } : c);
      setOptions(Array.isArray(d) ? { data: d } : d);
    } catch (e: any) {
      setErr(e?.message || "Failed to load feeds");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeeds();
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  const totals = useMemo(() => {
    const safeLen = (v: Feed) => (Array.isArray(v?.data) ? v.data.length : 0);
    return {
      intraday: safeLen(intraday),
      swing: safeLen(swing),
      crypto: safeLen(crypto),
      options: safeLen(options),
    };
  }, [intraday, swing, crypto, options]);

  async function handleBuy() {
    const host = containerRef.current;
    if (host) fireConfetti(host);
    await sleep(200);
    window.open("https://buy.stripe.com/test_abc123", "_blank", "noopener");
  }

  return (
    <div ref={containerRef} style={{ position: "relative", minHeight: "100vh" }}>
      <style>{css}</style>
      {/* Header */}
      <header className="hero">
        <div className="brand">
          <img src="/logo.png" alt="LogiqSignals" className="logo" />
          <div className="title">
            <span className="word">Logiq</span>
            <span className="word glow">Signals</span>
            <span className="tm">™</span>
          </div>
          <div className="tag">Trade clarity. Faster.</div>
        </div>

        <div className="cta">
          <button className="buy" onClick={handleBuy}>
            Start now – $29/mo
          </button>
          <button className="refresh" onClick={loadFeeds} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh data"}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="pill">{totals[t.key]}</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="content">
        {err && <div className="error">⚠️ {err}</div>}

        {tab === "intraday" && (
          <FeedGrid
            title="Intraday – ORB + EMA"
            rows={intraday.data}
            columns={[
              { key: "symbol", label: "Symbol" },
              { key: "timeframe", label: "TF", width: 90 },
              { key: "prob", label: "Score", render: (v) => pct(v) },
              { key: "entry", label: "Entry", render: fmt },
              { key: "stop", label: "Stop", render: fmt },
              { key: "targets", label: "Targets", render: (t: any[]) => (t?.length ? t.join(" • ") : "—") },
              { key: "note", label: "Note", width: 280 },
            ]}
            emptyHint="No intraday setups yet. Refresh after market opens."
          />
        )}

        {tab === "swing" && (
          <FeedGrid
            title="Swing (1–2 weeks)"
            rows={swing.data}
            columns={[
              { key: "ticker", label: "Symbol" },
              { key: "timeframe", label: "TF", width: 90 },
              { key: "prob", label: "Score", render: (v) => pct(v) },
              { key: "entry", label: "Entry", render: fmt },
              { key: "stop", label: "Stop", render: fmt },
              { key: "targets", label: "Targets", render: (t: any[]) => (t?.length ? t.join(" • ") : "—") },
              { key: "trail", label: "Trail", render: (t: AnyRow) => (t ? `${t.method || "—"}` : "—") },
            ]}
            emptyHint="No swing setups passed the filters today."
          />
        )}

        {tab === "crypto" && (
          <FeedGrid
            title="Crypto movers (24h / 7d)"
            rows={crypto.data}
            columns={[
              { key: "symbol", label: "Coin" },
              { key: "price", label: "Price", render: (v) => fmt(v, 4) },
              { key: "chg_24h", label: "24h", render: (v) => (v == null ? "—" : `${fmt(v, 2)}%`) },
              { key: "chg_7d", label: "7d", render: (v) => (v == null ? "—" : `${fmt(v, 2)}%`) },
              { key: "vol", label: "Vol", render: kmb },
              { key: "note", label: "Note", width: 280 },
            ]}
            emptyHint="No crypto movers yet."
          />
        )}

        {tab === "options" && (
          <FeedGrid
            title="Options picks (Δ .50–.80, tight spreads)"
            rows={options.data}
            columns={[
              { key: "symbol", label: "Symbol" },
              { key: "type", label: "Type", width: 90 },
              { key: "strike", label: "Strike", render: fmt },
              { key: "expiry", label: "Expiry" },
              { key: "delta", label: "Δ", render: fmt },
              { key: "spread", label: "Spread", render: fmt },
              { key: "rr", label: "R:R", render: fmt },
              { key: "note", label: "Why this", width: 280 },
            ]}
            emptyHint="No option contracts passed filters. Try Refresh or relax filters in the engine."
          />
        )}
      </main>

      {/* Footer */}
      <footer className="foot">
        <span>© {new Date().getFullYear()} LogiqSignals — All rights reserved.</span>
        <a href="mailto:support@logiqsignals.com">support@logiqsignals.com</a>
      </footer>
    </div>
  );
}

/** ---------- Reusable grid ---------- */
function FeedGrid({
  title,
  rows,
  columns,
  emptyHint,
}: {
  title: string;
  rows: AnyRow[];
  columns: { key: string; label: string; width?: number; render?: (v: any) => React.ReactNode }[];
  emptyHint?: string;
}) {
  const hasRows = Array.isArray(rows) && rows.length > 0;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <div className="meta">{hasRows ? `${rows.length} items` : "—"}</div>
      </div>

      {!hasRows && <div className="empty">{emptyHint || "No data"}</div>}

      {hasRows && (
        <div className="grid">
          <div className="grid-row header">
            {columns.map((c) => (
              <div key={c.key} className="cell" style={{ width: c.width }}>
                {c.label}
              </div>
            ))}
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid-row card-row">
              {columns.map((c) => {
                const raw = r[c.key];
                const val = c.render ? c.render(raw) : raw ?? "—";
                return (
                  <div key={c.key} className="cell" style={{ width: c.width }}>
                    {val}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** ---------- CSS-in-file (stable) ---------- */
const css = `
:root{
  --bg:#0b0b12;
  --card:#12121a;
  --ink:#d7e3ff;
  --muted:#8ea3c7;
  --accent:#22d3ee;
  --accent2:#a855f7;
  --line:rgba(255,255,255,.06);
}

*{box-sizing:border-box}
html,body,#root{height:100%}
body{
  margin:0; font-family: ui-sans-serif,system-ui,Arial,Segoe UI;
  background: radial-gradient(60% 70% at 50% 0%, rgba(34,211,238,.12), transparent 60%),
              radial-gradient(50% 50% at 90% 10%, rgba(168,85,247,.12), transparent 60%),
              var(--bg);
  color:var(--ink);
}

.hero{
  display:flex; align-items:center; justify-content:space-between;
  gap:24px; padding:28px 20px 18px;
  border-bottom:1px solid var(--line);
  position:sticky; top:0; backdrop-filter: blur(8px);
  background: linear-gradient(180deg, rgba(11,11,18,.72), rgba(11,11,18,.35) 60%, transparent);
  z-index:10;
}
.brand{display:flex; align-items:center; gap:16px; position:relative}
.logo{
  width:200px; height:200px; border-radius:50%; object-fit:cover;
  box-shadow: 0 0 0 4px rgba(34,211,238,.18), 0 18px 42px rgba(168,85,247,.45);
  animation:pulse 3s ease-in-out infinite;
  filter: brightness(1.2) saturate(1.15);
}
@media (max-width:640px){ .logo{ width:140px; height:140px; } }

.title{ font-size: clamp(24px, 4vw, 38px); font-weight:800; letter-spacing:.5px }
.title .word{ background: linear-gradient(180deg, #e2e8f0, #cbd5e1 60%, #93c5fd);
  -webkit-background-clip:text; background-clip:text; color:transparent }
.title .word.glow{
  background: linear-gradient(90deg, #67e8f9, #a78bfa 60%, #60a5fa);
  filter: drop-shadow(0 8px 26px rgba(6,182,212,.32));
}
.title .tm{ font-size:.6em; color:var(--muted); margin-left:6px }

.tag{ color:var(--muted); font-size:13px; margin-top:4px }

.cta{ display:flex; gap:12px }
.buy{
  padding:10px 16px; border-radius:999px; border:0; cursor:pointer;
  color:#061018; font-weight:800; letter-spacing:.3px;
  background: linear-gradient(90deg, #22d3ee, #a855f7);
  box-shadow: 0 8px 26px rgba(168,85,247,.35);
  transition:.2s transform ease, .2s filter ease;
}
.buy:hover{ transform: translateY(-1px); filter: brightness(1.05) }
.refresh{
  padding:10px 14px; border-radius:999px; border:1px solid var(--line); cursor:pointer;
  background: rgba(255,255,255,.04); color:var(--ink);
}

.tabs{
  display:flex; gap:8px; padding:10px 12px; border-bottom:1px solid var(--line);
  position:sticky; top:86px; background:rgba(11,11,18,.65); backdrop-filter: blur(6px); z-index:9;
}
.tab{
  position:relative; padding:10px 14px; border-radius:12px; border:1px solid var(--line);
  background:rgba(255,255,255,.02); color:var(--ink); cursor:pointer; font-weight:700;
  transition:.2s ease;
}
.tab.active{
  background: linear-gradient(90deg, rgba(34,211,238,.18), rgba(168,85,247,.18));
  border-color: rgba(255,255,255,.18);
  box-shadow: inset 0 0 20px rgba(34,211,238,.12);
}
.pill{
  margin-left:8px; background:rgba(255,255,255,.12); padding:2px 8px;
  border-radius:999px; font-size:12px;
}

.content{ padding:22px 14px 80px; max-width:1200px; margin:0 auto }

.panel{ background:linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,.03));
  border:1px solid var(--line); border-radius:18px; padding:14px; margin-top:16px;
  box-shadow: 0 10px 28px rgba(0,0,0,.28), inset 0 1px rgba(255,255,255,.05);
}
.panel-head{ display:flex; align-items:baseline; justify-content:space-between; margin:2px 4px 12px }
.panel-head h2{ margin:0; font-size:18px }
.meta{ color:var(--muted); font-size:12px }

.grid{ width:100%; border-top:1px dashed var(--line) }
.grid-row{
  display:grid; grid-template-columns: repeat(8, minmax(0,1fr)); gap:10px;
  padding:12px 8px; align-items:center; border-bottom:1px dashed var(--line);
  transition: background .2s ease, transform .2s ease, box-shadow .2s ease;
}
.header{ font-weight:700; color:#cbe3ff; background:rgba(255,255,255,.02) }
.card-row:hover{
  background: radial-gradient(60% 120% at 10% 50%, rgba(34,211,238,.10), transparent 60%),
              radial-gradient(60% 120% at 90% 50%, rgba(168,85,247,.10), transparent 60%);
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(0,0,0,.25);
}
.cell{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.cell:nth-child(1){ grid-column: span 1 }
.cell:nth-child(2){ grid-column: span 1 }
.cell:nth-child(3){ grid-column: span 1 }
.cell:nth-child(4){ grid-column: span 1 }
.cell:nth-child(5){ grid-column: span 1 }
.cell:nth-child(6){ grid-column: span 2 }
.cell:nth-child(7){ grid-column: span 1 }
@media (max-width: 920px){
  .grid-row{ grid-template-columns: repeat(6, minmax(0,1fr)); }
  .cell:nth-child(6){ grid-column: span 3 }
}
@media (max-width: 640px){
  .grid-row{ grid-template-columns: repeat(4, minmax(0,1fr)); }
  .cell:nth-child(6){ grid-column: span 4 }
}

.empty{
  padding:28px 10px; text-align:center; color:var(--muted);
  background: repeating-linear-gradient(45deg, rgba(255,255,255,.02) 0 10px, transparent 10px 20px);
  border-radius:12px; border:1px dashed var(--line); margin:12px 4px;
}

.error{
  color:#fecaca; background: rgba(220,38,38,.18);
  border:1px solid rgba(220,38,38,.35); padding:10px 12px; border-radius:12px; margin-bottom:12px;
}

.foot{
  color:var(--muted);
  display:flex; justify-content:space-between; gap:12px; align-items:center;
  padding:14px 16px; border-top:1px solid var(--line); margin-top:22px; font-size:13px;
}

@keyframes pulse{
  0%,100%{ transform:scale(1); }
  50%{ transform:scale(1.03); }
}
`;
