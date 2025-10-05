import React, { useEffect, useMemo, useRef, useState } from "react";

/** ===========================
 *  Tiny utilities (sound + confetti)
 *  =========================== */
function pingSound() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    o.start();
    g.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.00001, now + 0.18);
    o.stop(now + 0.2);
  } catch {}
}

function confettiBurst(anchor?: HTMLElement | null) {
  const c = document.createElement("canvas");
  c.className = "confetti";
  const ctx = c.getContext("2d")!;
  document.body.appendChild(c);

  function resize() {
    c.width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    c.height = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  }
  resize();
  window.addEventListener("resize", resize, { once: true });

  const colors = ["#7c3aed", "#06b6d4", "#22c55e", "#f59e0b", "#e879f9"];
  const N = 160;
  const rect = anchor?.getBoundingClientRect();
  const originX = rect ? rect.left + rect.width / 2 : c.width / 2;
  const originY = rect ? rect.top + rect.height / 2 : c.height * 0.18;

  const parts = Array.from({ length: N }).map(() => ({
    x: originX,
    y: originY,
    r: 2 + Math.random() * 3,
    a: Math.random() * Math.PI * 2,
    v: 4 + Math.random() * 6,
    col: colors[(Math.random() * colors.length) | 0],
    spin: (Math.random() - 0.5) * 0.2,
  }));

  const start = performance.now();
  const duration = 700;

  function frame(t: number) {
    const k = Math.min(1, (t - start) / duration);
    ctx.clearRect(0, 0, c.width, c.height);
    parts.forEach((p) => {
      p.x += Math.cos(p.a) * p.v;
      p.y += Math.sin(p.a) * p.v + k * 3; // gravity
      p.a += p.spin;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.col;
      ctx.fill();
    });
    if (k < 1) requestAnimationFrame(frame);
    else c.remove();
  }
  requestAnimationFrame(frame);
}

/** ===========================
 *  Data + fetch helpers
 *  =========================== */
type IntradayRow = {
  symbol: string;
  note?: string;
  score?: number;
  timeframe?: string;
  asof?: string;
};

type SwingRow = {
  ticker: string;
  prob?: number;
  entry?: number;
  stop?: number;
  targets?: number[];
  asof?: string;
};

type CryptoMover = {
  symbol: string;
  pct_24h?: number;
  pct_7d?: number;
};

type OptionPick = {
  symbol: string;
  type: "CALL" | "PUT";
  strike: number;
  expiry: string;
  delta?: number;
  bid?: number;
  ask?: number;
  spread?: number;
  premium?: number;
};

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    console.warn("fetchJSON fail:", url, e);
    return null;
  }
}

/** Minimal CSV maker */
function toCSV(headers: string[], rows: any[], pick: (r: any) => (string | number | undefined)[]): string {
  const head = headers.join(",");
  const body = rows
    .map((r) =>
      pick(r)
        .map((x) => {
          const s = x ?? "";
          const str = String(s);
          return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(",")
    )
    .join("\n");
  return head + "\n" + body;
}

/** ===========================
 *  Main App
 *  =========================== */
export default function App() {
  const [tab, setTab] = useState<"intraday" | "swing" | "crypto" | "options">("intraday");
  const [loading, setLoading] = useState(false);
  const [intraday, setIntraday] = useState<IntradayRow[]>([]);
  const [swing, setSwing] = useState<SwingRow[]>([]);
  const [crypto, setCrypto] = useState<CryptoMover[]>([]);
  const [options, setOptions] = useState<OptionPick[]>([]);
  const buyRef = useRef<HTMLButtonElement | null>(null);

  async function loadAll() {
    setLoading(true);
    const [i, s, c, o] = await Promise.all([
      fetchJSON<IntradayRow[]>("/signals.json"),
      fetchJSON<SwingRow[]>("/signals_swing.json"),
      fetchJSON<CryptoMover[]>("/crypto_movers.json"),
      fetchJSON<OptionPick[]>("/options.json"),
    ]);

    setIntraday(Array.isArray(i) ? i : []);
    setSwing(Array.isArray(s) ? s : []);
    setCrypto(Array.isArray(c) ? c : []);
    setOptions(Array.isArray(o) ? o : []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // slide-in the buy button after mount
    setTimeout(() => buyRef.current?.classList.add("in"), 350);
  }, []);

  const anyData = intraday.length + swing.length + crypto.length + options.length > 0;

  /** CSV actions */
  function download(name: string, text: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportIntradayCSV() {
    const csv = toCSV(
      ["symbol", "score", "note", "timeframe", "asof"],
      intraday,
      (r) => [r.symbol, r.score ?? "", r.note ?? "", r.timeframe ?? "", r.asof ?? ""]
    );
    download("intraday.csv", csv);
  }

  function exportSwingCSV() {
    const csv = toCSV(
      ["ticker", "prob", "entry", "stop", "targets", "asof"],
      swing,
      (r) => [r.ticker, r.prob ?? "", r.entry ?? "", r.stop ?? "", (r.targets || []).join("|"), r.asof ?? ""]
    );
    download("swing.csv", csv);
  }

  function exportCryptoCSV() {
    const csv = toCSV(["symbol", "pct_24h", "pct_7d"], crypto, (r) => [r.symbol, r.pct_24h ?? "", r.pct_7d ?? ""]);
    download("crypto.csv", csv);
  }

  function exportOptionsCSV() {
    const csv = toCSV(
      ["symbol", "type", "strike", "expiry", "delta", "bid", "ask", "spread", "premium"],
      options,
      (r) => [r.symbol, r.type, r.strike, r.expiry, r.delta ?? "", r.bid ?? "", r.ask ?? "", r.spread ?? "", r.premium ?? ""]
    );
    download("options.csv", csv);
  }

  /** Render helpers */
  function Shimmer() {
    return (
      <div className="grid">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card shimmer" />
        ))}
      </div>
    );
  }

  function Empty({ label }: { label: string }) {
    return (
      <div className="empty">
        <div>No {label} yet.</div>
        <div className="hint">Click Refresh to reload your latest feeds.</div>
      </div>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <div className="wrap">
        {/* Header */}
        <header className="header">
          <div className="brand">
            <img className="logo" src="/logo.png" alt="Logiq Lion" />
            <div className="title">
              <div className="word">LOGIQ</div>
              <div className="word glow">Signals</div>
            </div>
          </div>

          <div className="actions">
            <button
              className="btn"
              onClick={() => {
                pingSound();
                loadAll();
              }}
              disabled={loading}
              title="Refresh feeds"
            >
              {loading ? "Refreshing…" : "Refresh"}
              <span className="ripple" />
            </button>

            <button
              ref={buyRef}
              className="btn primary slidein"
              onClick={(e) => {
                const el = e.currentTarget;
                pingSound();
                confettiBurst(el);
                setTimeout(() => {
                  // TODO: replace with your real checkout URL
                  window.open("https://buy.stripe.com/test_abc123", "_blank", "noopener,noreferrer");
                }, 380);
              }}
              title="Buy access"
            >
              Buy Access
              <span className="sparkle" />
            </button>
          </div>
        </header>

        {/* Tabs */}
        <nav className="tabs">
          {[
            ["intraday", "Intraday"],
            ["swing", "Swing"],
            ["crypto", "Crypto"],
            ["options", "Options"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`tab ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key as any)}
              title={String(label)}
            >
              <span>{label}</span>
              <span className="underline" />
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="main">
          {loading && <Shimmer />}

          {!loading && tab === "intraday" && (
            <>
              {intraday.length === 0 ? (
                <Empty label="intraday signals" />
              ) : (
                <section>
                  <div className="toolbar">
                    <div className="subtitle">AI-weighted 15m ORB/EMA</div>
                    <div className="right">
                      <button className="btn ghost" onClick={exportIntradayCSV}>
                        Export CSV
                      </button>
                    </div>
                  </div>

                  <div className="grid">
                    {intraday.map((r, i) => (
                      <article className="card" key={r.symbol + i}>
                        <div className="chip">#{i + 1}</div>
                        <div className="sym">{r.symbol}</div>
                        <div className="meta">
                          <span className="tag">score</span>
                          <span className="val">{(r.score ?? 0).toFixed(2)}</span>
                        </div>
                        {r.note && <div className="note">{r.note}</div>}

                        <div className="row">
                          <span className="mini">timeframe</span>
                          <span className="mini dim">{r.timeframe || "15m"}</span>
                        </div>
                        <div className="row">
                          <span className="mini">as of</span>
                          <span className="mini dim">{r.asof || "—"}</span>
                        </div>

                        <div className="cta">
                          <a className="btn small ghost" href="/signals.json" target="_blank" rel="noreferrer">
                            View JSON
                          </a>
                          <button className="btn small" onClick={exportIntradayCSV}>
                            Save CSV
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {!loading && tab === "swing" && (
            <>
              {swing.length === 0 ? (
                <Empty label="swing signals" />
              ) : (
                <section>
                  <div className="toolbar">
                    <div className="subtitle">Daily EMA break & retest (1–2w)</div>
                    <div className="right">
                      <button className="btn ghost" onClick={exportSwingCSV}>
                        Export CSV
                      </button>
                    </div>
                  </div>

                  <div className="grid">
                    {swing.map((r, i) => (
                      <article className="card" key={r.ticker + i}>
                        <div className="chip">#{i + 1}</div>
                        <div className="sym">{r.ticker}</div>

                        <div className="pillwrap">
                          <span className="pill">
                            prob <b>{(r.prob ?? 0).toFixed(2)}</b>
                          </span>
                          <span className="pill">
                            entry <b>{r.entry ?? "—"}</b>
                          </span>
                          <span className="pill">
                            stop <b>{r.stop ?? "—"}</b>
                          </span>
                        </div>

                        <div className="targets">
                          {(r.targets || []).slice(0, 3).map((t, j) => (
                            <span className="tg" key={j}>
                              T{j + 1} {t}
                            </span>
                          ))}
                        </div>

                        <div className="row">
                          <span className="mini">as of</span>
                          <span className="mini dim">{r.asof || "—"}</span>
                        </div>

                        <div className="cta">
                          <a className="btn small ghost" href="/signals_swing.json" target="_blank" rel="noreferrer">
                            View JSON
                          </a>
                          <button className="btn small" onClick={exportSwingCSV}>
                            Save CSV
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {!loading && tab === "crypto" && (
            <>
              {crypto.length === 0 ? (
                <Empty label="crypto movers" />
              ) : (
                <section>
                  <div className="toolbar">
                    <div className="subtitle">Top Crypto Movers</div>
                    <div className="right">
                      <button className="btn ghost" onClick={exportCryptoCSV}>
                        Export CSV
                      </button>
                    </div>
                  </div>

                  <div className="grid">
                    {crypto.map((r, i) => (
                      <article className="card" key={r.symbol + i}>
                        <div className="chip">#{i + 1}</div>
                        <div className="sym">{r.symbol}</div>
                        <div className="row">
                          <span className="mini">24h</span>
                          <span className={`mini ${numClass(r.pct_24h)}`}>{fmtPct(r.pct_24h)}</span>
                        </div>
                        <div className="row">
                          <span className="mini">7d</span>
                          <span className={`mini ${numClass(r.pct_7d)}`}>{fmtPct(r.pct_7d)}</span>
                        </div>

                        <div className="cta">
                          <a className="btn small ghost" href="/crypto_movers.json" target="_blank" rel="noreferrer">
                            View JSON
                          </a>
                          <button className="btn small" onClick={exportCryptoCSV}>
                            Save CSV
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {!loading && tab === "options" && (
            <>
              {options.length === 0 ? (
                <Empty label="options picks" />
              ) : (
                <section>
                  <div className="toolbar">
                    <div className="subtitle">Options Scanner (δ .50–.80, tight spreads)</div>
                    <div className="right">
                      <button className="btn ghost" onClick={exportOptionsCSV}>
                        Export CSV
                      </button>
                    </div>
                  </div>

                  <div className="grid">
                    {options.map((r, i) => (
                      <article className="card" key={r.symbol + i}>
                        <div className="chip">#{i + 1}</div>
                        <div className="sym">{r.symbol}</div>

                        <div className="pillwrap">
                          <span className="pill">{r.type}</span>
                          <span className="pill">K {r.strike}</span>
                          <span className="pill">{r.expiry}</span>
                        </div>

                        <div className="row">
                          <span className="mini">δ</span>
                          <span className="mini dim">{r.delta ?? "—"}</span>
                        </div>
                        <div className="row">
                          <span className="mini">Bid/Ask</span>
                          <span className="mini dim">
                            {r.bid ?? "—"} / {r.ask ?? "—"}{" "}
                            <span className="ghosty">({r.spread ?? "—"})</span>
                          </span>
                        </div>

                        <div className="cta">
                          <a className="btn small ghost" href="/options.json" target="_blank" rel="noreferrer">
                            View JSON
                          </a>
                          <button className="btn small" onClick={exportOptionsCSV}>
                            Save CSV
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>

        {/* Footer helper */}
        <footer className="foot">
          {!anyData && !loading && (
            <div className="hint">
              Heads up: If the market is closed or feeds are empty, click <b>Refresh</b> after you generate JSON in
              <code className="mono"> signals-engine/output </code> and copy them to <code className="mono">public</code>.
            </div>
          )}
          <div className="tiny">© {new Date().getFullYear()} LogiqSignals — edge for humans.</div>
        </footer>
      </div>
    </>
  );
}

/** ===========================
 *  Local helpers
 *  =========================== */
function fmtPct(n?: number) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}
function numClass(n?: number) {
  if (n === undefined || n === null || Number.isNaN(n)) return "";
  return n >= 0 ? "pos" : "neg";
}

/** ===========================
 *  Styles (no external libs)
 *  =========================== */
const styles = `
:root{
  --bg:#0b0b12;
  --panel:#0d0f1a;
  --glass:rgba(255,255,255,.06);
  --text:#e9e9f1;
  --muted:#a8a8b8;
  --brand-1:#7c3aed;
  --brand-2:#06b6d4;
  --brand-3:#22c55e;
  --accent:#e879f9;
}
*{box-sizing:border-box}
html,body,#root{height:100%}
body{margin:0; background: radial-gradient(1200px 700px at 10% -10%, rgba(124,58,237,.22), rgba(124,58,237,0) 60%) ,linear-gradient(180deg,#0a0a11 0%, #0b0c14 60%, #0a0a11 100%); color:var(--text); font: 14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Inter,Helvetica,Arial,sans-serif}
a{color:inherit}

.wrap{max-width:1160px; margin:0 auto; padding:28px 18px 40px}

.header{display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 16px; border-radius:16px; background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03)); border:1px solid rgba(255,255,255,.08); box-shadow: 0 10px 28px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.06); position:sticky; top:12px; backdrop-filter: blur(10px); z-index:5}
.brand{display:flex; align-items:center; gap:14px}
.logo{width:168px; height:168px; border-radius:50%; object-fit:cover; filter: drop-shadow(0 10px 32px rgba(124,58,237,.55)) brightness(1.17); animation: pulse 3s ease-in-out infinite}
@keyframes pulse{0%,100%{transform:translateZ(0) scale(1)}50%{transform:translateZ(0) scale(1.03)}}

.title{display:flex; flex-direction:column; line-height:1}
.title .word{font-weight:800; letter-spacing:.6px; font-size:22px}
.title .word.glow{
  font-size:28px; letter-spacing:1px;
  background: linear-gradient(92deg,var(--brand-1),var(--brand-2),var(--brand-3));
  -webkit-background-clip:text; background-clip:text; color:transparent;
  filter: drop-shadow(0 6px 20px rgba(6,182,212,.25));
}

.actions{display:flex; align-items:center; gap:10px}
.btn{
  position:relative; border:none; border-radius:12px; padding:10px 14px;
  background: rgba(255,255,255,.06); color:var(--text); cursor:pointer;
  transition: transform .12s ease, background .2s ease, box-shadow .2s ease;
  box-shadow: 0 6px 18px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.06);
  backdrop-filter: blur(6px);
}
.btn:hover{ transform: translateY(-1px); background: rgba(255,255,255,.09)}
.btn:active{ transform: translateY(0)}
.btn.primary{
  background: linear-gradient(92deg,var(--brand-1),var(--brand-2),var(--brand-3));
  color:#0b0b12; font-weight:700;
  box-shadow: 0 8px 24px rgba(124,58,237,.45);
}
.btn.primary:hover{ filter: brightness(1.05)}
.btn.ghost{ background: rgba(255,255,255,.04)}
.btn.small{ padding:8px 10px; border-radius:10px; font-size:12px}
.btn:disabled{opacity:.6; cursor:not-allowed}
.ripple::after{
  content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  background: radial-gradient(120px 80px at var(--mx,50%) var(--my,50%), rgba(255,255,255,.14), transparent 60%);
  opacity:0; transition: opacity .2s ease;
}
.btn:hover .ripple::after{opacity:1}

.sparkle{position:absolute; right:10px; top:8px; width:6px; height:6px; border-radius:50%; background:#fff; box-shadow: 0 0 18px 6px rgba(255,255,255,.45); opacity:.85; animation: twinkle 2.4s infinite}
@keyframes twinkle{0%,100%{transform:scale(.8); opacity:.45}50%{transform:scale(1.2); opacity:.95}}

.slidein{ transform: translateY(16px); opacity:0}
.slidein.in{ transform: translateY(0); opacity:1; transition: transform .45s cubic-bezier(.2,.8,.2,1), opacity .4s ease .05s}

.tabs{ display:flex; gap:10px; padding:14px 2px 0; margin-top:12px; position:sticky; top:100px; z-index:4; background: transparent}
.tab{
  position:relative; padding:10px 14px; border-radius:12px; color:var(--muted);
  background: rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.06);
  transition: color .2s ease, background .2s ease;
}
.tab:hover{ color:#fff; background: rgba(255,255,255,.05)}
.tab.active{ color:#fff; background: rgba(255,255,255,.08)}
.tab .underline{
  position:absolute; left:16px; right:16px; bottom:6px; height:3px;
  background:
    radial-gradient(40% 200% at 50% 50%, rgba(255,255,255,.75), rgba(255,255,255,0) 70%),
    linear-gradient(90deg, var(--brand-1), var(--brand-2), var(--brand-3));
  border-radius:999px; transform: scaleX(.3); opacity:0; filter: blur(.2px);
  transition: transform .22s cubic-bezier(.2,.8,.2,1), opacity .2s ease;
}
.tab:hover .underline{ opacity:.65; transform: scaleX(.7)}
.tab.active .underline{ opacity:1; transform: scaleX(1)}

.main{ margin-top:18px}
.toolbar{display:flex; align-items:center; justify-content:space-between; margin:10px 2px 18px}
.subtitle{color:#d8d8e6; font-weight:700; letter-spacing:.3px}
.right{display:flex; align-items:center; gap:10px}

.grid{display:grid; grid-template-columns: repeat( auto-fill, minmax(260px, 1fr) ); gap:14px}
.card{
  position:relative; padding:14px; border-radius:16px;
  background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
  border:1px solid rgba(255,255,255,.08);
  box-shadow: 0 12px 28px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.06);
  transition: transform .15s ease, box-shadow .2s ease, background .2s ease;
  overflow:hidden;
}
.card::before{
  content:""; position:absolute; inset:-40px; background:
    radial-gradient(400px 100px at var(--hx,20%) var(--hy,0%), rgba(124,58,237,.15), transparent 60%),
    radial-gradient(400px 100px at var(--hx2,80%) var(--hy2,100%), rgba(6,182,212,.12), transparent 60%);
  filter: blur(18px); opacity:.8; transition: opacity .25s ease;
}
.card:hover{ transform: translateY(-3px); box-shadow: 0 16px 36px rgba(0,0,0,.32)}
.card:hover::before{ opacity:1}

.card.shimmer{
  min-height:160px;
  background: linear-gradient(110deg, rgba(255,255,255,.06) 8%, rgba(255,255,255,.13) 18%, rgba(255,255,255,.06) 33%);
  background-size: 200% 100%;
  animation: shine 1.1s linear infinite;
}
@keyframes shine { to { background-position-x: -200% } }

.chip{ position:absolute; top:10px; right:12px; font-size:11px; color:#fff; opacity:.6}
.sym{ font-size:22px; font-weight:800; letter-spacing:.6px; margin-bottom:6px}
.meta{ display:flex; align-items:center; gap:8px; margin:6px 0 8px}
.tag{ font-size:11px; color:#aaa; border:1px dashed rgba(255,255,255,.18); padding:2px 6px; border-radius:8px}
.val{ font-weight:700}

.note{ font-size:12px; color:#d8d8e6; opacity:.9; background: rgba(255,255,255,.05); padding:8px; border-radius:10px; border:1px solid rgba(255,255,255,.06); margin:8px 0}

.pillwrap{display:flex; flex-wrap:wrap; gap:6px; margin:8px 0}
.pill{ font-size:11px; padding:6px 8px; border-radius:999px; color:#0b0b12; font-weight:700;
  background: linear-gradient(92deg, var(--brand-1), var(--brand-2), var(--brand-3)); box-shadow: inset 0 1px 0 rgba(255,255,255,.3)
}

.targets{ display:flex; gap:8px; flex-wrap:wrap; margin:6px 0 8px}
.tg{ font-size:11px; color:#dfe; background: rgba(34,197,94,.18); border:1px solid rgba(34,197,94,.35); padding:4px 8px; border-radius:8px }

.row{ display:flex; align-items:center; justify-content:space-between; margin:4px 0}
.mini{ font-size:12px}
.dim{ color:#bcbcd0}
.ghosty{ opacity:.6}

.cta{ display:flex; gap:8px; margin-top:10px}

.empty{ text-align:center; padding:36px 10px; border:1px dashed rgba(255,255,255,.15); border-radius:14px; color:#cfd0df; background: rgba(255,255,255,.02)}
.hint{ opacity:.8; font-size:12px; margin-top:6px}
.mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; background: rgba(255,255,255,.06); padding:0 6px; border-radius:6px}

.foot{ margin-top:28px; opacity:.8; text-align:center}
.tiny{ font-size:12px; color:#a8a8b8}

.pos{ color:#53f29a}
.neg{ color:#f36d7a}

.confetti{ position: fixed; inset: 0; pointer-events: none; z-index: 9999; }
`;
