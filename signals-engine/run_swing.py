# run_swing.py
from __future__ import annotations
from pathlib import Path
from typing import Dict, List
import pandas as pd

from common import download, ema, round_price, now_utc_str, write_json

TICKERS = ["SPY","QQQ","NVDA","AAPL","MSFT","META","TSLA","AMD","AMZN","GOOGL","NFLX","MU","SMCI","AVGO"]
DAILY_PERIOD = "180d"   # ~6 months
OUT_PATH = Path("output/signals_swing.json")

RR_DEFAULT = 2

def swing_buy(df: pd.DataFrame, symbol: str) -> Dict | None:
    # Daily trend filter: EMA20 > EMA50 and close > EMA20
    df["ema20"] = ema(df["close"], 20)
    df["ema50"] = ema(df["close"], 50)

    last = df.iloc[-1]
    if last["ema20"] > last["ema50"] and last["close"] > last["ema20"]:
        entry = round_price(float(last["close"]))
        stop  = round_price(float(last["ema50"]))
        rr    = RR_DEFAULT
        risk  = max(entry - stop, 0)
        target = round_price(entry + rr * risk)
        return {
            "symbol": symbol,
            "type": "swing",
            "strategy": "EMA20>EMA50 trend",
            "entry": entry,
            "stop": stop,
            "rr": rr,
            "target": target,
            "reason": "Daily uptrend (EMA20>EMA50) with price above EMA20.",
        }
    return None

def build_swings() -> Dict:
    ideas: List[Dict] = []
    for t in TICKERS:
        try:
            df = download(t, DAILY_PERIOD, "1d")
            idea = swing_buy(df, t)
            if idea: ideas.append(idea)
        except Exception as e:
            print(f"[WARN] {t}: {e}")

    return {
        "asof": now_utc_str(),
        "source": "yfinance",
        "count": len(ideas),
        "signals": ideas
    }

def ensure_not_empty(payload: Dict) -> Dict:
    if payload["count"] > 0:
        return payload
    mock = [
        {"symbol":"AAPL","type":"swing","strategy":"EMA20>EMA50 trend","entry":195.40,"stop":189.90,"rr":2,"target":200.90,"reason":"Fallback sample."},
        {"symbol":"NVDA","type":"swing","strategy":"EMA20>EMA50 trend","entry":118.20,"stop":112.70,"rr":2,"target":123.70,"reason":"Fallback sample."},
    ]
    payload["signals"] = mock
    payload["count"] = len(mock)
    payload["note"] = "fallback_mock_used"
    return payload

if __name__ == "__main__":
    payload = build_swings()
    payload = ensure_not_empty(payload)
    write_json(str(OUT_PATH), payload)
    print(f"Wrote {payload['count']} swing signals -> {OUT_PATH.resolve()}")
