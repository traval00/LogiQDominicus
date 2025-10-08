# common.py
from __future__ import annotations
import time, math, datetime as dt
from typing import Optional, Tuple
import pandas as pd
import yfinance as yf

UTC = dt.timezone.utc

def now_utc_str() -> str:
    return dt.datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")

def _sleep_backoff(try_idx:int):
    time.sleep(min(2 ** try_idx, 8))

def download(
    ticker: str,
    period: str,
    interval: str,
    tries: int = 4
) -> pd.DataFrame:
    """Robust yfinance download with simple backoff + column normalization."""
    last_exc = None
    for i in range(tries):
        try:
            df = yf.download(
                tickers=ticker,
                period=period,
                interval=interval,
                auto_adjust=True,
                progress=False,
                threads=False,
            )
            # yfinance can return multiindex; flatten to single level
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = [c[0].lower() for c in df.columns]
            else:
                df.columns = [c.lower() for c in df.columns]
            # sanity: must include ohcl
            need = {"open","high","low","close"}
            if not need.issubset(set(df.columns)):
                raise RuntimeError(f"missing columns; got {list(df.columns)}")
            # trim empties
            df = df.dropna(subset=["open","high","low","close"])
            if len(df) == 0:
                raise RuntimeError("empty frame")
            return df
        except Exception as e:
            last_exc = e
            _sleep_backoff(i)
    raise RuntimeError(f"download failed for {ticker}: {last_exc}")

def round_price(x: float) -> float:
    if math.isnan(x) or not math.isfinite(x):
        return x
    # equities vs crypto: crude tick rounding
    return float(f"{x:.2f}") if x >= 1 else float(f"{x:.4f}")

def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()

def write_json(path: str, payload: dict):
    import json, os
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
