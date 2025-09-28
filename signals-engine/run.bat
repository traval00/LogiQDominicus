@echo off
cd /d %~dp0
python -m venv .venv
call .venv\Scripts\activate
pip install -r requirements.txt
python - <<PY
import yfinance as yf
from pathlib import Path
from ai.train import train_from_df
sp = yf.download('SPY', period='60d', interval='15m', auto_adjust=True, progress=False)
sp = sp.rename(columns={'Open':'open','High':'high','Low':'low','Close':'close','Volume':'volume'}).dropna()
auc = train_from_df(sp, Path('models/model.pkl'))
print('Model AUC:', auc)
PY
python generate_signals.py
pause
