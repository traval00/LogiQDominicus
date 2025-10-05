# generate_signals.py
import os, json, math, datetime as dt, logging
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

# ---------------- Setup logging ----------------
logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)

# -------------- Symbols (fallback if no config.yaml) --------------
DEFAULT_EQUITY = [
    "SPY","QQQ","NVDA","AAPL","MSFT","META","TSLA","AMD","AMZN","GOOGL",
    "NFLX","MU","SMCI","AVGO"
]
DEFAULT_CRYPTO = [
    "BTC-USD","ETH-USD","SOL-USD","XRP-USD","DOGE-USD","ADA-USD",
    "AVAX-USD","LINK-USD","LTC-USD","DOT-USD"
]

# -------------- helpers --------------
def _flatten(df: pd.DataFrame) -> pd.DataFrame:
    """Make sure columns are ['open','high','low','close','volume'] and numeric."""
    if df is None or df.empty:
        return pd.DataFrame()
    # Handle MultiIndex (Price, Ticker) from yfinance
    if isinstance(df.columns, pd.MultiIndex):
        # Take first level name-insensitive
        cols = {}
        for (price, *_), ser in df.items():
            k = str(price).lower()
            if k == "open": cols.setdefault("open", ser)
            if k == "high": cols.setdefault("high", ser)
            if k == "low": cols.setdefault("low", ser)
            if k == "close": cols.setdefault("close", ser)
            if k == "volume": cols.setdefault("volume", ser)
        if not cols:
            return pd.DataFrame()
        out = pd.DataFrame(cols)
    else:
        # Single-level; normalize common Yahoo names
        rename_map = {
            "Open":"open","High":"high","Low":"low","Close":"close","Adj Close":"close","Volume":"volume"
        }
        out = df.rename(columns={c: rename_map.get(c, c).lower() for c in df.columns})
        # some builds use lowercase already
        for want in ["open","high","low","close","volume"]:
            if want not in out.columns and want.capitalize() in out.columns:
                out[want] = out[want.capitalize()]

    # keep only what we need
    out = out[ [c for c in ["open","high","low","close","volume"] if c in out.columns] ].copy()
    if "close" not in out.columns:
        return pd.DataFrame()

    # numeric
    for c in out.columns:
        out[c] = pd.to_numeric(out[c], errors="coerce")
    out = out.dropna(subset=["close"])
    return out

def fetch_1d(sym, period="60d"):
    try:
        raw = yf.download(sym, period=period, interval="1d", auto_adjust=True, progress=False)
        return _flatten(raw)
    except Exception as e:
        logging.error(f"{sym}: 1d download failed: {e}")
        return pd.DataFrame()

def fetch_15m(sym, period="5d"):
    try:
        raw = yf.download(sym, period=period, interval="15m", auto_adjust=True, progress=False)
        return _flatten(raw)
    except Exception as e:
        logging.warning(f"{sym}: 15m download failed: {e}")
        return pd.DataFrame()

def ema(s: pd.Series, span: int) -> pd.Series:
    return s.ewm(span=span, adjust=False).mean()

def orb_score(df15: pd.DataFrame) -> float:
    """Simple ORB tendency score from first 30m vs current."""
    if df15 is None or df15.empty or len(df15) < 4:
        return 0.0
    first30_high = df15["high"].iloc[:2].max()
    first30_low = df15["low"].iloc[:2].min()
    last = df15["close"].iloc[-1]
    if last > first30_high:
        return 0.7
    if last < first30_low:
        return -0.7
    return 0.0

def ema_confluence(df: pd.DataFrame) -> float:
    """EMA10/20/200 alignment signal."""
    if df is None or df.empty or len(df) < 50:
        return 0.0
    e10 = ema(df["close"], 10).iloc[-1]
    e20 = ema(df["close"], 20).iloc[-1]
    e200 = ema(df["close"], 200).iloc[-1] if len(df) >= 210 else ema(df["close"], 200).iloc[-1]
    last = df["close"].iloc[-1]
    bull = float(last>e10>e20>e200)
    bear = float(last<e10<e20<e200)
    return 0.6 if bull else (-0.6 if bear else 0.0)

def blend_score(sym: str, d1: pd.DataFrame, m15: pd.DataFrame) -> float:
    """Blend daily momentum + intraday ORB + EMA structure."""
    if d1 is None or d1.empty:
        return 0.0
    try:
        mom = (d1["close"].iloc[-1] / d1["close"].iloc[-5] - 1.0) if len(d1) >= 6 else 0.0
    except Exception:
        mom = 0.0
    intraday = orb_score(m15) if m15 is not None and not m15.empty else 0.0
    ema_s = ema_confluence(d1)
    score = 0.5*mom + 0.3*intraday + 0.2*ema_s
    return float(score)

def make_entry_stop_targets(df: pd.DataFrame, direction: str):
    last = df.iloc[-1]
    price = float(last["close"])
    e20 = float(ema(df["close"], 20).iloc[-1])
    if direction == "LONG":
        stop = min(e20, float(df["low"].tail(5).min()))
        risk = price - stop
        targets = [round(price + r*risk, 4) for r in (1.0, 1.5, 2.0)]
    else:
        stop = max(e20, float(df["high"].tail(5).max()))
        risk = stop - price
        targets = [round(price - r*risk, 4) for r in (1.0, 1.5, 2.0)]
    return round(price,4), round(stop,4), targets

def load_symbol_lists():
    # Minimal, robust: try config.yaml; otherwise defaults
    cfg_path = ROOT / "config.yaml"
    if cfg_path.exists():
        try:
            import yaml
            cfg = yaml.safe_load(cfg_path.read_text())
            equities = cfg.get("symbols_equity", DEFAULT_EQUITY)
            cryptos  = cfg.get("symbols_crypto", DEFAULT_CRYPTO)
            return equities, cryptos
        except Exception as e:
            logging.warning(f"config.yaml read failed, using defaults: {e}")
    return DEFAULT_EQUITY, DEFAULT_CRYPTO

def main():
    equities, cryptos = load_symbol_lists()
    symbols = equities + cryptos

    rows = []
    for sym in symbols:
        d1 = fetch_1d(sym, "120d")
        m15 = fetch_15m(sym, "5d")
        if d1.empty and m15.empty:
            logging.warning(f"{sym}: no data; skipping")
            continue

        score = blend_score(sym, d1, m15)
        direction = "LONG" if score >= 0 else "SHORT"
        use_df = d1 if not d1.empty else m15
        entry, stop, targets = make_entry_stop_targets(use_df, direction)

        rows.append({
            "symbol": sym,
            "timeframe": "15m+1d blend",
            "direction": direction,
            "score": round(score, 3),
            "entry": entry,
            "stop": stop,
            "targets": targets,
            "note": "ORB/EMA blended with daily momentum",
            "asof": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        })

    # sort best to worst
    rows.sort(key=lambda r: abs(r["score"]), reverse=True)

    # Fallback: if everything very low, keep top 10 anyway so UI has content
    if not rows:
        logging.warning("No intraday candidates. Writing empty list.")
    else:
        # Trim to top 25 for the UI
        rows = rows[:25]

    out_path = OUT / "signals.json"
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2)
    logging.info(f"Wrote {len(rows)} signals -> {out_path}")

if __name__ == "__main__":
    main()
