# outcome_logger.py – creates/updates positions/history safely (expand later)
from pathlib import Path
import pandas as pd, yfinance as yf, datetime as dt

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"; DATA.mkdir(exist_ok=True)
POS = DATA / "options_positions.csv"
HIST = DATA / "options_history.csv"

def main():
    if not POS.exists():
        print("[INFO] No open positions file yet.")
        return
    pos = pd.read_csv(POS)
    if pos.empty:
        print("[INFO] Positions file exists but is empty.")
        return
    # touch + ensure history exists
    pos["touched_at"] = dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    pos["best_seen"] = pos["best_seen"].fillna(pos["entry_mid"])
    pos.to_csv(POS, index=False)
    if not HIST.exists():
        pd.DataFrame(columns=list(pos.columns)+["outcome"]).to_csv(HIST, index=False)
    print(f"[OK] touched positions -> {POS}")
    print(f"[OK] history exists -> {HIST}")

if __name__ == "__main__":
    main()
