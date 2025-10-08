# generate_signals.py
from __future__ import annotations
import datetime as dt
from pathlib import Path
from typing import List, Dict
import pandas as pd

from common import download, ema, round_price, now_utc_str, write_json

# ---------- CONFIG ----------
EQUITY_TICKERS = ["SPY","QQQ","NVDA","AAPL","MSFT","META","TSLA","AMD","AMZN","GOOGL","NFLX","MU","SMCI","AVGO"]
CRYPTO_TICKERS = ["BTC-USD","ETH-USD","SOL-USD","XRP-USD","DOGE-USD","ADA-USD","AVAX-USD","LINK-USD","LTC-USD","DOT-USD"]

INTRADAY_PERIOD   = "7d"     # 15m bars across last week
INTRADAY_INTERVAL = "15m"
ORB_BARS          = 6        # first 90 minutes (6 x 15m) for ORB
RR_DEFAULT        = 2        # 1:R default

OUT_PATH = Path("output/signals.json")
# ----------------------------

def orb_signal_for_today(df: pd.DataFrame, symbol: str) -> Dict | None:
    df = df.tz_localize(None) if df.index.tz is not None else df
    df_today = df[df.index.date == dt.datetime.now().date()]
    if len(df_today) < ORB_BARS + 1:
        return None

    first = df_today.iloc[:ORB_BARS]
    after = df_today.iloc[ORB_BARS:]

    orb_high = first["high"].max()
    orb_low  = first["low"].min()
    last     = after.iloc[-1]

    # Basic trend filter: 10>20 ema on 15m close
    df["ema10"] = ema(df["close"], 10)
    df["ema20"] = ema(df["close"], 20)
    bull_trend = df["ema10"].iloc[-1] > df["ema20"].iloc[-1]

    # Breakout if last close above ORB high and bull trend
    if last["close"] > orb_high and bull_trend:
        entry  = round_price(orb_high)
        stop   = round_price(orb_low)
        rr     = RR_DEFAULT
        risk   = max(entry - stop, 0)
        target = round_price(entry + rr * risk)
        return {
            "symbol": symbol,
            "type": "intraday",
            "strategy": "ORB/EMA 15m",
            "entry": entry,
            "stop": stop,
            "rr": rr,
            "target": target,
            "reason": "ORB breakout confirmed with EMA10>EMA20.",
        }
    return None

def build_signals() -> Dict:
    ideas: List[Dict] = []

    # Equities 15m
    for t in EQUITY_TICKERS:
        try:
            df = download(t, INTRADAY_PERIOD, INTRADAY_INTERVAL)
            idea = orb_signal_for_today(df, t)
            if idea: ideas.append(idea)
        except Exception as e:
            print(f"[WARN] {t}: {e}")

    # Crypto 15m (24/7)
    for t in CRYPTO_TICKERS:
        try:
            df = download(t, "7d", "15m")
            idea = orb_signal_for_today(df, t)
            if idea: ideas.append(idea)
        except Exception as e:
            print(f"[WARN] {t} (crypto): {e}")

    return {
        "asof": now_utc_str(),
        "source": "yfinance",
        "count": len(ideas),
        "signals": ideas
    }

def ensure_not_empty(payload: Dict) -> Dict:
    if payload["count"] > 0:
        return payload
    # Fallback mock to keep the site populated
    mock = [
        {"symbol":"SPY","type":"intraday","strategy":"ORB/EMA 15m","entry":505.20,"stop":502.80,"rr":2,"target":509.60,"reason":"Fallback sample."},
        {"symbol":"BTC-USD","type":"intraday","strategy":"ORB/EMA 15m","entry":64250,"stop":63600,"rr":3,"target":66150,"reason":"Fallback sample."},
    ]
    payload["signals"] = mock
    payload["count"] = len(mock)
    payload["note"] = "fallback_mock_used"
    return payload

if __name__ == "__main__":
    payload = build_signals()
    payload = ensure_not_empty(payload)
    write_json(str(OUT_PATH), payload)
    print(f"Wrote {payload['count']} intraday/crypto signals -> {OUT_PATH.resolve()}")
