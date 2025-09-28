# generate_signals.py
import numpy as np, pandas as pd, yfinance as yf, yaml, joblib, datetime as dt
from pathlib import Path
from ta.momentum import RSIIndicator
from ta.volatility import AverageTrueRange
from ai.featurize import make_features, FEATS
from options_picker import pick_option_contract
from news import sentiment_for

ROOT = Path(__file__).resolve().parent
CFG = yaml.safe_load((ROOT / "config.yaml").read_text())
MODELS = ROOT / "models"; OUT = ROOT / "output"; OUT.mkdir(exist_ok=True)

FAST, MID, SLOW = CFG["ema_fast"], CFG["ema_mid"], CFG["ema_slow"]
MIN_P, MAX_P, MIN_PROB = CFG["min_price"], CFG["max_price"], CFG["min_prob"]
SYMS_E, SYMS_C = CFG["symbols_equity"], CFG["symbols_crypto"]

# weekend loosening
today = dt.datetime.utcnow().weekday()  # 0=Mon ... 5=Sat, 6=Sun
WEEKEND = CFG.get("weekend_mode", False) and (today in (5, 6))
W_MIN_PROB = CFG.get("weekend_min_prob", MIN_PROB)
CRYPTO_ONLY = CFG.get("weekend_crypto_only", False)

def fetch15(ticker, period="60d"):
    df = yf.download(ticker, period=period, interval="15m", auto_adjust=True, progress=False)
    if df.empty: return df
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = ['_'.join([str(x) for x in tup if str(x)!='']) for tup in df.columns]
    df.columns = [str(c).strip() for c in df.columns]
    return df

def _get_series(df, candidates):
    cols = [str(c).lower() for c in df.columns]
    for name in candidates:
        k = name.lower()
        if k in cols: s = df.iloc[:, cols.index(k)]; return s.squeeze()
        for i, c in enumerate(cols):
            if c == f"{k}_spy" or c.endswith(f"_{k}") or c.startswith(f"{k}_") or k in c:
                s = df.iloc[:, i]; return s.squeeze()
    raise KeyError(f"Missing {candidates}")

def enrich(raw):
    if raw.empty: return raw
    c = pd.to_numeric(_get_series(raw, ["close","adj close","adj_close","adjclose"]), errors="coerce")
    h = pd.to_numeric(_get_series(raw, ["high"]), errors="coerce")
    l = pd.to_numeric(_get_series(raw, ["low"]),  errors="coerce")
    df = pd.DataFrame(index=raw.index)
    df["close"], df["high"], df["low"] = c, h, l
    df["ema10"]  = df["close"].ewm(span=FAST, adjust=False).mean()
    df["ema20"]  = df["close"].ewm(span=MID,  adjust=False).mean()
    df["ema200"] = df["close"].ewm(span=SLOW, adjust=False).mean()
    df["rsi"] = RSIIndicator(df["close"], window=CFG["rsi_len"]).rsi()
    df["atr"] = AverageTrueRange(df["high"], df["low"], df["close"], window=CFG["atr_len"]).average_true_range()
    return df.replace([np.inf,-np.inf], np.nan).dropna()

def load_model():
    p = MODELS / "model.pkl"
    return joblib.load(p) if p.exists() else None

def make_row(ticker, base, proba, sent):
    last = base.iloc[-1]; price = float(last["close"])
    if not (MIN_P <= price <= MAX_P): return None
    stop = float(min(last["ema20"], base["low"].tail(4).min())); risk = price - stop
    if risk <= 0: return None
    targets = [round(price + r*risk, 4) for r in CFG["risk_r_targets"]]
    opt = None
    if "-USD" not in ticker:  # equities only
        opt = pick_option_contract(ticker, "BUY", CFG["opt_moneyness_pct"], CFG["opt_days_min"], CFG["opt_days_max"])
    return {
        "ticker": ticker, "timeframe": "15m-intraday", "strategy": "ORB+EMA break&retest",
        "prob": round(float(proba),3), "news_sent": round(float(sent),3),
        "entry": round(price,4), "stop": round(stop,4), "targets": targets,
        "trail": {"method":"ema20_atr","atr_mult": CFG["trail_atr_mult"]},
        "options_suggestion": opt, "asof": base.index[-1].strftime("%Y-%m-%d %H:%M")
    }

def main():
    out = []; model_pack = load_model()
    syms = []
    if WEEKEND and CRYPTO_ONLY:
        syms = SYMS_C[:]  # only crypto
    else:
        syms = SYMS_E + SYMS_C

    for sym in syms:
        raw = fetch15(sym, CFG["period_15m"]); base = enrich(raw)
        if base.empty or len(base) < 120:  # 120 bars ≈ 5 trading days
            continue

        feats = make_features(base)
        # choose threshold (looser on weekend)
        min_prob = W_MIN_PROB if (WEEKEND and "-USD" in sym) else MIN_PROB

        # proba
        if model_pack:
            proba = float(model_pack["model"].predict_proba(feats[FEATS].iloc[[-1]])[0,1])
        else:
            last = feats.iloc[-1]
            proba = 0.58 if (last["close"]>last["ema20"]>last["ema200"] and 40<=last["rsi"]<=75) else 0.45

        sent = sentiment_for(sym)
        if proba >= min_prob:
            row = make_row(sym, base, proba, sent)
            if row: out.append(row)

    pd.Series(out, dtype="object").to_json(OUT / "signals.json", orient="values", indent=2)
    print(f"Wrote {len(out)} signals -> output/signals.json")

if __name__ == "__main__":
    main()
