# train_options.py
# Minimal trainer for options model. Expand with your own features/outcomes.

import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.ensemble import GradientBoostingClassifier
import joblib

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / "models"; MODELS.mkdir(exist_ok=True)

# Expect a CSV: data/options_history.csv with columns:
# delta, iv, open_interest, volume, side(0/1 for PUT/CALL), dte_bucket, trend_score, label(0/1)
DATA = ROOT / "data" / "options_history.csv"

def main():
    if not DATA.exists():
        print(f"[INFO] No training data found at {DATA}. Add outcomes to start training.")
        return

    df = pd.read_csv(DATA)
    req = ["delta","iv","open_interest","volume","side","dte_bucket","trend_score","label"]
    if any(c not in df.columns for c in req):
        print(f"[ERR] Missing required columns. Need: {req}")
        return

    X = df[["delta","iv","open_interest","volume","side","dte_bucket","trend_score"]].astype(float).fillna(0)
    y = df["label"].astype(int)

    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    model = GradientBoostingClassifier(random_state=42)
    model.fit(Xtr, ytr)
    acc = model.score(Xte, yte)
    print(f"Options model trained. Acc={acc:.3f}")

    joblib.dump(model, MODELS / "model_options.pkl")
    print(f"Saved -> {MODELS / 'model_options.pkl'}")

if __name__ == "__main__":
    main()
