import React, { useEffect, useMemo, useState } from "react";

/** ---------- Types ---------- */
type Intraday = {
  ticker: string; timeframe: string; strategy: string; side: string;
  prob: number; entry: number; stop: number; targets: number[]; asof?: string;
};
type Swing = {
  ticker: string; timeframe: string; strategy: string;
  prob: number; entry: number; stop: number; targets: number[]; asof?: string;
};
type OptionRow = {
  symbol: string; type: "CALL" | "PUT"; strike: number; expiry: string;
  delta: number; spread: number; note: string; score: number;
};
type SwingOpt = {
  ticker: string; timeframe: string; prob: number; entry: number; stop: number;
  targets: number[]; opt_type: string; opt_strike: number; opt_exp: string;
  opt_delta: number; opt_note: string;
};

/** ---------- Safe fetch ---------- */
async function fetchJSON<T>(url: string): Promise<T[]> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch {
    return [];
  }
}

/** ---------- CSS (inline, stable) ---------- */
const css = `
:root {
  --bg:#0b0b10; --ink:#e9eaf6; --muted:#9aa0a6; --panel:#14141d; --line:#2b2d3a;
  --g1:#ff8a00; --g2:#ff3d6e; --g3:#6a5cff;
}
*{box-sizing:border-box} html,body,#root{height:100%} body{margin:0}
.app{min-height:100%;background:radial-gradient(1200px 600px at 50% -20%,#1b1b27 0%,#0b0b10 60%,#0b0b10 100%);color:var(--ink);font-family:Inter,system-ui,Segoe UI,Arial,sans-serif}
.container{max-width:1120px;margin:0 auto;padding:24px}
.header{display:flex;align-items:center;gap:16px;justify-content:center;margin:6px 0 12px}
.logo{width:92px;height:auto;filter:drop-shadow(0 6px 24px rgba(255,140,0,.38));animation:pulse 2.4s ease-in-out infinite}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
.brand{text-align:center}
.title{font-weight:900;font-size:40px;letter-spacing:.3px;background:linear-gradient(90deg,var(--g1),var(--g2),var(--g3));-webkit-background-clip:text;background-clip:text;color:transparent;margin:0}
.subtitle{margin:4px 0 0;color:var(--muted);font-weight:500}

.tabs{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:14px 0 18px}
.tab{border:1px solid var(--line);background:#171823;padding:10px 14px;border-radius:10px;color:#dfe3ea;cursor:pointer;transition:.18s;user-select:none}
.tab:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(0,0,0,.25)}
.tab.active{background:linear-gradient(90deg,var(--g1),var(--g2));border-color:transparent;color:white}

.actions{display:flex;gap:10px;justify-content:flex-end;margin:8px 0 14px}
.btn{padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:#181a23;color:#e9ebf6;cursor:pointer}
.btn.grad{background:linear-gradient(90deg,var(--g1),var(--g2));border-color:transparent;color:#fff}

.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin:10px 0}
.empty{color:#a0a6ae;margin:10px 0;text-align:center}

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.card{background:linear-gradient(180deg,#171722 0%,#111117 100%);border:1px solid #2a2a37;border-radius:14px;padding:14px;box-shadow:0 8px 30px rgba(0,0,0,.25)}
.row{display:flex;justify-content:space-between;margin:4px 0}
.k{color:#9aa0a6;margin-right:6px}
.badge{padding:3px 8px;border-radius:999px;border:1px solid #2f3140;background:#1a1b25;color:#cfd3e1;font-size:12px}
.prob{font-weight:800}
.targets{display:flex;gap:6px;flex-wrap:wrap}
.target{padding:4px 8px;border-radius:8px;background:#1a1b25;border:1px solid #2d2f3c}
.updated{color:#9aa0a6;font-size:12px;text-align:center;margin-top:8px}
`;

/** ---------- helpers ---------- */
const fmt = (n: number | string, d=2) => {
  const x = typeof n === "number" ? n : parseFloat(String(n));
  return isFinite(x) ? x.toFixed(d) : String(n);
};
const csv = (name: string, rows: any[]) => {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const body = rows.map(r => cols.map(c => JSON.stringify(r[c] ?? "")).join(",")).join("\n");
  const blob = new Blob([cols.join(",")+"\n"+body], { type:"text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name + ".csv"; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
};

/** ---------- App ---------- */
export default function App() {
  const [tab, setTab] = useState<"Intraday"|"Swing"|"Options"|"Swing+Options">("Intraday");
  const [intraday, setIntraday] = useState<Intraday[]>([]);
  const [swing, setSwing] = useState<Swing[]>([]);
  const [opt, setOpt] = useState<OptionRow[]>([]);
  const [sx, setSx] = useState<SwingOpt[]>([]);

  useEffect(() => {
    fetchJSON<Intraday>("/signals.json").then(setIntraday);
    fetchJSON<Swing>("/signals_swing.json").then(setSwing);
    fetchJSON<OptionRow>("/options.json").then(setOpt);
    fetchJSON<SwingOpt>("/swing_plus_options.json").then(setSx);
  }, []);

  const updated = useMemo(() => {
    const ts: string[] = [];
    const take = (s?: string) => s && ts.push(s);
    intraday.forEach(r=>take(r.asof)); swing.forEach(r=>take(r.asof));
    return ts.sort().slice(-1)[0] || "";
  }, [intraday, swing]);

  return (
    <div className="app">
      <style>{css}</style>
      <div className="container">
        {/* header */}
        <div className="header">
          <img src="/logo.png" alt="logo" className="logo" />
          <div className="brand">
            <h1 className="title">Logiq Signals</h1>
            <p className="subtitle">Intraday • Swing • Options • Crypto</p>
          </div>
        </div>

        {/* tabs */}
        <div className="tabs">
          {(["Intraday","Swing","Options","Swing+Options"] as const).map(t=>(
            <button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{t}</button>
          ))}
        </div>

        {/* actions */}
        <div className="actions">
          {tab==="Intraday" && <button className="btn" onClick={()=>csv("intraday", intraday)}>Export CSV</button>}
          {tab==="Swing"    && <button className="btn" onClick={()=>csv("swing", swing)}>Export CSV</button>}
          {tab==="Options"  && <button className="btn" onClick={()=>csv("options", opt)}>Export CSV</button>}
          {tab==="Swing+Options" && <button className="btn" onClick={()=>csv("swing_plus_options", sx)}>Export CSV</button>}
          <a className="btn grad" href="mailto:hello@logiqsignals.com?subject=Subscribe">Subscribe</a>
        </div>

        {/* panes */}
        {tab==="Intraday" && (
          <section className="panel">
            {!intraday.length && <p className="empty">No intraday signals yet.</p>}
            {!!intraday.length && (
              <div className="grid">
                {intraday.map((r,i)=>(
                  <div className="card" key={i}>
                    <div className="row"><strong>{r.ticker}</strong> <span className="badge">{r.timeframe}</span></div>
                    <div className="row"><span className="k">Strategy</span><span>{r.strategy}</span></div>
                    <div className="row"><span className="k">Side</span><span className="badge">{r.side}</span></div>
                    <div className="row"><span className="k">Entry</span><span>{fmt(r.entry)}</span></div>
                    <div className="row"><span className="k">Stop</span><span>{fmt(r.stop)}</span></div>
                    <div className="row"><span className="k">Prob</span><span className="prob">{Math.round(r.prob*100)}%</span></div>
                    <div className="targets">{r.targets?.map((t,j)=>(<span key={j} className="target">T{j+1}: {fmt(t)}</span>))}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab==="Swing" && (
          <section className="panel">
            {!swing.length && <p className="empty">No swing signals yet.</p>}
            {!!swing.length && (
              <div className="grid">
                {swing.map((r,i)=>(
                  <div className="card" key={i}>
                    <div className="row"><strong>{r.ticker}</strong> <span className="badge">{r.timeframe}</span></div>
                    <div className="row"><span className="k">Strategy</span><span>{r.strategy}</span></div>
                    <div className="row"><span className="k">Entry</span><span>{fmt(r.entry)}</span></div>
                    <div className="row"><span className="k">Stop</span><span>{fmt(r.stop)}</span></div>
                    <div className="row"><span className="k">Prob</span><span className="prob">{Math.round(r.prob*100)}%</span></div>
                    <div className="targets">{r.targets?.map((t,j)=>(<span key={j} className="target">T{j+1}: {fmt(t)}</span>))}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab==="Options" && (
          <section className="panel">
            {!opt.length && <p className="empty">No options today.</p>}
            {!!opt.length && (
              <div className="grid">
                {opt.map((r,i)=>(
                  <div className="card" key={i}>
                    <div className="row"><strong>{r.symbol}</strong> <span className="badge">{r.type}</span></div>
                    <div className="row"><span className="k">Strike</span><span>{r.strike}</span></div>
                    <div className="row"><span className="k">Expiry</span><span>{r.expiry}</span></div>
                    <div className="row"><span className="k">Delta</span><span>{fmt(r.delta,2)}</span></div>
                    <div className="row"><span className="k">Spread</span><span>{fmt(r.spread,2)}</span></div>
                    <div className="row"><span className="k">Score</span><span className="prob">{Math.round((r.score||0)*100)}%</span></div>
                    <div className="row"><span className="k">Note</span><span>{r.note}</span></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab==="Swing+Options" && (
          <section className="panel">
            {!sx.length && <p className="empty">No linked swing+options yet.</p>}
            {!!sx.length && (
              <div className="grid">
                {sx.map((r,i)=>(
                  <div className="card" key={i}>
                    <div className="row"><strong>{r.ticker}</strong> <span className="badge">{r.timeframe}</span></div>
                    <div className="row"><span className="k">Entry/Stop</span><span>{fmt(r.entry)}/{fmt(r.stop)}</span></div>
                    <div className="targets">{r.targets?.map((t,j)=>(<span key={j} className="target">T{j+1}: {fmt(t)}</span>))}</div>
                    <div className="row"><span className="k">Option</span><span>{r.opt_type} {r.opt_strike} {r.opt_exp}</span></div>
                    <div className="row"><span className="k">Delta</span><span>{fmt(r.opt_delta,2)}</span></div>
                    <div className="row"><span className="k">Note</span><span>{r.opt_note}</span></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="updated">{updated ? `Last updated: ${updated}` : "Demo mode or missing timestamps"}</div>
      </div>
    </div>
  );
}
