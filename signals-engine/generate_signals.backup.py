# Intraday signals (15m) with robust OHLCV normalization
import json, datetime as dt
from pathlib import Path
import pandas as pd
import yfinance as yf
import yaml

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output"; OUT.mkdir(exist_ok=True)

# ---------- config ----------
def load_cfg():
    cfg = yaml.safe_load((ROOT / "config.yaml").read_text())
    def explode(x):
        if isinstance(x, list): return x
        if isinstance(x, str): return [s.strip() for s in x.split("-")]
        return []
    cfg["symbols_equity"] = [s for line in cfg.get("symbols_equity", []) for s in explode(line)]
    cfg["symbols_crypto"] = [s for line in cfg.get("symbols_crypto", []) for s in explode(line)]
    return cfg

# ---------- normalization helpers ----------
def _lower_colnames(df):
    # unwrap tuples if any (MultiIndex remnants) and lower
    new_cols = []
    for c in df.columns:
        if isinstance(c, tuple):
            # prefer inner name like ('AAPL','Close') -> 'Close'
            cand = c[-1] if len(c) else ""
        else:
            cand = c
        new_cols.append(str(cand))
    df = df.copy()
    df.columns = [c.lower() for c in new_cols]
    return df

def normalize_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    """Return DataFrame with columns: open, high, low, close, volume. Empty if cannot normalize."""
    if df is None or len(df) == 0:
        return pd.DataFrame()

    # If MultiIndex, try dropping the first level (ticker)
    if isinstance(df.columns, pd.MultiIndex):
        try:
            # if there is only one top-level ticker, drop it
            if len(df.columns.get_level_values(0).unique()) == 1:
                df = df.droplevel(0, axis=1)
        except Exception:
            pass

    df = _lower_colnames(df)

    # Map possible names
    out = pd.DataFrame(index=pd.to_datetime(df.index))
    def pick(dest, candidates):
        for c in candidates:
            if c in df.columns:
                out[dest] = df[c]
                return True
        return False

    have = True
    have &= pick("open",   ["open"])
    have &= pick("high",   ["high"])
    have &= pick("low",    ["low"])
    # prefer close; if missing, use adj close variants
    if not pick("close", ["close", "adj close", "adj_close", "adjclose"]):
        have = False
    pick("volume", ["volume"])  # optional for crypto; fine if missing

    if not have:
        return pd.DataFrame()

    # Coerce to numeric series (handles weird 1-col frames)
    for col in list(out.columns):
        s = out[col]
        if hasattr(s, "columns"):
            s = s.iloc[:, 0]
        out[col] = pd.to_numeric(s, errors="coerce")

    out = out.dropna(subset=["close"])
    return out

# ---------- fetchers ----------
def fetch15(tkr, period, is_crypto=False):
    intervals = ("15m", "30m") if is_crypto else ("15m",)
    for iv in intervals:
        try:
            df = yf.download(tkr, period=period, interval=iv, auto_adjust=True, progress=False)
            if df is not None and not df.empty:
                df = normalize_ohlcv(df)
                if not df.empty:
                    return df
        except Exception:
            continue
    return pd.DataFrame()

# ---------- indicators ----------
def add_indicators(df, ema_fast=10, ema_mid=20, ema_slow=200, rsi_len=14):
    if df.empty: return df
    df = df.copy()
    c = df["close"]
    df["ema10"]  = c.ewm(span=ema_fast, adjust=False).mean()
    df["ema20"]  = c.ewm(span=ema_mid, adjust=False).mean()
    df["ema200"] = c.ewm(span=ema_slow, adjust=False).mean()

    # RSI (classic)
    delta = c.diff()
    up = delta.clip(lower=0)
    down = -delta.clip(upper=0)
    roll_up = up.ewm(alpha=1/rsi_len, adjust=False).mean()
    roll_down = down.ewm(alpha=1/rsi_len, adjust=False).mean()
    rs = roll_up / (roll_down.replace(0, 1e-9))
    df["rsi"] = 100 - (100 / (1 + rs))
    return df.dropna()

# ---------- scoring ----------
def score_intraday(df):
    last = df.iloc[-1]
    prior = df.iloc[-20:] if len(df) >= 20 else df
    ema_ok = (last["ema10"] > last["ema20"] > last["ema200"]) or (last["ema10"] < last["ema20"] < last["ema200"])
    rsi_neutral = 35 <= last["rsi"] <= 70
    mid = (prior["high"].max() + prior["low"].min()) / 2.0
    dist = (last["close"] - mid) / mid if mid else 0.0
    orb_bias = 1.0 if dist > 0 else 0.0

    base = 0.4 + 0.4 * float(ema_ok) + 0.2 * float(rsi_neutral)
    mom = (last["close"] - prior["close"].iloc[0]) / prior["close"].iloc[0] if "close" in prior else 0.0
    base += 0.1 * (1 if (orb_bias > 0 and mom > 0) or (orb_bias == 0 and mom < 0) else 0)
    score = max(0.0, min(1.0, base))

    note = []
    note.append("EMA trending" if ema_ok else "EMA mixed")
    note.append(f"RSI {int(last['rsi'])}")
    note.append("above mid" if dist > 0 else "below mid")
    return score, ", ".join(note)

# ---------- main ----------
def main():
    cfg = load_cfg()
    if not cfg.get("allow_weekend", False):
        wd = dt.datetime.utcnow().weekday()  # 0=Mon..6=Sun
        if wd in (5, 6):
            print("[SKIP] Weekend and allow_weekend=false")
            (OUT / "signals.json").write_text("[]")
            return

    rows = []

    # Equities
    for sym in cfg["symbols_equity"]:
        df = fetch15(sym, cfg.get("period_15m_equity", "60d"), is_crypto=False)
        if df.empty or len(df) < 50:
            print(f"[WARN] {sym}: no 15m data normalized; skipping")
            continue
        df = add_indicators(df, cfg["ema_fast"], cfg["ema_mid"], cfg["ema_slow"], cfg["rsi_len"])
        if df.empty: 
            print(f"[WARN] {sym}: indicators empty; skipping")
            continue
        score, note = score_intraday(df)
        if score >= cfg.get("min_score_intraday", 0.5):
            rows.append({
                "symbol": sym, "timeframe": "15m", "type": "equity",
                "score": round(float(score), 3), "note": note,
                "asof": df.index[-1].strftime("%Y-%m-%d %H:%M UTC")
            })

    # Crypto
    for sym in cfg["symbols_crypto"]:
        df = fetch15(sym, cfg.get("period_15m_crypto", "30d"), is_crypto=True)
        if df.empty or len(df) < 50:
            print(f"[WARN] {sym}: no 15m crypto data normalized; skipping")
            continue
        df = add_indicators(df, cfg["ema_fast"], cfg["ema_mid"], cfg["ema_slow"], cfg["rsi_len"])
        if df.empty:
            print(f"[WARN] {sym}: crypto indicators empty; skipping")
            continue
        score, note = score_intraday(df)
        if score >= cfg.get("min_score_intraday", 0.5):
            rows.append({
                "symbol": sym, "timeframe": "15m", "type": "crypto",
                "score": round(float(score), 3), "note": note,
                "asof": df.index[-1].strftime("%Y-%m-%d %H:%M UTC")
            })

    rows.sort(key=lambda r: r["score"], reverse=True)
    (OUT / "signals.json").write_text(json.dumps(rows, indent=2))
    print(f"Wrote {len(rows)} signals -> {OUT/'signals.json'}")

if __name__ == "__main__":
    main()
