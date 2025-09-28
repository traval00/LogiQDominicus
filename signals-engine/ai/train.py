import joblib
from pathlib import Path
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score
from sklearn.ensemble import GradientBoostingClassifier
from .featurize import make_features, label_forward_returns, FEATS

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT/"models"; MODELS.mkdir(exist_ok=True)

def train_from_df(df15: pd.DataFrame, model_out: Path):
    feats = make_features(df15); feats['label'] = label_forward_returns(feats); feats = feats.dropna()
    X, y = feats[FEATS], feats['label']
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, shuffle=False)
    model = GradientBoostingClassifier(random_state=42).fit(Xtr, ytr)
    auc = roc_auc_score(yte, model.predict_proba(Xte)[:,1])
    joblib.dump({'model':model,'feats':FEATS,'auc':float(auc)}, model_out)
    return float(auc)
