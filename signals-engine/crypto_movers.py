# crypto_movers.py
# Finds top weekly crypto movers and appends them to config.yaml (dedup). Quiet & robust.

import warnings
warnings.filterwarnings("ignore", category=FutureWarning)

import yaml, yfinance as yf
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent
CFG_PATH = ROOT / "config.yaml"
OUT = ROOT / "output"; OUT.mkdir(exist_ok=True)

# Base universe to scan (deduped)
BASE = sorted(set([
    "BTC-USD","ETH-USD","SOL-USD","XRP-USD","DOGE-USD","SHIB-USD","ADA-USD","AVAX-USD",
    "MATIC-USD","LINK-USD","INJ-USD","NEAR-USD","APT-USD","SUI-USD","FTM-USD","SEI-USD",
    "TIA-USD","JUP-USD","WIF-USD","FLOKI-USD","PYTH-USD","ARB-USD","STRK-USD","RUNE-USD",
    "ATOM-USD","ETC-USD","HBAR-USD","GRT-USD","AR-USD","RNDR-USD"
]))

def weekly_change(ticker: str):
    try:
        df = yf.download(ticker, period="15d", interval="1d", auto_adjust=True, progress=False)
        if df.empty or "Close" not in df.columns or len(df["Close"].dropna()) < 8:
            return None
        close = df["Close"].dropna()
        # scalar % change over ~7 trading days
        chg = float(close.iloc[-1] / close.iloc[-8] - 1.0)
        return chg
    except Exception:
        return None

def main(top_n=12):
    rows = []
    for t in BASE:
        chg = weekly_change(t)
        if chg is not None:
            rows.append({"ticker": t, "weekly_change": chg})

    if not rows:
        print("No movers found."); return

    df = pd.DataFrame(rows).sort_values("weekly_change", ascending=False).reset_index(drop=True)
    movers = df.head(top_n)["ticker"].tolist()

    # Save a readable report
    df.to_json(OUT / "crypto_movers.json", orient="records", indent=2)
    print(f"Top {top_n} movers:", movers)

    # Append to config symbols_crypto (dedup)
    cfg = yaml.safe_load(CFG_PATH.read_text())
    current = list(cfg.get("symbols_crypto", []))
    merged = sorted(set(current + movers))
    cfg["symbols_crypto"] = merged
    CFG_PATH.write_text(yaml.safe_dump(cfg, sort_keys=False))
    print(f"Appended movers to config.yaml (symbols_crypto now {len(merged)} items).")

if __name__ == "__main__":
    main()
