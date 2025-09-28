# run_swing.py
# Swing (1–2 weeks) signals on daily bars. Uses models/model_swing.pkl (10-feature daily)
# and falls back to heuristic if the model or features don't line up.

import numpy as np
import pandas as pd
import yfinance as yf
import yaml, joblib
from pathlib import Path
from ta.momentum import RSIIndicator
from ta.volatility import AverageTrueRange

ROOT = Path(__file__).resolve().parent
CFG = yaml.safe_load((ROOT / "config.yaml").read_text())
MODELS = ROOT / "models"
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)

FAST, MID, SLOW = CFG["ema_fast"], CFG["ema_mid"], CFG["ema_slow"]
SYMS = CFG["symbols_equity"] + CFG["symbols_crypto"]
MIN_PROB = float(CFG.get("swing_min_prob", 0.65))
MIN_RR = float(CFG.get("swing_min_rr", 1.4))
TREND_CONFIRM = bool(CFG.get("swing_trend_confirm", True))
RETEST_REQUIRED = bool(CFG.get("swing_retest_required", True))
MIN_AVG_VOL = float(CFG.get("swing_min_avg_vol", 0.0))

FEATS_SWING = [
    "ret1","ret3","ret5",
    "ema10","ema20","ema200",
    "ema_slope20","ema_dist20",
    "rsi","atr"
]

def _norm_cols(df):
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = ['_'.join([str(x) for x in tup if str(x)!='']) for tup in df.columns]
    df.columns = [str(c).strip() for c in df.columns]
    return df

def _get_series(df: pd.DataFrame, candidates) -> pd.Series:
    cols = [str(c).lower() for c in df.columns]
    for name in candidates:
        key = name.lower()
        if key in cols:
            s = df.iloc[:, cols.index(key)]
            return s.squeeze() if hasattr(s, "squeeze") else s
        for i, c in enumerate(cols):
            if c == f"{key}_spy" or c.endswith(f"_{key}") or c.startswith(f"{key}_") or key in c:
                s = df.iloc[:, i]
                return s.squeeze() if hasattr(s, "squeeze") else s
    raise KeyError(f"Missing any of {candidates} in {list(df.columns)}")

def fetch1d(ticker: str, period="12mo"):
    df = yf.download(ticker, period=period, interval="1d", auto_adjust=True, progress=False)
    return _norm_cols(df) if not df.empty else df

def enrich(raw: pd.DataFrame) -> pd.DataFrame:
    if raw.empty:
        return raw
    c = _get_series(raw, ["close","adj close","adj_close","adjclose"])
    h = _get_series(raw, ["high"])
    l = _get_series(raw, ["low"])

    df = pd.DataFrame(index=raw.index)
    df["close"] = pd.to_numeric(c, errors="coerce")
    df["high"]  = pd.to_numeric(h, errors="coerce")
    df["low"]   = pd.to_numeric(l, errors="coerce")

    df["ema10"]  = df["close"].ewm(span=FAST, adjust=False).mean()
    df["ema20"]  = df["close"].ewm(span=MID,  adjust=False).mean()
    df["ema200"] = df["close"].ewm(span=SLOW, adjust=False).mean()
    df["ema_slope20"] = df["ema20"].diff()
    df["ema_dist20"]  = (df["close"] - df["ema20"]) / df["ema20"]

    df["rsi"] = RSIIndicator(df["close"], window=CFG["rsi_len"]).rsi()
    df["atr"] = AverageTrueRange(df["high"], df["low"], df["close"], window=CFG["atr_len"]).average_true_range()

    df["ret1"] = df["close"].pct_change(1)
    df["ret3"] = df["close"].pct_change(3)
    df["ret5"] = df["close"].pct_change(5)

    return df.replace([np.inf,-np.inf], np.nan).dropna()

def load_daily_model():
    p = MODELS / "model_swing.pkl"
    return joblib.load(p) if p.exists() else None

def passes_filters(df: pd.DataFrame) -> bool:
    last = df.iloc[-1]
    if TREND_CONFIRM and not (last["close"] > last["ema20"] > last["ema200"]):
        return False
    if RETEST_REQUIRED:
        near = ((df.tail(5)["close"] - df.tail(5)["ema20"]).abs() / df.tail(5)["ema20"]) <= 0.01
        if not bool(near.any()):
            return False
    return True

def avg_vol_ok(ticker: str) -> bool:
    if "-USD" in ticker:
        return True
    try:
        hist = yf.download(ticker, period="3mo", interval="1d", auto_adjust=True, progress=False)
        if hist.empty:
            return True
        hist = _norm_cols(hist)
        cols_lower = [str(c).lower() for c in hist.columns]
        vol_col = None
        for cand in ["volume","volume_close","vol","volumetotal"]:
            if cand in cols_lower:
                vol_col = hist.columns[cols_lower.index(cand)]
                break
        if vol_col is None:
            for i, c in enumerate(cols_lower):
                if "volume" in c:
                    vol_col = hist.columns[i]; break
        if vol_col is None:
            return True
        vs = hist[vol_col]
        if hasattr(vs, "ndim") and vs.ndim == 2:
            vs = vs.iloc[:, -1]
        return float(vs.tail(20).mean()) >= MIN_AVG_VOL
    except Exception:
        return True

def main():
    model_pack = load_daily_model()
    out = []

    for sym in SYMS:
        if not avg_vol_ok(sym):
            continue

        base = enrich(fetch1d(sym))
        if base.empty or len(base) < 80:
            continue

        # default heuristic probability
        last = base.iloc[-1]
        heur_proba = 0.65 if (last["close"] > last["ema20"] > last["ema200"] and 45 <= last["rsi"] <= 70) else 0.4
        proba = heur_proba

        # try daily model if present & features match
        try:
            if model_pack and isinstance(model_pack, dict):
                model = model_pack.get("model")
                feats = model_pack.get("feats", [])
                X = base[FEATS_SWING].iloc[[-1]]
                if model and feats and feats == FEATS_SWING:
                    proba = float(model.predict_proba(X)[0,1])
        except Exception:
            proba = heur_proba

        if proba < MIN_PROB:
            continue
        if not passes_filters(base):
            continue

        price = float(last["close"])
        stop  = float(min(last["ema20"], base["low"].tail(3).min()))
        risk  = price - stop
        if risk <= 0:
            continue

        t1 = round(price + 1.0 * risk, 4)
        t2 = round(price + 2.0 * risk, 4)
        rr = (t1 - price) / risk
        if rr < MIN_RR:
            continue

        out.append({
            "ticker": sym,
            "timeframe": "1d-swing",
            "strategy": "EMA trend + retest",
            "prob": round(proba, 3),
            "entry": round(price, 4),
            "stop": round(stop, 4),
            "targets": [t1, t2],
            "trail": {"method": "ema20_atr", "atr_mult": CFG["trail_atr_mult"]},
            "asof": base.index[-1].strftime("%Y-%m-%d"),
        })

    pd.Series(out, dtype="object").to_json(OUT / "signals_swing.json", orient="values", indent=2)
    print(f"Wrote {len(out)} swing signals -> output/signals_swing.json")

if __name__ == "__main__":
    main()
