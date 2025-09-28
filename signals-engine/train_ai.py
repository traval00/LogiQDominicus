# train_swing.py
# Trains a daily-bars swing model (10 features) and writes models/model_swing.pkl

from pathlib import Path
import numpy as np
import pandas as pd
import yfinance as yf
import yaml
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score
from sklearn.ensemble import GradientBoostingClassifier
import joblib

ROOT = Path(__file__).resolve().parent
CFG = yaml.safe_load((ROOT / "config.yaml").read_text())
MODELS = ROOT / "models"
MODELS.mkdir(exist_ok=True)

FAST, MID, SLOW = CFG["ema_fast"], CFG["ema_mid"], CFG["ema_slow"]
HORIZON = int(CFG.get("swing_horizon_days", 10))

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

def _get_series(df, candidates):
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

def fetch1d(ticker: str, period="24mo"):
    df = yf.download(ticker, period=period, interval="1d", auto_adjust=True, progress=False)
    return _norm_cols(df) if not df.empty else df

def make_daily_features(raw: pd.DataFrame) -> pd.DataFrame:
    if raw.empty:
        return raw
    close = _get_series(raw, ["close","adj close","adj_close","adjclose"])
    high  = _get_series(raw, ["high"])
    low   = _get_series(raw, ["low"])

    df = pd.DataFrame(index=raw.index)
    df["close"] = pd.to_numeric(close, errors="coerce")
    df["high"]  = pd.to_numeric(high,  errors="coerce")
    df["low"]   = pd.to_numeric(low,   errors="coerce")

    df["ret1"] = df["close"].pct_change(1)
    df["ret3"] = df["close"].pct_change(3)
    df["ret5"] = df["close"].pct_change(5)

    df["ema10"]  = df["close"].ewm(span=FAST, adjust=False).mean()
    df["ema20"]  = df["close"].ewm(span=MID,  adjust=False).mean()
    df["ema200"] = df["close"].ewm(span=SLOW, adjust=False).mean()
    df["ema_slope20"] = df["ema20"].diff()
    df["ema_dist20"]  = (df["close"] - df["ema20"]) / df["ema20"]

    # indicators
    from ta.momentum import RSIIndicator
    from ta.volatility import AverageTrueRange
    df["rsi"] = RSIIndicator(df["close"], window=CFG["rsi_len"]).rsi()
    df["atr"] = AverageTrueRange(df["high"], df["low"], df["close"], window=CFG["atr_len"]).average_true_range()

    df = df.replace([np.inf,-np.inf], np.nan).dropna()
    return df

def label_forward_up(df: pd.DataFrame, horizon=10):
    fwd = df["close"].pct_change(horizon).shift(-horizon)
    return (fwd > 0).astype(int)

def main():
    syms = CFG["symbols_equity"] + CFG["symbols_crypto"]
    frames = []
    for s in syms:
        try:
            raw = fetch1d(s)
            if raw.empty: 
                continue
            feats = make_daily_features(raw)
            feats["label"] = label_forward_up(feats, HORIZON)
            feats["ticker"] = s
            frames.append(feats)
        except Exception:
            continue

    if not frames:
        raise RuntimeError("No data to train on.")

    data = pd.concat(frames, axis=0, sort=False).dropna()
    X = data[FEATS_SWING]
    y = data["label"]

    # time-order split (no shuffle)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, shuffle=False)
    model = GradientBoostingClassifier(random_state=42)
    model.fit(Xtr, ytr)
    proba = model.predict_proba(Xte)[:,1]
    auc = roc_auc_score(yte, proba)

    joblib.dump({"model": model, "feats": FEATS_SWING, "auc": float(auc)}, MODELS / "model_swing.pkl")
    print(f"Swing model trained. AUC={auc:.3f} -> models/model_swing.pkl")

if __name__ == "__main__":
    main()
