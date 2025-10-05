# options_picker.py
import json, math
from pathlib import Path
import datetime as dt
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent
OUT  = ROOT / "output"; OUT.mkdir(exist_ok=True)
DATA = ROOT / "data";  DATA.mkdir(exist_ok=True)

UNDR = ["SPY","QQQ","NVDA","AAPL","MSFT","META","TSLA","AMD","AMZN","GOOGL","NFLX","MU","SMCI","AVGO"]

def last_price(tkr):
    try:
        s = yf.download(tkr,period="5d",interval="1d",auto_adjust=True,progress=False)["Close"].iloc[-1]
        return float(s)
    except Exception:
        return None

def make_pick(sym, side, und_price, dte_days, delta, premium, spread):
    return {
        "underlying": sym,
        "type": side,
        "dte_days": dte_days,
        "delta": delta,
        "mark": premium,
        "spread": spread,
        "asof": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    }

def score(p):
    delta_term  = 1 - abs(abs(p["delta"]) - 0.65)       # target 0.65
    dte_term    = 1 - min(p["dte_days"], 30)/30.0       # nearer is better up to 30d
    spread_term = 1 - min(p["spread"], 0.4)/0.4         # tighter is better
    return 0.5*delta_term + 0.3*dte_term + 0.2*spread_term

def synthetic_chain(sym, price):
    # Make 2 calls + 2 puts around ~0.65 delta and ~14 DTE with plausible spread/mark.
    if price is None: return []
    dte = 14
    # crude premium guess
    atmprem = max(0.5, 0.03*price)
    picks = [
        make_pick(sym,"CALL",price,dte, 0.70, atmprem*1.1, 0.05*atmprem),
        make_pick(sym,"CALL",price,dte, 0.60, atmprem*0.9, 0.06*atmprem),
        make_pick(sym,"PUT" ,price,dte,-0.60, atmprem*1.0, 0.06*atmprem),
        make_pick(sym,"PUT" ,price,dte,-0.70, atmprem*1.2, 0.05*atmprem),
    ]
    return picks

def main():
    out=[]
    for sym in UNDR:
        p = last_price(sym)
        chain = synthetic_chain(sym, p)
        if not chain:
            print(f"{sym}: 0 picks")
            continue
        # keep the best two by score
        chain.sort(key=score, reverse=True)
        best = chain[:2]
        out.extend(best)
        print(f"{sym}: {len(best)} picks")

    (OUT/"options.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    # append to running positions log (simple demo of position sheet)
    pos = pd.DataFrame(out)
    (DATA/"options_positions.csv").parent.mkdir(exist_ok=True, parents=True)
    with open(DATA/"options_positions.csv","a", encoding="utf-8") as f:
        if f.tell()==0: f.write(",".join(pos.columns)+"\n")
        for _,r in pos.iterrows():
            f.write(",".join(str(r[c]) for c in pos.columns)+"\n")
    print(f"[OK] wrote {len(out)} options -> {OUT/'options.json'}")
    print(f"[OK] positions -> {DATA/'options_positions.csv'}")

if __name__=="__main__":
    main()
