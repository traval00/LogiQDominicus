# Daily swing signals (stocks + crypto) with liquidity filter
import os, json, datetime as dt
from pathlib import Path
import pandas as pd
import yfinance as yf
import yaml

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output"; OUT.mkdir(exist_ok=True)

def load_cfg():
    cfg = yaml.safe_load((ROOT / "config.yaml").read_text())
    def explode(x):
        if isinstance(x, list): return x
        if isinstance(x, str): return [s.strip() for s in x.split("-")]
        return []
    cfg["symbols_equity"] = [s for line in cfg.get("symbols_equity", []) for s in explode(line)]
    cfg["symbols_crypto"] = [s for line in cfg.get("symbols_crypto", []) for s in explode(line)]
    return cfg

def coerce_numeric(df):
    for col in ("open","high","low","close","volume"):
        if col in df:
            s = df[col]
            if hasattr(s, "columns"):  # 1-col DataFrame to Series
                s = s.iloc[:, 0]
            df[col] = pd.to_numeric(s, errors="coerce")
    return df.dropna(subset=["close"])

def fetch1d(tkr, period="1y"):
    df = yf.download(tkr, period=period, interval="1d", auto_adjust=True, progress=False)
    if df is None or df.empty: return pd.DataFrame()
    df = df.rename(columns=str.lower)
    df.index = pd.to_datetime(df.index)
    return coerce_numeric(df)

def add_indicators(df, ema_fast=10, ema_mid=20, ema_slow=200, rsi_len=14, atr_len=14):
    if df.empty: return df
    df = df.copy()
    c = df["close"]
    df["ema10"]  = c.ewm(span=ema_fast, adjust=False).mean()
    df["ema20"]  = c.ewm(span=ema_mid, adjust=False).mean()
    df["ema200"] = c.ewm(span=ema_slow, adjust=False).mean()

    # RSI
    delta = c.diff()
    up = delta.clip(lower=0)
    down = -delta.clip(upper=0)
    roll_up = up.ewm(alpha=1/rsi_len, adjust=False).mean()
    roll_down = down.ewm(alpha=1/rsi_len, adjust=False).mean()
    rs = roll_up / (roll_down.replace(0, 1e-9))
    df["rsi"] = 100 - (100 / (1 + rs))

    # ATR (simple)
    h, l, pc = df["high"], df["low"], c.shift(1)
    tr = pd.concat([(h - l).abs(), (h - pc).abs(), (l - pc).abs()], axis=1).max(axis=1)
    df["atr"] = tr.rolling(atr_len, min_periods=1).mean()
    return df.dropna()

def liquid_enough_equity(df, min_dollar=2_000_000, window=20):
    if "volume" not in df.columns or len(df) < window: return True
    px = df["close"].tail(window).mean()
    vol = df["volume"].tail(window).mean()
    dollar = float(px * vol)
    return dollar >= min_dollar

def liquid_enough_crypto(df, min_vol=1_000_000, window=20):
    # use volume as a crude proxy
    if "volume" not in df.columns or len(df) < window: return True
    v = df["volume"].tail(window).mean()
    return float(v) >= min_vol

def score_swing(df):
    last = df.iloc[-1]
    ema_stack_up = (last["ema20"] > last["ema200"]) and (last["close"] > last["ema20"])
    ema_stack_dn = (last["ema20"] < last["ema200"]) and (last["close"] < last["ema20"])
    rsi_ok = 45 <= last["rsi"] <= 70

    base = 0.4 + 0.4 * float(ema_stack_up or ema_stack_dn) + 0.2 * float(rsi_ok)
    score = max(0.0, min(1.0, base))

    direction = "long" if ema_stack_up else ("short" if ema_stack_dn else "neutral")
    note = f"{direction}, RSI {int(last['rsi'])}"
    return score, note, direction

def make_tradeplan(last_close, df, trail_mult=1.5):
    # stop = swing under EMA20 or recent low; targets at 1R/1.5R/2R
    ema20 = float(df["ema20"].iloc[-1])
    recent_low = float(df["low"].tail(5).min())
    stop = min(ema20, recent_low)
    if stop >= last_close:  # guard
        stop = last_close * 0.97
    risk = last_close - stop
    targets = [round(last_close + r*risk, 2) for r in (1.0, 1.5, 2.0)]
    return round(stop,2), targets, {"method":"atr", "atr_mult":trail_mult}

def main():
    cfg = load_cfg()
    rows = []
    MIN_PROB = max(cfg.get("min_prob", 0.55), 0.55)
    MIN_SCORE = cfg.get("min_score_swing", 0.55)

    # Equities
    for sym in cfg["symbols_equity"]:
        df = fetch1d(sym, cfg.get("period_1d","1y"))
        if df.empty or len(df) < 60: continue
        if not liquid_enough_equity(df, cfg.get("min_avg_dollar_vol", 2_000_000)): 
            continue
        df = add_indicators(df, cfg["ema_fast"], cfg["ema_mid"], cfg["ema_slow"], cfg["rsi_len"], cfg["atr_len"])
        if df.empty: continue
        score, note, direction = score_swing(df)
        if score >= MIN_SCORE:
            last_close = float(df["close"].iloc[-1])
            stop, targets, trail = make_tradeplan(last_close, df, cfg.get("trail_atr_mult",1.5))
            rows.append({
                "symbol": sym,
                "timeframe": "1d",
                "type": "equity",
                "score": round(float(score),3),
                "note": note,
                "entry": round(last_close,2),
                "stop": stop,
                "targets": targets,
                "trail": trail,
                "asof": df.index[-1].strftime("%Y-%m-%d")
            })

    # Crypto
    for sym in cfg["symbols_crypto"]:
        df = fetch1d(sym, cfg.get("period_1d","1y"))
        if df.empty or len(df) < 60: continue
        if not liquid_enough_crypto(df, 1_000_000):  # crude filter
            continue
        df = add_indicators(df, cfg["ema_fast"], cfg["ema_mid"], cfg["ema_slow"], cfg["rsi_len"], cfg["atr_len"])
        if df.empty: continue
        score, note, direction = score_swing(df)
        if score >= MIN_SCORE:
            last_close = float(df["close"].iloc[-1])
            stop, targets, trail = make_tradeplan(last_close, df, cfg.get("trail_atr_mult",1.5))
            rows.append({
                "symbol": sym,
                "timeframe": "1d",
                "type": "crypto",
                "score": round(float(score),3),
                "note": note,
                "entry": round(last_close,4),
                "stop": round(stop,4),
                "targets": [round(t,4) for t in targets],
                "trail": trail,
                "asof": df.index[-1].strftime("%Y-%m-%d")
            })

    rows.sort(key=lambda r: r["score"], reverse=True)
    (OUT / "signals_swing.json").write_text(json.dumps(rows, indent=2))
    print(f"Wrote {len(rows)} swing signals -> {OUT/'signals_swing.json'}")

if __name__ == "__main__":
    main()
