# run_swing.py
import json, math, datetime as dt
from pathlib import Path
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent
OUT  = ROOT / "output"; OUT.mkdir(exist_ok=True)

EQUITIES = ["SPY","QQQ","NVDA","AAPL","MSFT","META","TSLA","AMD","AMZN","GOOGL","NFLX","MU","SMCI","AVGO"]
CRYPTOS  = ["BTC-USD","ETH-USD","SOL-USD","XRP-USD","DOGE-USD","ADA-USD","AVAX-USD","LINK-USD","LTC-USD","DOT-USD"]

def now_utc():
    try:
        return dt.datetime.now(dt.timezone.utc)
    except Exception:
        return dt.datetime.utcnow()

def fetch_daily(tkr: str, period="1y"):
    try:
        df = yf.download(tkr, period=period, interval="1d", auto_adjust=True, progress=False, group_by="ticker")
        if isinstance(df.columns, pd.MultiIndex):
            colmap = {}
            for (price, _sym) in df.columns:
                colmap[(price, _sym)] = price.lower()
            df = df.rename(columns=colmap)
            df = df[["open","high","low","close","volume"]]
        else:
            lower = {c:c.lower() for c in df.columns}
            df = df.rename(columns=lower)
            df = df[["open","high","low","close","volume"]]
        df = df.dropna()
        return df
    except Exception as e:
        print(f"[ERR] {tkr}: download failed: {e}")
        return pd.DataFrame()

def ema(s, n): return s.ewm(span=n, adjust=False).mean()

def enrich(df: pd.DataFrame):
    if df.empty: return df
    for c in ["open","high","low","close","volume"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["close"])
    if df.empty: return df
    df["ema10"]  = ema(df["close"], 10)
    df["ema20"]  = ema(df["close"], 20)
    df["ema200"] = ema(df["close"], 200)
    tr = (df["high"]-df["low"]).abs()
    tr1= (df["high"]-df["close"].shift()).abs()
    tr2= (df["low"] -df["close"].shift()).abs()
    df["atr"] = pd.concat([tr,tr1,tr2], axis=1).max(axis=1).rolling(14).mean()
    return df.dropna()

def dv_ok(df: pd.DataFrame, min_dv=1_000_000):
    try:
        dv = (df["close"]*df["volume"]).tail(20).mean()
        return float(dv) >= min_dv
    except Exception:
        return False

def next_earnings(tkr: str):
    try:
        info = yf.Ticker(tkr).get_earnings_dates(limit=1)
        if info is None or info.empty: return None
        d = pd.to_datetime(info.index[0]).date()
        return d.isoformat()
    except Exception:
        return None

def guardrails(sym, is_equity: bool):
    note = []
    if is_equity:
        ed = next_earnings(sym)
        if ed:
            try:
                ed_date = dt.date.fromisoformat(ed)
                days = (ed_date - now_utc().date()).days
                if days >= 0 and days <= 5:
                    note.append(f"earnings in {days}d")
                    return False, "; ".join(note)
                else:
                    note.append(f"earnings {days}d out")
            except Exception:
                pass
    return True, "; ".join(note)

def swing_score(row):
    # basic momentum + trend alignment
    bias = 0
    if row["close"] > row["ema20"] > row["ema200"]: bias += 1
    if row["close"] < row["ema20"] < row["ema200"]: bias -= 1
    dist20 = (row["close"] - row["ema20"]) / row["ema20"]
    base = 0.55 + 0.2*(1 if bias>0 else (-1 if bias<0 else 0)) - 0.1*abs(dist20)
    return max(0.0, min(1.0, base))

def build_row(sym, last, direction, score, note):
    price = float(last["close"]); atr=float(last["atr"])
    if direction=="LONG":
        stop = max(float(last["ema20"]), price-2*atr)
        rr_risk = max(0.01, price-stop)
        targets = [round(price + k*rr_risk,4) for k in (1,2,3)]
    else:
        stop = min(float(last["ema20"]), price+2*atr)
        rr_risk = max(0.01, stop-price)
        targets = [round(price - k*rr_risk,4) for k in (1,2,3)]
    return {
        "symbol": sym,
        "timeframe":"1d-swing",
        "strategy":"EMA break & retest",
        "direction": direction,
        "score": round(float(score),3),
        "entry": round(price,4),
        "stop": round(float(stop),4),
        "targets": targets,
        "trail":{"method":"atr","mult":2.0},
        "note": note,
        "asof": now_utc().strftime("%Y-%m-%d %H:%M:%S UTC")
    }

def main():
    rows=[]
    # equities
    for sym in EQUITIES:
        df = enrich(fetch_daily(sym,"1y"))
        if df.empty or not dv_ok(df):
            print(f"[WARN] {sym}: no daily data normalized; skipping")
            continue
        allow, note = guardrails(sym, True)
        if not allow:
            print(f"[GUARD] {sym}: {note} -> skip")
            continue
        last = df.iloc[-1]
        sc = swing_score(last)
        if sc >= 0.60:
            direction = "LONG" if last["close"]>last["ema20"] else "SHORT"
            rows.append(build_row(sym, last, direction, sc, note))
    # crypto (no earnings guard)
    for sym in CRYPTOS:
        df = enrich(fetch_daily(sym,"1y"))
        if df.empty:
            print(f"[WARN] {sym}: no daily crypto normalized; skipping")
            continue
        last = df.iloc[-1]
        sc = swing_score(last)
        if sc >= 0.60:
            direction = "LONG" if last["close"]>last["ema20"] else "SHORT"
            rows.append(build_row(sym, last, direction, sc, ""))

    rows.sort(key=lambda r: r["score"], reverse=True)
    (OUT/"signals_swing.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"Wrote {len(rows)} swing signals -> {OUT/'signals_swing.json'}")

if __name__ == "__main__":
    main()
